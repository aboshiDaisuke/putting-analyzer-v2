// scorecard-v2.html をヘッドレスブラウザで描画し、四隅マーク中心を基準にした
// 正規化座標（TL=(0,0), BR=(1,1)）で全セルの矩形を計測して JSON を出力する。
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

const HTML = path.resolve(process.argv[2] || path.resolve(__dirname, "../../scorecard-v2.html"));
const OUT = process.argv[3] || path.resolve(__dirname, "layout.json");

(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage({ viewport: { width: 1200, height: 1600 }, deviceScaleFactor: 2 });
  await page.goto("file://" + HTML, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500); // Tailwind CDN JIT
  const layout = await page.evaluate(() => {
    const card = document.getElementById("scorecard");
    const cardRect = card.getBoundingClientRect();
    const markers = Array.from(card.querySelectorAll(":scope > div.bg-black.absolute")).map((m) => {
      const r = m.getBoundingClientRect();
      return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width, h: r.height };
    });
    // TL, TR, BL, BR
    const byPos = (a, b) => a.cy - b.cy || a.cx - b.cx;
    markers.sort(byPos);
    const [tl, tr, bl, br] = [markers[0], markers[1], markers[2], markers[3]];
    const ox = tl.cx, oy = tl.cy, sx = tr.cx - tl.cx, sy = bl.cy - tl.cy;
    const norm = (el) => {
      const r = el.getBoundingClientRect();
      return {
        x: (r.left - ox) / sx, y: (r.top - oy) / sy,
        w: r.width / sx, h: r.height / sy,
      };
    };
    const sections = Array.from(card.querySelectorAll(":scope > div.border.border-black")).map((sec) => {
      const boxes = Array.from(sec.querySelectorAll(".box, .box-right")).map(norm);
      return {
        cupIn: norm(sec.querySelector(".box-check")),
        result: boxes.slice(0, 5),
        length: boxes.slice(5, 7),
        lineUD: boxes.slice(7, 10),
        lineLR: boxes.slice(10, 13),
      };
    });
    const header = card.querySelector(":scope > div.flex.justify-between");
    const smBoxes = Array.from(header.querySelectorAll(".box-sm, .box-sm-right")).map(norm);
    return {
      markerRectAspect: sy / sx, // height / width of marker-center rectangle
      markerSizeNorm: tl.w / sx,
      cardBounds: {
        x: (cardRect.left - ox) / sx, y: (cardRect.top - oy) / sy,
        w: cardRect.width / sx, h: cardRect.height / sy,
      },
      header: { hole: smBoxes.slice(0, 2), date: smBoxes.slice(2, 10), course: norm(header.querySelector(".border-b.border-black")) },
      sections,
    };
  });
  fs.writeFileSync(OUT, JSON.stringify(layout, null, 2));
  console.log("markerRectAspect", layout.markerRectAspect, "markerSizeNorm", layout.markerSizeNorm, "sections", layout.sections.length);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
