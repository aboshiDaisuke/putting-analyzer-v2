/**
 * ocr-image-core.ts
 *
 * スコアカード写真の前処理（純粋関数・DOM/Canvas 非依存）。
 *   1. 四隅の■マーク検出       findCornerMarkers
 *   2. 射影変換（台形補正）      solveHomography / warpPerspective
 *   3. チェック枠の塗り判定      detectCellMarks
 *   4. ブレ判定                 laplacianVariance
 *
 * ピクセル配列だけを扱うので、Web（Canvas）でもテスト（Node）でも同じコードが動く。
 * 座標系: 画像は左上原点、x 右、y 下。
 */

import type { NormRect, ScorecardLayout } from "./ocr-layout";

export type GrayImage = { width: number; height: number; data: Uint8ClampedArray };
export type RgbaImage = { width: number; height: number; data: Uint8ClampedArray };
export type Point = { x: number; y: number };
/** 四隅マークの中心。順序は TL, TR, BR, BL（時計回り） */
export type Quad = [Point, Point, Point, Point];

// ─── 基本変換 ────────────────────────────────────────────────────────────────

export function rgbaToGray(img: RgbaImage): GrayImage {
  const n = img.width * img.height;
  const out = new Uint8ClampedArray(n);
  const d = img.data;
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    // ITU-R BT.601 輝度
    out[i] = (d[j] * 77 + d[j + 1] * 150 + d[j + 2] * 29) >> 8;
  }
  return { width: img.width, height: img.height, data: out };
}

/** 整数倍率のボックス平均で縮小する（マーク検出の高速化用） */
export function downscaleGray(img: GrayImage, targetWidth: number): { image: GrayImage; scale: number } {
  const factor = Math.max(1, Math.floor(img.width / targetWidth));
  if (factor === 1) return { image: img, scale: 1 };
  const w = Math.floor(img.width / factor);
  const h = Math.floor(img.height / factor);
  const out = new Uint8ClampedArray(w * h);
  const area = factor * factor;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      const sy0 = y * factor;
      const sx0 = x * factor;
      for (let dy = 0; dy < factor; dy++) {
        const row = (sy0 + dy) * img.width + sx0;
        for (let dx = 0; dx < factor; dx++) sum += img.data[row + dx];
      }
      out[y * w + x] = sum / area;
    }
  }
  return { image: { width: w, height: h, data: out }, scale: factor };
}

/** 大津の二値化しきい値 */
export function otsuThreshold(img: GrayImage): number {
  const hist = new Uint32Array(256);
  for (let i = 0; i < img.data.length; i++) hist[img.data[i]]++;
  const total = img.data.length;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let threshold = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  return threshold;
}

/** ラプラシアンの分散（大きいほどシャープ）。ブレ判定に使う。 */
export function laplacianVariance(img: GrayImage): number {
  const { width: w, height: h, data } = img;
  if (w < 3 || h < 3) return 0;
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const v = 4 * data[i] - data[i - 1] - data[i + 1] - data[i - w] - data[i + w];
      sum += v;
      sumSq += v * v;
      n++;
    }
  }
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

// ─── 四隅マーク検出 ──────────────────────────────────────────────────────────

type Blob = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  area: number;
  cx: number;
  cy: number;
};

/** 二値画像（1 = 暗）の連結成分をラベリングして矩形情報を返す */
function connectedComponents(bin: Uint8Array, w: number, h: number, maxBlobs = 4000): Blob[] {
  const visited = new Uint8Array(w * h);
  const blobs: Blob[] = [];
  const stack: number[] = [];
  for (let start = 0; start < w * h; start++) {
    if (!bin[start] || visited[start]) continue;
    visited[start] = 1;
    stack.push(start);
    let minX = w, minY = h, maxX = 0, maxY = 0, area = 0, sx = 0, sy = 0;
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % w;
      const y = (i - x) / w;
      area++;
      sx += x;
      sy += y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x > 0 && bin[i - 1] && !visited[i - 1]) { visited[i - 1] = 1; stack.push(i - 1); }
      if (x < w - 1 && bin[i + 1] && !visited[i + 1]) { visited[i + 1] = 1; stack.push(i + 1); }
      if (y > 0 && bin[i - w] && !visited[i - w]) { visited[i - w] = 1; stack.push(i - w); }
      if (y < h - 1 && bin[i + w] && !visited[i + w]) { visited[i + w] = 1; stack.push(i + w); }
    }
    blobs.push({ minX, minY, maxX, maxY, area, cx: sx / area, cy: sy / area });
    if (blobs.length >= maxBlobs) break;
  }
  return blobs;
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** 4点が時計回り（TL,TR,BR,BL）の凸四角形か */
function isConvexClockwise(q: Quad): boolean {
  for (let i = 0; i < 4; i++) {
    const a = q[i];
    const b = q[(i + 1) % 4];
    const c = q[(i + 2) % 4];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (cross <= 0) return false; // 画像座標（y 下向き）では時計回り = cross > 0
  }
  return true;
}

export type MarkerDetection = {
  quad: Quad;
  /** 検出に使った縮小画像上でのマーク平均サイズ(px) */
  markerSize: number;
};

/**
 * 四隅の■マークを検出する。
 * @param gray 元画像のグレースケール（縮小前でよい。内部で ~640px 幅に縮小する）
 * @param expectedAspect マーク中心矩形の 高さ/幅（レイアウトから）
 */
export function findCornerMarkers(gray: GrayImage, expectedAspect: number): MarkerDetection | null {
  const { image: small, scale } = downscaleGray(gray, 640);
  const { width: w, height: h, data } = small;
  const threshold = otsuThreshold(small);
  // 紙は明るく、マークは最も暗い部類。Otsu より少し厳しめにして罫線・文字の連結を減らす
  const dark = Math.min(threshold, 120);
  const bin = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) bin[i] = data[i] < dark ? 1 : 0;

  const blobs = connectedComponents(bin, w, h);
  const minSize = Math.max(3, w * 0.006);
  const maxSize = w * 0.08;
  const candidates = blobs.filter((b) => {
    const bw = b.maxX - b.minX + 1;
    const bh = b.maxY - b.minY + 1;
    if (bw < minSize || bh < minSize || bw > maxSize || bh > maxSize) return false;
    const aspect = bw / bh;
    if (aspect < 0.55 || aspect > 1.8) return false;
    const fill = b.area / (bw * bh);
    return fill > 0.5;
  });
  if (candidates.length < 4) return null;

  const corners: Point[] = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ];
  // 各象限で「画像の角に近い順」に上位候補を取る
  const perCorner = corners.map((corner, idx) => {
    const inQuadrant = candidates.filter((b) => {
      const left = b.cx < w / 2;
      const top = b.cy < h / 2;
      return idx === 0 ? left && top : idx === 1 ? !left && top : idx === 2 ? !left && !top : left && !top;
    });
    return inQuadrant
      .map((b) => ({ b, d: dist({ x: b.cx, y: b.cy }, corner) }))
      .sort((p, q) => p.d - q.d)
      .slice(0, 5)
      .map((p) => p.b);
  });
  if (perCorner.some((list) => list.length === 0)) return null;

  const size = (b: Blob) => ((b.maxX - b.minX + 1) + (b.maxY - b.minY + 1)) / 2;
  let best: { quad: Quad; score: number; markerSize: number } | null = null;

  for (const tl of perCorner[0]) {
    for (const tr of perCorner[1]) {
      for (const br of perCorner[2]) {
        for (const bl of perCorner[3]) {
          const quad: Quad = [
            { x: tl.cx, y: tl.cy },
            { x: tr.cx, y: tr.cy },
            { x: br.cx, y: br.cy },
            { x: bl.cx, y: bl.cy },
          ];
          if (!isConvexClockwise(quad)) continue;
          const top = dist(quad[0], quad[1]);
          const bottom = dist(quad[3], quad[2]);
          const left = dist(quad[0], quad[3]);
          const right = dist(quad[1], quad[2]);
          if (Math.min(top, bottom) / Math.max(top, bottom) < 0.7) continue;
          if (Math.min(left, right) / Math.max(left, right) < 0.7) continue;
          const width = (top + bottom) / 2;
          const height = (left + right) / 2;
          const aspect = height / width;
          if (aspect < expectedAspect * 0.75 || aspect > expectedAspect * 1.3) continue;
          const sizes = [size(tl), size(tr), size(br), size(bl)];
          const sMin = Math.min(...sizes);
          const sMax = Math.max(...sizes);
          if (sMax / sMin > 2.5) continue;
          const sizeNorm = ((sMin + sMax) / 2) / width;
          if (sizeNorm < 0.01 || sizeNorm > 0.07) continue;
          // スコア: 四角形が大きいほど（カードが画面を占めるほど）良い。同点なら整った形を優先
          const score = width * height * (1 - Math.abs(aspect - expectedAspect) / expectedAspect);
          if (!best || score > best.score) {
            best = { quad, score, markerSize: (sMin + sMax) / 2 };
          }
        }
      }
    }
  }
  if (!best) return null;
  return {
    quad: best.quad.map((p) => ({ x: (p.x + 0.5) * scale, y: (p.y + 0.5) * scale })) as Quad,
    markerSize: best.markerSize * scale,
  };
}

// ─── 射影変換 ────────────────────────────────────────────────────────────────

/** 8x8 連立一次方程式をガウスの消去法（部分ピボット）で解く */
function solveLinear(a: number[][], b: number[]): number[] | null {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    if (Math.abs(m[pivot][col]) < 1e-12) return null;
    [m[col], m[pivot]] = [m[pivot], m[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = m[r][col] / m[col][col];
      if (f === 0) continue;
      for (let c = col; c <= n; c++) m[r][c] -= f * m[col][c];
    }
  }
  return m.map((row, i) => row[n] / row[i]);
}

/** src の4点を dst の4点へ写す 3x3 ホモグラフィ（行優先 9 要素、h33 = 1） */
export function solveHomography(src: Quad, dst: Quad): number[] | null {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i];
    const { x: u, y: v } = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  const h = solveLinear(A, b);
  if (!h) return null;
  return [...h, 1];
}

export function applyHomography(H: number[], p: Point): Point {
  const w = H[6] * p.x + H[7] * p.y + H[8];
  return {
    x: (H[0] * p.x + H[1] * p.y + H[2]) / w,
    y: (H[3] * p.x + H[4] * p.y + H[5]) / w,
  };
}

/**
 * 射影変換で画像を補正する。
 * @param H 出力座標 → 入力座標 のホモグラフィ（dst→src）。solveHomography(dstQuad, srcQuad) で得る。
 */
export function warpPerspective(src: RgbaImage, H: number[], outW: number, outH: number): RgbaImage {
  const out = new Uint8ClampedArray(outW * outH * 4);
  const { width: sw, height: sh, data } = src;
  for (let v = 0; v < outH; v++) {
    for (let u = 0; u < outW; u++) {
      const den = H[6] * u + H[7] * v + H[8];
      const x = (H[0] * u + H[1] * v + H[2]) / den;
      const y = (H[3] * u + H[4] * v + H[5]) / den;
      const o = (v * outW + u) * 4;
      if (x < 0 || y < 0 || x >= sw - 1 || y >= sh - 1) {
        out[o] = out[o + 1] = out[o + 2] = 255;
        out[o + 3] = 255;
        continue;
      }
      const x0 = Math.floor(x);
      const y0 = Math.floor(y);
      const fx = x - x0;
      const fy = y - y0;
      const i00 = (y0 * sw + x0) * 4;
      const i10 = i00 + 4;
      const i01 = i00 + sw * 4;
      const i11 = i01 + 4;
      const w00 = (1 - fx) * (1 - fy);
      const w10 = fx * (1 - fy);
      const w01 = (1 - fx) * fy;
      const w11 = fx * fy;
      for (let c = 0; c < 3; c++) {
        out[o + c] = data[i00 + c] * w00 + data[i10 + c] * w10 + data[i01 + c] * w01 + data[i11 + c] * w11;
      }
      out[o + 3] = 255;
    }
  }
  return { width: outW, height: outH, data: out };
}

// ─── 正規化座標 ⇔ 補正画像ピクセル ──────────────────────────────────────────

/** 補正画像の出力サイズ（マーク中心矩形の幅を基準にした px） */
export const CANONICAL_MARKER_WIDTH_PX = 1000;

export type CanonicalFrame = {
  width: number;
  height: number;
  /** 正規化座標（マーク基準）→ 補正画像ピクセル */
  toPx: (nx: number, ny: number) => Point;
  /** 四隅マーク中心の補正画像上の位置（TL,TR,BR,BL） */
  markerQuad: Quad;
};

/** レイアウトから補正画像のサイズと座標変換を作る（カード全体が収まる範囲） */
export function canonicalFrame(layout: ScorecardLayout): CanonicalFrame {
  const S = CANONICAL_MARKER_WIDTH_PX;
  const cb = layout.cardBounds;
  const width = Math.round(cb.w * S);
  const height = Math.round(cb.h * S * layout.markerRectAspect);
  const toPx = (nx: number, ny: number): Point => ({
    x: (nx - cb.x) * S,
    y: (ny - cb.y) * S * layout.markerRectAspect,
  });
  const markerQuad: Quad = [toPx(0, 0), toPx(1, 0), toPx(1, 1), toPx(0, 1)];
  return { width, height, toPx, markerQuad };
}

/**
 * 写真 → 補正画像 の変換を一括で行う。
 * @returns 補正画像。マークが見つからなければ null。
 */
export function rectifyScorecard(
  photo: RgbaImage,
  layout: ScorecardLayout,
): { image: RgbaImage; frame: CanonicalFrame; markers: Quad } | null {
  const gray = rgbaToGray(photo);
  const detection = findCornerMarkers(gray, layout.markerRectAspect);
  if (!detection) return null;
  const frame = canonicalFrame(layout);
  const H = solveHomography(frame.markerQuad, detection.quad); // 出力 → 入力
  if (!H) return null;
  const image = warpPerspective(photo, H, frame.width, frame.height);
  return { image, frame, markers: detection.quad };
}

// ─── チェック枠の塗り判定 ────────────────────────────────────────────────────

/** 矩形（px）内側の暗い画素の割合。inset は枠線を避けるための内側マージン比 */
export function cellDarkRatio(
  gray: GrayImage,
  rect: { x: number; y: number; w: number; h: number },
  darkThreshold: number,
  inset = 0.22,
): number {
  const x0 = Math.max(0, Math.round(rect.x + rect.w * inset));
  const y0 = Math.max(0, Math.round(rect.y + rect.h * inset));
  const x1 = Math.min(gray.width, Math.round(rect.x + rect.w * (1 - inset)));
  const y1 = Math.min(gray.height, Math.round(rect.y + rect.h * (1 - inset)));
  if (x1 <= x0 || y1 <= y0) return 0;
  let dark = 0;
  let n = 0;
  for (let y = y0; y < y1; y++) {
    const row = y * gray.width;
    for (let x = x0; x < x1; x++) {
      if (gray.data[row + x] < darkThreshold) dark++;
      n++;
    }
  }
  return n > 0 ? dark / n : 0;
}

/** 排他選択（1つだけ印をつける枠群）の判定結果 */
export type ChoiceMark = {
  ratios: number[];
  /** 選ばれた index。印なし = null。あいまい = undefined（LLM に委ねる） */
  index: number | null | undefined;
};
export type CheckMark = { ratio: number; marked: boolean | undefined };

export type SectionMarks = {
  cupIn: CheckMark;
  result: ChoiceMark;
  lineUD: ChoiceMark;
  lineLR: ChoiceMark;
};

export type CellMarks = {
  /** 紙の白の推定値（0-255）と使用した暗さしきい値 */
  paperWhite: number;
  darkThreshold: number;
  sections: [SectionMarks, SectionMarks, SectionMarks];
};

// 印あり/なしのしきい値。空欄でも枠線の滲みで数%は暗くなるため余裕を持たせる
export const MARK_ON_RATIO = 0.12;
export const MARK_OFF_RATIO = 0.05;

function judgeCheck(ratio: number): boolean | undefined {
  if (ratio >= MARK_ON_RATIO) return true;
  if (ratio <= MARK_OFF_RATIO) return false;
  return undefined;
}

function judgeChoice(ratios: number[]): number | null | undefined {
  let best = -1;
  let bestRatio = -1;
  let second = -1;
  for (let i = 0; i < ratios.length; i++) {
    if (ratios[i] > bestRatio) {
      second = bestRatio;
      bestRatio = ratios[i];
      best = i;
    } else if (ratios[i] > second) {
      second = ratios[i];
    }
  }
  if (bestRatio <= MARK_OFF_RATIO) return null; // 全て空欄
  if (bestRatio < MARK_ON_RATIO) return undefined; // 薄すぎて判断できない
  if (second > MARK_OFF_RATIO && second > bestRatio * 0.5) return undefined; // 2つ以上に印
  return best;
}

/** 補正済み画像のグレースケールからチェック枠を判定する */
export function detectCellMarks(grayRect: GrayImage, layout: ScorecardLayout, frame: CanonicalFrame): CellMarks {
  // 紙の白: 画素値の中央値付近（カードの大半は白）
  const hist = new Uint32Array(256);
  for (let i = 0; i < grayRect.data.length; i++) hist[grayRect.data[i]]++;
  let acc = 0;
  let paperWhite = 255;
  for (let t = 0; t < 256; t++) {
    acc += hist[t];
    if (acc >= grayRect.data.length * 0.5) {
      paperWhite = t;
      break;
    }
  }
  const darkThreshold = Math.max(40, Math.round(paperWhite * 0.6));

  const rectPx = (r: NormRect) => {
    const p = frame.toPx(r.x, r.y);
    const q = frame.toPx(r.x + r.w, r.y + r.h);
    return { x: p.x, y: p.y, w: q.x - p.x, h: q.y - p.y };
  };
  const ratio = (r: NormRect) => cellDarkRatio(grayRect, rectPx(r), darkThreshold);
  const choice = (rects: NormRect[]): ChoiceMark => {
    const ratios = rects.map(ratio);
    return { ratios, index: judgeChoice(ratios) };
  };

  const sections = layout.sections.map((sec) => {
    const cupRatio = ratio(sec.cupIn);
    return {
      cupIn: { ratio: cupRatio, marked: judgeCheck(cupRatio) },
      result: choice(sec.result),
      lineUD: choice(sec.lineUD),
      lineLR: choice(sec.lineLR),
    };
  }) as [SectionMarks, SectionMarks, SectionMarks];

  return { paperWhite, darkThreshold, sections };
}
