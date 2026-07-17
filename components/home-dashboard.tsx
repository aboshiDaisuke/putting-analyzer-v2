// ホーム画面の表示専用コンポーネント（データ取得は画面側 app/(tabs)/index.tsx が担当）。
// プロフェッショナルなゴルフアプリ風のダッシュボード:
//  - 記録CTAを主役化（このアプリの核は「ラウンドを記録」）
//  - 平均パットの推移（スパークライン＋前回比）で「良くなっているか」を可視化
//  - 1/3パット率はリングで表現
import { ScrollView, Text, View, TouchableOpacity, RefreshControl } from "react-native";
import Svg, { Circle } from "react-native-svg";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { StatRing } from "@/components/ui/stat-ring";
import { Sparkline } from "@/components/ui/sparkline";
import { useColors } from "@/hooks/use-colors";
import { shadowSm, shadowMd, shadowLg, shadowPrimary } from "@/lib/card-shadow";
import {
  calculateBasicStats,
  calculateOnePuttRate,
  calculateThreePuttRate,
  formatDate,
  getPlayedHoles,
} from "@/lib/analytics";
import { Round, UserProfile } from "@/lib/types";

type Props = {
  rounds: Round[];
  profile: UserProfile | null;
  refreshing: boolean;
  onRefresh: () => void;
  onNewRound: () => void;
  onOpenAnalytics: () => void;
  onOpenRounds: () => void;
  onOpenRound: (id: string) => void;
};

const WHITE_70 = "rgba(255,255,255,0.72)";
const WHITE_15 = "rgba(255,255,255,0.14)";

/** 1ホールあたり平均パット（プレー済みのみ）。プレーしていなければ null。 */
function avgPuttsPerHole(round: Round): number | null {
  const holes = getPlayedHoles(round);
  const totalPutts = holes.reduce((sum, hole) => sum + hole.totalPutts, 0);
  return holes.length > 0 ? totalPutts / holes.length : null;
}

export function HomeDashboard({
  rounds,
  profile,
  refreshing,
  onRefresh,
  onNewRound,
  onOpenAnalytics,
  onOpenRounds,
  onOpenRound,
}: Props) {
  const colors = useColors();
  const stats = calculateBasicStats(rounds);
  const onePuttRate = calculateOnePuttRate(rounds);
  const threePuttRate = calculateThreePuttRate(rounds);
  const recentRounds = rounds.slice(0, 3);

  // プレー済みラウンド（rounds は日付降順）。ベスト・推移の算出に使う。
  const playedRounds = rounds.filter((r) => getPlayedHoles(r).length > 0);

  // ベスト = 1ホールあたり最少パット（ホール数の違いに左右されない公平な指標）
  const bestPerHole =
    playedRounds.length > 0
      ? Math.min(...playedRounds.map((r) => avgPuttsPerHole(r) ?? Infinity))
      : null;

  // 推移（古い→新しい、直近8ラウンド）と前回比
  const trendValues = playedRounds
    .slice(0, 8)
    .map(avgPuttsPerHole)
    .filter((v): v is number => v != null)
    .reverse();
  const latestAvg = avgPuttsPerHole(playedRounds[0] ?? ({} as Round));
  const prevAvg = avgPuttsPerHole(playedRounds[1] ?? ({} as Round));
  const diff = latestAvg != null && prevAvg != null ? latestAvg - prevAvg : null;

  const today = new Date().toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });

  return (
    <ScrollView
      contentContainerStyle={{ paddingBottom: 28 }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
    >
      <View style={{ padding: 16, gap: 16 }}>
        {/* ─── ヒーロー ─────────────────────────────────────────────── */}
        <View
          style={[
            { backgroundColor: colors.primary, borderRadius: 26, padding: 22, overflow: "hidden" },
            shadowLg,
          ]}
        >
          {/* 背景の装飾（グリーンの等高線をイメージ） */}
          <View pointerEvents="none" style={{ position: "absolute", top: -54, right: -40, opacity: 0.5 }}>
            <Svg width={180} height={180}>
              <Circle cx={90} cy={90} r={86} stroke="rgba(255,255,255,0.10)" strokeWidth={1.5} fill="none" />
              <Circle cx={90} cy={90} r={62} stroke="rgba(255,255,255,0.09)" strokeWidth={1.5} fill="none" />
              <Circle cx={90} cy={90} r={38} stroke="rgba(255,255,255,0.08)" strokeWidth={1.5} fill="none" />
              <Circle cx={90} cy={90} r={5} fill={colors.accent} />
            </Svg>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: colors.accent }} />
            <Text style={{ color: WHITE_70, fontSize: 12, letterSpacing: 0.5, fontWeight: "600" }}>{today}</Text>
          </View>

          <Text style={{ color: "#FFFFFF", fontSize: 27, fontWeight: "800", marginTop: 8, letterSpacing: -0.3 }}>
            {profile?.name ? `${profile.name}さん` : "Putting Analyzer"}
          </Text>
          <Text style={{ color: WHITE_70, fontSize: 13, marginTop: 2 }}>
            {stats.totalRounds > 0 ? "今日も良いパッティングを" : "最初のラウンドを記録しましょう"}
          </Text>

          {/* ヒーロー内のミニ指標 */}
          <View style={{ flexDirection: "row", marginTop: 18, gap: 10 }}>
            <HeroStat label="ラウンド" value={`${stats.totalRounds}`} />
            <View style={{ width: 1, backgroundColor: WHITE_15 }} />
            <HeroStat
              label="平均パット"
              value={stats.totalRounds > 0 ? stats.averagePuttsPerHole.toFixed(1) : "–"}
              suffix="/H"
            />
            <View style={{ width: 1, backgroundColor: WHITE_15 }} />
            <HeroStat label="ベスト" value={bestPerHole != null ? bestPerHole.toFixed(1) : "–"} suffix="/H" />
          </View>
        </View>

        {/* ─── 主役CTA: ラウンドを記録 ─────────────────────────────── */}
        <TouchableOpacity
          style={[
            {
              backgroundColor: colors.primary,
              borderRadius: 20,
              paddingVertical: 18,
              paddingHorizontal: 20,
              flexDirection: "row",
              alignItems: "center",
            },
            shadowPrimary,
          ]}
          onPress={onNewRound}
          activeOpacity={0.88}
        >
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              backgroundColor: "rgba(255,255,255,0.16)",
              alignItems: "center",
              justifyContent: "center",
              marginRight: 14,
            }}
          >
            <IconSymbol name="plus" size={24} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: "#FFFFFF", fontWeight: "800", fontSize: 17, letterSpacing: -0.2 }}>
              新規ラウンドを記録
            </Text>
            <Text style={{ color: WHITE_70, fontSize: 12.5, marginTop: 2 }}>
              スコアカードを撮影して自動入力
            </Text>
          </View>
          <IconSymbol name="chevron.right" size={20} color={WHITE_70} />
        </TouchableOpacity>

        {/* ─── パット率リング ───────────────────────────────────────── */}
        <View style={{ flexDirection: "row", gap: 12 }}>
          <RingCard
            label="1パット率"
            hint="高いほど良い"
            value={onePuttRate}
            max={60}
            displayValue={onePuttRate.toFixed(0)}
            color={colors.success}
            trackColor={colors.border}
            valueColor={colors.foreground}
            colors={colors}
          />
          <RingCard
            label="3パット率"
            hint="低いほど良い"
            value={threePuttRate}
            max={30}
            displayValue={threePuttRate.toFixed(0)}
            color={threePuttRate > 10 ? colors.error : colors.warning}
            trackColor={colors.border}
            valueColor={colors.foreground}
            colors={colors}
          />
        </View>

        {/* ─── 平均パットの推移 ─────────────────────────────────────── */}
        <View
          style={[
            {
              backgroundColor: colors.surface,
              borderRadius: 20,
              padding: 18,
              borderWidth: 1,
              borderColor: colors.border,
            },
            shadowMd,
          ]}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>平均パットの推移</Text>
              {diff != null && <TrendChip diff={diff} colors={colors} />}
            </View>
            <TouchableOpacity onPress={onOpenAnalytics} hitSlop={8}>
              <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "600" }}>分析 →</Text>
            </TouchableOpacity>
          </View>

          {trendValues.length >= 2 ? (
            <View style={{ marginTop: 12 }}>
              <Sparkline values={trendValues} color={colors.primary} trackColor={colors.border} />
              <Text style={{ color: colors.muted, fontSize: 11, marginTop: 6 }}>
                直近{trendValues.length}ラウンド（1ホールあたりパット数）
              </Text>
            </View>
          ) : (
            <Text style={{ color: colors.muted, fontSize: 13, marginTop: 12 }}>
              ラウンドを2回以上記録すると推移が表示されます
            </Text>
          )}
        </View>

        {/* ─── 最近のラウンド ───────────────────────────────────────── */}
        <View style={{ marginTop: 4 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <Text style={{ fontSize: 12, fontWeight: "700", letterSpacing: 1.2, color: colors.muted }}>
              最近のラウンド
            </Text>
            {rounds.length > 0 && (
              <TouchableOpacity onPress={onOpenRounds} hitSlop={8}>
                <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "600" }}>すべて見る →</Text>
              </TouchableOpacity>
            )}
          </View>

          {recentRounds.length > 0 ? (
            <View style={{ gap: 12 }}>
              {recentRounds.map((round) => (
                <RoundCard key={round.id} round={round} onPress={() => onOpenRound(round.id)} colors={colors} />
              ))}
            </View>
          ) : (
            <View
              style={[
                {
                  backgroundColor: colors.surface,
                  borderRadius: 20,
                  paddingVertical: 36,
                  paddingHorizontal: 24,
                  alignItems: "center",
                  borderWidth: 1,
                  borderColor: colors.border,
                },
                shadowSm,
              ]}
            >
              <View
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 32,
                  backgroundColor: `${colors.primary}12`,
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 14,
                }}
              >
                <IconSymbol name="flag.fill" size={30} color={colors.primary} />
              </View>
              <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 15, textAlign: "center" }}>
                まだラウンド記録がありません
              </Text>
              <Text style={{ color: colors.muted, fontSize: 13, textAlign: "center", marginTop: 4 }}>
                上の「新規ラウンドを記録」から始めましょう
              </Text>
            </View>
          )}
        </View>
      </View>
    </ScrollView>
  );
}

function TrendChip({ diff, colors }: { diff: number; colors: ReturnType<typeof useColors> }) {
  // パットは少ないほど良い → diff < 0 が改善
  const improved = diff < -0.05;
  const worsened = diff > 0.05;
  const tone = improved ? colors.success : worsened ? colors.error : colors.muted;
  const arrow = improved ? "↓" : worsened ? "↑" : "→";
  const label = improved || worsened ? `${arrow} ${Math.abs(diff).toFixed(1)}` : "横ばい";
  return (
    <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, backgroundColor: `${tone}1A` }}>
      <Text style={{ color: tone, fontSize: 11.5, fontWeight: "700" }}>{label}</Text>
      {(improved || worsened) && (
        <Text style={{ color: tone, fontSize: 10, fontWeight: "600", marginLeft: 3 }}>前回比</Text>
      )}
    </View>
  );
}

function HeroStat({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ color: WHITE_70, fontSize: 10.5, fontWeight: "700", letterSpacing: 0.8 }}>
        {label.toUpperCase()}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "baseline", marginTop: 3 }}>
        <Text style={{ color: "#FFFFFF", fontSize: 22, fontWeight: "800", letterSpacing: -0.5 }}>{value}</Text>
        {suffix ? <Text style={{ color: WHITE_70, fontSize: 12, fontWeight: "700", marginLeft: 2 }}>{suffix}</Text> : null}
      </View>
    </View>
  );
}

function RingCard({
  label,
  hint,
  value,
  max,
  displayValue,
  color,
  trackColor,
  valueColor,
  colors,
}: {
  label: string;
  hint: string;
  value: number;
  max: number;
  displayValue: string;
  color: string;
  trackColor: string;
  valueColor: string;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View
      style={[
        {
          flex: 1,
          backgroundColor: colors.surface,
          borderRadius: 20,
          paddingVertical: 18,
          alignItems: "center",
          borderWidth: 1,
          borderColor: colors.border,
        },
        shadowMd,
      ]}
    >
      <StatRing
        value={value}
        max={max}
        displayValue={displayValue}
        unit="%"
        color={color}
        trackColor={trackColor}
        valueColor={valueColor}
        size={92}
        strokeWidth={9}
      />
      <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 14, marginTop: 12 }}>{label}</Text>
      <Text style={{ color: colors.muted, fontSize: 11, marginTop: 2 }}>{hint}</Text>
    </View>
  );
}

function RoundCard({
  round,
  onPress,
  colors,
}: {
  round: Round;
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  const holesPlayed = round.holes?.length ?? 0;
  const avgPutts = holesPlayed > 0 ? (round.totalPutts / holesPlayed).toFixed(1) : "–";
  const grassLabel =
    round.grassType === "bent" ? "ベント" : round.grassType === "korai" ? "高麗" : round.grassType;
  const condLabel =
    round.greenCondition === "excellent" ? "優" : round.greenCondition === "good" ? "良" : "可";

  return (
    <TouchableOpacity
      style={[
        { backgroundColor: colors.surface, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: colors.border },
        shadowMd,
      ]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        {/* パット数バッジ */}
        <View
          style={{
            width: 54,
            height: 54,
            borderRadius: 16,
            backgroundColor: `${colors.primary}12`,
            alignItems: "center",
            justifyContent: "center",
            marginRight: 14,
          }}
        >
          <Text style={{ fontSize: 22, fontWeight: "800", color: colors.primary, letterSpacing: -0.5 }}>
            {round.totalPutts}
          </Text>
          <Text style={{ fontSize: 8.5, fontWeight: "700", color: colors.primary, opacity: 0.7, letterSpacing: 0.5 }}>
            PUTTS
          </Text>
        </View>

        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 16 }} numberOfLines={1}>
            {round.courseName}
          </Text>
          <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>{formatDate(round.date)}</Text>
          <View style={{ flexDirection: "row", gap: 6, marginTop: 8, alignItems: "center" }}>
            <Chip label={grassLabel} colors={colors} />
            <Chip label={`${round.stimpmeter}ft`} colors={colors} />
            <Chip
              label={condLabel}
              colors={colors}
              tone={round.greenCondition === "excellent" ? "success" : "default"}
            />
          </View>
        </View>

        <View style={{ alignItems: "flex-end", marginLeft: 8 }}>
          <Text style={{ color: colors.muted, fontSize: 10, fontWeight: "600", letterSpacing: 0.5 }}>平均</Text>
          <Text style={{ color: colors.foreground, fontSize: 17, fontWeight: "800" }}>{avgPutts}</Text>
          <IconSymbol name="chevron.right" size={15} color={colors.muted} style={{ marginTop: 2 }} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

function Chip({
  label,
  colors,
  tone = "default",
}: {
  label: string;
  colors: ReturnType<typeof useColors>;
  tone?: "default" | "success";
}) {
  const bg = tone === "success" ? `${colors.success}1A` : `${colors.primary}0F`;
  const fg = tone === "success" ? colors.success : colors.muted;
  return (
    <View style={{ paddingHorizontal: 9, paddingVertical: 3, borderRadius: 8, backgroundColor: bg }}>
      <Text style={{ fontSize: 11, fontWeight: "600", color: fg }}>{label}</Text>
    </View>
  );
}
