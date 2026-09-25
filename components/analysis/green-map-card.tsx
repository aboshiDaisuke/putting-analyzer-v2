/**
 * 「グリーンマップ」: 1st パットを打った位置を 3D グリーン（Web）/ 真上図（ネイティブ）に並べ、
 * 1・2・3パットで色分けする。タップした点の詳細を下に出す。
 */
import { useMemo, useState } from "react";
import { Text, View, useWindowDimensions } from "react-native";

import { GreenScene } from "@/components/green/green-scene";
import { OUTCOME_COLOR, OUTCOME_LABEL, STAGE, type Outcome } from "@/components/green/green-types";
import type { GreenPoint } from "@/lib/putting-stats";
import { Chip } from "./ui";

const UD_JA = { flat: "平ら", uphill: "上り", downhill: "下り", up_down: "上→下", down_up: "下→上" } as const;
const LR_JA = { straight: "まっすぐ", left: "左に曲がる", right: "右に曲がる", left_right: "左→右", right_left: "右→左" } as const;

function describe(p: GreenPoint): string {
  const d = new Date(`${p.date}T00:00:00`);
  const line = [p.lineUD ? UD_JA[p.lineUD] : null, p.lineLR ? LR_JA[p.lineLR] : null].filter(Boolean).join("・");
  const result =
    p.outcome === "one"
      ? "1パットで沈めた"
      : `${p.leaveMeters != null ? `${p.leaveMeters}m ${p.missLength === "short" ? "ショート" : p.missLength === "long" ? "オーバー" : "残り"}` : "外れ"} → ${OUTCOME_LABEL[p.outcome]}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${p.holeNumber}番　${p.meters}m${line ? `（${line}）` : ""}　${result}`;
}

export function GreenMapCard({ points, height, title = "グリーンマップ" }: { points: GreenPoint[]; height?: number; title?: string }) {
  const { width } = useWindowDimensions();
  const [visible, setVisible] = useState<Outcome[]>(["one", "two", "three"]);
  const [selected, setSelected] = useState<GreenPoint | null>(null);
  const counts = useMemo(() => {
    const c = { one: 0, two: 0, three: 0 } as Record<Outcome, number>;
    for (const p of points) c[p.outcome]++;
    return c;
  }, [points]);
  const h = height ?? Math.min(440, Math.max(300, width * 0.85));
  const toggle = (o: Outcome) =>
    setVisible((v) => (v.includes(o) ? (v.length > 1 ? v.filter((x) => x !== o) : v) : [...v, o]));

  return (
    <View style={{ backgroundColor: STAGE.bgTop, borderRadius: 24, overflow: "hidden" }}>
      <View style={{ padding: 18, paddingBottom: 10 }}>
        <Text accessibilityRole="header" style={{ color: STAGE.text, fontSize: 18, fontWeight: "800" }}>
          {title}
        </Text>
        <Text style={{ color: STAGE.textMuted, fontSize: 14, marginTop: 4, lineHeight: 20 }}>
          1st パットを打った位置。手前＝上り、奥＝下り、カップの右側＝左に曲がるライン。ドラッグで回転、ボールをタップで詳細
        </Text>
      </View>
      <GreenScene
        mode="map"
        points={points}
        visible={visible}
        height={h}
        radius={0}
        selected={selected}
        onSelect={setSelected}
        accessibilityLabel={`グリーンマップ。1パット${counts.one}回、2パット${counts.two}回、3パット以上${counts.three}回`}
      />
      <View style={{ padding: 14, gap: 10 }}>
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          {(["one", "two", "three"] as Outcome[]).map((o) => (
            <View key={o} style={{ backgroundColor: "#FFFFFF10", borderRadius: 18 }}>
              <Chip
                label={`${OUTCOME_LABEL[o]} ${counts[o]}`}
                selected={visible.includes(o)}
                onPress={() => toggle(o)}
                dot={OUTCOME_COLOR[o]}
                color={STAGE.text}
                textColor={STAGE.text}
              />
            </View>
          ))}
        </View>
        <Text style={{ color: selected ? STAGE.text : STAGE.textMuted, fontSize: 15, minHeight: 22 }}>
          {selected ? describe(selected) : `${points.length}ホール分を表示中`}
        </Text>
      </View>
    </View>
  );
}

