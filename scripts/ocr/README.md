# OCR 前処理のための補助スクリプト

どちらも Playwright（Microsoft Edge チャネル）でカードの HTML を描画します。
リポジトリの依存には含めていないので、一時ディレクトリで `npm i playwright` してから
`NODE_PATH=<そのnode_modules> node scripts/ocr/<script>.js` の形で実行してください。

- `measure-layout.js` — `scorecard-v2.html` の全セル座標を四隅■マーク基準の正規化座標で計測し
  `layout.json` を出力する。`lib/ocr-layout.ts` の値はこの出力から生成したもの。
  カードのレイアウトを変更したら再計測して `lib/ocr-layout.ts` を更新すること。
- `gen-fixtures.js` — 手書き風に記入したカードを CSS 3D 変形で「斜めから撮った写真」風に
  スクリーンショットし、`tests/fixtures/scorecard-photo-*.png` と正解 JSON を生成する。
  `lib/__tests__/ocr-image-core.test.ts` がこれを使って四隅検出・台形補正・枠判定を検証する。
