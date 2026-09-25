/**
 * OCR テスト用の「合成写真」を作る。
 * カード v3 の SVG に手書き風の記入を重ね、CSS 3D 変形・回転・照明ムラを付けてスクリーンショットする。
 *
 *   (scratchpad で npm i playwright@1.52.0)
 *   NODE_PATH=<scratchpad>/node_modules npx tsx scripts/scorecard/gen-fixtures.ts [出力先]
 *
 * 出力: tests/fixtures/card-v3-*.png と正解 *.json（lib/__tests__/scorecard-process.test.ts が使う）
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildCardSvg, type CardFill } from "../../lib/scorecard/card-svg";
import type { CardSide } from "../../lib/scorecard/layout";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { chromium } = require("playwright");

const OUT_DIR = process.argv[2] || path.resolve(__dirname, "../../tests/fixtures");

type Case = {
  name: string;
  side: CardSide;
  fill: CardFill;
  transform: string;
  viewport: { width: number; height: number };
  /** 照明ムラ（片側が暗い） */
  shade?: boolean;
  /** カードにかける CSS filter（ブレ・暗さ） */
  filter?: string;
  /** カードに重ねる CSS background（テカリ等） */
  overlay?: string;
};

const OUT_FILL: CardFill = {
  date: "0925",
  course: "Fable GC",
  ink: "pen",
  markStyle: "check",
  markStyles: { "1.puttFor": "fill", "3.p1.ud": "cross", "6.p2.lr": "fill" },
  rows: [
    { puttFor: 1, p1: { dist: "8", ud: 1, lr: 2, miss: 0 }, p2: { dist: "1.2", ud: 0, lr: 0 }, total: "2" },
    { puttFor: 2, p1: { dist: "3", ud: 2, lr: 1 }, total: "1" },
    { puttFor: 1, p1: { dist: "15", ud: 0, lr: 0, miss: 1 }, p2: { dist: "2.5", ud: 2, lr: 1 }, p3: { dist: "0.6" }, total: "3" },
    { puttFor: 2, p1: { dist: "6", ud: 2, lr: 2, miss: 1 }, p2: { dist: "0.9", ud: 1, lr: 0 }, total: "2" },
    { puttFor: 3, p1: { dist: "2", ud: 1, lr: 0 }, total: "1" },
    null,
    { puttFor: 1, p1: { dist: "11", ud: 0, lr: 1, miss: 0 }, p2: { dist: "1.8", ud: 1, lr: 2 }, total: "2" },
    { puttFor: 4, p1: { dist: "4", ud: 1, lr: 2, miss: 0 }, p2: { dist: "0.4" }, total: "2" },
    { puttFor: 2, p1: { dist: "22", ud: 2, lr: 0, miss: 1 }, p2: { dist: "3.1", ud: 0, lr: 2 }, p3: { dist: "1.0" }, total: "3" },
  ],
};

const IN_FILL: CardFill = {
  ink: "pencil",
  markStyle: "check",
  markStyles: { "0.puttFor": "slash", "2.p1.lr": "cross", "4.p1.ud": "fill", "5.puttFor": "circle" },
  rows: [
    { puttFor: 1, p1: { dist: "9", ud: 1, lr: 1, miss: 0 }, p2: { dist: "1.5", ud: 1, lr: 0 }, total: "2" },
    { puttFor: 2, p1: { dist: "5", ud: 0, lr: 2, miss: 1 }, p2: { dist: "0.7", ud: 2, lr: 0 }, total: "2" },
    { puttFor: 1, p1: { dist: "13", ud: 2, lr: 2, miss: 1 }, p2: { dist: "1.1", ud: 0, lr: 1 }, total: "2" },
    { puttFor: 2, p1: { dist: "1", ud: 1, lr: 0 }, total: "1" },
    { puttFor: 3, p1: { dist: "7", ud: 2, lr: 1, miss: 0 }, p2: { dist: "2.0", ud: 1, lr: 2 }, p3: { dist: "0.5" }, total: "3" },
    { puttFor: 2, p1: { dist: "18", ud: 1, lr: 0, miss: 0 }, p2: { dist: "1.4", ud: 0, lr: 0 }, total: "2" },
    null,
    null,
    { puttFor: 1, p1: { dist: "10", ud: 0, lr: 2, miss: 1 }, p2: { dist: "0.8", ud: 2, lr: 1 }, total: "2" },
  ],
};

const CASES: Case[] = [
  {
    name: "card-v3-out-pen",
    side: "out",
    fill: OUT_FILL,
    transform: "perspective(1600px) rotateX(10deg) rotateY(-8deg) rotateZ(3deg) scale(0.9)",
    viewport: { width: 1500, height: 1100 },
  },
  {
    name: "card-v3-in-pencil-180",
    side: "in",
    fill: IN_FILL,
    transform: "perspective(1500px) rotateX(-7deg) rotateY(9deg) rotateZ(178deg) scale(0.93)",
    viewport: { width: 1500, height: 1100 },
    shade: true,
  },
  {
    name: "card-v3-out-rot90",
    side: "out",
    fill: { ...OUT_FILL, ink: "pen", markStyles: { "2.puttFor": "circle", "4.p1.lr": "fill" } },
    transform: "perspective(1700px) rotateX(6deg) rotateY(5deg) rotateZ(-88deg) scale(0.78)",
    viewport: { width: 1100, height: 1500 },
    shade: true,
  },
];

// 悪条件の写真（精度の実力を測るため。単体テストでは使わず eval-ocr で測る）
const STRESS_CASES: Case[] = [
  { name: "stress-messy-pen", side: "out", fill: { ...OUT_FILL, messy: 7 }, transform: "perspective(1500px) rotateX(12deg) rotateY(-9deg) rotateZ(4deg) scale(0.9)", viewport: { width: 1500, height: 1100 } },
  { name: "stress-messy-pencil", side: "in", fill: { ...IN_FILL, messy: 11 }, transform: "perspective(1500px) rotateX(-8deg) rotateY(10deg) rotateZ(-3deg) scale(0.9)", viewport: { width: 1500, height: 1100 }, shade: true },
  { name: "stress-far", side: "out", fill: { ...OUT_FILL, messy: 3 }, transform: "perspective(1500px) rotateX(8deg) rotateZ(-5deg) scale(0.42)", viewport: { width: 1500, height: 1100 } },
  { name: "stress-blur", side: "in", fill: { ...IN_FILL, messy: 5 }, transform: "perspective(1500px) rotateX(6deg) rotateY(6deg) scale(0.85)", viewport: { width: 1500, height: 1100 }, filter: "blur(1.6px)" },
  { name: "stress-glare-dark", side: "out", fill: { ...OUT_FILL, messy: 9, ink: "pencil" }, transform: "perspective(1500px) rotateX(9deg) rotateY(-6deg) rotateZ(2deg) scale(0.88)", viewport: { width: 1500, height: 1100 }, filter: "brightness(0.62) contrast(0.85)", overlay: "radial-gradient(circle at 70% 35%, rgba(255,255,255,.85) 0, rgba(255,255,255,.35) 18%, rgba(255,255,255,0) 38%)" },
  { name: "stress-steep", side: "in", fill: { ...IN_FILL, messy: 13, ink: "pen" }, transform: "perspective(1100px) rotateX(38deg) rotateY(-18deg) rotateZ(6deg) scale(0.95)", viewport: { width: 1500, height: 1100 } },
];

async function main() {
  const set = process.env.SET === "stress" ? STRESS_CASES : CASES;
  const outDir = process.env.SET === "stress" ? path.join(OUT_DIR, "stress") : OUT_DIR;
  mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const only = process.env.ONLY;
  for (const c of set.filter((x) => !only || x.name === only)) {
    const page = await browser.newPage({ viewport: c.viewport, deviceScaleFactor: 1 });
    const svg = buildCardSvg(c.side, { fill: c.fill, width: "1240px", height: `${(1240 * 105) / 175}px` });
    await page.setContent(`<!DOCTYPE html><html><head>
      <link href="https://fonts.googleapis.com/css2?family=Caveat:wght@700&family=Kalam:wght@700&family=Patrick+Hand&family=Reenie+Beanie&family=Nanum+Pen+Script&family=Noto+Sans+JP:wght@400;700;900&display=swap" rel="stylesheet">
      <style>
        html,body{margin:0;height:100%;background:radial-gradient(circle at 30% 20%,#9b8b77,#6f6150);display:flex;align-items:center;justify-content:center;overflow:hidden}
        .card{transform:${c.transform};transform-origin:center;box-shadow:0 10px 26px rgba(0,0,0,.45);position:relative;line-height:0;${c.filter ? `filter:${c.filter};` : ""}}
        .glare{position:absolute;inset:0;background:${c.overlay ?? "none"};pointer-events:none}
        .shade{position:absolute;inset:0;background:linear-gradient(100deg,rgba(0,0,0,0) 35%,rgba(40,30,20,.28) 100%);pointer-events:none}
      </style></head><body><div class="card">${svg}${c.shade ? '<div class="shade"></div>' : ""}${c.overlay ? '<div class="glare"></div>' : ""}</div></body></html>`);
    await page.evaluate(() => (document as unknown as { fonts: { ready: Promise<unknown> } }).fonts.ready);
    await page.waitForTimeout(400);
    const png = path.join(outDir, `${c.name}.png`);
    await page.screenshot({ path: png, type: "png" });
    writeFileSync(path.join(outDir, `${c.name}.json`), JSON.stringify({ side: c.side, fill: c.fill }, null, 2));
    console.log("wrote", png);
    await page.close();
  }
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
