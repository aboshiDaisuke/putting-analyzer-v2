/**
 * ラウンドの9ホール分をカード v3 と同じ並び（何のパット / 1st / 2nd / 3rd / 計）で表示する表。
 * 行をタップするとそのホールの入力画面へ。
 */
import { Pressable, Text, View } from "react-native";

import { useDivergingColors } from "@/components/analysis/charts";
import { formatStrokes } from "@/components/analysis/ui";
import { useColors } from "@/hooks/use-colors";
import { puttForOfHole, puttMeters } from "@/lib/putting";
import type { HoleData, PuttData, ScoreResult } from "@/lib/types";

export const PUTT_FOR_CARD: Record<ScoreResult, string> = {
  eagle: "E",
  birdie: "Ba",
  par: "P",
  bogey: "Bo",
  double_bogey_plus: "D+",
};

const UD = { flat: "平", uphill: "上", downhill: "下", up_down: "上下", down_up: "下上" } as const;
const LR = { straight: "直", left: "左", right: "右", left_right: "左右", right_left: "右左" } as const;

function puttCell(p: PuttData | undefined): { main: string; sub: string } {
  if (!p) return { main: "", sub: "" };
  const m = puttMeters(p);
  const sub = [p.lineUD ? UD[p.lineUD] : "", p.lineLR ? LR[p.lineLR] : "", p.missLength === "short" ? "短" : p.missLength === "long" ? "長" : ""]
    .filter(Boolean)
    .join("");
  return { main: m != null ? `${m}` : "–", sub };
}

export function HoleTable({
  title,
  holes,
  sgByHole,
  onPressHole,
}: {
  title: string;
  holes: HoleData[];
  sgByHole: Map<number, number | null>;
  onPressHole: (holeNumber: number) => void;
}) {
  const colors = useColors();
  const pal = useDivergingColors();
  const played = holes.filter((h) => h.totalPutts > 0);
  const total = played.reduce((s, h) => s + h.totalPutts, 0);
  const cols = [
    { key: "h", label: "H", flex: 0.6 },
    { key: "for", label: "何の", flex: 0.8 },
    { key: "p1", label: "1st", flex: 1.2 },
    { key: "p2", label: "2nd", flex: 1.1 },
    { key: "p3", label: "3rd", flex: 0.9 },
    { key: "t", label: "計", flex: 0.6 },
    { key: "sg", label: "損得", flex: 0.9 },
  ];
  const head = { color: colors.muted, fontSize: 12, fontWeight: "800" as const, textAlign: "center" as const };
  return (
    <View style={{ borderRadius: 16, borderWidth: 1, borderColor: colors.border, overflow: "hidden", backgroundColor: colors.surface }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 10, backgroundColor: colors.background }}>
        <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "900" }}>{title}</Text>
        <Text style={{ color: colors.muted, fontSize: 14, fontWeight: "700" }}>{played.length > 0 ? `${total}パット` : "未入力"}</Text>
      </View>
      <View style={{ flexDirection: "row", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        {cols.map((c) => (
          <Text key={c.key} style={[head, { flex: c.flex }]}>
            {c.label}
          </Text>
        ))}
      </View>
      {holes.map((h, i) => {
        const sorted = [...h.putts].sort((a, b) => a.strokeNumber - b.strokeNumber);
        const cells = [puttCell(sorted[0]), puttCell(sorted[1]), puttCell(sorted[2])];
        const puttFor = puttForOfHole(h);
        const sg = sgByHole.get(h.holeNumber) ?? null;
        const empty = h.totalPutts === 0;
        return (
          <Pressable
            key={h.holeNumber}
            onPress={() => onPressHole(h.holeNumber)}
            accessibilityRole="button"
            accessibilityLabel={`${h.holeNumber}番ホール${empty ? "、未入力" : `、${h.totalPutts}パット`}。タップして編集`}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              minHeight: 48,
              backgroundColor: pressed ? colors.background : i % 2 ? `${colors.background}88` : "transparent",
            })}
          >
            <Text style={{ flex: 0.6, textAlign: "center", color: colors.foreground, fontSize: 16, fontWeight: "900" }}>{h.holeNumber}</Text>
            <Text style={{ flex: 0.8, textAlign: "center", color: colors.foreground, fontSize: 14, fontWeight: "700" }}>{puttFor ? PUTT_FOR_CARD[puttFor] : ""}</Text>
            {cells.map((c, j) => (
              <View key={j} style={{ flex: [1.2, 1.1, 0.9][j], alignItems: "center" }}>
                <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: "700", fontVariant: ["tabular-nums"] }}>{c.main ? `${c.main}m` : ""}</Text>
                {c.sub ? <Text style={{ color: colors.muted, fontSize: 12 }}>{c.sub}</Text> : null}
              </View>
            ))}
            <Text style={{ flex: 0.6, textAlign: "center", color: colors.foreground, fontSize: 17, fontWeight: "900" }}>{empty ? "·" : h.totalPutts}</Text>
            <Text
              style={{
                flex: 0.9,
                textAlign: "center",
                color: sg == null ? colors.muted : sg >= 0 ? pal.gain : pal.loss,
                fontSize: 14,
                fontWeight: "800",
                fontVariant: ["tabular-nums"],
              }}
            >
              {sg == null ? "" : formatStrokes(sg, 2)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
