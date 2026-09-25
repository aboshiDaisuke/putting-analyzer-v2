/**
 * サーバー側のカード画像処理（Node。jpeg-js は純 JS なので Vercel の関数でもそのまま動く）。
 *
 * どの端末から送られてきた写真でも、ここで同じ前処理をかける:
 *   JPEG デコード → 四隅マーク検出・向き補正・台形補正 → 枠の画素判定 → 行ごとの切り出し
 * Web 版は端末側でも補正してから送ってくる（通信量の削減とその場のフィードバックのため）が、
 * 補正済み画像にも四隅マークは写っているので同じ処理でよい。
 */
import jpeg from "jpeg-js";
import type { RgbaImage } from "../../lib/ocr-image-core";
import {
  cropRgba,
  processCardPhoto,
  rowCropRects,
  stackRgba,
  type ProcessedCard,
} from "../../lib/scorecard/process";

// 大きすぎる写真は検出前に縮小する（デコード後の長辺）
const MAX_LONG_SIDE = 2400;

export function decodeJpegBase64(base64: string): RgbaImage | null {
  try {
    const buf = Buffer.from(base64, "base64");
    const img = jpeg.decode(buf, { useTArray: true, maxMemoryUsageInMB: 512, formatAsRGBA: true });
    return { width: img.width, height: img.height, data: new Uint8ClampedArray(img.data.buffer, img.data.byteOffset, img.data.byteLength) };
  } catch {
    return null;
  }
}

export function encodeJpegBase64(img: RgbaImage, quality = 88): string {
  const out = jpeg.encode({ width: img.width, height: img.height, data: Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength) }, quality);
  return Buffer.from(out.data).toString("base64");
}

/** 面積平均で縮小（整数倍） */
export function downscaleRgba(img: RgbaImage, maxLongSide: number): RgbaImage {
  const factor = Math.ceil(Math.max(img.width, img.height) / maxLongSide);
  if (factor <= 1) return img;
  const w = Math.floor(img.width / factor);
  const h = Math.floor(img.height / factor);
  const out = new Uint8ClampedArray(w * h * 4);
  const area = factor * factor;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const acc = [0, 0, 0];
      for (let dy = 0; dy < factor; dy++) {
        let i = ((y * factor + dy) * img.width + x * factor) * 4;
        for (let dx = 0; dx < factor; dx++, i += 4) {
          acc[0] += img.data[i];
          acc[1] += img.data[i + 1];
          acc[2] += img.data[i + 2];
        }
      }
      const o = (y * w + x) * 4;
      out[o] = acc[0] / area;
      out[o + 1] = acc[1] / area;
      out[o + 2] = acc[2] / area;
      out[o + 3] = 255;
    }
  }
  return { width: w, height: h, data: out };
}

export type PreparedCard = {
  processed: ProcessedCard;
  /** 補正済みカード全体（JPEG base64） */
  fullBase64: string;
  /** 列見出し＋各行（9枚、JPEG base64） */
  rowBase64: string[];
  /** 確認画面に出すプレビュー（幅 1200px） */
  previewBase64: string;
};

export function prepareCardFromJpeg(base64: string): { photo: RgbaImage | null; card: PreparedCard | null } {
  const decoded = decodeJpegBase64(base64);
  if (!decoded) return { photo: null, card: null };
  const photo = downscaleRgba(decoded, MAX_LONG_SIDE);
  const processed = processCardPhoto(photo);
  if (!processed) return { photo, card: null };

  const { header, rows } = rowCropRects();
  const headerImg = cropRgba(processed.image, header);
  const rowBase64 = rows.map((r) => encodeJpegBase64(stackRgba([headerImg, cropRgba(processed.image, r)]), 90));
  return {
    photo,
    card: {
      processed,
      fullBase64: encodeJpegBase64(processed.image, 88),
      rowBase64,
      previewBase64: encodeJpegBase64(downscaleRgba(processed.image, 1200), 80),
    },
  };
}
