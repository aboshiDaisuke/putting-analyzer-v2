# Fable 5 改修バージョン

このフォルダは **Claude Fable 5** による改修バージョンです（2026-06-10作成）。
元リポジトリ: `/Volumes/Workspace/Div/putting-analyzer_2_Claude`（ブランチ `fable5/gemini3-ui-refresh` のクローン）

## このバージョンでの変更内容

### OCR・サーバー
- OCRモデルを `gemini-2.5-flash`（2026/10/16廃止予定）→ **`gemini-3.1-flash-lite`** に移行
  - `.env` の `GEMINI_MODEL` で切替可能（高精度版: `gemini-3.5-flash`）
  - Gemini 3系は `thinkingLevel`、2.5系は `thinkingBudget` を自動振り分け（server/_core/llm.ts）
- `ocr.analyzeScorecard` を認証必須化（未認証のGemini APIコスト消費を防止）
- 未使用の `ocr.uploadImage` / `ocr.analyzeBatch` を削除
- 距離別統計から距離未記入（distanceMeters=0）のパットを除外
- OCRレビュー画面: Hole未設定カードのスキップを保存前に確認表示
- scoreResult の採用ロジックをコメント通り「最初に見つかったもの」に修正

### UI（ネイティブらしさ向上）
- `components/ui/confirm-box.tsx` / `error-banner.tsx` 新設 — ハードコード色を排除しダークモード対応
- 全画面の主要カードに影（`lib/card-shadow.ts`: iOS shadow / Android elevation / Web boxShadow）
- ハプティクス（`lib/haptics.ts`）: 保存・削除成功 / 削除確認表示 / セクション開閉
- 分析画面のセクション開閉に LayoutAnimation、空状態にアイコン追加
- RefreshControl をテーマ色に、新規ラウンドのステップ進捗バー強化

### 開発環境
- metro.config.js: 外付けボリュームのAppleDoubleファイル（._*）を除外（バンドルエラー対策）
- vitest: 同様に ._* を除外

## 起動方法

```bash
npm install   # または pnpm install
npm run dev   # APIサーバー(3000) + Metro(8081)
```

ブラウザ確認: http://localhost:8081 を開く。`.env` の `EXPO_PUBLIC_API_BASE_URL=http://localhost:3000` が必要（設定済み。空白だとAPI呼び出しがMetroに飛んで404になる）。
スマホ確認: Macと同じWi-Fiで Expo Go からQR読み取り。
スマホ実機の場合は `EXPO_PUBLIC_API_BASE_URL=http://<MacのLAN IP>:3000` に変更してMetroを再起動すること。
