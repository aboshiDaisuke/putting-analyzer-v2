/**
 * ocr-image.web.ts（Web 用）
 *
 * 撮影したスコアカード画像を Canvas で読み込み、
 *   1. 四隅の■マークを検出して台形補正（正面から見た固定サイズの画像にする）
 *   2. 補正画像上の既知座標にあるチェック枠を画素で判定（markHints）
 *   3. ラプラシアン分散でブレを判定
 * してから JPEG(base64) にする。マークが見つからなければ従来通りの縮小のみ。
 */
import type { OcrMarkHints, SectionMarkHints } from "./ocr-utils";
import { SCORECARD_LAYOUT } from "./ocr-layout";
import {
  detectCellMarks,
  laplacianVariance,
  rectifyScorecard,
  rgbaToGray,
  type CellMarks,
  type RgbaImage,
} from "./ocr-image-core";
import { MAX_UPLOAD_BASE64_LEN, type PreparedImage } from "./ocr-image";

export type { PreparedImage } from "./ocr-image";

// 検出・補正に使う最大の長辺。大きいほど精度は上がるが処理時間が延びる
const MAX_PROCESS_LONG_SIDE = 2200;
// ラプラシアン分散がこれ未満なら「ぼやけている可能性」を出す（補正後画像・1000px基準）
const BLUR_VARIANCE_THRESHOLD = 30;

function loadImage(uri: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("画像の読み込みに失敗しました"));
    img.src = uri;
  });
}

function drawToRgba(img: HTMLImageElement, maxLongSide: number): RgbaImage {
  const scale = Math.min(1, maxLongSide / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h);
  return { width: w, height: h, data: data.data };
}

function rgbaToJpegBase64(img: RgbaImage, quality: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d")!;
  const imageData = new ImageData(new Uint8ClampedArray(img.data), img.width, img.height);
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/jpeg", quality).split(",")[1] ?? "";
}

function toHints(marks: CellMarks): OcrMarkHints {
  const section = (s: CellMarks["sections"][number]): SectionMarkHints => ({
    cupIn: s.cupIn.marked === undefined ? "unsure" : s.cupIn.marked,
    result: s.result.index === undefined ? "unsure" : s.result.index,
    lineUD: s.lineUD.index === undefined ? "unsure" : s.lineUD.index,
    lineLR: s.lineLR.index === undefined ? "unsure" : s.lineLR.index,
  });
  return { sections: [section(marks.sections[0]), section(marks.sections[1]), section(marks.sections[2])] };
}

/** 上限を超えたら品質を落として収める */
function encodeWithinLimit(img: RgbaImage): string {
  for (const q of [0.92, 0.85, 0.75, 0.65]) {
    const b64 = rgbaToJpegBase64(img, q);
    if (b64.length <= MAX_UPLOAD_BASE64_LEN) return b64;
  }
  return rgbaToJpegBase64(img, 0.6);
}

export async function prepareScorecardImage(uri: string, fallbackBase64: string): Promise<PreparedImage> {
  try {
    const img = await loadImage(uri);
    const photo = drawToRgba(img, MAX_PROCESS_LONG_SIDE);
    const rectified = rectifyScorecard(photo, SCORECARD_LAYOUT);

    if (rectified) {
      const gray = rgbaToGray(rectified.image);
      const marks = detectCellMarks(gray, SCORECARD_LAYOUT, rectified.frame);
      const variance = laplacianVariance(gray);
      return {
        base64: encodeWithinLimit(rectified.image),
        mimeType: "image/jpeg",
        rectified: true,
        markHints: toHints(marks),
        blur: { variance, isBlurry: variance < BLUR_VARIANCE_THRESHOLD },
      };
    }

    // マークが見つからない: 元画像を縮小して送る（従来動作）
    const variance = laplacianVariance(rgbaToGray(photo));
    return {
      base64: encodeWithinLimit(photo),
      mimeType: "image/jpeg",
      rectified: false,
      blur: { variance, isBlurry: variance < BLUR_VARIANCE_THRESHOLD },
    };
  } catch (e) {
    console.warn("[ocr-image] prepare failed, sending original:", e);
    return { base64: fallbackBase64, mimeType: "image/jpeg", rectified: false };
  }
}
