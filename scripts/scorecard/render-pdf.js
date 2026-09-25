/* global Buffer, __dirname */
// 印刷用カードの HTML から A4 の PDF を作る。
//   npx tsx scripts/scorecard/build-card.ts
//   NODE_PATH=<playwright を入れた node_modules> node scripts/scorecard/render-pdf.js
//
// Google Fonts の Noto Sans JP は可変フォントで、そのまま PDF にすると Type3（アウトライン）になる。
// 日本語フォントを通常の埋め込みフォントとして入れるため、ウェイトごとの静的 TTF を取得して差し替えてから印刷する。
const { chromium } = require("playwright");
const fs = require("fs");
const os = require("os");
const path = require("path");

const CSS_URL = "https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700;900&family=Caveat:wght@700";

async function staticFontFaces() {
  // UA を付けないと TrueType の静的フォントを返す
  const css = await (await fetch(CSS_URL, { headers: { "User-Agent": "curl/8" } })).text();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "card-fonts-"));
  const faces = [];
  const re = /font-family: '([^']+)';\s*font-style: normal;\s*font-weight: (\d+);\s*src: url\(([^)]+)\)/g;
  let m;
  while ((m = re.exec(css))) {
    const [, family, weight, url] = m;
    const file = path.join(dir, `${family.replace(/\s/g, "")}-${weight}.ttf`);
    fs.writeFileSync(file, Buffer.from(await (await fetch(url)).arrayBuffer()));
    faces.push(`@font-face{font-family:'${family}';font-weight:${weight};src:url('file://${file}') format('truetype');}`);
  }
  if (faces.length < 4) throw new Error("静的フォントを取得できませんでした");
  return faces.join("\n");
}

(async () => {
  const html = path.resolve(__dirname, "../../public/scorecard/putting-card-v3.html");
  const out = path.resolve(__dirname, "../../public/scorecard/putting-card-v3.pdf");
  const faces = await staticFontFaces();
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage();
  await page.route("https://fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: faces }));
  await page.goto("file://" + html, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.emulateMedia({ media: "print" });
  await page.pdf({ path: out, format: "A4", printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 }, preferCSSPageSize: true });
  await browser.close();
  console.log("wrote", out);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
