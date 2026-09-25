/**
 * パッティングカード v3 の物理レイアウト（単一の正）。
 *
 * - 印刷用 HTML（scripts/scorecard/build-card.ts が public/scorecard/ に生成）も、
 *   OCR の画素判定も、すべてこのファイルの mm 座標から作る。HTML を計測し直す必要はない。
 * - 1面 = 175 × 105 mm（横長）。表 = OUT（1〜9H）、裏 = IN（10〜18H）。
 *   R&A/JGA のゴルフ規則 4.3 の解釈で認められる「ポケットサイズ 4.25 × 7 インチ
 *   (107.95 × 177.8 mm)」に収まる大きさにしてある（裁断の誤差ぶんの余裕も取っている）。
 * - A4 1枚に OUT 面と IN 面を上下に並べて印刷し、中央で山折りすると二つ折りのカードになる。
 *
 * 座標系: 面の左上が原点、x 右・y 下、単位 mm。Rect は枠の外形。
 */

export type MmRect = { x: number; y: number; w: number; h: number };
export type MmPoint = { x: number; y: number };

export type CardSide = "out" | "in";

export const CARD_W = 175;
export const CARD_H = 105;

// ─── 位置合わせマーク ───────────────────────────────────────────────────────
export const MARKER_SIZE = 5;
const MARKER_INSET = 3;
const mc = MARKER_INSET + MARKER_SIZE / 2; // マーク中心の端からの距離

/** 四隅マーク中心（TL, TR, BR, BL の時計回り） */
export const MARKER_CENTERS: [MmPoint, MmPoint, MmPoint, MmPoint] = [
  { x: mc, y: mc },
  { x: CARD_W - mc, y: mc },
  { x: CARD_W - mc, y: CARD_H - mc },
  { x: mc, y: CARD_H - mc },
];

/** 向き判定用の塗りつぶし正方形（左上マークの右隣）。180°回転した位置は必ず空白にしておく */
export const ORIENTATION_KEY: MmRect = { x: 10.2, y: 4, w: 3, h: 3 };

/** 面の識別コード。OUT 面は [0]、IN 面は [1] だけが塗りつぶされている */
export const SIDE_CODE: [MmRect, MmRect] = [
  { x: 62, y: 4, w: 3, h: 3 },
  { x: 66.2, y: 4, w: 3, h: 3 },
];

// ─── ヘッダー（OUT 面のみ記入欄あり） ───────────────────────────────────────
const DIGIT_W = 5.2;
const DIGIT_H = 5.8;
const DIGIT_PITCH = 5.8;

/** 日付 MM/DD の4枠（OUT 面のみ） */
export const DATE_BOXES: MmRect[] = [0, 1, 2, 3].map((i) => ({
  x: 99 + i * DIGIT_PITCH + (i >= 2 ? 2.2 : 0), // 月と日の間に "/" の余白
  y: 3.8,
  w: DIGIT_W,
  h: DIGIT_H,
}));

/** コース名の手書き欄（下線） */
export const COURSE_LINE: MmRect = { x: 137, y: 3.8, w: 28, h: DIGIT_H };

// ─── 表（9ホール × 1行） ────────────────────────────────────────────────────
export const HEADER_BAND = { groupY: 11.6, groupH: 4.0, optionY: 15.6, optionH: 4.2 };
export const ROWS_TOP = 20.4;
export const ROW_PITCH = 7.7;
export const ROW_COUNT = 9;
export const ROWS_BOTTOM = ROWS_TOP + ROW_PITCH * ROW_COUNT;

const CHECK_PITCH = 4.8;
const CHECK_SIZE = 3.8;
const DEC_DOT_GAP = 1.4;

/** 列の配置（x の開始位置） */
export const COLUMNS = {
  hole: { x: 5, w: 8 },
  puttFor: 14,
  p1Dist: 40.5,
  p1UD: 53.5,
  p1LR: 69,
  p1Miss: 84.5,
  p2Dist: 96.6,
  p2UD: 111,
  p2LR: 126.5,
  p3Dist: 143.4,
  total: 158.9,
} as const;

/** 列グループの区切り線の x（ヘッダーから表の下端まで縦に引く） */
export const GROUP_DIVIDERS = [13.5, 39.3, 95.4, 142.2, 157.7];

/** 選択肢のラベル（印刷用）と OCR の値 */
export const PUTT_FOR_OPTIONS = ["E", "Ba", "P", "Bo", "D+"] as const;
export const UD_OPTIONS = ["F", "U", "D"] as const;
export const LR_OPTIONS = ["S", "L", "R"] as const;
export const MISS_OPTIONS = ["short", "long"] as const;

export type PuttForCode = (typeof PUTT_FOR_OPTIONS)[number];
export type UdCode = (typeof UD_OPTIONS)[number];
export type LrCode = (typeof LR_OPTIONS)[number];
export type MissCode = (typeof MISS_OPTIONS)[number];

export const OPTION_PRINT_LABELS = {
  puttFor: ["E", "Ba", "P", "Bo", "D+"],
  ud: ["平", "上", "下"],
  lr: ["直", "左", "右"],
  miss: ["短", "長"],
} as const;

export type RowLayout = {
  /** 行全体（罫線の内側） */
  band: MmRect;
  holeLabel: MmRect;
  puttFor: MmRect[];
  p1: { dist: MmRect[]; ud: MmRect[]; lr: MmRect[]; miss: MmRect[] };
  /** 2nd/3rd の距離は [整数部, 小数部]（間に小数点が印刷されている） */
  p2: { dist: MmRect[]; ud: MmRect[]; lr: MmRect[] };
  p3: { dist: MmRect[] };
  total: MmRect;
};

function checks(x0: number, count: number, cy: number): MmRect[] {
  return Array.from({ length: count }, (_, i) => ({
    x: x0 + i * CHECK_PITCH + (CHECK_PITCH - CHECK_SIZE) / 2,
    y: cy - CHECK_SIZE / 2,
    w: CHECK_SIZE,
    h: CHECK_SIZE,
  }));
}

function digits(x0: number, count: number, cy: number): MmRect[] {
  return Array.from({ length: count }, (_, i) => ({
    x: x0 + i * DIGIT_PITCH + (DIGIT_PITCH - DIGIT_W) / 2,
    y: cy - DIGIT_H / 2,
    w: DIGIT_W,
    h: DIGIT_H,
  }));
}

/** 整数部 + 小数点 + 小数部 */
function decimal(x0: number, cy: number): MmRect[] {
  const a = { x: x0 + (DIGIT_PITCH - DIGIT_W) / 2, y: cy - DIGIT_H / 2, w: DIGIT_W, h: DIGIT_H };
  const b = { ...a, x: x0 + DIGIT_PITCH + DEC_DOT_GAP + (DIGIT_PITCH - DIGIT_W) / 2 };
  return [a, b];
}

/** 小数点の中心（印刷用） */
export function decimalDotCenter(x0: number, cy: number): MmPoint {
  return { x: x0 + DIGIT_PITCH + DEC_DOT_GAP / 2, y: cy + DIGIT_H / 2 - 0.7 };
}

export function rowCenterY(i: number): number {
  return ROWS_TOP + ROW_PITCH * i + ROW_PITCH / 2;
}

export const ROWS: RowLayout[] = Array.from({ length: ROW_COUNT }, (_, i) => {
  const cy = rowCenterY(i);
  return {
    band: { x: 5, y: ROWS_TOP + ROW_PITCH * i, w: 160.5, h: ROW_PITCH },
    holeLabel: { x: COLUMNS.hole.x, y: cy - 3, w: COLUMNS.hole.w, h: 6 },
    puttFor: checks(COLUMNS.puttFor, 5, cy),
    p1: {
      dist: digits(COLUMNS.p1Dist, 2, cy),
      ud: checks(COLUMNS.p1UD, 3, cy),
      lr: checks(COLUMNS.p1LR, 3, cy),
      miss: checks(COLUMNS.p1Miss, 2, cy),
    },
    p2: {
      dist: decimal(COLUMNS.p2Dist, cy),
      ud: checks(COLUMNS.p2UD, 3, cy),
      lr: checks(COLUMNS.p2LR, 3, cy),
    },
    p3: { dist: decimal(COLUMNS.p3Dist, cy) },
    total: { x: COLUMNS.total + 0.3, y: cy - DIGIT_H / 2, w: 5.8, h: DIGIT_H },
  };
});

/** 表の範囲（列見出し＋9行）。OCR で行ごとに切り出すときの横幅にも使う */
export const TABLE_RECT: MmRect = {
  x: 4,
  y: HEADER_BAND.groupY,
  w: 162.5,
  h: ROWS_BOTTOM - HEADER_BAND.groupY,
};

export function holeNumberFor(side: CardSide, rowIndex: number): number {
  return side === "out" ? rowIndex + 1 : rowIndex + 10;
}

// ─── mm ⇔ マーク基準の正規化座標 ───────────────────────────────────────────
// OCR はマーク中心を (0,0)-(1,1) とする正規化座標で扱う（撮影距離に依存しない）。
const M0 = MARKER_CENTERS[0];
const MARKER_SPAN_X = MARKER_CENTERS[1].x - M0.x;
const MARKER_SPAN_Y = MARKER_CENTERS[3].y - M0.y;

/** マーク中心矩形の 高さ / 幅 */
export const MARKER_RECT_ASPECT = MARKER_SPAN_Y / MARKER_SPAN_X;

export function mmToNorm(p: MmPoint): MmPoint {
  return { x: (p.x - M0.x) / MARKER_SPAN_X, y: (p.y - M0.y) / MARKER_SPAN_Y };
}

export function rectMmToNorm(r: MmRect): MmRect {
  const a = mmToNorm({ x: r.x, y: r.y });
  return { x: a.x, y: a.y, w: r.w / MARKER_SPAN_X, h: r.h / MARKER_SPAN_Y };
}

/** 面の外形（カード全体）の正規化座標。補正画像の出力範囲に使う */
export const CARD_BOUNDS_NORM: MmRect = rectMmToNorm({ x: 0, y: 0, w: CARD_W, h: CARD_H });
