import type { GreenPoint } from "@/lib/putting-stats";

export type Outcome = GreenPoint["outcome"];

export type GreenSceneProps = {
  /** hero = ボールが転がってカップインする演出 / map = 自分の 1st パットを配置 */
  mode: "hero" | "map";
  points?: GreenPoint[];
  /** 表示する結果（未指定は全部） */
  visible?: Outcome[];
  height: number;
  /** 選択中の点（map）。タップで onSelect が呼ばれる */
  selected?: GreenPoint | null;
  onSelect?: (p: GreenPoint | null) => void;
  /** 読み上げ用の説明 */
  accessibilityLabel?: string;
  /** 角丸 */
  radius?: number;
};

// 3D ステージの配色（ライト/ダーク共通の「夜のグリーン」。文字は白で 4.5:1 以上を確保）
export const STAGE = {
  bgTop: "#0E2417",
  bgBottom: "#07130C",
  grass: "#2E7A43",
  grassLight: "#3C9154",
  fringe: "#1D4E2C",
  ring: "#E9E4D4",
  one: "#E8C35A",
  two: "#F3EFE4",
  three: "#E2573F",
  text: "#F3EFE4",
  textMuted: "#B9C7BC",
};

export const OUTCOME_COLOR: Record<Outcome, string> = {
  one: STAGE.one,
  two: STAGE.two,
  three: STAGE.three,
};

export const OUTCOME_LABEL: Record<Outcome, string> = {
  one: "1パット",
  two: "2パット",
  three: "3パット以上",
};

/** 表示上の最大距離（これより遠い点は外周に置く） */
export const MAX_RADIUS_M = 16;
export const RING_METERS = [1, 2, 3, 5, 10, 15];

export function pointXZ(p: { meters: number; angle: number; jitter?: number }): { x: number; z: number } {
  // 1st パットは整数 m で記録されるので、表示だけ ±0.4m ずらしてリング上に一列に並ぶのを防ぐ
  const r = Math.max(0.35, Math.min(p.meters + (p.jitter ?? 0) * 0.8, MAX_RADIUS_M));
  // angle 0 = 手前（+z、カメラ側）、π = 奥、+ = 右（+x）
  return { x: Math.sin(p.angle) * r, z: Math.cos(p.angle) * r };
}
