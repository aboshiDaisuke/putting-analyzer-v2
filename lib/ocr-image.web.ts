/**
 * ocr-image.web.ts（Web 用）
 *
 * 撮影したカード画像を Canvas で読み込み、端末でも
 *   四隅■マーク検出 → 向き（0/90/180/270°）→ 台形補正 → OUT/IN 判定 → ブレ判定
 * をしてから補正済み JPEG（1750×1050）を送る。撮影直後に「補正OK・OUT」のように結果を見せられ、
 * 通信量も減る。サーバーは受け取った画像に同じ処理をもう一度かける（補正済みでも四隅マークは写っている）。
 */
import type { RgbaImage } from "./ocr-image-core";
import { laplacianVariance, rgbaToGray } from "./ocr-image-core";
import { processCardPhoto } from "./scorecard/process";
// "./ocr-image" は Web ではこのファイル自身に解決されるため、共有部分は別ファイルから読む
import { MAX_UPLOAD_BASE64_LEN, type PreparedImage } from "./ocr-image-shared";

export type { PreparedImage } from "./ocr-image-shared";

// 検出・補正に使う最大の長辺。大きいほど精度は上がるが処理時間が延びる
const MAX_PROCESS_LONG_SIDE = 2400;
const BLUR_VARIANCE_THRESHOLD = 25;

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
  ctx.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
  return canvas.toDataURL("image/jpeg", quality).split(",")[1] ?? "";
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
    const processed = processCardPhoto(photo);
    if (processed) {
      return {
        base64: encodeWithinLimit(processed.image),
        mimeType: "image/jpeg",
        rectified: true,
        side: processed.marks.side,
        blur: processed.blur,
      };
    }
    // マークが見つからない: 元画像を縮小して送る（サーバーでも検出を試み、だめなら LLM だけで読む）
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
