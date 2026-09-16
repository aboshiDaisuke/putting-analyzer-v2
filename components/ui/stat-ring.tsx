// 円形プログレスリング。パット率などの割合データをプレミアムに見せる。
// react-native-svg で描画し、中央に値、リングで達成度を表現する。
import { View, Text } from "react-native";
import Svg, { Circle } from "react-native-svg";

type StatRingProps = {
  /** 進捗の現在値 */
  value: number;
  /** 進捗の最大値（value/max でリングの充填率を計算） */
  max: number;
  /** 中央に表示する値（例: "32"） */
  displayValue: string;
  /** 値の単位（例: "%"） */
  unit?: string;
  /** リング（進捗）の色 */
  color: string;
  /** トラック（背景リング）の色 */
  trackColor: string;
  /** 中央テキストの色（省略時は color） */
  valueColor?: string;
  size?: number;
  strokeWidth?: number;
};

export function StatRing({
  value,
  max,
  displayValue,
  unit,
  color,
  trackColor,
  valueColor,
  size = 76,
  strokeWidth = 8,
}: StatRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const dash = circumference * pct;

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      {/* リング本体（上12時方向から時計回りに伸びるよう -90deg 回転） */}
      <View style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}>
        <Svg width={size} height={size}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={trackColor}
            strokeWidth={strokeWidth}
            fill="none"
          />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={`${dash} ${circumference - dash}`}
            strokeLinecap="round"
          />
        </Svg>
      </View>

      {/* 中央の値 */}
      <View style={{ flexDirection: "row", alignItems: "baseline" }}>
        <Text style={{ fontSize: size * 0.32, fontWeight: "800", color: valueColor ?? color, letterSpacing: -0.5 }}>
          {displayValue}
        </Text>
        {unit ? (
          <Text style={{ fontSize: size * 0.18, fontWeight: "700", color: valueColor ?? color, marginLeft: 1 }}>
            {unit}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
