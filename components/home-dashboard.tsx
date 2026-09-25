// ホーム画面の表示専用コンポーネント（データ取得は app/(tabs)/index.tsx）。
//  - 3D グリーンのヒーロー（ボールが曲がって入る）に「最近の調子」を重ねる
//  - 主役の CTA は「ラウンドを記録」。カード撮影・印刷にもすぐ行ける
//  - 今いちばん伸びしろのある練習テーマと、最近のラウンド（1ラウンドの損得つき）
import { useMemo } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View, useWindowDimensions } from "react-native";

import { GreenScene } from "@/components/green/green-scene";
import { STAGE } from "@/components/green/green-types";
import { useDivergingColors } from "@/components/analysis/charts";
import { formatStrokes } from "@/components/analysis/ui";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { shadowPrimary, shadowSm } from "@/lib/card-shadow";
import {
  BASELINES,
  holeObservations,
  practicePriorities,
  roundSgSeries,
  sgSummary,
  type BaselineId,
} from "@/lib/putting-stats";
import { Round, UserProfile } from "@/lib/types";

type Props = {
  rounds: Round[];
  profile: UserProfile | null;
  baseline: BaselineId;
  isDemo?: boolean;
  /** オフラインで端末に保留中のホール保存件数（ラウンド単位） */
  pendingSaves?: number;
  refreshing: boolean;
  onRefresh: () => void;
  onNewRound: () => void;
  onScan: () => void;
  onPrintCard: () => void;
  onOpenAnalytics: () => void;
  onOpenRounds: () => void;
  onOpenRound: (id: string) => void;
  onExitDemo?: () => void;
};

export function HomeDashboard({
  rounds,
  profile,
  baseline,
  isDemo,
  pendingSaves = 0,
  refreshing,
  onRefresh,
  onNewRound,
  onScan,
  onPrintCard,
  onOpenAnalytics,
  onOpenRounds,
  onOpenRound,
  onExitDemo,
}: Props) {
  const colors = useColors();
  const pal = useDivergingColors();
  const { width: screenW } = useWindowDimensions();
  const contentW = Math.min(screenW, 760) - 32;

  const played = useMemo(
    () => rounds.filter((r) => r.holes.some((h) => h.totalPutts > 0)).sort((a, b) => b.date.localeCompare(a.date)),
    [rounds],
  );
  const stats = useMemo(() => {
    const recent = played.slice(0, 5);
    const holes = holeObservations(recent, baseline);
    const all = holeObservations(played, baseline);
    const series = roundSgSeries(all);
    const bySg = new Map(series.map((s) => [s.roundId, s]));
    return {
      recent: sgSummary(holes),
      threePuttsPerRound: holes.length ? (holes.filter((h) => h.total >= 3).length / holes.length) * 18 : 0,
      top: practicePriorities(all, baseline)[0] ?? null,
      bySg,
    };
  }, [played, baseline]);

  const hour = new Date().getHours();
  const greeting = hour < 11 ? "おはようございます" : hour < 18 ? "こんにちは" : "こんばんは";
  const name = profile?.name ? `${profile.name}さん` : "ようこそ";
  const heroH = Math.min(340, Math.max(260, contentW * 0.72));
  const hasData = stats.recent.holes > 0;

  return (
    <ScrollView
      contentContainerStyle={{ paddingBottom: 32, alignItems: "center" }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
    >
      <View style={{ width: contentW, gap: 16, paddingTop: 12 }}>
        {isDemo && (
          <Banner
            tone="accent"
            icon="sparkles"
            text="デモモードで表示中です（サンプルの22ラウンド）。記録や編集も試せます。"
            action={onExitDemo ? { label: "終了", onPress: onExitDemo } : undefined}
          />
        )}
        {pendingSaves > 0 && (
          <Banner tone="warning" icon="flag.fill" text={`未送信の入力が${pendingSaves}ラウンド分あります。接続が戻ると自動で送信します（下に引いて再試行）。`} />
        )}

        {/* ─── ヒーロー: 3D グリーン ─── */}
        <View style={{ borderRadius: 26, overflow: "hidden", backgroundColor: STAGE.bgBottom }}>
          <GreenScene mode="hero" height={heroH} radius={0} accessibilityLabel="グリーン上でボールが曲がりながらカップに入るアニメーション" />
          <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: 0, padding: 20 }}>
            <Text style={{ color: STAGE.textMuted, fontSize: 14, fontWeight: "700" }}>{greeting}</Text>
            <Text style={{ color: STAGE.text, fontSize: 26, fontWeight: "900", marginTop: 2, letterSpacing: -0.4 }}>{name}</Text>
          </View>
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: 14,
              right: 14,
              bottom: 14,
              padding: 14,
              borderRadius: 18,
              backgroundColor: "rgba(7,19,12,0.72)",
              flexDirection: "row",
              gap: 12,
            }}
          >
            {hasData ? (
              <>
                <HeroStat label={`直近5Rの損得（${BASELINES[baseline].short}比）`} value={formatStrokes(stats.recent.sgPer18)} unit="打/R" flex={1.5} />
                <HeroStat label="パット/R" value={stats.recent.actualPer18.toFixed(1)} />
                <HeroStat label="3パット/R" value={stats.threePuttsPerRound.toFixed(1)} />
              </>
            ) : (
              <Text style={{ color: STAGE.text, fontSize: 15, lineHeight: 22, flex: 1 }}>
                カードに記録して撮影するだけ。どの距離で何打失っているかが分かります。
              </Text>
            )}
          </View>
        </View>

        {/* ─── CTA ─── */}
        <Pressable
          onPress={onNewRound}
          accessibilityRole="button"
          style={({ pressed }) => [
            {
              backgroundColor: colors.primary,
              borderRadius: 20,
              paddingVertical: 16,
              paddingHorizontal: 18,
              flexDirection: "row",
              alignItems: "center",
              opacity: pressed ? 0.9 : 1,
            },
            shadowPrimary,
          ]}
        >
          <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.16)", alignItems: "center", justifyContent: "center", marginRight: 14 }}>
            <IconSymbol name="plus" size={24} color={colors.onPrimary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.onPrimary, fontWeight: "900", fontSize: 18 }}>ラウンドを記録</Text>
            <Text style={{ color: colors.onPrimary, opacity: 0.85, fontSize: 14, marginTop: 2 }}>カードを撮影 or 手入力</Text>
          </View>
          <IconSymbol name="chevron.right" size={22} color={colors.onPrimary} />
        </Pressable>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <SubAction icon="camera.fill" title="カードを撮影" note="表と裏の2枚" onPress={onScan} />
          <SubAction icon="printer.fill" title="カードを印刷" note="A4・二つ折り" onPress={onPrintCard} />
        </View>

        {/* ─── 今の練習テーマ ─── */}
        {stats.top && (
          <Pressable onPress={onOpenAnalytics} accessibilityRole="button">
            <View style={[{ backgroundColor: colors.surface, borderRadius: 22, padding: 18, borderWidth: 1, borderColor: colors.border }, shadowSm]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <IconSymbol name="target" size={18} color={colors.accent} />
                <Text style={{ color: colors.muted, fontSize: 14, fontWeight: "800" }}>いちばんの伸びしろ</Text>
              </View>
              <Text style={{ color: colors.foreground, fontSize: 20, fontWeight: "900", marginTop: 8 }}>{stats.top.title}</Text>
              <Text style={{ color: colors.foreground, fontSize: 16, marginTop: 4, lineHeight: 23 }}>
                {`1ラウンドあたり約${stats.top.strokesPer18.toFixed(1)}打。${stats.top.evidence}`}
              </Text>
              <Text style={{ color: colors.primary, fontSize: 15, fontWeight: "800", marginTop: 10 }}>練習メニューと詳しい分析 →</Text>
            </View>
          </Pressable>
        )}

        {/* ─── 最近のラウンド ─── */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
          <Text accessibilityRole="header" style={{ color: colors.foreground, fontSize: 18, fontWeight: "900" }}>最近のラウンド</Text>
          {played.length > 3 && (
            <Pressable onPress={onOpenRounds} hitSlop={8} style={{ minHeight: 44, justifyContent: "center" }}>
              <Text style={{ color: colors.primary, fontSize: 15, fontWeight: "700" }}>すべて見る →</Text>
            </Pressable>
          )}
        </View>
        {rounds.length === 0 ? (
          <View style={{ backgroundColor: colors.surface, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: colors.border, alignItems: "center" }}>
            <Text style={{ color: colors.foreground, fontWeight: "800", fontSize: 16 }}>まだラウンドがありません</Text>
            <Text style={{ color: colors.muted, fontSize: 14, marginTop: 4, textAlign: "center", lineHeight: 20 }}>
              カードを印刷して次のラウンドに持って行きましょう
            </Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {rounds.slice(0, 3).map((r) => {
              const s = stats.bySg.get(r.id);
              return (
                <Pressable
                  key={r.id}
                  onPress={() => onOpenRound(r.id)}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    { backgroundColor: colors.surface, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center", gap: 12, opacity: pressed ? 0.85 : 1 },
                    shadowSm,
                  ]}
                >
                  <DateBadge date={r.date} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "800" }} numberOfLines={1}>
                      {r.courseName}
                    </Text>
                    <Text style={{ color: colors.muted, fontSize: 14, marginTop: 2 }}>
                      {s ? `${s.putts}パット・${s.holes}H・3パット${s.threePutts}回` : "未入力"}
                    </Text>
                  </View>
                  {s && (
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={{ color: s.sgPer18 >= 0 ? pal.gain : pal.loss, fontSize: 18, fontWeight: "900", fontVariant: ["tabular-nums"] }}>
                        {formatStrokes(s.sgPer18)}
                      </Text>
                      <Text style={{ color: colors.muted, fontSize: 12 }}>打/R</Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

function HeroStat({ label, value, unit, flex = 1 }: { label: string; value: string; unit?: string; flex?: number }) {
  return (
    <View style={{ flex }}>
      <Text style={{ color: STAGE.textMuted, fontSize: 12, fontWeight: "700" }} numberOfLines={2}>
        {label}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "baseline", marginTop: 2 }}>
        <Text style={{ color: STAGE.text, fontSize: 24, fontWeight: "900", fontVariant: ["tabular-nums"] }}>{value}</Text>
        {unit ? <Text style={{ color: STAGE.textMuted, fontSize: 12, fontWeight: "700", marginLeft: 3 }}>{unit}</Text> : null}
      </View>
    </View>
  );
}

function SubAction({ icon, title, note, onPress }: { icon: "camera.fill" | "printer.fill"; title: string; note: string; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        { flex: 1, backgroundColor: colors.surface, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.85 : 1 },
        shadowSm,
      ]}
    >
      <IconSymbol name={icon} size={22} color={colors.primary} />
      <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "800", marginTop: 8 }}>{title}</Text>
      <Text style={{ color: colors.muted, fontSize: 13, marginTop: 2 }}>{note}</Text>
    </Pressable>
  );
}

function DateBadge({ date }: { date: string }) {
  const colors = useColors();
  const d = new Date(`${date}T00:00:00`);
  return (
    <View style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: `${colors.primary}18`, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "800" }}>{`${d.getMonth() + 1}月`}</Text>
      <Text style={{ color: colors.primary, fontSize: 20, fontWeight: "900", marginTop: -2 }}>{d.getDate()}</Text>
    </View>
  );
}

function Banner({
  tone,
  icon,
  text,
  action,
}: {
  tone: "warning" | "accent";
  icon: "flag.fill" | "sparkles";
  text: string;
  action?: { label: string; onPress: () => void };
}) {
  const colors = useColors();
  const c = tone === "warning" ? colors.warning : colors.accent;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: `${c}1A`, borderColor: `${c}55`, borderWidth: 1, borderRadius: 14, padding: 12 }}>
      <IconSymbol name={icon} size={18} color={c} />
      <Text style={{ color: colors.foreground, fontSize: 14, flex: 1, lineHeight: 20 }}>{text}</Text>
      {action && (
        <Pressable onPress={action.onPress} accessibilityRole="button" style={{ minHeight: 40, paddingHorizontal: 12, justifyContent: "center", borderRadius: 10, backgroundColor: colors.surface }}>
          <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: "800" }}>{action.label}</Text>
        </Pressable>
      )}
    </View>
  );
}
