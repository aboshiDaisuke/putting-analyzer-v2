/**
 * ocr-image.ts（ネイティブ用）
 *
 * 撮影したカード画像を OCR 送信用に整える。
 * ネイティブでは Canvas が使えないため端末では補正せず、
 * Vercel の本文上限（4.5MB）に収まるよう段階的に圧縮するだけ。
 * 向き・台形補正・枠の画素判定はサーバー（server/_core/card-image.ts）が同じ処理を行う。
 * Web 版は ocr-image.web.ts（端末でも補正して、その場で「補正OK / OUT・IN」を表示する）。
 */
import * as ImageManipulator from "expo-image-manipulator";
import { MAX_UPLOAD_BASE64_LEN, type PreparedImage } from "./ocr-image-shared";

export { MAX_UPLOAD_BASE64_LEN, type PreparedImage } from "./ocr-image-shared";

/** 精度優先の順に試行し、最初に上限内へ収まったものを採用する */
export async function compressForUpload(uri: string, fallbackBase64: string): Promise<string> {
  // サーバー側で長辺 2400px に縮小して処理するので、それ以上は送らない
  const attempts: { width: number; compress: number }[] = [
    { width: 2400, compress: 0.9 },
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
