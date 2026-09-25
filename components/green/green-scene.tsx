/**
 * グリーン表示（ネイティブ用のフォールバック）。
 * Web は green-scene.web.tsx（three.js の 3D）。ネイティブでは同じ配置を真上から見た SVG で描く。
 */
import { Pressable, View, useWindowDimensions } from "react-native";
import Svg, { Circle, Defs, G, Line, Path, RadialGradient, Rect, Stop, Text as SvgText } from "react-native-svg";

import { MAX_RADIUS_M, OUTCOME_COLOR, RING_METERS, STAGE, pointXZ, type GreenSceneProps } from "./green-types";

export function GreenScene({ mode, points = [], visible, height, selected, onSelect, accessibilityLabel, radius = 24 }: GreenSceneProps) {
  const { width: screenW } = useWindowDimensions();
  const width = Math.min(screenW - 32, 720);
  const R = Math.min(width, height) / 2 - 10;
  const scale = R / (MAX_RADIUS_M + 1);
  const cx = width / 2;
  const cy = height / 2;
  const show = new Set(visible ?? ["one", "two", "three"]);
  const toXY = (p: { meters: number; angle: number }) => {
    const { x, z } = pointXZ(p);
    return { x: cx + x * scale, y: cy + z * scale };
  };

  const heroPath = `M ${cx + 4.2 * scale} ${cy + 5.6 * scale} Q ${cx + 1.2 * scale} ${cy + 3.8 * scale} ${cx} ${cy}`;

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      style={{ height, borderRadius: radius, overflow: "hidden", backgroundColor: STAGE.bgBottom, alignItems: "center" }}
    >
      <Pressable onPress={() => onSelect?.(null)} style={{ width, height }}>
        <Svg width={width} height={height}>
          <Defs>
            <RadialGradient id="g" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={STAGE.grassLight} />
              <Stop offset="0.85" stopColor={STAGE.grass} />
              <Stop offset="1" stopColor={STAGE.fringe} />
            </RadialGradient>
          </Defs>
          <Rect x={0} y={0} width={width} height={height} fill={STAGE.bgBottom} />
          <Circle cx={cx} cy={cy} r={R} fill="url(#g)" />
          {RING_METERS.map((m) => (
            <G key={m}>
              <Circle cx={cx} cy={cy} r={m * scale} stroke={STAGE.ring} strokeOpacity={0.35} strokeWidth={1} fill="none" />
              {mode === "map" && m >= 3 && (
                <SvgText x={cx + m * scale * 0.72} y={cy - m * scale * 0.72} fill={STAGE.text} fontSize={11} fontWeight="700">
                  {`${m}m`}
                </SvgText>
              )}
            </G>
          ))}
          {mode === "hero" && <Path d={heroPath} stroke="#fff" strokeOpacity={0.4} strokeWidth={2} fill="none" />}
          {mode === "map" &&
            points.map((p, i) => {
              if (!show.has(p.outcome)) return null;
              const { x, y } = toXY(p);
              return (
                <Circle
                  key={i}
                  cx={x}
                  cy={y}
                  r={4}
                  fill={OUTCOME_COLOR[p.outcome]}
                  stroke="#0008"
                  strokeWidth={0.5}
                  onPress={() => onSelect?.(p)}
                />
              );
            })}
          {mode === "map" && selected && (
            <G>
              <Line x1={toXY(selected).x} y1={toXY(selected).y} x2={cx} y2={cy} stroke="#fff" strokeDasharray="4 3" strokeWidth={1.2} />
              <Circle cx={toXY(selected).x} cy={toXY(selected).y} r={8} stroke="#fff" strokeWidth={2} fill="none" />
            </G>
          )}
          <Circle cx={cx} cy={cy} r={5} fill="#050805" stroke="#F5F1E6" strokeWidth={1.5} />
          {mode === "hero" && <Circle cx={cx + 4.2 * scale} cy={cy + 5.6 * scale} r={5} fill="#F6F3EA" />}
        </Svg>
      </Pressable>
    </View>
  );
}
