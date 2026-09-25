/**
 * 分析用のチャート（react-native-svg。Web とネイティブで共通）。
 *
 * - 得失（SG）は「青＝得・橙＝損」の発散配色（色覚特性シミュレーションで判別できる組み合わせ）。
 *   値は必ず符号付きの数字でも出すので、色だけに頼らない。
 * - 線は 2px、点は 8px 以上。グリッドは控えめ。タップ（Web はホバーも）で詳細を表示。
 */
import { useState, type ReactNode } from "react";
import { Platform, Text, View } from "react-native";
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from "react-native-svg";

import { useColors } from "@/hooks/use-colors";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { formatStrokes } from "./ui";

export function useDivergingColors() {
  const scheme = useColorScheme() ?? "light";
  return scheme === "dark" ? { gain: "#4C93CC", loss: "#C9782A" } : { gain: "#2F78B5", loss: "#D07A22" };
}

/** チャートの上に出す詳細（タップ／ホバーで更新） */
function Readout({ children }: { children: ReactNode }) {
  const colors = useColors();
  return (
    <View style={{ minHeight: 22, marginBottom: 6 }}>
      <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: "600" }} numberOfLines={2}>
        {children}
      </Text>
    </View>
  );
}

// ─── 横向きの発散バー（SG の内訳・条件別比較） ────────────────────────────

export type DivergingRow = { label: string; value: number; note?: string };

export function DivergingBars({ rows, unit = "打", width, digits = 2 }: { rows: DivergingRow[]; unit?: string; width: number; digits?: number }) {
  const colors = useColors();
  const pal = useDivergingColors();
  const labelW = Math.min(132, width * 0.38);
  const valueW = 58;
  const plotW = Math.max(60, width - labelW - valueW);
  const maxAbs = Math.max(0.3, ...rows.map((r) => Math.abs(r.value)));
  const rowH = 34;
  const cx = labelW + plotW / 2;
  return (
    <View>
      <Svg width={width} height={rows.length * rowH + 6} accessibilityLabel={rows.map((r) => `${r.label} ${formatStrokes(r.value, digits)}${unit}`).join("、")}>
        <Line x1={cx} y1={0} x2={cx} y2={rows.length * rowH + 6} stroke={colors.border} strokeWidth={1.5} />
        {rows.map((r, i) => {
          const y = i * rowH + 6;
          const w = (Math.abs(r.value) / maxAbs) * (plotW / 2 - 4);
          const x = r.value >= 0 ? cx + 1 : cx - 1 - w;
          return (
            <G key={r.label}>
              <SvgText x={0} y={y + 17} fill={colors.foreground} fontSize={13} fontWeight="600">
                {r.label}
              </SvgText>
              <Rect x={x} y={y + 5} width={Math.max(2, w)} height={rowH - 16} rx={4} fill={r.value >= 0 ? pal.gain : pal.loss} />
              <SvgText x={width} y={y + 17} fill={colors.foreground} fontSize={13} fontWeight="800" textAnchor="end">
                {`${formatStrokes(r.value, digits)}`}
              </SvgText>
            </G>
          );
        })}
      </Svg>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginLeft: labelW, width: plotW }}>
        <Text style={{ color: colors.muted, fontSize: 12 }}>← 損</Text>
        <Text style={{ color: colors.muted, fontSize: 12 }}>得 →</Text>
      </View>
    </View>
  );
}

// ─── 距離別カップイン率のカーブ ───────────────────────────────────────────

export type CurvePoint = { label: string; short?: string; attempts: number; makes: number; rate: number; low: number; high: number; baseline: number };

export function MakeCurveChart({ points, width, baselineLabel }: { points: CurvePoint[]; width: number; baselineLabel: string }) {
  const colors = useColors();
  const [sel, setSel] = useState<number | null>(null);
  const H = 190;
  const padL = 34;
  const padB = 38;
  const padT = 8;
  const plotW = width - padL - 6;
  const plotH = H - padB - padT;
  const step = plotW / points.length;
  const xOf = (i: number) => padL + step * i + step / 2;
  const yOf = (v: number) => padT + plotH - (v / 100) * plotH;
  const has = points.map((p) => p.attempts > 0);
  const you = points.map((p, i) => (has[i] ? `${xOf(i)},${yOf(p.rate)}` : null));
  const youPath = you.reduce<string>((acc, pt, i) => (pt ? acc + (acc && you[i - 1] ? " L" : " M") + pt : acc), "").trim();
  const basePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${xOf(i)},${yOf(p.baseline)}`).join(" ");
  const cur = sel != null ? points[sel] : null;
  return (
    <View>
      <Readout>
        {cur
          ? `${cur.label}：${cur.makes}/${cur.attempts} 成功（${cur.attempts ? cur.rate.toFixed(0) : "–"}%）・${baselineLabel} ${cur.baseline.toFixed(0)}%`
          : "点をタップすると回数と基準を表示"}
      </Readout>
      <Svg width={width} height={H}>
        {[0, 25, 50, 75, 100].map((v) => (
          <G key={v}>
            <Line x1={padL} x2={width - 4} y1={yOf(v)} y2={yOf(v)} stroke={colors.border} strokeWidth={1} />
            <SvgText x={padL - 6} y={yOf(v) + 4} fill={colors.muted} fontSize={11} textAnchor="end">{`${v}`}</SvgText>
          </G>
        ))}
        <Path d={basePath} stroke={colors.muted} strokeWidth={2} strokeDasharray="5 4" fill="none" />
        {youPath ? <Path d={youPath} stroke={colors.primary} strokeWidth={2.5} fill="none" /> : null}
        {points.map((p, i) =>
          has[i] ? (
            <G key={p.label}>
              <Line x1={xOf(i)} x2={xOf(i)} y1={yOf(p.high)} y2={yOf(p.low)} stroke={colors.primary} strokeOpacity={0.35} strokeWidth={3} strokeLinecap="round" />
              <Circle cx={xOf(i)} cy={yOf(p.rate)} r={sel === i ? 7 : 5} fill={colors.primary} stroke={colors.surface} strokeWidth={2} />
            </G>
          ) : null,
        )}
        {points.map((p, i) => (
          <SvgText key={`l${i}`} x={xOf(i)} y={H - padB + 16} fill={colors.muted} fontSize={10} textAnchor="middle">
            {p.short ?? p.label.replace("m", "")}
          </SvgText>
        ))}
        <SvgText x={padL + plotW / 2} y={H - 4} fill={colors.muted} fontSize={11} textAnchor="middle">距離（m）</SvgText>
        {/* 当たり判定（点より大きい帯） */}
        {points.map((p, i) => (
          <Rect
            key={`h${i}`}
            x={padL + step * i}
            y={padT}
            width={step}
            height={plotH}
            fill="transparent"
            onPress={() => setSel(sel === i ? null : i)}
            {...(Platform.OS === "web" ? ({ onMouseEnter: () => setSel(i) } as object) : {})}
          />
        ))}
      </Svg>
      <View style={{ flexDirection: "row", gap: 16, marginTop: 6, flexWrap: "wrap" }}>
        <LegendItem color={colors.primary} label="あなた（縦線は95%の幅）" />
        <LegendItem color={colors.muted} label={baselineLabel} dashed />
      </View>
    </View>
  );
}

function LegendItem({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <Svg width={22} height={10}>
        <Line x1={0} x2={22} y1={5} y2={5} stroke={color} strokeWidth={2.5} strokeDasharray={dashed ? "5 4" : undefined} />
      </Svg>
      <Text style={{ color: colors.muted, fontSize: 13 }}>{label}</Text>
    </View>
  );
}

// ─── ラウンドごとの推移 ──────────────────────────────────────────────────

export type TrendPoint = { label: string; value: number; detail: string };

export function TrendChart({ points, width, window = 5 }: { points: TrendPoint[]; width: number; window?: number }) {
  const colors = useColors();
  const pal = useDivergingColors();
  const [sel, setSel] = useState<number | null>(null);
  const H = 170;
  const padL = 34;
  const padB = 24;
  const padT = 10;
  const plotW = width - padL - 8;
  const plotH = H - padB - padT;
  const maxAbs = Math.max(1, ...points.map((p) => Math.abs(p.value)));
  const n = points.length;
  const xOf = (i: number) => padL + (n <= 1 ? plotW / 2 : (plotW * i) / (n - 1));
  const yOf = (v: number) => padT + plotH / 2 - (v / maxAbs) * (plotH / 2 - 4);
  const rolling = points.map((_, i) => {
    const s = points.slice(Math.max(0, i - window + 1), i + 1);
    return s.reduce((a, p) => a + p.value, 0) / s.length;
  });
  const rollPath = rolling.map((v, i) => `${i === 0 ? "M" : "L"}${xOf(i)},${yOf(v)}`).join(" ");
  const cur = sel != null ? points[sel] : null;
  const tick = Math.ceil(maxAbs);
  return (
    <View>
      <Readout>{cur ? cur.detail : `点＝各ラウンド、線＝直近${window}ラウンドの平均`}</Readout>
      <Svg width={width} height={H}>
        {[tick, 0, -tick].map((v) => (
          <G key={v}>
            <Line x1={padL} x2={width - 4} y1={yOf(v)} y2={yOf(v)} stroke={colors.border} strokeWidth={v === 0 ? 1.5 : 1} />
            <SvgText x={padL - 6} y={yOf(v) + 4} fill={colors.muted} fontSize={11} textAnchor="end">{formatStrokes(v, 0)}</SvgText>
          </G>
        ))}
        <Path d={rollPath} stroke={colors.foreground} strokeOpacity={0.75} strokeWidth={2} fill="none" />
        {points.map((p, i) => (
          <Circle
            key={i}
            cx={xOf(i)}
            cy={yOf(p.value)}
            r={sel === i ? 7 : 4.5}
            fill={p.value >= 0 ? pal.gain : pal.loss}
            stroke={colors.surface}
            strokeWidth={2}
          />
        ))}
        {n > 0 && (
          <>
            <SvgText x={xOf(0)} y={H - 6} fill={colors.muted} fontSize={11} textAnchor="start">{points[0].label}</SvgText>
            <SvgText x={xOf(n - 1)} y={H - 6} fill={colors.muted} fontSize={11} textAnchor="end">{points[n - 1].label}</SvgText>
          </>
        )}
        {points.map((_, i) => (
          <Rect
            key={`h${i}`}
            x={xOf(i) - Math.max(8, plotW / Math.max(1, n) / 2)}
            y={padT}
            width={Math.max(16, plotW / Math.max(1, n))}
            height={plotH}
            fill="transparent"
            onPress={() => setSel(sel === i ? null : i)}
            {...(Platform.OS === "web" ? ({ onMouseEnter: () => setSel(i) } as object) : {})}
          />
        ))}
      </Svg>
    </View>
  );
}

// ─── 傾斜 × 曲がり のヒートマップ ────────────────────────────────────────

export type HeatCell = { value: number; n: number };

export function LineHeatmap({
  rows,
  cols,
  cells,
  width,
}: {
  rows: string[];
  cols: string[];
  cells: HeatCell[][];
  width: number;
}) {
  const colors = useColors();
  const pal = useDivergingColors();
  const labelW = 44;
  const cellW = (width - labelW) / cols.length;
  const cellH = 58;
  const maxAbs = Math.max(0.05, ...cells.flat().filter((c) => c.n > 0).map((c) => Math.abs(c.value)));
  return (
    <View>
      <View style={{ flexDirection: "row", marginLeft: labelW }}>
        {cols.map((c) => (
          <Text key={c} style={{ width: cellW, textAlign: "center", color: colors.muted, fontSize: 13, fontWeight: "700" }}>
            {c}
          </Text>
        ))}
      </View>
      {rows.map((r, i) => (
        <View key={r} style={{ flexDirection: "row", alignItems: "center", marginTop: 4 }}>
          <Text style={{ width: labelW, color: colors.muted, fontSize: 13, fontWeight: "700" }}>{r}</Text>
          {cols.map((c, j) => {
            const cell = cells[i][j];
            const strength = cell.n > 0 ? Math.min(1, Math.abs(cell.value) / maxAbs) : 0;
            const tint = cell.value >= 0 ? pal.gain : pal.loss;
            return (
              <View
                key={c}
                accessibilityLabel={`${r}・${c}: ${cell.n > 0 ? `${formatStrokes(cell.value, 2)}打/回、${cell.n}回` : "記録なし"}`}
                style={{
                  width: cellW - 4,
                  marginHorizontal: 2,
                  height: cellH,
                  borderRadius: 10,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: cell.n > 0 ? `${tint}${Math.round(24 + strength * 150).toString(16).padStart(2, "0")}` : colors.background,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: "800", fontVariant: ["tabular-nums"] }}>
                  {cell.n > 0 ? formatStrokes(cell.value, 2) : "–"}
                </Text>
                <Text style={{ color: colors.muted, fontSize: 12 }}>{cell.n > 0 ? `${cell.n}回` : ""}</Text>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/** 横棒の割合メーター（ショート/オーバー など2値） */
export function SplitMeter({ left, right, leftLabel, rightLabel }: { left: number; right: number; leftLabel: string; rightLabel: string }) {
  const colors = useColors();
  const total = left + right || 1;
  const lp = (left / total) * 100;
  return (
    <View>
      <View style={{ flexDirection: "row", height: 14, borderRadius: 7, overflow: "hidden", gap: 2 }}>
        <View style={{ width: `${lp}%`, backgroundColor: colors.primary }} />
        <View style={{ flex: 1, backgroundColor: colors.accent }} />
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
        <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: "700" }}>{`${leftLabel} ${lp.toFixed(0)}%`}</Text>
        <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: "700" }}>{`${rightLabel} ${(100 - lp).toFixed(0)}%`}</Text>
      </View>
    </View>
  );
}
