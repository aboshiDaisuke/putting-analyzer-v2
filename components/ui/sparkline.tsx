// 小さな推移グラフ（スパークライン）。直近の平均パット数などの傾向を見せる。
// onLayout で実幅を測ってから描画し、viewBox 伸縮による線の歪みを避ける。
import { useState } from "react";
import { View } from "react-native";
import Svg, { Polyline, Path, Circle, Line } from "react-native-svg";

type Props = {
  /** 古い→新しい の順に並べた値 */
  values: number[];
  color: string;
  /** 補助線の色（トラック） */
  trackColor: string;
  height?: number;
};

export function Sparkline({ values, color, trackColor, height = 56 }: Props) {
  const [w, setW] = useState(0);
  const pad = 8;

  let content = null;
  if (w > 0 && values.length >= 2) {
    const n = values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const innerW = w - pad * 2;
    const innerH = height - pad * 2;

    const pts = values.map((v, i) => {
      const x = pad + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
      const y = pad + (1 - (v - min) / span) * innerH;
      return { x, y };
    });

    const linePoints = pts.map((p) => `${p.x},${p.y}`).join(" ");
    const areaPath =
      `M ${pts[0].x},${pts[0].y} ` +
      pts.slice(1).map((p) => `L ${p.x},${p.y}`).join(" ") +
      ` L ${pts[n - 1].x},${height - pad} L ${pts[0].x},${height - pad} Z`;
    const last = pts[n - 1];

    content = (
      <Svg width={w} height={height}>
        {/* 平均（中央）の補助線 */}
        <Line x1={pad} y1={height / 2} x2={w - pad} y2={height / 2} stroke={trackColor} strokeWidth={1} strokeDasharray="3 4" />
        <Path d={areaPath} fill={color} fillOpacity={0.1} />
        <Polyline
          points={linePoints}
          fill="none"
          stroke={color}
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {/* 直近の点を強調 */}
        <Circle cx={last.x} cy={last.y} r={4.5} fill={color} />
        <Circle cx={last.x} cy={last.y} r={8} fill={color} fillOpacity={0.18} />
      </Svg>
    );
  }

  return (
    <View
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      style={{ height, width: "100%", justifyContent: "center" }}
    >
      {content}
    </View>
  );
}
