/**
 * ocr-image.ts（ネイティブ用）
 *
 * 撮影したスコアカード画像を OCR 送信用に整える。
 * ネイティブでは Canvas が使えないため台形補正・枠判定は行わず、
 * Vercel の本文上限（4.5MB）に収まるよう段階的に圧縮するだけ。
 * Web 版は ocr-image.web.ts（四隅マーク検出 → 台形補正 → 枠判定 → ブレ判定）。
 */
import * as ImageManipulator from "expo-image-manipulator";
import type { OcrMarkHints } from "./ocr-utils";

export type PreparedImage = {
  base64: string;
  mimeType: "image/jpeg";
  /** 四隅マークで台形補正できたか */
  rectified: boolean;
  /** 補正画像から画素で判定したチェック枠（補正できた場合のみ） */
  markHints?: OcrMarkHints;
  /** ブレ判定（Webのみ）。variance が小さいほどぼやけている */
  blur?: { variance: number; isBlurry: boolean };
};

// 送信する base64 文字列長 ≒ 本文バイト数。上限を安全側に 4.0MB とする。
export const MAX_UPLOAD_BASE64_LEN = 4_000_000;

/** 精度優先の順に試行し、最初に上限内へ収まったものを採用する */
export async function compressForUpload(uri: string, fallbackBase64: string): Promise<string> {
  const attempts: { width: number; compress: number }[] = [
    { width: 2560, compress: 0.92 },
    { width: 2048, compress: 0.85 },
    { width: 1600, compress: 0.8 },
  ];
  let last: string | null = null;
  for (const a of attempts) {
    try {
      const result = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: a.width } }],
        { compress: a.compress, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );
      if (!result.base64) continue;
      last = result.base64;
      if (result.base64.length <= MAX_UPLOAD_BASE64_LEN) return result.base64;
    } catch (e) {
      console.warn("Image compression failed:", e);
      break;
    }
  }
  return last ?? fallbackBase64;
}

export async function prepareScorecardImage(uri: string, fallbackBase64: string): Promise<PreparedImage> {
  const base64 = await compressForUpload(uri, fallbackBase64);
  return { base64, mimeType: "image/jpeg", rectified: false };
}
