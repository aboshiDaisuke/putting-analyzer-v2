/**
 * 分析タブ（v3）。ストロークス・ゲインド（SG）を軸に「どこで何打失っているか」を見せる。
 *
 *   1. 結論: 基準に対して1ラウンド何打の得/損か、パット数を「距離の難しさ」と「腕前」に分解
 *   2. グリーンマップ（3D）: 1st パットの位置と結果
 *   3. 練習の優先順位: 失っている打数が大きい順
 *   4. 距離帯別の SG / 距離別カップイン率 / ロングパットの寄せ / ライン別 / 何のパット別 / 推移 / 条件別
 * 集計ロジックは lib/putting-stats.ts、考え方は docs/ANALYTICS.md。
 */
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { GreenMapCard } from "@/components/analysis/green-map-card";
import { DivergingBars, LineHeatmap, MakeCurveChart, SplitMeter, TrendChart, useDivergingColors } from "@/components/analysis/charts";
import { Card, Chip, Note, SectionTitle, Segmented, StatTile, formatStrokes } from "@/components/analysis/ui";
import { useColors } from "@/hooks/use-colors";
import { useBaseline } from "@/hooks/use-baseline";
import { getRoundsWithHoles, getUserProfile } from "@/lib/storage";
import {
  BASELINES,
  greenPoints,
  groupSg,
  holeObservations,
  lagStats,
  lineStats,
  makeCurve,
  missTendency,
  practicePriorities,
  puttForStats,
  puttsPerGir,
  roundSgSeries,
  sgSummary,
  stimpBand,
  type BaselineId,
} from "@/lib/putting-stats";
import { LABELS, type Round, type ScoreResult } from "@/lib/types";

type Period = "last5" | "3m" | "1y" | "all";

const PERIODS: { value: Period; label: string }[] = [
  { value: "last5", label: "直近5R" },
  { value: "3m", label: "3ヶ月" },
  { value: "1y", label: "1年" },
  { value: "all", label: "全期間" },
];

const PUTT_FOR_SHORT: Record<ScoreResult, string> = {
  eagle: "イーグル",
  birdie: "バーディ",
  par: "パー",
  bogey: "ボギー",
  double_bogey_plus: "ダボ以上",
};

function filterRounds(rounds: Round[], period: Period): Round[] {
  const played = rounds.filter((r) => r.holes.some((h) => h.totalPutts > 0));
  const sorted = [...played].sort((a, b) => b.date.localeCompare(a.date));
  if (period === "last5") return sorted.slice(0, 5);
  if (period === "all") return sorted;
  const now = new Date();
  const cutoff = period === "3m" ? new Date(now.getFullYear(), now.getMonth() - 3, now.getDate()) : new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
  const ymd = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}-${String(cutoff.getDate()).padStart(2, "0")}`;
  return sorted.filter((r) => r.date >= ymd);
}

export default function AnalyticsScreen() {
  const colors = useColors();
  const router = useRouter();
  const { width: screenW } = useWindowDimensions();
  const contentW = Math.min(screenW, 760) - 32;
  const chartW = contentW - 36;

  const [rounds, setRounds] = useState<Round[]>([]);
  const [handicap, setHandicap] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("all");
  const [baseline, setBaseline] = useBaseline(handicap);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      Promise.all([getRoundsWithHoles(), getUserProfile().catch(() => null)])
        .then(([r, p]) => {
          if (!alive) return;
          setRounds(r);
          setHandicap(p?.handicap ?? null);
        })
        .catch((e) => console.warn("[analytics] load failed", e))
        .finally(() => alive && setLoading(false));
      return () => {
        alive = false;
      };
    }, []),
  );

  const data = useMemo(() => {
    const scoped = filterRounds(rounds, period);
    const holes = holeObservations(scoped, baseline);
    return {
      scoped,
      holes,
      sg: sgSummary(holes),
      curve: makeCurve(holes, baseline),
      lag: lagStats(holes),
      lines: lineStats(holes),
      miss: missTendency(holes),
      puttFor: puttForStats(holes),
      gir: puttsPerGir(holes),
      trend: roundSgSeries(holes),
      priorities: practicePriorities(holes, baseline),
      points: greenPoints(holes),
      putters: groupSg(holes, (r) => r.putterName || null),
      speeds: groupSg(holes, (r) => stimpBand(r.stimpmeter)),
      grass: groupSg(holes, (r) => (r.grassType ? LABELS.grassType[r.grassType] : null)),
      courses: groupSg(holes, (r) => r.courseName || null),
    };
  }, [rounds, period, baseline]);

  const base = BASELINES[baseline];

  if (loading) {
    return (
      <ScreenContainer className="items-center justify-center">
        <ActivityIndicator size="large" color={colors.primary} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={{ paddingBottom: 40, alignItems: "center" }} showsVerticalScrollIndicator={false}>
        <View style={{ width: contentW, gap: 16, paddingTop: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text accessibilityRole="header" style={{ color: colors.foreground, fontSize: 28, fontWeight: "900", letterSpacing: -0.6 }}>
              分析
            </Text>
            <Pressable
              onPress={() => router.push("/guide" as never)}
              accessibilityRole="link"
              style={{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, paddingHorizontal: 6 }}
            >
              <IconSymbol name="info.circle" size={18} color={colors.primary} />
              <Text style={{ color: colors.primary, fontSize: 15, fontWeight: "700" }}>分析の見方</Text>
            </Pressable>
          </View>

          <Segmented options={PERIODS} value={period} onChange={setPeriod} />
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <Text style={{ color: colors.muted, fontSize: 14, fontWeight: "700" }}>比べる相手</Text>
            {(Object.keys(BASELINES) as BaselineId[]).map((b) => (
              <Chip key={b} label={BASELINES[b].short} selected={baseline === b} onPress={() => setBaseline(b)} />
            ))}
          </View>

          {data.sg.holes === 0 ? (
            <EmptyState onNew={() => router.push("/new-round" as never)} />
          ) : (
            <>
              <SgHero sg={data.sg} baselineLabel={base.label} rounds={data.scoped.length} />
              <GreenMapCard points={data.points} />
              <PrioritiesCard priorities={data.priorities} baselineLabel={base.short} />

              <Card>
                <SectionTitle title="どの距離で得/損しているか" subtitle={`1打ごとの損得を打つ前の距離で分けて合計（1ラウンドあたり・${base.short}比）`} />
                <DivergingBars
                  width={chartW}
                  rows={data.sg.byBand.map((b) => ({ label: b.band.label.replace(/（.*）/, ""), value: b.sgPer18 }))}
                />
                <Note>
                  {data.sg.byBand.map((b) => `${b.band.label} ${b.putts}打`).join(" ／ ")}
                </Note>
              </Card>

              <Card>
                <SectionTitle title="距離別カップイン率" subtitle="1st に限らず全パット。破線は比べる相手の目安" />
                <MakeCurveChart
                  width={chartW}
                  baselineLabel={base.label}
                  points={data.curve.map((c) => ({
                    label: c.band.label,
                    short: Number.isFinite(c.band.max) ? `〜${c.band.max}` : `${c.band.min}〜`,
                    attempts: c.attempts,
                    makes: c.makes,
                    rate: c.rate,
                    low: c.ci.low,
                    high: c.ci.high,
                    baseline: c.baseline,
                  }))}
                />
                <Note>縦の線は「本当の実力はこの範囲にありそう」という95%の幅。回数が少ないほど長くなります。</Note>
              </Card>

              <LagCard lag={data.lag} />
              <LineCard lines={data.lines} miss={data.miss} chartW={chartW} baselineShort={base.short} />
              <PuttForCard stats={data.puttFor} gir={data.gir} />

              <Card>
                <SectionTitle title="ラウンドごとの推移" subtitle={`1ラウンド（18H換算）あたりの損得・${base.short}比`} />
                <TrendChart
                  width={chartW}
                  points={data.trend.map((t) => ({
                    label: t.label,
                    value: t.sgPer18,
                    detail: `${t.label} ${t.courseName}：${formatStrokes(t.sgPer18)}打 ／ ${t.putts}パット（${t.holes}H）・3パット${t.threePutts}回`,
                  }))}
                />
              </Card>

              <ConditionsCard
                chartW={chartW}
                groups={[
                  { title: "パター別", rows: data.putters },
                  { title: "グリーンの速さ別", rows: data.speeds },
                  { title: "芝の種類別", rows: data.grass },
                  { title: "コース別", rows: data.courses },
                ]}
              />

              <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>
                基準: {base.label}（{base.note}）。{data.sg.holes}ホール・{data.sg.rounds}ラウンドを集計。距離の記入があるホールだけが対象です。
              </Text>
            </>
          )}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

// ─── 結論カード ─────────────────────────────────────────────────────────────

function SgHero({ sg, baselineLabel, rounds }: { sg: ReturnType<typeof sgSummary>; baselineLabel: string; rounds: number }) {
  const pal = useDivergingColors();
  const good = sg.sgPer18 >= 0;
  const skill = -sg.sgPer18;
  return (
    <View style={{ backgroundColor: "#10271A", borderRadius: 24, padding: 20 }}>
      <Text style={{ color: "#B9C7BC", fontSize: 14, fontWeight: "700" }}>{`${baselineLabel}と比べて（${rounds}ラウンド）`}</Text>
      <View style={{ flexDirection: "row", alignItems: "baseline", marginTop: 6, gap: 8 }}>
        <Text style={{ color: "#F3EFE4", fontSize: 52, fontWeight: "900", letterSpacing: -1.5, fontVariant: ["tabular-nums"] }}>
          {formatStrokes(sg.sgPer18)}
        </Text>
        <Text style={{ color: "#F3EFE4", fontSize: 17, fontWeight: "700" }}>打 / ラウンド</Text>
      </View>
      <Text style={{ color: "#F3EFE4", fontSize: 16, marginTop: 2, lineHeight: 23 }}>
        {Math.abs(sg.sgPer18) < 0.15
          ? "ほぼ同じ腕前です"
          : good
            ? `パッティングで1ラウンド約${sg.sgPer18.toFixed(1)}打を稼いでいます`
            : `パッティングで1ラウンド約${(-sg.sgPer18).toFixed(1)}打を失っています`}
      </Text>

      {/* パット数の分解 */}
      <View style={{ marginTop: 18, backgroundColor: "#FFFFFF0F", borderRadius: 16, padding: 14 }}>
        <Text style={{ color: "#B9C7BC", fontSize: 13, fontWeight: "700" }}>1ラウンドのパット数の内訳</Text>
        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8, flexWrap: "wrap", gap: 6 }}>
          <Big value={sg.actualPer18.toFixed(1)} label="実際" />
          <Op>=</Op>
          <Big value={sg.expectedPer18.toFixed(1)} label="距離の難しさ" />
          <Op>{skill >= 0 ? "+" : "−"}</Op>
          <Big value={Math.abs(skill).toFixed(1)} label="腕前の差" color={skill > 0 ? pal.loss : pal.gain} />
        </View>
        <Text style={{ color: "#B9C7BC", fontSize: 13, marginTop: 8, lineHeight: 19 }}>
          「距離の難しさ」は、同じ1st パットの距離から{baselineLabel}が打った場合のパット数。パット数が多くても、アプローチが遠いせいなら腕前の問題ではありません。
        </Text>
      </View>
    </View>
  );
}

function Big({ value, label, color }: { value: string; label: string; color?: string }) {
  return (
    <View style={{ alignItems: "center", minWidth: 64 }}>
      <Text style={{ color: color ?? "#F3EFE4", fontSize: 24, fontWeight: "900", fontVariant: ["tabular-nums"] }}>{value}</Text>
      <Text style={{ color: "#B9C7BC", fontSize: 12, fontWeight: "700" }}>{label}</Text>
    </View>
  );
}

function Op({ children }: { children: string }) {
  return <Text style={{ color: "#B9C7BC", fontSize: 20, fontWeight: "700", marginBottom: 14 }}>{children}</Text>;
}

// ─── 練習の優先順位 ─────────────────────────────────────────────────────────

function PrioritiesCard({ priorities, baselineLabel }: { priorities: ReturnType<typeof practicePriorities>; baselineLabel: string }) {
  const colors = useColors();
  return (
    <Card>
      <SectionTitle title="練習の優先順位" subtitle={`${baselineLabel}と比べて失っている打数が大きい順`} />
      {priorities.length === 0 ? (
        <Text style={{ color: colors.foreground, fontSize: 16, lineHeight: 24 }}>
          目立って失っている分野はありません。この調子で記録を続けると、弱点がはっきりしてきます。
        </Text>
      ) : (
        <View style={{ gap: 14 }}>
          {priorities.map((p, i) => (
            <View key={p.id} style={{ flexDirection: "row", gap: 12 }}>
              <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: colors.onPrimary, fontSize: 16, fontWeight: "900" }}>{i + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                  <Text style={{ color: colors.foreground, fontSize: 17, fontWeight: "800", flex: 1 }}>{p.title}</Text>
                  <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: "800", fontVariant: ["tabular-nums"] }}>
                    {`${p.strokesPer18.toFixed(1)}打/R`}
                  </Text>
                </View>
                <Text style={{ color: colors.muted, fontSize: 14, marginTop: 2 }}>{p.evidence}</Text>
                <View style={{ marginTop: 8, padding: 12, borderRadius: 12, backgroundColor: colors.background }}>
                  <Text style={{ color: colors.foreground, fontSize: 15, lineHeight: 22 }}>{`練習：${p.drill}`}</Text>
                </View>
              </View>
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}

// ─── ロングパット ──────────────────────────────────────────────────────────

function LagCard({ lag }: { lag: ReturnType<typeof lagStats> }) {
  const colors = useColors();
  if (lag.attempts === 0) return null;
  return (
    <Card>
      <SectionTitle title="ロングパットの寄せ（6m以上）" subtitle={`${lag.attempts}回の 1st パット`} />
      <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
        <StatTile label="平均の残り" value={lag.avgLeave.toFixed(1)} unit="m" note={`元の距離の${(lag.leaveRatio * 100).toFixed(0)}%`} />
        <StatTile label="1m以内に寄った" value={lag.within1m.toFixed(0)} unit="%" />
        <StatTile label="3パット率" value={lag.threePuttRate.toFixed(0)} unit="%" tone={lag.threePuttRate > 15 ? "bad" : "neutral"} />
      </View>
      {lag.shortRate != null && lag.missRecorded >= 5 && (
        <View style={{ marginTop: 16 }}>
          <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: "700", marginBottom: 8 }}>外れたときの向き（{lag.missRecorded}回）</Text>
          <SplitMeter left={lag.shortRate} right={100 - lag.shortRate} leftLabel="ショート" rightLabel="オーバー" />
          <Note>
            {lag.shortRate >= 60
              ? "ショートが多めです。カップの40cm先に止めるつもりで打つと、入る確率も上がります。"
              : lag.shortRate <= 35
                ? "オーバーが多めです。返しのパットが長く残っていないか、残り距離と合わせて確認しましょう。"
                : "ショートとオーバーのバランスは良好です。"}
          </Note>
        </View>
      )}
      <View style={{ marginTop: 14, gap: 6 }}>
        {lag.byBand.filter((b) => b.attempts > 0).map((b) => (
          <View key={b.band.key} style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ color: colors.foreground, fontSize: 15 }}>{b.band.label}</Text>
            <Text style={{ color: colors.muted, fontSize: 15, fontVariant: ["tabular-nums"] }}>
              {`残り ${b.avgLeave.toFixed(1)}m ・ 3パット ${b.threePuttRate.toFixed(0)}% ・ ${b.attempts}回`}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

// ─── ライン別 ──────────────────────────────────────────────────────────────

function LineCard({ lines, miss, chartW, baselineShort }: { lines: ReturnType<typeof lineStats>; miss: ReturnType<typeof missTendency>; chartW: number; baselineShort: string }) {
  const colors = useColors();
  const ud = ["flat", "uphill", "downhill"] as const;
  const lr = ["straight", "left", "right"] as const;
  const total = ud.reduce((s, k) => s + lines.ud[k].putts, 0);
  if (total === 0) return null;
  return (
    <Card>
      <SectionTitle title="ライン別の得意・苦手" subtitle={`7m以内のパットの1打あたり損得（距離の違いは補正済み・${baselineShort}比）`} />
      <LineHeatmap
        width={chartW}
        rows={["平ら", "上り", "下り"]}
        cols={["まっすぐ", "左へ", "右へ"]}
        cells={ud.map((u) => lr.map((l) => ({ value: lines.matrix[u][l].sgPerPutt, n: lines.matrix[u][l].putts })))}
      />
      {miss.recorded >= 5 && (
        <View style={{ marginTop: 16, gap: 6 }}>
          <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: "700" }}>1st が外れたときショートした割合</Text>
          {ud.map((k) =>
            miss.byUD[k].recorded > 0 ? (
              <View key={k} style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ color: colors.foreground, fontSize: 15 }}>{{ flat: "平ら", uphill: "上り", downhill: "下り" }[k]}</Text>
                <Text style={{ color: colors.muted, fontSize: 15, fontVariant: ["tabular-nums"] }}>
                  {`${miss.byUD[k].shortRate.toFixed(0)}%（${miss.byUD[k].recorded}回）`}
                </Text>
              </View>
            ) : null,
          )}
        </View>
      )}
      <Note>数字は1回あたりの損得（打）。回数が10回未満のマスは参考程度に見てください。</Note>
    </Card>
  );
}

// ─── 何のパット別 ──────────────────────────────────────────────────────────

function PuttForCard({ stats, gir }: { stats: ReturnType<typeof puttForStats>; gir: ReturnType<typeof puttsPerGir> }) {
  const colors = useColors();
  if (stats.length === 0) return null;
  return (
    <Card>
      <SectionTitle title="何のパットだったか" subtitle="スコアがかかったパットの決定率" />
      <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        {gir.holes > 0 && <StatTile label="パーオン時の平均パット" value={gir.avg.toFixed(2)} note={`${gir.holes}ホール`} />}
        {stats.find((s) => s.puttFor === "birdie") && (
          <StatTile label="バーディ奪取率" value={stats.find((s) => s.puttFor === "birdie")!.conversion.toFixed(0)} unit="%" note="バーディパットを1パット" />
        )}
        {stats.find((s) => s.puttFor === "par") && (
          <StatTile label="パーセーブ率" value={stats.find((s) => s.puttFor === "par")!.conversion.toFixed(0)} unit="%" note="パーパットを1パット" />
        )}
      </View>
      <View style={{ flexDirection: "row", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        {["", "回数", "平均距離", "1パット", "3パット"].map((h, i) => (
          <Text key={h || i} style={{ flex: i === 0 ? 1.3 : 1, color: colors.muted, fontSize: 13, fontWeight: "700", textAlign: i === 0 ? "left" : "right" }}>
            {h}
          </Text>
        ))}
      </View>
      {stats.map((s) => (
        <View key={s.puttFor} style={{ flexDirection: "row", paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <Text style={{ flex: 1.3, color: colors.foreground, fontSize: 15, fontWeight: "700" }}>{PUTT_FOR_SHORT[s.puttFor]}</Text>
          {[`${s.holes}`, `${s.avgFirstMeters.toFixed(1)}m`, `${s.conversion.toFixed(0)}%`, `${s.threePuttRate.toFixed(0)}%`].map((v, i) => (
            <Text key={i} style={{ flex: 1, color: colors.foreground, fontSize: 15, textAlign: "right", fontVariant: ["tabular-nums"] }}>
              {v}
            </Text>
          ))}
        </View>
      ))}
    </Card>
  );
}

// ─── 条件別 ────────────────────────────────────────────────────────────────

function ConditionsCard({ groups, chartW }: { groups: { title: string; rows: ReturnType<typeof groupSg> }[]; chartW: number }) {
  const colors = useColors();
  const [open, setOpen] = useState(0);
  const usable = groups.filter((g) => g.rows.length > 0);
  if (usable.length === 0) return null;
  const g = usable[Math.min(open, usable.length - 1)];
  return (
    <Card>
      <SectionTitle title="条件別の比較" subtitle="1ラウンドあたりの損得。1st パットの距離の違いを補正しているので、パター同士も公平に比べられます" />
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {usable.map((x, i) => (
          <Chip key={x.title} label={x.title} selected={g === x} onPress={() => setOpen(i)} />
        ))}
      </View>
      <DivergingBars width={chartW} rows={g.rows.slice(0, 6).map((r) => ({ label: r.label, value: r.sgPer18 }))} digits={1} />
      <View style={{ marginTop: 8, gap: 4 }}>
        {g.rows.slice(0, 6).map((r) => (
          <Text key={r.label} style={{ color: colors.muted, fontSize: 13 }}>
            {`${r.label}：${r.rounds}ラウンド・${r.puttsPer18.toFixed(1)}パット/R`}
          </Text>
        ))}
      </View>
    </Card>
  );
}

function EmptyState({ onNew }: { onNew: () => void }) {
  const colors = useColors();
  return (
    <Card style={{ alignItems: "center", paddingVertical: 32 }}>
      <IconSymbol name="chart.bar.fill" size={40} color={colors.muted} />
      <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "800", marginTop: 12 }}>まだ分析できるデータがありません</Text>
      <Text style={{ color: colors.muted, fontSize: 15, textAlign: "center", marginTop: 6, lineHeight: 22 }}>
        パッティングカードに記入してラウンドを記録すると、{"\n"}ここに損得と練習の優先順位が表示されます。
      </Text>
      <Pressable onPress={onNew} style={{ marginTop: 16, backgroundColor: colors.primary, borderRadius: 14, paddingHorizontal: 20, minHeight: 48, justifyContent: "center" }}>
        <Text style={{ color: colors.onPrimary, fontSize: 16, fontWeight: "800" }}>ラウンドを記録する</Text>
      </Pressable>
    </Card>
  );
}
