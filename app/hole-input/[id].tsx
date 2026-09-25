/**
 * ホールの手入力（カード v3 と同じ項目）。
 *   何のパット？ → パット数 → 各パットの距離・傾斜・曲がり（1st が外れたら 短/長）
 * ホールを移るたびにそのホールだけ保存する（圏外なら端末に保留して後で送信）。
 * 距離は m で入力。「歩」に切り替えるとプロフィールの歩幅で m に換算する。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { ErrorBanner } from "@/components/ui/error-banner";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useDivergingColors } from "@/components/analysis/charts";
import { formatStrokes } from "@/components/analysis/ui";
import { useColors } from "@/hooks/use-colors";
import { useBaseline } from "@/hooks/use-baseline";
import { hapticLight, hapticSuccess } from "@/lib/haptics";
import { buildHole, holeToEntry, type HoleEntry, type PuttEntry } from "@/lib/putting";
import { BASELINES, expectedPutts } from "@/lib/putting-stats";
import { getRoundWithPending, getUserProfile, saveHolesForRound } from "@/lib/storage";
import type { MissLength, Round, ScoreResult, SlopeLeftRight, SlopeUpDown } from "@/lib/types";

const PUTT_FOR_OPTIONS: { value: ScoreResult; label: string; code: string }[] = [
  { value: "eagle", label: "イーグル", code: "E" },
  { value: "birdie", label: "バーディ", code: "Ba" },
  { value: "par", label: "パー", code: "P" },
  { value: "bogey", label: "ボギー", code: "Bo" },
  { value: "double_bogey_plus", label: "ダボ+", code: "D+" },
];
const UD_OPTIONS: { value: SlopeUpDown; label: string }[] = [
  { value: "flat", label: "平ら" },
  { value: "uphill", label: "上り" },
  { value: "downhill", label: "下り" },
];
const LR_OPTIONS: { value: SlopeLeftRight; label: string }[] = [
  { value: "straight", label: "まっすぐ" },
  { value: "left", label: "左へ" },
  { value: "right", label: "右へ" },
];
const MISS_OPTIONS: { value: MissLength; label: string }[] = [
  { value: "short", label: "ショート" },
  { value: "long", label: "オーバー" },
];
const ORDINAL = ["1st", "2nd", "3rd"];

type Draft = HoleEntry & { distText: string[] };

function toDraft(entry: HoleEntry): Draft {
  const putts: PuttEntry[] = [0, 1, 2].map((i) => entry.putts[i] ?? { meters: null });
  return { ...entry, putts, distText: putts.map((p) => (p.meters != null ? String(p.meters) : "")) };
}

function emptyDraft(holeNumber: number): Draft {
  return toDraft({ holeNumber, puttFor: null, totalPutts: 0, putts: [] });
}

function shiftLabel(puttFor: ScoreResult | null, i: number): string {
  if (!puttFor) return "";
  const idx = Math.min(4, PUTT_FOR_OPTIONS.findIndex((o) => o.value === puttFor) + i);
  return `${PUTT_FOR_OPTIONS[idx].label}パット`;
}

export default function HoleInputScreen() {
  const router = useRouter();
  const { id, hole } = useLocalSearchParams<{ id: string; hole?: string }>();
  const colors = useColors();
  const pal = useDivergingColors();
  const { width: screenW } = useWindowDimensions();
  const contentW = Math.min(screenW, 720) - 32;

  const [round, setRound] = useState<Round | null>(null);
  const [stride, setStride] = useState(0.75);
  const [handicap, setHandicap] = useState<number | null>(null);
  const [baseline] = useBaseline(handicap);
  const [current, setCurrent] = useState(Math.min(18, Math.max(1, Number(hole) || 1)));
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [dirty, setDirty] = useState<Set<number>>(new Set());
  const [unit, setUnit] = useState<"m" | "step">("m");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const stripRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (!id) return;
    Promise.all([getRoundWithPending(id), getUserProfile().catch(() => null)])
      .then(([r, p]) => {
        if (!r) {
          setError("ラウンドが見つかりません");
          return;
        }
        setRound(r);
        const map: Record<number, Draft> = {};
        for (let n = 1; n <= 18; n++) {
          const h = r.holes.find((x) => x.holeNumber === n);
          map[n] = h && h.totalPutts > 0 ? toDraft(holeToEntry(h)) : emptyDraft(n);
        }
        setDrafts(map);
        if (p?.strideLength) setStride(p.strideLength);
        setHandicap(p?.handicap ?? null);
      })
      .catch((e) => setError(`読み込みに失敗しました（${e instanceof Error ? e.message : String(e)}）`));
  }, [id]);

  useEffect(() => {
    stripRef.current?.scrollTo({ x: Math.max(0, (current - 3) * 50), animated: true });
  }, [current]);

  const draft = drafts[current];

  const update = (fn: (d: Draft) => Draft) => {
    setDrafts((prev) => ({ ...prev, [current]: fn(prev[current]) }));
    setDirty((prev) => new Set(prev).add(current));
  };
  const setPutt = (i: number, patch: Partial<PuttEntry>) =>
    update((d) => ({ ...d, putts: d.putts.map((p, j) => (j === i ? { ...p, ...patch } : p)) }));
  const setDist = (i: number, text: string) => {
    const clean = text.replace(/[^0-9.]/g, "");
    const n = Number(clean);
    const meters = clean && Number.isFinite(n) && n > 0 ? (unit === "step" ? Math.round(n * stride * 10) / 10 : n) : null;
    update((d) => ({
      ...d,
      distText: d.distText.map((t, j) => (j === i ? clean : t)),
      putts: d.putts.map((p, j) => (j === i ? { ...p, meters } : p)),
    }));
  };

  const preview = useMemo(() => {
    if (!draft || draft.totalPutts === 0) return null;
    const first = draft.putts[0]?.meters;
    if (!first) return null;
    return expectedPutts(first, baseline) - draft.totalPutts;
  }, [draft, baseline]);

  const saveCurrent = async (): Promise<boolean> => {
    if (!round || !draft || !dirty.has(current)) return true;
    setSaving(true);
    setError(null);
    try {
      const built = buildHole(draft);
      const res = await saveHolesForRound(round.id, [built]);
      setNotice(res.queued ? "電波が無いため端末に保存しました。接続が戻ると自動で送信します。" : null);
      setRound((r) => (r ? { ...r, holes: r.holes.map((h) => (h.holeNumber === current ? built : h)) } : r));
      setDirty((prev) => {
        const next = new Set(prev);
        next.delete(current);
        return next;
      });
      return true;
    } catch (e) {
      setError(`保存に失敗しました（${e instanceof Error ? e.message : String(e)}）`);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const go = async (target: number | "finish") => {
    if (saving) return;
    const ok = await saveCurrent();
    if (!ok) return;
    hapticLight();
    if (target === "finish") {
      hapticSuccess();
      router.replace(`/round/${id}` as never);
      return;
    }
    setCurrent(target);
  };

  if (!round || !draft) {
    return (
      <ScreenContainer className="p-4">
        {error ? <ErrorBanner message={error} /> : <Text style={{ color: colors.muted, fontSize: 16 }}>読み込み中…</Text>}
      </ScreenContainer>
    );
  }

  const recorded = Math.min(3, draft.totalPutts);

  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        {/* ヘッダー */}
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingTop: 6, gap: 4 }}>
          <Pressable onPress={() => void go("finish")} accessibilityRole="button" accessibilityLabel="保存して戻る" style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
            <IconSymbol name="arrow.left" size={24} color={colors.foreground} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.foreground, fontSize: 17, fontWeight: "900" }} numberOfLines={1}>{round.courseName}</Text>
            <Text style={{ color: colors.muted, fontSize: 13 }}>{`${round.date.replace(/-/g, "/")}・カードと同じ順で入力`}</Text>
          </View>
          <Pressable onPress={() => void go("finish")} accessibilityRole="button" style={{ minHeight: 44, paddingHorizontal: 14, justifyContent: "center", borderRadius: 12, backgroundColor: colors.primary }}>
            <Text style={{ color: colors.onPrimary, fontSize: 15, fontWeight: "800" }}>完了</Text>
          </Pressable>
        </View>

        {/* ホール選択 */}
        <ScrollView ref={stripRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 10, gap: 6 }} style={{ flexGrow: 0 }}>
          {Array.from({ length: 18 }, (_, i) => i + 1).map((n) => {
            const d = drafts[n];
            const filled = d && d.totalPutts > 0;
            const active = n === current;
            return (
              <Pressable
                key={n}
                onPress={() => void go(n)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${n}番ホール${filled ? `、${d.totalPutts}パット` : ""}`}
                style={{
                  width: 44,
                  height: 52,
                  borderRadius: 12,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: active ? colors.primary : filled ? `${colors.primary}1F` : colors.surface,
                  borderWidth: 1,
                  borderColor: active ? colors.primary : colors.border,
                }}
              >
                <Text style={{ color: active ? colors.onPrimary : colors.foreground, fontSize: 16, fontWeight: "900" }}>{n}</Text>
                <Text style={{ color: active ? colors.onPrimary : colors.muted, fontSize: 11, fontWeight: "700" }}>{filled ? `${d.totalPutts}打` : "–"}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <ScrollView contentContainerStyle={{ alignItems: "center", paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
          <View style={{ width: contentW, gap: 14 }}>
            {error && <ErrorBanner message={error} />}
            {notice && (
              <View style={{ padding: 12, borderRadius: 12, backgroundColor: `${colors.warning}1A`, borderWidth: 1, borderColor: `${colors.warning}55` }}>
                <Text style={{ color: colors.foreground, fontSize: 14 }}>{notice}</Text>
              </View>
            )}

            <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
              <Text accessibilityRole="header" style={{ color: colors.foreground, fontSize: 30, fontWeight: "900" }}>{`${current}番`}</Text>
              {preview != null && (
                <Text style={{ color: preview >= 0 ? pal.gain : pal.loss, fontSize: 16, fontWeight: "800" }}>
                  {`このホール ${formatStrokes(preview, 2)}打（${BASELINES[baseline].short}比）`}
                </Text>
              )}
            </View>

            <Field label="何のパット？" hint="1打目のパットが入れば何のスコアか">
              <Options
                options={PUTT_FOR_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                value={draft.puttFor}
                onChange={(v) => update((d) => ({ ...d, puttFor: v as ScoreResult | null }))}
              />
            </Field>

            <Field label="パット数">
              <View style={{ flexDirection: "row", gap: 8 }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Pressable
                    key={n}
                    onPress={() => update((d) => ({ ...d, totalPutts: d.totalPutts === n ? 0 : n }))}
                    accessibilityRole="button"
                    accessibilityState={{ selected: draft.totalPutts === n }}
                    style={{
                      flex: 1,
                      height: 56,
                      borderRadius: 14,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: draft.totalPutts === n ? colors.primary : colors.surface,
                      borderWidth: 1,
                      borderColor: draft.totalPutts === n ? colors.primary : colors.border,
                    }}
                  >
                    <Text style={{ color: draft.totalPutts === n ? colors.onPrimary : colors.foreground, fontSize: 22, fontWeight: "900" }}>{n === 5 ? "5+" : n}</Text>
                  </Pressable>
                ))}
              </View>
            </Field>

            {recorded > 0 && (
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
                <Text style={{ color: colors.muted, fontSize: 14 }}>距離の単位</Text>
                <MiniToggle
                  options={[
                    { value: "m", label: "m" },
                    { value: "step", label: `歩（${stride}m）` },
                  ]}
                  value={unit}
                  onChange={(u) => {
                    setUnit(u as "m" | "step");
                    // 表示中の数字を新しい単位に合わせて書き直す
                    update((d) => ({
                      ...d,
                      distText: d.putts.map((p) =>
                        p.meters == null ? "" : u === "step" ? String(Math.round(p.meters / stride)) : String(p.meters),
                      ),
                    }));
                  }}
                />
              </View>
            )}

            {Array.from({ length: recorded }, (_, i) => {
              const p = draft.putts[i];
              const holed = i + 1 === draft.totalPutts;
              return (
                <View key={i} style={{ backgroundColor: colors.surface, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: colors.border, gap: 12 }}>
                  <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
                    <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "900" }}>{`${ORDINAL[i]} パット`}</Text>
                    <Text style={{ color: colors.muted, fontSize: 14, fontWeight: "700" }}>
                      {[shiftLabel(draft.puttFor, i), holed ? "カップイン" : "外れ"].filter(Boolean).join("・")}
                    </Text>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <TextInput
                      value={draft.distText[i]}
                      onChangeText={(t) => setDist(i, t)}
                      keyboardType="decimal-pad"
                      inputMode="decimal"
                      placeholder={unit === "m" ? (i === 0 ? "例 8" : "例 1.2") : "歩数"}
                      placeholderTextColor={colors.muted}
                      accessibilityLabel={`${ORDINAL[i]}パットの距離`}
                      style={{
                        flex: 1,
                        height: 52,
                        borderRadius: 14,
                        borderWidth: 1,
                        borderColor: colors.border,
                        backgroundColor: colors.background,
                        paddingHorizontal: 14,
                        fontSize: 22,
                        fontWeight: "800",
                        color: colors.foreground,
                      }}
                    />
                    <Text style={{ color: colors.muted, fontSize: 16, fontWeight: "700", width: 64 }}>
                      {unit === "m" ? "m" : p.meters != null ? `= ${p.meters}m` : "歩"}
                    </Text>
                  </View>
                  {i < 2 && (
                    <>
                      <Options options={UD_OPTIONS} value={p.lineUD ?? null} onChange={(v) => setPutt(i, { lineUD: v as SlopeUpDown | null })} />
                      <Options options={LR_OPTIONS} value={p.lineLR ?? null} onChange={(v) => setPutt(i, { lineLR: v as SlopeLeftRight | null })} />
                    </>
                  )}
                  {i === 0 && !holed && (
                    <Options options={MISS_OPTIONS} value={p.missLength ?? null} onChange={(v) => setPutt(i, { missLength: v as MissLength | null })} />
                  )}
                </View>
              );
            })}
            {draft.totalPutts > 3 && (
              <Text style={{ color: colors.muted, fontSize: 14 }}>4打目以降の距離は記録しません（カードと同じ）。</Text>
            )}
          </View>
        </ScrollView>

        {/* 前後の移動 */}
        <View style={{ flexDirection: "row", gap: 10, padding: 12, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface }}>
          <Pressable
            disabled={current === 1 || saving}
            onPress={() => void go(current - 1)}
            style={{ flex: 1, minHeight: 52, borderRadius: 14, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, opacity: current === 1 ? 0.4 : 1 }}
          >
            <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "800" }}>← 前のホール</Text>
          </Pressable>
          <Pressable
            disabled={saving}
            onPress={() => void go(current === 18 ? "finish" : current + 1)}
            style={{ flex: 1.4, minHeight: 52, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary, opacity: saving ? 0.7 : 1 }}
          >
            <Text style={{ color: colors.onPrimary, fontSize: 16, fontWeight: "900" }}>{saving ? "保存中…" : current === 18 ? "保存して完了" : "保存して次へ →"}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
        <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "900" }}>{label}</Text>
        {hint ? <Text style={{ color: colors.muted, fontSize: 13 }}>{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function Options<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T | null; onChange: (v: T | null) => void }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: "row", gap: 6 }}>
      {options.map((o) => {
        const active = value === o.value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(active ? null : o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={{
              flex: 1,
              minHeight: 46,
              borderRadius: 12,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: active ? colors.primary : colors.background,
              borderWidth: 1,
              borderColor: active ? colors.primary : colors.border,
            }}
          >
            <Text style={{ color: active ? colors.onPrimary : colors.foreground, fontSize: 15, fontWeight: "800" }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function MiniToggle({ options, value, onChange }: { options: { value: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: "row", borderRadius: 10, borderWidth: 1, borderColor: colors.border, overflow: "hidden" }}>
      {options.map((o) => (
        <Pressable
          key={o.value}
          onPress={() => onChange(o.value)}
          style={{ paddingHorizontal: 12, minHeight: 36, justifyContent: "center", backgroundColor: value === o.value ? colors.primary : colors.surface }}
        >
          <Text style={{ color: value === o.value ? colors.onPrimary : colors.foreground, fontSize: 14, fontWeight: "700" }}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}
