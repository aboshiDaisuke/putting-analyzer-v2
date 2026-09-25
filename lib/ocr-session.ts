/**
 * 撮影画面 → 確認画面への読み取り結果の受け渡し（メモリ上）。
 * 補正済みプレビュー画像を含むため URL パラメータには載せない。
 */
import type { CardSide } from "./scorecard/layout";
import type { OcrCard } from "./scorecard/ocr";

export type SideResult = {
  side: CardSide;
  card: OcrCard;
  conflicts: string[];
  warnings: Record<number, string[]>;
  /** 補正済み画像（JPEG base64）。補正できなかったときは撮影した写真 */
  preview: string | null;
  rectified: boolean;
  blurry: boolean;
};

let pending: { roundId?: string; results: SideResult[] } | null = null;

export function setOcrSession(value: { roundId?: string; results: SideResult[] }) {
  pending = value;
}

export function getOcrSession() {
  return pending;
}

export function clearOcrSession() {
  pending = null;
}
