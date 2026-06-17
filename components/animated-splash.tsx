// ゴルフブランドのアニメーション付きスプラッシュ「ブレイクするパット」。
// スポットライトのかかった立体的なグリーン上を、ボールが曲がる軌道（ベジェ）で
// 転がってカップへ。ゴールドの軌跡が線を引き、残像が追従し、カップインで
// パーティクルと波紋が弾ける。はためくフラッグとタイトルが立ち上がる。
// SVGグラデーション＋reanimated。ネイティブ／Web 両対応。
import { useEffect, useMemo, useState } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  runOnJS,
  type SharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import Svg, {
  Defs,
  Ellipse,
  G,
  LinearGradient,
  Path,
  Polygon,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";
import * as Haptics from "expo-haptics";

import { IconSymbol } from "@/components/ui/icon-symbol";

const GOLD = "#DAA520";
const GOLD_HI = "#F4C752";

// タイムライン（ms）
const TRAIL_START = 470;
const TRAIL_DUR = 1030; // 到達 ≈ 1500ms
const SINK_AT = 1500;
const SINK_DUR = 640;
const TITLE_AT = 1080;
const MIN_MS = 2150;

const AnimatedPath = Animated.createAnimatedComponent(Path);

type Props = {
  /** アプリ側の準備完了（= 認証状態が解決した）か */
  ready: boolean;
  /** フェードアウト完了でアンマウントを依頼するコールバック */
  onHidden: () => void;
};

// 3次ベジェ（worklet/通常 両用）
function bez(t: number, a: number, b: number, c: number, d: number) {
  "worklet";
  const u = 1 - t;
  return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
}

function sinkHaptic() {
  if (Platform.OS === "web") return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}

export function AnimatedSplash({ ready, onHidden }: Props) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [minElapsed, setMinElapsed] = useState(false);
  const [skip, setSkip] = useState(false); // タップでスキップ要求
  const root = useSharedValue(1);

  useEffect(() => {
    const t = setTimeout(() => setMinElapsed(true), MIN_MS);
    return () => clearTimeout(t);
  }, []);

  // 退出：自動時は遷移先が決まり（session解決）かつ最低表示時間でフェードアウト。
  // タップ時は即スキップ（ユーザーの明示操作なので ready 待ちもしない）。
  useEffect(() => {
    if ((ready && minElapsed) || skip) {
      root.value = withTiming(
        0,
        { duration: skip ? 340 : 480, easing: Easing.in(Easing.quad) },
        (fin) => {
          if (fin) runOnJS(onHidden)();
        },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, minElapsed, skip]);

  const rootStyle = useAnimatedStyle(() => ({ opacity: root.value }));

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, styles.root, rootStyle]}
      pointerEvents="auto"
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (width && height) setSize({ w: width, h: height });
      }}
    >
      {size.w > 0 && <PuttScene w={size.w} h={size.h} />}
      {/* タップ取得用の透明オーバーレイ（最前面） */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={() => setSkip(true)}
        accessibilityRole="button"
        accessibilityLabel="タップして続ける"
      />
    </Animated.View>
  );
}

/** 計測済みサイズで動くシーン本体（hooks を無条件に呼べるよう分離）。 */
function PuttScene({ w, h }: { w: number; h: number }) {
  // 軌道（ブレイクするパット）と弧長を px で算出
  const geo = useMemo(() => {
    const cx = w / 2;
    const P = {
      x0: cx - 6,
      y0: h * 0.66,
      x1: cx + 86,
      y1: h * 0.575,
      x2: cx + 64,
      y2: h * 0.455,
      x3: cx,
      y3: h * 0.405,
    };
    let len = 0;
    let prev: { x: number; y: number } | null = null;
    for (let i = 0; i <= 32; i++) {
      const tt = i / 32;
      const x = bez(tt, P.x0, P.x1, P.x2, P.x3);
      const y = bez(tt, P.y0, P.y1, P.y2, P.y3);
      if (prev) len += Math.hypot(x - prev.x, y - prev.y);
      prev = { x, y };
    }
    const d = `M ${P.x0} ${P.y0} C ${P.x1} ${P.y1} ${P.x2} ${P.y2} ${P.x3} ${P.y3}`;
    return { P, len, d, cx, holeY: P.y3 };
  }, [w, h]);

  const { P, holeY, cx } = geo;

  // --- アニメーション値 ---
  const intro = useSharedValue(0); // シーンのフェードイン
  const t = useSharedValue(0); // ボール/軌跡の進行
  const sink = useSharedValue(0); // 沈み込み・波紋・パーティクル
  const flagSway = useSharedValue(0);
  const titleP = useSharedValue(0);
  const hint = useSharedValue(0); // 「タップして続ける」ヒント

  useEffect(() => {
    intro.value = withTiming(1, { duration: 560, easing: Easing.out(Easing.quad) });
    hint.value = withDelay(1400, withTiming(1, { duration: 600, easing: Easing.out(Easing.quad) }));
    flagSway.value = withDelay(
      200,
      withRepeat(
        withSequence(
          withTiming(4.5, { duration: 880, easing: Easing.inOut(Easing.quad) }),
          withTiming(-3, { duration: 880, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
        true,
      ),
    );
    t.value = withDelay(TRAIL_START, withTiming(1, { duration: TRAIL_DUR, easing: Easing.out(Easing.cubic) }));
    sink.value = withDelay(SINK_AT, withTiming(1, { duration: SINK_DUR, easing: Easing.out(Easing.cubic) }));
    titleP.value = withDelay(TITLE_AT, withTiming(1, { duration: 560, easing: Easing.out(Easing.cubic) }));

    const ht = setTimeout(sinkHaptic, SINK_AT + 60);
    return () => clearTimeout(ht);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w, h]);

  // --- スタイル ---
  const sceneStyle = useAnimatedStyle(() => ({ opacity: intro.value }));

  const trailProps = useAnimatedProps(() => ({
    strokeDashoffset: geo.len * (1 - t.value),
  }));

  const ballStyle = useAnimatedStyle(() => {
    const tt = t.value;
    const x = bez(tt, P.x0, P.x1, P.x2, P.x3);
    const y = bez(tt, P.y0, P.y1, P.y2, P.y3) + sink.value * 16;
    const scale = 1 - 0.7 * sink.value;
    const opacity = sink.value < 0.5 ? 1 : Math.max(0, 1 - (sink.value - 0.5) / 0.4);
    return {
      opacity,
      transform: [
        { translateX: x - BALL_R },
        { translateY: y - BALL_R },
        { scale },
        { rotate: `${tt * 660}deg` },
      ],
    };
  });

  const shadowStyle = useAnimatedStyle(() => {
    const tt = t.value;
    const x = bez(tt, P.x0, P.x1, P.x2, P.x3);
    const y = bez(tt, P.y0, P.y1, P.y2, P.y3);
    return {
      opacity: (1 - sink.value) * 0.26 * Math.min(1, tt * 4),
      transform: [{ translateX: x - 18 }, { translateY: y - 3 }, { scaleX: 1.4 }, { scaleY: 0.42 }],
    };
  });

  const flagStyle = useAnimatedStyle(() => ({
    opacity: intro.value,
    transform: [{ rotate: `${flagSway.value}deg` }],
  }));

  const titleStyle = useAnimatedStyle(() => ({
    opacity: titleP.value,
    transform: [{ translateY: (1 - titleP.value) * 16 }],
  }));

  const hintStyle = useAnimatedStyle(() => ({ opacity: hint.value }));

  // カップから弾けるゴールドの光
  const flashStyle = useAnimatedStyle(() => {
    const b = sink.value;
    return {
      opacity: Math.max(0, 1 - b * 2.1) * Math.min(1, b * 9),
      transform: [{ scale: 0.2 + b * 1.5 }, { scaleY: 0.46 }],
    };
  });
  const ring1 = useAnimatedStyle(() => ({
    opacity: (1 - sink.value) * 0.85 * Math.min(1, sink.value * 7),
    transform: [{ scale: 0.3 + sink.value * 2.4 }, { scaleY: 0.44 }],
  }));
  const ring2 = useAnimatedStyle(() => ({
    opacity: (1 - sink.value) * 0.6 * Math.min(1, sink.value * 4),
    transform: [{ scale: 0.3 + sink.value * 3.4 }, { scaleY: 0.44 }],
  }));

  return (
    <View style={StyleSheet.absoluteFill}>
      {/* グラデーションのグリーン・等高線・軌道・カップ */}
      <Animated.View style={[StyleSheet.absoluteFill, sceneStyle]} pointerEvents="none">
        <Svg width={w} height={h}>
          <Defs>
            <RadialGradient id="glow" cx="50%" cy="40%" r="72%">
              <Stop offset="0%" stopColor="#2A6B45" />
              <Stop offset="52%" stopColor="#1A472A" />
              <Stop offset="100%" stopColor="#0A2A1A" />
            </RadialGradient>
            <RadialGradient id="vign" cx="50%" cy="42%" r="75%">
              <Stop offset="60%" stopColor="#000000" stopOpacity={0} />
              <Stop offset="100%" stopColor="#000000" stopOpacity={0.4} />
            </RadialGradient>
            <RadialGradient id="cup" cx="50%" cy="38%" r="70%">
              <Stop offset="0%" stopColor="#0B2E1A" />
              <Stop offset="100%" stopColor="#03130C" />
            </RadialGradient>
            <LinearGradient id="trail" x1="0" y1="1" x2="0" y2="0">
              <Stop offset="0%" stopColor={GOLD} stopOpacity={0} />
              <Stop offset="40%" stopColor={GOLD} stopOpacity={0.7} />
              <Stop offset="100%" stopColor={GOLD_HI} stopOpacity={1} />
            </LinearGradient>
          </Defs>

          {/* 背景グロー */}
          <Rect x={0} y={0} width={w} height={h} fill="url(#glow)" />

          {/* 等高線（グリーン読み・遠近感） */}
          {[
            { rx: Math.min(w * 0.42, 168), ry: 66 },
            { rx: Math.min(w * 0.3, 118), ry: 47 },
            { rx: Math.min(w * 0.19, 74), ry: 29 },
          ].map((r, i) => (
            <Ellipse
              key={i}
              cx={cx}
              cy={holeY}
              rx={r.rx}
              ry={r.ry}
              fill="none"
              stroke="rgba(255,255,255,0.085)"
              strokeWidth={1.4}
            />
          ))}

          {/* ビネット */}
          <Rect x={0} y={0} width={w} height={h} fill="url(#vign)" />

          {/* 軌道ガイド（薄） */}
          <Path d={geo.d} stroke="rgba(255,255,255,0.10)" strokeWidth={2} strokeDasharray="2 7" strokeLinecap="round" fill="none" />

          {/* ゴールドの軌跡（自己描画） */}
          <AnimatedPath
            d={geo.d}
            stroke="url(#trail)"
            strokeWidth={4.5}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={geo.len}
            animatedProps={trailProps}
          />

          {/* カップ */}
          <Ellipse cx={cx} cy={holeY + 1.5} rx={28} ry={11.5} fill="#000000" opacity={0.25} />
          <Ellipse cx={cx} cy={holeY} rx={26} ry={10.5} fill="url(#cup)" stroke="#0A2417" strokeWidth={1.5} />
          <Ellipse cx={cx} cy={holeY - 1} rx={20} ry={7.5} fill="#04190F" />
        </Svg>
      </Animated.View>

      {/* フラッグ（はためく） */}
      <Animated.View
        style={[
          { position: "absolute", left: cx - 30, top: holeY - 92, width: 60, height: 96, transformOrigin: "bottom" },
          flagStyle,
        ]}
        pointerEvents="none"
      >
        <Svg width={60} height={96}>
          <Defs>
            <LinearGradient id="flagg" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0%" stopColor={GOLD_HI} />
              <Stop offset="100%" stopColor="#C2901A" />
            </LinearGradient>
            <LinearGradient id="poleg" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0%" stopColor="#FFFFFF" />
              <Stop offset="100%" stopColor="#AFB4B8" />
            </LinearGradient>
          </Defs>
          <G>
            {/* ポール */}
            <Rect x={28.5} y={14} width={3} height={78} rx={1.5} fill="url(#poleg)" />
            {/* ペナント */}
            <Polygon points="30,14 56,21 30,30" fill="url(#flagg)" />
            <Polygon points="30,14 56,21 49,21" fill="#FFFFFF" opacity={0.12} />
          </G>
        </Svg>
      </Animated.View>

      {/* ボール影・残像・ボール（RNオーバーレイ） */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Animated.View style={[styles.shadow, shadowStyle]} />
        {GHOSTS.map((g, i) => (
          <GhostBall key={i} t={t} P={P} delay={g.delay} size={g.size} maxOpacity={g.opacity} />
        ))}
        <Animated.View style={[styles.ball, ballStyle]}>
          <View style={styles.ballHi} />
          <View style={styles.ballDimple} />
        </Animated.View>
      </View>

      {/* 波紋・パーティクル（カップ位置） */}
      <View style={{ position: "absolute", left: cx, top: holeY }} pointerEvents="none">
        <Animated.View style={[styles.flash, flashStyle]} />
        <Animated.View style={[styles.ring, ring1]} />
        <Animated.View style={[styles.ring, ring2]} />
        {PARTICLES.map((p, i) => (
          <Particle key={i} sink={sink} angle={p.angle} dist={p.dist} color={p.color} size={p.size} />
        ))}
      </View>

      {/* タイトル */}
      <Animated.View style={[styles.titleWrap, { top: h * 0.7 }, titleStyle]} pointerEvents="none">
        <View style={styles.accentBar} />
        <View style={styles.titleRow}>
          <IconSymbol name="flag.fill" size={20} color={GOLD} />
          <View style={{ width: 8 }} />
          <Animated.Text style={styles.title}>パッティング分析</Animated.Text>
        </View>
        <Animated.Text style={styles.subtitle}>グリーンを、データで読む</Animated.Text>
      </Animated.View>

      {/* タップヒント */}
      <Animated.View style={[styles.hintWrap, { top: h - 58 }, hintStyle]} pointerEvents="none">
        <Animated.Text style={styles.hint}>タップして続ける</Animated.Text>
      </Animated.View>
    </View>
  );
}

const BALL_R = 11;

const GHOSTS = [
  { delay: 0.05, size: 19, opacity: 0.5 },
  { delay: 0.1, size: 16, opacity: 0.34 },
  { delay: 0.16, size: 13, opacity: 0.2 },
  { delay: 0.22, size: 10, opacity: 0.12 },
];

const PARTICLES = Array.from({ length: 11 }).map((_, i) => {
  const angle = (i / 11) * Math.PI * 2 + 0.3;
  return {
    angle,
    dist: 46 + (i % 3) * 12,
    size: 6 + (i % 3),
    color: i % 2 === 0 ? GOLD_HI : "#FFFFFF",
  };
});

function GhostBall({
  t,
  P,
  delay,
  size,
  maxOpacity,
}: {
  t: SharedValue<number>;
  P: { x0: number; y0: number; x1: number; y1: number; x2: number; y2: number; x3: number; y3: number };
  delay: number;
  size: number;
  maxOpacity: number;
}) {
  const style = useAnimatedStyle(() => {
    const tt = Math.max(0, t.value - delay);
    const x = bez(tt, P.x0, P.x1, P.x2, P.x3);
    const y = bez(tt, P.y0, P.y1, P.y2, P.y3);
    const vis = t.value > 0.02 && t.value < 0.96 ? 1 : 0;
    return {
      opacity: maxOpacity * vis,
      transform: [{ translateX: x - size / 2 }, { translateY: y - size / 2 }],
    };
  });
  return (
    <Animated.View
      style={[
        { position: "absolute", width: size, height: size, borderRadius: size / 2, backgroundColor: "#FFFFFF" },
        style,
      ]}
    />
  );
}

function Particle({
  sink,
  angle,
  dist,
  color,
  size,
}: {
  sink: SharedValue<number>;
  angle: number;
  dist: number;
  color: string;
  size: number;
}) {
  const style = useAnimatedStyle(() => {
    const b = sink.value;
    return {
      opacity: Math.max(0, 1 - b) * Math.min(1, b * 5),
      transform: [
        { translateX: Math.cos(angle) * dist * b - size / 2 },
        { translateY: Math.sin(angle) * dist * b - 12 * b - size / 2 },
        { scale: 1 - 0.5 * b },
      ],
    };
  });
  return (
    <Animated.View
      style={[
        { position: "absolute", width: size, height: size, borderRadius: size / 2, backgroundColor: color },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: "#1A472A",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999,
    elevation: 999,
  },
  shadow: {
    position: "absolute",
    width: 36,
    height: 12,
    borderRadius: 18,
    backgroundColor: "#000000",
  },
  ball: {
    position: "absolute",
    width: BALL_R * 2,
    height: BALL_R * 2,
    borderRadius: BALL_R,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 5,
  },
  ballHi: {
    position: "absolute",
    top: 3,
    left: 4,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.9)",
  },
  ballDimple: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(0,0,0,0.06)",
  },
  flash: {
    position: "absolute",
    width: 90,
    height: 90,
    marginLeft: -45,
    marginTop: -45,
    borderRadius: 45,
    backgroundColor: GOLD_HI,
  },
  ring: {
    position: "absolute",
    width: 56,
    height: 56,
    marginLeft: -28,
    marginTop: -28,
    borderRadius: 28,
    borderWidth: 2.5,
    borderColor: GOLD_HI,
  },
  titleWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  accentBar: {
    width: 34,
    height: 3,
    borderRadius: 2,
    backgroundColor: GOLD,
    marginBottom: 14,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  title: {
    fontSize: 25,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },
  subtitle: {
    marginTop: 8,
    fontSize: 13,
    color: "rgba(245,242,235,0.72)",
    letterSpacing: 1,
  },
  hintWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  hint: {
    fontSize: 12,
    color: "rgba(245,242,235,0.5)",
    letterSpacing: 2,
  },
});
