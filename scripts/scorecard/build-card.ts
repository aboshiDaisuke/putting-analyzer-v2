/**
 * 印刷用のパッティングカード v3（A4 1枚・二つ折り）を生成する。
 *
 *   npx tsx scripts/scorecard/build-card.ts
 *
 * 出力: public/scorecard/putting-card-v3.html（アプリの Web 版から /scorecard/putting-card-v3.html で開ける）
 * PDF は scripts/scorecard/render-pdf.js で同じ HTML から作る。
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildCardSvg, type CardFill } from "../../lib/scorecard/card-svg";
import { CARD_H, CARD_W } from "../../lib/scorecard/layout";

const OUT_DIR = path.resolve(__dirname, "../../public/scorecard");

// 記入例（1〜3番ホール）
const EXAMPLE: CardFill = {
  date: "0925",
  course: "富士見CC",
  markStyle: "check",
  rows: [
    // 1番: バーディパット 8m 上り・右曲がり・ショート → 2nd 1.2m 平・直 → 2パット
    { puttFor: 1, p1: { dist: "8", ud: 1, lr: 2, miss: 0 }, p2: { dist: "1.2", ud: 0, lr: 0 }, total: "2" },
    // 2番: パーパット 3m 下り・左 → 1パット
    { puttFor: 2, p1: { dist: "3", ud: 2, lr: 1 }, total: "1" },
    // 3番: バーディパット 15m 平・直・オーバー → 2nd 2.5m 下・左 → 3rd 0.6m → 3パット
    { puttFor: 1, p1: { dist: "15", ud: 0, lr: 0, miss: 1 }, p2: { dist: "2.5", ud: 2, lr: 1 }, p3: { dist: "0.6" }, total: "3" },
  ],
};

const PANEL_X = (210 - CARD_W) / 2;
const TOP = 34;

const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>パッティングカード v3</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Caveat:wght@700&family=Noto+Sans+JP:wght@400;700;900&display=swap" rel="stylesheet">
<style>
  :root { --ink: #111; --muted: #555; --line: #999; --bg: #e7e4dc; --accent: #1a472a; }
  * { box-sizing: border-box; }
  html, body { margin: 0; background: var(--bg); color: var(--ink); font-family: 'Noto Sans JP', 'Hiragino Sans', sans-serif; }
  .toolbar { position: sticky; top: 0; z-index: 2; display: flex; gap: 12px; justify-content: center; align-items: center;
    flex-wrap: wrap; padding: 12px 16px; background: #10271a; color: #fff; font-size: 16px; }
  .toolbar button, .toolbar a { font: inherit; font-weight: 700; border: 0; border-radius: 10px; padding: 10px 16px;
    background: #d4a93c; color: #10271a; text-decoration: none; cursor: pointer; }
  .toolbar .hint { opacity: .85; font-size: 14px; }
  .viewport { overflow-x: auto; padding: 24px 16px 48px; }
  .sheet { position: relative; width: 210mm; height: 297mm; margin: 0 auto; background: #fff; box-shadow: 0 8px 30px rgba(0,0,0,.18); }
  .abs { position: absolute; }
  h1 { margin: 0; font-size: 5.4mm; line-height: 1.35; font-weight: 900; letter-spacing: .02em; }
  .lead { font-size: 3.3mm; line-height: 1.55; color: var(--ink); margin: 1.6mm 0 0; }
  .steps { display: flex; gap: 3mm; margin-top: 1.8mm; }
  .step { flex: 1; border: .3mm solid #222; border-radius: 2mm; padding: 1.2mm 2.2mm; font-size: 2.6mm; line-height: 1.4; }
  .step b { display: block; font-size: 2.9mm; }
  .cut { border: .25mm solid #222; }
  .fold { border-top: .3mm dashed #222; }
  .label { font-size: 2.6mm; color: var(--muted); background: #fff; padding: 0 1.5mm; white-space: nowrap; }
  .crop { position: absolute; background: #000; }
  .notes { font-size: 2.75mm; line-height: 1.55; color: #222; }
  .notes h2 { font-size: 3.3mm; margin: 0 0 1mm; }
  .example-title { font-size: 3.1mm; font-weight: 900; margin: 0 0 1.2mm; }
  .example { width: 175mm; height: 33mm; overflow: hidden; border: .25mm solid #ccc; border-radius: 1.5mm; }
  .example svg { display: block; margin-top: -10.6mm; }
  .rule { white-space: nowrap; font-size: 2.35mm; color: #333; margin: 1.2mm 0 0; line-height: 1.4; }
  @media print {
    html, body { background: #fff; }
    .toolbar { display: none; }
    .viewport { padding: 0; overflow: visible; }
    .sheet { box-shadow: none; margin: 0; }
    @page { size: A4 portrait; margin: 0; }
  }
</style>
</head>
<body>
<div class="toolbar">
  <button onclick="window.print()">印刷する（A4・倍率100%）</button>
  <a href="putting-card-v3.pdf" download>PDF をダウンロード</a>
  <span class="hint">「実際のサイズ」「用紙に合わせない」で印刷してください</span>
</div>
<div class="viewport">
<div class="sheet">
  <div class="abs" style="left:${PANEL_X}mm; top:5.5mm; width:${CARD_W}mm;">
    <h1>パッティングカード v3 <span style="font-weight:700;font-size:3.4mm;color:#555">／ A4 等倍で印刷 → 実線で切る → 点線で山折り</span></h1>
    <div class="steps">
      <div class="step"><b>① 1ホール1行</b>距離は歩測でOK・選択は ✓</div>
      <div class="step"><b>② 数字は枠に1字</b>2nd・3rd は 1.5 と小数1桁</div>
      <div class="step"><b>③ 表と裏を撮影</b>四隅の ■ を入れる（逆さOK）</div>
    </div>
    <p class="rule">規則4.3a：成績を「ラウンド後に使うため記録する」ことは可（ラウンド中の判断に使うのは不可）。${CARD_W}×${CARD_H}mm＝ポケットサイズ（4.25×7インチ）以内。</p>
  </div>

  <!-- 切り取り線（2面ぶんの外形）と折り線 -->
  <div class="abs cut" style="left:${PANEL_X}mm; top:${TOP}mm; width:${CARD_W}mm; height:${CARD_H * 2}mm;"></div>
  <div class="abs fold" style="left:${PANEL_X - 6}mm; top:${TOP + CARD_H}mm; width:${CARD_W + 12}mm;"></div>
  <div class="abs label" style="left:${PANEL_X + CARD_W / 2}mm; top:${TOP + CARD_H - 1.8}mm; transform:translateX(-50%);">山折り</div>
  <div class="abs label" style="left:${PANEL_X - 1}mm; top:${TOP + CARD_H * 2 + 0.6}mm;">✂ 実線で切り取り</div>

  <!-- 表: OUT -->
  <div class="abs" style="left:${PANEL_X}mm; top:${TOP}mm; width:${CARD_W}mm; height:${CARD_H}mm;">
    ${buildCardSvg("out")}
  </div>
  <!-- 裏: IN（折り返したとき正しい向きになるよう 180° 回転） -->
  <div class="abs" style="left:${PANEL_X}mm; top:${TOP + CARD_H}mm; width:${CARD_W}mm; height:${CARD_H}mm; transform:rotate(180deg);">
    ${buildCardSvg("in")}
  </div>

  <div class="abs" style="left:${PANEL_X}mm; top:${TOP + CARD_H * 2 + 4}mm; width:${CARD_W}mm;">
    <p class="example-title">記入例（1番: 8m のバーディパットを1.2m ショート → 2パット ／ 3番: 15m をオーバーして3パット）</p>
    <div class="example">${buildCardSvg("out", { fill: EXAMPLE })}</div>
  </div>
</div>
</div>
</body>
</html>
`;

mkdirSync(OUT_DIR, { recursive: true });
const file = path.join(OUT_DIR, "putting-card-v3.html");
writeFileSync(file, html);
console.log("wrote", file);

// 未記入の各面（OCR のお手本画像・テスト用）
for (const side of ["out", "in"] as const) {
  const svgFile = path.join(OUT_DIR, `card-v3-${side}.svg`);
  writeFileSync(svgFile, buildCardSvg(side, { outline: true }));
  console.log("wrote", svgFile);
}
