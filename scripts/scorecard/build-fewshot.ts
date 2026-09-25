/**
 * OCR のお手本（記入済みカード画像＋正解 JSON）を生成し server/_core/card-fewshot.ts に埋め込む。
 * Vercel の関数バンドルに確実に含めるため base64 で保持する。
 *
 *   NODE_PATH=<scratchpad>/node_modules npx tsx scripts/scorecard/build-fewshot.ts
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { buildCardSvg, fillToOcrCard, type CardFill } from "../../lib/scorecard/card-svg";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { chromium } = require("playwright");

const FILL: CardFill = {
  date: "0612",
  course: "Sample CC",
  ink: "pen",
  markStyle: "check",
  markStyles: { "1.puttFor": "fill", "2.p1.ud": "circle", "4.p1.lr": "cross", "6.p2.ud": "slash" },
  rows: [
    { puttFor: 2, p1: { dist: "7", ud: 1, lr: 1, miss: 0 }, p2: { dist: "0.8", ud: 0, lr: 0 }, total: "2" },
    { puttFor: 1, p1: { dist: "12", ud: 2, lr: 2, miss: 1 }, p2: { dist: "1.6", ud: 1, lr: 1 }, total: "2" },
    { puttFor: 2, p1: { dist: "4", ud: 1, lr: 0 }, total: "1" },
    null,
    { puttFor: 3, p1: { dist: "19", ud: 0, lr: 2, miss: 0 }, p2: { dist: "3.5", ud: 2, lr: 1 }, p3: { dist: "0.9" }, total: "3" },
    { puttFor: 2, p1: { dist: "2", ud: 2, lr: 1 }, total: "1" },
    { puttFor: 1, p1: { dist: "6", ud: 1, lr: 2, miss: 1 }, p2: { dist: "1.3", ud: 2, lr: 0 }, total: "2" },
    { puttFor: 4, p1: { dist: "9", ud: 0, lr: 0, miss: 0 }, p2: { dist: "2.2", ud: 1, lr: 2 }, p3: { dist: "0.4" }, total: "3" },
    { puttFor: 1, p1: { dist: "25", ud: 1, lr: 1, miss: 0 }, p2: { dist: "4.0", ud: 0, lr: 1 }, total: "2" },
  ],
};

async function main() {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage({ viewport: { width: 1750, height: 1050 }, deviceScaleFactor: 1 });
  await page.setContent(`<!DOCTYPE html><html><head>
    <link href="https://fonts.googleapis.com/css2?family=Caveat:wght@700&family=Noto+Sans+JP:wght@400;700;900&display=swap" rel="stylesheet">
    <style>html,body{margin:0}svg{display:block}</style></head>
    <body>${buildCardSvg("out", { fill: FILL, width: "1750px", height: "1050px" })}</body></html>`);
  await page.evaluate(() => (document as unknown as { fonts: { ready: Promise<unknown> } }).fonts.ready);
  await page.waitForTimeout(300);
  const buf: Buffer = await page.screenshot({ type: "jpeg", quality: 72 });
  await browser.close();

  const answer = fillToOcrCard("out", FILL);
  const out = `/**
 * OCR のお手本: 記入済みカード v3（OUT 面）の補正済み画像と、その正しい読み取り結果。
 * scripts/scorecard/build-fewshot.ts が生成（手で編集しない）。
 */
import type { OcrCard } from "../../lib/scorecard/ocr";

export const FEWSHOT_MIME = "image/jpeg";
export const FEWSHOT_ANSWER: OcrCard = ${JSON.stringify(answer, null, 2)};
export const FEWSHOT_BASE64 =
  "${buf.toString("base64")}";
`;
  const file = path.resolve(__dirname, "../../server/_core/card-fewshot.ts");
  writeFileSync(file, out);
  console.log("wrote", file, Math.round(buf.length / 1024), "KB");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
