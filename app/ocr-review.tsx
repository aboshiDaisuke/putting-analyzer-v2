/**
 * 読み取り結果の確認（カード v3）。
 * - 面ごとに補正済みのカード画像と9行の読み取り結果を並べる
 * - 「要確認」（二重読み・画素判定との食い違い）と記入ルールの矛盾を行ごとに表示。直すと消える
 * - 既存ラウンドに保存、またはカードの日付・コース名で新しいラウンドを作る
 */
import { useEffect, useMemo, useState } from "react";
import { Image, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { ErrorBanner } from "@/components/ui/error-banner";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { shadowPrimary, shadowSm } from "@/lib/card-shadow";
import { hapticSuccess } from "@/lib/haptics";
import { clearOcrSession, getOcrSession, type SideResult } from "@/lib/ocr-session";
import { holeNumberFor, LR_OPTIONS, MISS_OPTIONS, PUTT_FOR_OPTIONS, UD_OPTIONS, type CardSide } from "@/lib/scorecard/layout";
import { cardDateToYmd, effectiveTotal, rowHasData, rowToHole, validateRow, type OcrRow } from "@/lib/scorecard/ocr";
import { getPutters, saveHolesForRound, saveRound } from "@/lib/storage";
import type { HoleData, Round } from "@/lib/types";

const CARD_ASPECT = 175 / 105;
const LABEL = {
  puttFor: { E: "イーグル", Ba: "バーディ", P: "パー", Bo: "ボギー", "D+": "ダボ+" } as Record<string, string>,
  ud: { F: "平ら", U: "上り", D: "下り" } as Record<string, string>,
  lr: { S: "まっすぐ", L: "左へ", R: "右へ" } as Record<string, string>,
  miss: { short: "ショート", long: "オーバー" } as Record<string, string>,
};

function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function summary(row: OcrRow): string {
  if (!rowHasData(row)) return "記入なし";
  const parts: string[] = [];
  if (row.puttFor) parts.push(LABEL.puttFor[row.puttFor]);
  const dists = [row.p1.meters, row.p2.meters, row.p3.meters].filter((m): m is number => m != null);
  if (dists.length) parts.push(dists.map((m) => `${m}m`).join("→"));
  parts.push(`${effectiveTotal(row)}パット`);
  return parts.join("・");
}

export default function OcrReviewScreen() {
  const router = useRouter();
  const colors = useColors();
  const { width: screenW } = useWindowDimensions();
  const contentW = Math.min(screenW, 760) - 32;
  const session = useMemo(() => getOcrSession(), []);

  const [sides, setSides] = useState<SideResult[]>(session?.results ?? []);
  const [open, setOpen] = useState<string | null>(null);
  const [showImage, setShowImage] = useState<Record<string, boolean>>({});
  const [date, setDate] = useState(() => cardDateToYmd(session?.results.find((r) => r.side === "out")?.card.date ?? null) ?? todayYmd());
  const [course, setCourse] = useState(() => session?.results.find((r) => r.card.course)?.card.course ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 要確認のある最初の行を開いておく
  useEffect(() => {
    for (const s of sides) {
      const i = s.card.rows.findIndex((_, idx) => s.conflicts.some((c) => c.startsWith(`rows[${idx}]`)) || (s.warnings[idx]?.length ?? 0) > 0);
      if (i >= 0) {
        setOpen(`${s.side}-${i}`);
        break;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const issueCount = sides.reduce((n, s) => n + s.conflicts.length + Object.values(s.warnings).reduce((a, w) => a + w.length, 0), 0);
  const holes: HoleData[] = useMemo(
    () => sides.flatMap((s) => s.card.rows.flatMap((row, i) => (rowToHole(s.side, i, row) ? [rowToHole(s.side, i, row)!] : []))),
    [sides],
  );

  const editRow = (side: CardSide, index: number, path: string, fn: (r: OcrRow) => OcrRow) => {
    setSides((prev) =>
      prev.map((s) => {
        if (s.side !== side) return s;
        const rows = s.card.rows.map((r, i) => (i === index ? fn(r) : r));
        const warnings = { ...s.warnings };
        const w = validateRow(rows[index]);
        if (w.length) warnings[index] = w;
        else delete warnings[index];
        return { ...s, card: { ...s.card, rows }, warnings, conflicts: s.conflicts.filter((c) => c !== `rows[${index}].${path}`) };
      }),
    );
  };

  const save = async () => {
    if (holes.length === 0) {
      setError("保存できるホールがありません");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      let roundId = session?.roundId;
      if (roundId) {
        await saveHolesForRound(roundId, holes);
      } else {
        const putters = await getPutters().catch(() => []);
        const ace = putters.find((p) => p.ranking === "ace") ?? putters[0];
        const newRound: Omit<Round, "id" | "createdAt" | "updatedAt"> = {
          date,
          weather: "sunny",
          windSpeed: "calm",
          courseId: "",
          courseName: course.trim() || "未設定",
          frontNineGreen: "",
          backNineGreen: "",
          roundType: "private",
          competitionFormat: "stroke",
          grassType: "bent",
          stimpmeter: 9,
          greenCondition: "good",
          putterId: ace?.id ?? "",
          putterName: ace ? `${ace.brandName} ${ace.productName}` : "",
          holes,
          totalPutts: holes.reduce((s, h) => s + h.totalPutts, 0),
        };
        const created = await saveRound(newRound);
        roundId = created.id;
      }
      clearOcrSession();
      hapticSuccess();
      router.replace(`/round/${roundId}` as never);
    } catch (e) {
      setError(`保存に失敗しました（${e instanceof Error ? e.message : String(e)}）`);
    } finally {
      setSaving(false);
    }
  };

  if (!session || sides.length === 0) {
    return (
      <ScreenContainer className="p-6 items-center justify-center">
        <Text style={{ color: colors.foreground, fontSize: 17, fontWeight: "800" }}>確認する読み取り結果がありません</Text>
        <Pressable onPress={() => router.replace("/scan-card" as never)} style={{ marginTop: 14, minHeight: 48, paddingHorizontal: 20, borderRadius: 14, backgroundColor: colors.primary, justifyContent: "center" }}>
          <Text style={{ color: colors.onPrimary, fontSize: 16, fontWeight: "800" }}>カードを撮影する</Text>
        </Pressable>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingTop: 6 }}>
        <Pressable onPress={() => router.back()} accessibilityLabel="戻る" style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
          <IconSymbol name="arrow.left" size={24} color={colors.foreground} />
        </Pressable>
        <Text accessibilityRole="header" style={{ color: colors.foreground, fontSize: 18, fontWeight: "900", flex: 1 }}>読み取り結果の確認</Text>
      </View>
      <ScrollView contentContainerStyle={{ alignItems: "center", paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <View style={{ width: contentW, gap: 14, paddingTop: 6 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: 16, backgroundColor: issueCount ? `${colors.warning}1A` : `${colors.success}1A` }}>
            <IconSymbol name={issueCount ? "exclamationmark.triangle.fill" : "checkmark.circle.fill"} size={22} color={issueCount ? colors.warning : colors.success} />
            <Text style={{ color: colors.foreground, fontSize: 15, flex: 1, lineHeight: 21 }}>
              {issueCount
                ? `要確認が ${issueCount} 件あります。色の付いた項目をカードの画像と見比べてください。`
                : `${holes.length}ホールを読み取りました。念のため画像と見比べてから保存してください。`}
            </Text>
          </View>

          {!session.roundId && (
            <View style={[{ backgroundColor: colors.surface, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: colors.border, gap: 10 }, shadowSm]}>
              <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "900" }}>新しいラウンドとして保存</Text>
              <LabeledInput label="日付" value={date} onChange={setDate} placeholder="YYYY-MM-DD" />
              <LabeledInput label="コース" value={course} onChange={setCourse} placeholder="コース名" />
              <Text style={{ color: colors.muted, fontSize: 13 }}>グリーンの速さや天気は保存後にラウンド画面から追加できます。</Text>
            </View>
          )}

          {sides.map((s) => {
            const key = s.side;
            return (
              <View key={key} style={{ gap: 8 }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <Text style={{ color: colors.foreground, fontSize: 20, fontWeight: "900" }}>{s.side === "out" ? "OUT（1〜9番）" : "IN（10〜18番）"}</Text>
                  {s.preview && (
                    <Pressable onPress={() => setShowImage((v) => ({ ...v, [key]: !v[key] }))} style={{ minHeight: 44, justifyContent: "center" }}>
                      <Text style={{ color: colors.primary, fontSize: 15, fontWeight: "800" }}>{showImage[key] ? "画像を閉じる" : "カードの画像を見る"}</Text>
                    </Pressable>
                  )}
                </View>
                {showImage[key] && s.preview && (
                  <Image
                    source={{ uri: `data:image/jpeg;base64,${s.preview}` }}
                    style={{ width: contentW, height: contentW / CARD_ASPECT, borderRadius: 12, backgroundColor: colors.surface }}
                    resizeMode="contain"
                    accessibilityLabel="補正済みのカード画像"
                  />
                )}
                {s.card.rows.map((row, i) => {
                  const id = `${key}-${i}`;
                  const flags = s.conflicts.filter((c) => c.startsWith(`rows[${i}]`)).map((c) => c.replace(`rows[${i}].`, ""));
                  const warns = s.warnings[i] ?? [];
                  const expanded = open === id;
                  const hasIssue = flags.length + warns.length > 0;
                  return (
                    <View key={id} style={{ backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: hasIssue ? colors.warning : colors.border, overflow: "hidden" }}>
                      <Pressable
                        onPress={() => setOpen(expanded ? null : id)}
                        accessibilityRole="button"
                        accessibilityState={{ expanded }}
                        style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 12, minHeight: 56 }}
                      >
                        <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "900", width: 40 }}>{`${holeNumberFor(s.side, i)}`}</Text>
                        <Text style={{ color: rowHasData(row) ? colors.foreground : colors.muted, fontSize: 15, flex: 1 }}>{summary(row)}</Text>
                        {hasIssue && <IconSymbol name="exclamationmark.triangle.fill" size={18} color={colors.warning} />}
                        <IconSymbol name="chevron.down" size={20} color={colors.muted} style={{ transform: [{ rotate: expanded ? "180deg" : "0deg" }] }} />
                      </Pressable>
                      {expanded && (
                        <RowEditor
                          row={row}
                          flags={flags}
                          warnings={warns}
                          onEdit={(path, fn) => editRow(s.side, i, path, fn)}
                        />
                      )}
                    </View>
                  );
                })}
              </View>
            );
          })}
          {error && <ErrorBanner message={error} />}
        </View>
      </ScrollView>
      <View style={{ padding: 12, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface }}>
        <Pressable
          onPress={() => void save()}
          disabled={saving}
          accessibilityRole="button"
          style={[{ minHeight: 54, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary, opacity: saving ? 0.6 : 1 }, shadowPrimary]}
        >
          <Text style={{ color: colors.onPrimary, fontSize: 17, fontWeight: "900" }}>{saving ? "保存中…" : `${holes.length}ホールを保存`}</Text>
        </Pressable>
      </View>
    </ScreenContainer>
  );
}

function LabeledInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <Text style={{ color: colors.muted, fontSize: 15, fontWeight: "700", width: 56 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        style={{ flex: 1, minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, fontSize: 16, color: colors.foreground, backgroundColor: colors.background }}
      />
    </View>
  );
}

function RowEditor({ row, flags, warnings, onEdit }: { row: OcrRow; flags: string[]; warnings: string[]; onEdit: (path: string, fn: (r: OcrRow) => OcrRow) => void }) {
  const colors = useColors();
  const flagged = (p: string) => flags.includes(p);
  return (
    <View style={{ paddingHorizontal: 12, paddingBottom: 14, gap: 12, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 }}>
      {warnings.map((w) => (
        <Text key={w} style={{ color: colors.foreground, fontSize: 14 }}>{`⚠ ${w}`}</Text>
      ))}
      <Line label="何のパット" flagged={flagged("puttFor")}>
        <Pick options={PUTT_FOR_OPTIONS} labels={LABEL.puttFor} value={row.puttFor} onChange={(v) => onEdit("puttFor", (r) => ({ ...r, puttFor: v }))} />
      </Line>
      <Line label="計（総パット）" flagged={flagged("total")}>
        <Pick options={["0", "1", "2", "3", "4", "5"] as const} value={row.total == null ? null : String(row.total) as "0"} onChange={(v) => onEdit("total", (r) => ({ ...r, total: v == null ? null : Number(v) }))} />
      </Line>
      {(["p1", "p2", "p3"] as const).map((k, idx) => (
        <View key={k} style={{ gap: 8, paddingTop: 4 }}>
          <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: "900" }}>{["1st", "2nd", "3rd"][idx]}</Text>
          <Line label="距離 m" flagged={flagged(`${k}.meters`)}>
            <NumberBox
              value={row[k].meters}
              decimals={k !== "p1"}
              onChange={(m) => onEdit(`${k}.meters`, (r) => ({ ...r, [k]: { ...r[k], meters: m } }))}
            />
          </Line>
          {k !== "p3" && (
            <>
              <Line label="傾斜" flagged={flagged(`${k}.ud`)}>
                <Pick options={UD_OPTIONS} labels={LABEL.ud} value={row[k].ud} onChange={(v) => onEdit(`${k}.ud`, (r) => ({ ...r, [k]: { ...r[k], ud: v } }))} />
              </Line>
              <Line label="曲がり" flagged={flagged(`${k}.lr`)}>
                <Pick options={LR_OPTIONS} labels={LABEL.lr} value={row[k].lr} onChange={(v) => onEdit(`${k}.lr`, (r) => ({ ...r, [k]: { ...r[k], lr: v } }))} />
              </Line>
            </>
          )}
          {k === "p1" && (
            <Line label="外れ" flagged={flagged("p1.miss")}>
              <Pick options={MISS_OPTIONS} labels={LABEL.miss} value={row.p1.miss ?? null} onChange={(v) => onEdit("p1.miss", (r) => ({ ...r, p1: { ...r.p1, miss: v } }))} />
            </Line>
          )}
        </View>
      ))}
    </View>
  );
}

function Line({ label, flagged, children }: { label: string; flagged: boolean; children: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={{ gap: 6, padding: flagged ? 8 : 0, borderRadius: 10, backgroundColor: flagged ? `${colors.warning}22` : "transparent" }}>
      <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "800" }}>{flagged ? `${label}（要確認）` : label}</Text>
      {children}
    </View>
  );
}

function Pick<T extends string>({ options, labels, value, onChange }: { options: readonly T[]; labels?: Record<string, string>; value: T | null; onChange: (v: T | null) => void }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
      {options.map((o) => {
        const active = o === value;
        return (
          <Pressable
            key={o}
            onPress={() => onChange(active ? null : o)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={{ flexGrow: 1, minWidth: 40, minHeight: 42, paddingHorizontal: 8, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: active ? colors.primary : colors.background, borderWidth: 1, borderColor: active ? colors.primary : colors.border }}
          >
            <Text style={{ color: active ? colors.onPrimary : colors.foreground, fontSize: 15, fontWeight: "800" }}>{labels?.[o] ?? o}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function NumberBox({ value, decimals, onChange }: { value: number | null; decimals: boolean; onChange: (v: number | null) => void }) {
  const colors = useColors();
  const [text, setText] = useState(value == null ? "" : String(value));
  return (
    <TextInput
      value={text}
      onChangeText={(t) => {
        const clean = t.replace(/[^0-9.]/g, "");
        setText(clean);
        const n = Number(clean);
        onChange(clean && Number.isFinite(n) && n > 0 ? (decimals ? Math.round(n * 10) / 10 : Math.round(n)) : null);
      }}
      keyboardType="decimal-pad"
      inputMode="decimal"
      placeholder="空欄"
      placeholderTextColor={colors.muted}
      style={{ width: 120, minHeight: 44, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, fontSize: 18, fontWeight: "800", color: colors.foreground, backgroundColor: colors.background }}
    />
  );
}
