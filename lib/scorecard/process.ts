/**
 * パッティングカード v3 の写真処理（純粋関数・DOM 非依存。Web の Canvas でも Node のサーバーでも動く）。
 *
 *   1. 四隅の■マークを検出（カードが縦向き・逆さに写っていても可）
 *   2. 左上の「向きキー」で 0°/90°/180°/270° を確定
 *   3. 射影変換で 10px/mm の正面画像（1750×1050）へ補正
 *   4. 面コードで OUT / IN を判定
 *   5. 全チェック枠の印・全数字枠のインク有無を画素で判定
 *
 * 画素判定は鉛筆の薄い線も拾えるよう、枠ごとに周囲の「紙の白さ」を測ってから暗さを判定する。
 */
import {
  applyHomography,
  findCornerMarkers,
  laplacianVariance,
  rgbaToGray,
  solveHomography,
  warpPerspective,
  type GrayImage,
  type Point,
  type Quad,
  type RgbaImage,
} from "../ocr-image-core";
import {
  CARD_H,
  CARD_W,
  DATE_BOXES,
  HEADER_BAND,
  MARKER_CENTERS,
  MARKER_RECT_ASPECT,
  ORIENTATION_KEY,
  ROWS,
  ROW_COUNT,
  SIDE_CODE,
  TABLE_RECT,
  type CardSide,
  type MmRect,
} from "./layout";

/** 補正画像の解像度 */
export const PX_PER_MM = 10;
export const CANONICAL_W = CARD_W * PX_PER_MM;
export const CANONICAL_H = CARD_H * PX_PER_MM;

export type PxRect = { x: number; y: number; w: number; h: number };

export function mmRectToPx(r: MmRect): PxRect {
  return { x: r.x * PX_PER_MM, y: r.y * PX_PER_MM, w: r.w * PX_PER_MM, h: r.h * PX_PER_MM };
}

const CANONICAL_MARKERS: Quad = MARKER_CENTERS.map((p) => ({ x: p.x * PX_PER_MM, y: p.y * PX_PER_MM })) as Quad;

// ─── 1〜2. マーク検出と向きの確定 ───────────────────────────────────────────

export type CardLocation = {
  /** 写真上のマーク中心。カードの正しい向きでの TL, TR, BR, BL */
  quad: Quad;
  /** 写真に対してカードが何度回っていたか（時計回り 0/90/180/270） */
  rotation: 0 | 90 | 180 | 270;
  /** 向きキーの判定に自信があるか */
  orientationConfident: boolean;
};

function rotateQuad(q: Quad, k: number): Quad {
  return [0, 1, 2, 3].map((i) => q[(i + k) % 4]) as Quad;
}

/** 写真上の矩形（カードの mm 座標）の平均輝度を、ホモグラフィで写した格子点から測る */
function sampleMean(gray: GrayImage, H: number[], r: MmRect): number {
  let sum = 0;
  let n = 0;
  for (let iy = 1; iy <= 4; iy++) {
    for (let ix = 1; ix <= 4; ix++) {
      const p = applyHomography(H, {
        x: (r.x + (r.w * ix) / 5) * PX_PER_MM,
        y: (r.y + (r.h * iy) / 5) * PX_PER_MM,
      });
      const x = Math.round(p.x);
      const y = Math.round(p.y);
      if (x < 0 || y < 0 || x >= gray.width || y >= gray.height) continue;
      sum += gray.data[y * gray.width + x];
      n++;
    }
  }
  return n > 0 ? sum / n : 255;
}

/** 180° 回した位置の矩形 */
function rotated180(r: MmRect): MmRect {
  return { x: CARD_W - r.x - r.w, y: CARD_H - r.y - r.h, w: r.w, h: r.h };
}

export function locateCard(gray: GrayImage): CardLocation | null {
  const landscape = findCornerMarkers(gray, MARKER_RECT_ASPECT);
  const portrait = findCornerMarkers(gray, 1 / MARKER_RECT_ASPECT);
  let detection = landscape;
  let base = 0;
  if (portrait && (!landscape || portrait.score > landscape.score)) {
    detection = portrait;
    base = 1; // 写真上で縦長 = 90° か 270° 回っている
  }
  if (!detection) return null;

  // 候補の2通り（k と k+2）で向きキーを調べ、キーが暗く反対側が白い方を採る
  const candidates = [base, base + 2].map((k) => {
    // 写真の角 (TL,TR,BR,BL) を shift 個ずらした並びをカードの TL,TR,BR,BL とみなす。
    // shift = カードが時計回りに回っている量（90°単位）。例: 180° なら写真の BR がカードの TL
    const shift = (4 - k) % 4;
    const quad = rotateQuad(detection!.quad, shift);
    const H = solveHomography(CANONICAL_MARKERS, quad);
    if (!H) return null;
    const key = sampleMean(gray, H, ORIENTATION_KEY);
    const anti = sampleMean(gray, H, rotated180(ORIENTATION_KEY));
    return { shift, quad, contrast: anti - key };
  });
  const valid = candidates.filter((c): c is NonNullable<typeof c> => c !== null);
  if (valid.length === 0) return null;
  valid.sort((a, b) => b.contrast - a.contrast);
  const best = valid[0];
  return {
    quad: best.quad,
    rotation: (best.shift * 90) as CardLocation["rotation"],
    orientationConfident: best.contrast > 40,
  };
}

// ─── 3. 補正 ─────────────────────────────────────────────────────────────────

export function rectifyCard(photo: RgbaImage, loc: CardLocation): RgbaImage | null {
  const H = solveHomography(CANONICAL_MARKERS, loc.quad); // 出力 → 入力
  if (!H) return null;
  return warpPerspective(photo, H, CANONICAL_W, CANONICAL_H);
}

// ─── 4〜5. 面と枠の判定 ─────────────────────────────────────────────────────

/** 枠の周囲（外側に広げた範囲）の明るい側の分位点 ≒ 紙の白さ */
function localPaper(gray: GrayImage, r: PxRect): number {
  const pad = Math.max(r.w, r.h) * 0.6;
  const x0 = Math.max(0, Math.floor(r.x - pad));
  const y0 = Math.max(0, Math.floor(r.y - pad));
  const x1 = Math.min(gray.width, Math.ceil(r.x + r.w + pad));
  const y1 = Math.min(gray.height, Math.ceil(r.y + r.h + pad));
  const hist = new Uint32Array(256);
  let n = 0;
  for (let y = y0; y < y1; y += 2) {
    const row = y * gray.width;
    for (let x = x0; x < x1; x += 2) {
      hist[gray.data[row + x]]++;
      n++;
    }
  }
  if (n === 0) return 255;
  let acc = 0;
  for (let t = 255; t >= 0; t--) {
    acc += hist[t];
    if (acc >= n * 0.3) return t; // 上位30%の明るさ
  }
  return 255;
}

/**
 * 枠の内側でインクとみなせる画素の割合。
 * 枠線を避けるため inset ぶん内側だけを見る。しきい値は周囲の紙の白さから決める（鉛筆対応）。
 */
export function inkRatio(gray: GrayImage, r: PxRect, inset = 0.2): number {
  const paper = localPaper(gray, r);
  const threshold = paper - Math.max(32, paper * 0.2);
  const x0 = Math.max(0, Math.round(r.x + r.w * inset));
  const y0 = Math.max(0, Math.round(r.y + r.h * inset));
  const x1 = Math.min(gray.width, Math.round(r.x + r.w * (1 - inset)));
  const y1 = Math.min(gray.height, Math.round(r.y + r.h * (1 - inset)));
  if (x1 <= x0 || y1 <= y0) return 0;
  let dark = 0;
  let n = 0;
  for (let y = y0; y < y1; y++) {
    const row = y * gray.width;
    for (let x = x0; x < x1; x++) {
      if (gray.data[row + x] < threshold) dark++;
      n++;
    }
  }
  return n > 0 ? dark / n : 0;
}

// しきい値（合成写真と実写で調整）。空欄は枠線の滲みで数%暗くなる
export const MARK_ON = 0.09;
export const MARK_OFF = 0.03;
export const INK_ON = 0.035;
export const INK_OFF = 0.012;

/** 排他選択の判定: index / null = 印なし / "unsure" = 判定不能（LLM に委ねる） */
export type ChoiceHint = number | null | "unsure";
/** 数字枠のインク: true / false / "unsure" */
export type InkHint = boolean | "unsure";

export type ChoiceMark = { ratios: number[]; hint: ChoiceHint; /** 印の濃さの差がはっきりしている（誤判定の心配が小さい） */ strong: boolean };
export type InkMark = { ratio: number; hint: InkHint };

export function judgeChoice(ratios: number[]): ChoiceHint {
  let best = -1;
  let bestRatio = -1;
  let second = -1;
  ratios.forEach((r, i) => {
    if (r > bestRatio) {
      second = bestRatio;
      bestRatio = r;
      best = i;
    } else if (r > second) {
      second = r;
    }
  });
  if (bestRatio <= MARK_OFF) return null;
  if (bestRatio < MARK_ON) return "unsure";
  if (second > MARK_OFF && second > bestRatio * 0.55) return "unsure"; // 2つ以上に印（書き直し等）
  return best;
}

function judgeInk(ratio: number): InkHint {
  if (ratio >= INK_ON) return true;
  if (ratio <= INK_OFF) return false;
  return "unsure";
}

export type RowMarks = {
  puttFor: ChoiceMark;
  p1: { dist: InkMark[]; ud: ChoiceMark; lr: ChoiceMark; miss: ChoiceMark };
  p2: { dist: InkMark[]; ud: ChoiceMark; lr: ChoiceMark };
  p3: { dist: InkMark[] };
  total: InkMark;
};

export type CardMarks = {
  side: CardSide | null;
  sideRatios: [number, number];
  date: InkMark[];
  rows: RowMarks[];
};

function darkFill(gray: GrayImage, r: MmRect): number {
  // 面コードは印刷の塗りつぶしなので単純な暗さの割合で十分
  return inkRatio(gray, mmRectToPx(r), 0.25);
}

export function detectCardMarks(rectGray: GrayImage): CardMarks {
  const choice = (rects: MmRect[]): ChoiceMark => {
    const ratios = rects.map((r) => inkRatio(rectGray, mmRectToPx(r)));
    const hint = judgeChoice(ratios);
    const sorted = [...ratios].sort((a, b) => b - a);
    const strong =
      hint === null ? sorted[0] <= MARK_OFF * 0.6 : typeof hint === "number" ? sorted[0] >= 0.15 && (sorted[1] ?? 0) <= sorted[0] * 0.35 : false;
    return { ratios, hint, strong };
  };
  const ink = (r: MmRect): InkMark => {
    const ratio = inkRatio(rectGray, mmRectToPx(r), 0.14);
    return { ratio, hint: judgeInk(ratio) };
  };

  const s0 = darkFill(rectGray, SIDE_CODE[0]);
  const s1 = darkFill(rectGray, SIDE_CODE[1]);
  let side: CardSide | null = null;
  if (s0 > 0.5 && s1 < 0.2) side = "out";
  else if (s1 > 0.5 && s0 < 0.2) side = "in";

  const rows: RowMarks[] = ROWS.map((row) => ({
    puttFor: choice(row.puttFor),
    p1: { dist: row.p1.dist.map(ink), ud: choice(row.p1.ud), lr: choice(row.p1.lr), miss: choice(row.p1.miss) },
    p2: { dist: row.p2.dist.map(ink), ud: choice(row.p2.ud), lr: choice(row.p2.lr) },
    p3: { dist: row.p3.dist.map(ink) },
    total: ink(row.total),
  }));

  return { side, sideRatios: [s0, s1], date: DATE_BOXES.map(ink), rows };
}

// ─── まとめ ─────────────────────────────────────────────────────────────────

export const BLUR_VARIANCE_THRESHOLD = 25;

export type ProcessedCard = {
  image: RgbaImage;
  gray: GrayImage;
  location: CardLocation;
  marks: CardMarks;
  blur: { variance: number; isBlurry: boolean };
};

/** 写真 → 補正画像＋画素判定。四隅マークが見つからなければ null */
export function processCardPhoto(photo: RgbaImage): ProcessedCard | null {
  const location = locateCard(rgbaToGray(photo));
  // 向きキーがはっきりしない = マークの誤検出（端が切れている等）。補正せず撮り直しを促す
  if (!location || !location.orientationConfident) return null;
  const image = rectifyCard(photo, location);
  if (!image) return null;
  const gray = rgbaToGray(image);
  const marks = detectCardMarks(gray);
  // 面コード（■□ / □■）が読めない = 別の四角をマークと取り違えた可能性が高い（角が画面外など）。
  // 誤った座標で枠を判定すると LLM の正しい読みを上書きしてしまうので、補正なしの扱いにする
  if (marks.side === null) return null;
  const variance = laplacianVariance(gray);
  return { image, gray, location, marks, blur: { variance, isBlurry: variance < BLUR_VARIANCE_THRESHOLD } };
}

/** 行ごとの切り出し範囲（列見出しは別に切り出して各行の上に付ける） */
export function rowCropRects(): { header: PxRect; rows: PxRect[] } {
  const pad = 0.6 * PX_PER_MM;
  const header = mmRectToPx({
    x: TABLE_RECT.x,
    y: HEADER_BAND.groupY,
    w: TABLE_RECT.w,
    h: HEADER_BAND.groupH + HEADER_BAND.optionH,
  });
  const rows = Array.from({ length: ROW_COUNT }, (_, i) => {
    const b = ROWS[i].band;
    return { x: TABLE_RECT.x * PX_PER_MM, y: b.y * PX_PER_MM - pad, w: TABLE_RECT.w * PX_PER_MM, h: b.h * PX_PER_MM + pad * 2 };
  });
  return { header, rows };
}

/** 画像の一部を切り出す（ピクセル単位） */
export function cropRgba(img: RgbaImage, r: PxRect): RgbaImage {
  const x0 = Math.max(0, Math.round(r.x));
  const y0 = Math.max(0, Math.round(r.y));
  const w = Math.min(img.width - x0, Math.round(r.w));
  const h = Math.min(img.height - y0, Math.round(r.h));
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const src = ((y0 + y) * img.width + x0) * 4;
    out.set(img.data.subarray(src, src + w * 4), y * w * 4);
  }
  return { width: w, height: h, data: out };
}

/** 縦に画像を連結する（列見出し＋行） */
export function stackRgba(parts: RgbaImage[]): RgbaImage {
  const width = Math.max(...parts.map((p) => p.width));
  const height = parts.reduce((s, p) => s + p.height, 0);
  const out = new Uint8ClampedArray(width * height * 4).fill(255);
  let y = 0;
  for (const p of parts) {
    for (let row = 0; row < p.height; row++) {
      out.set(p.data.subarray(row * p.width * 4, (row + 1) * p.width * 4), ((y + row) * width) * 4);
    }
    y += p.height;
  }
  return { width, height, data: out };
}

export type { Point };
