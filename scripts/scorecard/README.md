# パッティングカード v3 のスクリプト

Playwright は依存に含めていない。一時ディレクトリで `npm i playwright@1.52.0` し、`NODE_PATH=<その node_modules>` を付けて実行する（Microsoft Edge チャネル）。

| スクリプト | 役割 |
|---|---|
| `build-card.ts` | `lib/scorecard/layout.ts` から印刷用 HTML と各面の SVG を `public/scorecard/` に生成（`npx tsx`） |
| `render-pdf.js` | HTML → A4 PDF。日本語フォントは静的 TTF に差し替えて埋め込む |
| `gen-fixtures.ts` | 手書き風に記入したカードを斜め・回転・照明ムラ付きで撮った「合成写真」と正解 JSON を `tests/fixtures/` に生成 |
| `build-fewshot.ts` | OCR のお手本（記入済みカード画像＋正解）を `server/_core/card-fewshot.ts` に埋め込む |
| `eval-ocr.ts` | 実際の Gemini で合成写真を読み、フィールドごとの正解率と「要確認に出ない誤読」を表示（課金あり） |

レイアウトを変えたら上から順に全部やり直し、`npx vitest run` と `eval-ocr.ts` で確認する。
