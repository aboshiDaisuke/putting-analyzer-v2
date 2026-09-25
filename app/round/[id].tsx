/**
 * ラウンド詳細。結論（損得・パット数の内訳）→ グリーンマップ → カードと同じ並びの表。
 * 未入力のラウンドでは「カードを撮影」「手入力」を大きく出す。
 */
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { ConfirmBox } from "@/components/ui/confirm-box";
import { ErrorBanner } from "@/components/ui/error-banner";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { GreenMapCard } from "@/components/analysis/green-map-card";
import { useDivergingColors } from "@/components/analysis/charts";
import { formatStrokes } from "@/components/analysis/ui";
import { HoleTable } from "@/components/round/hole-table";
import { useColors } from "@/hooks/use-colors";
import { useBaseline } from "@/hooks/use-baseline";
import { shadowSm } from "@/lib/card-shadow";
import { hapticSuccess } from "@/lib/haptics";
import { BASELINES, greenPoints, holeObservations, sgSummary } from "@/lib/putting-stats";
import { deleteRound, getRoundWithPending, getUserProfile, resetRoundHoles } from "@/lib/storage";
import { LABELS, type Round } from "@/lib/types";

export default function RoundDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const pal = useDivergingColors();
  const { width: screenW } = useWindowDimensions();
  const contentW = Math.min(screenW, 760) - 32;

  const [round, setRound] = useState<Round | null>(null);
  const [handicap, setHandicap] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"delete" | "reset" | null>(null);
  const [baseline] = useBaseline(handicap);

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      let alive = true;
      setLoadError(null);
      Promise.all([getRoundWithPending(id), getUserProfile().catch(() => null)])
        .then(([r, p]) => {
          if (!alive) return;
          if (r) setRound(r);
          else setLoadError("ラウンドが見つかりません");
          setHandicap(p?.handicap ?? null);
        })
        .catch((e) => alive && setLoadError(`読み込みに失敗しました（${e instanceof Error ? e.message : String(e)}）`));
      return () => {
        alive = false;
      };
    }, [id]),
  );

  const view = useMemo(() => {
    if (!round) return null;
    const holes = holeObservations([round], baseline);
    const sgByHole = new Map(holes.map((h) => [h.hole.holeNumber, h.sg]));
    return {
      holes,
      sg: sgSummary(holes),
      points: greenPoints(holes),
      sgByHole,
      played: holes.length,
      putts: holes.reduce((s, h) => s + h.total, 0),
      one: holes.filter((h) => h.total === 1).length,
      three: holes.filter((h) => h.total >= 3).length,
    };
  }, [round, baseline]);

  const onConfirm = async () => {
    if (!round || !confirm) return;
    if (confirm === "delete") {
      await deleteRound(round.id);
      hapticSuccess();
      router.back();
      return;
    }
    await resetRoundHoles(round.id);
    setConfirm(null);
    const r = await getRoundWithPending(round.id);
    setRound(r);
  };

  if (loadError) {
    return (
      <ScreenContainer className="p-4">
        <Header onBack={() => router.back()} title="ラウンド" />
        <ErrorBanner message={loadError} />
      </ScreenContainer>
    );
  }
  if (!round || !view) {
    return (
      <ScreenContainer className="items-center justify-center">
        <ActivityIndicator size="large" color={colors.primary} />
      </ScreenContainer>
    );
  }

  const d = new Date(`${round.date}T00:00:00`);
  const chips = [
    round.stimpmeter ? `${round.stimpmeter}ft` : null,
    round.grassType ? LABELS.grassType[round.grassType] : null,
    round.putterName || null,
    round.weather ? LABELS.weather[round.weather] : null,
  ].filter(Boolean) as string[];
  const empty = view.played === 0;

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={{ alignItems: "center", paddingBottom: 40 }}>
        <View style={{ width: contentW, gap: 16 }}>
          <Header onBack={() => router.back()} title={`${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`} />
          <View>
            <Text accessibilityRole="header" style={{ color: colors.foreground, fontSize: 26, fontWeight: "900", letterSpacing: -0.4 }}>
              {round.courseName}
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
              {chips.map((c) => (
                <View key={c} style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, backgroundColor: `${colors.primary}14` }}>
                  <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "700" }}>{c}</Text>
                </View>
              ))}
            </View>
          </View>

          {empty ? (
            <View style={[{ backgroundColor: colors.surface, borderRadius: 22, padding: 20, borderWidth: 1, borderColor: colors.border, gap: 12 }, shadowSm]}>
              <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "900" }}>ホールの記録を入れましょう</Text>
              <Text style={{ color: colors.muted, fontSize: 15, lineHeight: 22 }}>
                パッティングカードの表（OUT）と裏（IN）を撮影すると、18ホールをまとめて読み取ります。
              </Text>
              <BigButton icon="camera.fill" label="カードを撮影して読み取る" primary onPress={() => router.push(`/scan-card?roundId=${round.id}` as never)} />
              <BigButton icon="pencil" label="手で入力する" onPress={() => router.push(`/hole-input/${round.id}` as never)} />
            </View>
          ) : (
            <>
              <View style={{ backgroundColor: "#10271A", borderRadius: 24, padding: 20 }}>
                <Text style={{ color: "#B9C7BC", fontSize: 14, fontWeight: "700" }}>{`${BASELINES[baseline].label}と比べて（${view.played}H）`}</Text>
                <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8, marginTop: 4 }}>
                  <Text style={{ color: "#F3EFE4", fontSize: 44, fontWeight: "900", fontVariant: ["tabular-nums"] }}>{formatStrokes(view.sg.sgPer18)}</Text>
                  <Text style={{ color: "#F3EFE4", fontSize: 16, fontWeight: "700" }}>打 / 18H換算</Text>
                </View>
                <View style={{ flexDirection: "row", marginTop: 14, gap: 8 }}>
                  <Mini label="パット" value={`${view.putts}`} />
                  <Mini label="期待値" value={((view.sg.expectedPer18 * view.played) / 18).toFixed(1)} />
                  <Mini label="1パット" value={`${view.one}`} />
                  <Mini label="3パット" value={`${view.three}`} color={view.three > 0 ? pal.loss : undefined} />
                </View>
                <Text style={{ color: "#B9C7BC", fontSize: 13, marginTop: 10, lineHeight: 19 }}>
                  期待値＝同じ1st パットの距離から{BASELINES[baseline].short}が打った場合のパット数
                </Text>
              </View>

              <View style={{ flexDirection: "row", gap: 10 }}>
                <SmallButton icon="camera.fill" label="カードを読み取る" onPress={() => router.push(`/scan-card?roundId=${round.id}` as never)} />
                <SmallButton icon="pencil" label="手入力で編集" onPress={() => router.push(`/hole-input/${round.id}` as never)} />
              </View>

              {view.points.length > 0 && <GreenMapCard points={view.points} title="このラウンドのグリーンマップ" height={Math.min(360, contentW * 0.9)} />}

              {[
                { title: "OUT（1〜9）", holes: round.holes.filter((h) => h.holeNumber <= 9) },
                { title: "IN（10〜18）", holes: round.holes.filter((h) => h.holeNumber >= 10) },
              ].map((g) => (
                <HoleTable
                  key={g.title}
                  title={g.title}
                  holes={g.holes}
                  sgByHole={view.sgByHole}
                  onPressHole={(n) => router.push(`/hole-input/${round.id}?hole=${n}` as never)}
                />
              ))}
            </>
          )}

          {confirm ? (
            <ConfirmBox
              message={confirm === "delete" ? "このラウンドを削除しますか？" : "ホールの記録をすべて消しますか？"}
              detail="この操作は取り消せません"
              confirmLabel={confirm === "delete" ? "削除する" : "消去する"}
              onConfirm={() => void onConfirm()}
              onCancel={() => setConfirm(null)}
            />
          ) : (
            <View style={{ flexDirection: "row", gap: 16, justifyContent: "center", marginTop: 8 }}>
              {!empty && (
                <Pressable onPress={() => setConfirm("reset")} style={{ minHeight: 44, justifyContent: "center" }}>
                  <Text style={{ color: colors.muted, fontSize: 15, fontWeight: "700" }}>記録をリセット</Text>
                </Pressable>
              )}
              <Pressable onPress={() => setConfirm("delete")} style={{ minHeight: 44, justifyContent: "center" }}>
                <Text style={{ color: colors.error, fontSize: 15, fontWeight: "700" }}>ラウンドを削除</Text>
              </Pressable>
            </View>
          )}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

function Header({ onBack, title }: { onBack: () => void; title: string }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 8 }}>
      <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="戻る" style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center", marginLeft: -10 }}>
        <IconSymbol name="arrow.left" size={24} color={colors.foreground} />
      </Pressable>
      <Text style={{ color: colors.muted, fontSize: 15, fontWeight: "700" }}>{title}</Text>
    </View>
  );
}

function Mini({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: "#FFFFFF10", borderRadius: 12, paddingVertical: 8, alignItems: "center" }}>
      <Text style={{ color: color ?? "#F3EFE4", fontSize: 20, fontWeight: "900", fontVariant: ["tabular-nums"] }}>{value}</Text>
      <Text style={{ color: "#B9C7BC", fontSize: 12, fontWeight: "700" }}>{label}</Text>
    </View>
  );
}

function BigButton({ icon, label, onPress, primary }: { icon: "camera.fill" | "pencil"; label: string; onPress: () => void; primary?: boolean }) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        minHeight: 54,
        paddingHorizontal: 16,
        borderRadius: 16,
        backgroundColor: primary ? colors.primary : colors.background,
        borderWidth: primary ? 0 : 1,
        borderColor: colors.border,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <IconSymbol name={icon} size={22} color={primary ? colors.onPrimary : colors.primary} />
      <Text style={{ color: primary ? colors.onPrimary : colors.foreground, fontSize: 17, fontWeight: "800" }}>{label}</Text>
    </Pressable>
  );
}

function SmallButton({ icon, label, onPress }: { icon: "camera.fill" | "pencil"; label: string; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 48, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.85 : 1 },
        shadowSm,
      ]}
    >
      <IconSymbol name={icon} size={20} color={colors.primary} />
      <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: "800" }}>{label}</Text>
    </Pressable>
  );
}
