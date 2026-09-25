/** ocr-image.ts（ネイティブ）と ocr-image.web.ts（Web）で共有する型・定数 */
import type { CardSide } from "./scorecard/layout";

export type PreparedImage = {
  base64: string;
  mimeType: "image/jpeg";
  /** 端末で四隅マークを見つけて補正できたか（ネイティブでは常に false = サーバーで判定） */
  rectified: boolean;
  /** 端末で判定できた面 */
  side?: CardSide | null;
  /** ブレ判定（Webのみ）。variance が小さいほどぼやけている */
  blur?: { variance: number; isBlurry: boolean };
};

// 送信する base64 文字列長 ≒ 本文バイト数。上限を安全側に 4.0MB とする。
export const MAX_UPLOAD_BASE64_LEN = 4_000_000;

