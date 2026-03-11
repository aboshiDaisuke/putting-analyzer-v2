# パッティング分析アプリ 作業メモ (2026-03-11)

## アプリ概要
- React Native Web + Expo Router + Supabase Auth + tRPC + Drizzle ORM + PostgreSQL
- Vercelデプロイ: putting-analyzer-v2.vercel.app
- GitHub: aboshiDaisuke/putting-analyzer-v2

## 完了した作業

### 1. データリセット機能の追加 ✅
- **個別ラウンドリセット**: `app/round/[id].tsx` のホール別データカードに「リセット」ボタン（橙色）追加。ホール・パットデータのみ削除、ラウンド情報は保持。
- **全ラウンド削除**: `app/(tabs)/profile.tsx` にログアウトボタンの上に「全ラウンドデータを削除」ボタン追加。確認ダイアログ付き。
- バックエンド: `server/db.ts` に `deleteHolesByRound()` / `deleteAllRounds()` 追加。`server/golfRouter.ts` に `rounds.resetHoles` / `rounds.deleteAll` mutation追加。
- API: `lib/api-golf.ts` に `resetRoundHoles()` / `deleteAllRounds()` 追加。`lib/storage.ts` に再エクスポート追加。

### 2. OCRスキャンフローの変更 ✅ (A案を採用)
- **旧フロー**: トップ画面「カード撮影」→ スキャン → 新規ラウンド自動作成
- **新フロー**: 新規ラウンド作成（日付・コース等を手入力）→ ホール入力画面の「スキャンでホールデータを取り込む」バー → 撮影 → OCRレビュー → 既存ラウンドにデータ保存
- `app/(tabs)/index.tsx`: 「カード撮影」ボタン削除、「新規ラウンド」のみに
- `app/hole-input/[id].tsx`: ホールナビゲーター下にスキャンバー追加（カメラアイコン + テキスト）
- `app/scan-card.tsx`: `roundId` パラメータを受け取り、ocr-reviewに転送
- `app/ocr-review.tsx`: `roundId` がある場合は `saveHolesForRound` + `updateRound` で既存ラウンドに保存

### 3. ホールナビゲーターの表示修正 ✅
- `app/hole-input/[id].tsx` のホールナビゲーター（1H〜18H）がWeb上で上部がクリップされて見にくい問題を修正
- **根本原因**: `contentContainerStyle` の `alignItems: "center"` が React Native Web で ScrollView の高さを正確に把握できずに上部クリップが発生していた。また `alignSelf: "stretch"` も競合していた。
- **修正内容**:
  - `contentContainerStyle` から `alignItems: "center"` を削除
  - 各 `TouchableOpacity` に `height: 48` を明示的に設定（ScrollViewと同じ高さ）
  - `alignSelf: "stretch"` を削除し、代わりに `justifyContent: "center"` + `alignItems: "center"` で縦横中央配置

## 前セッションからの主要な修正（参考）
- tRPC batch query input format: `{"0":{"json":{...}}}` 形式に修正済み
- superjson エラーパース: `data[0].error.json.message` に修正済み
- N+1クエリ: `getPuttsByHoles` バッチクエリで最適化済み
- Alert.alert: `round/[id].tsx` でインラインUI確認に置換済み
- hole-input: エラー詳細表示 + 再試行ボタン追加済み
- Supabase Storage: `scorecards` バケット作成済み
- OCR機能: Gemini 2.5 Flash統合済み（scan-card.tsx, ocr-review.tsx, server/routers.ts）

## DB構造（CASCADE関係）
- `holes.roundId` → `rounds.id` (onDelete: cascade)
- `putts.holeId` → `holes.id` (onDelete: cascade)
- ラウンド削除でホール・パットも自動削除

### 4. OCR画像自動削除の実装 ✅
- **問題**: OCR解析後も画像がSupabase Storageに残り続けてストレージが増大する
- **修正内容**:
  - `server/storage.ts`: `storageDelete(relKey)` 関数を追加（エラーはログのみ、例外は投げない）
  - `server/routers.ts`:
    - `uploadImage` mutation: `imageKey` も返すように変更（`{ imageUrl, imageKey }`）
    - `analyzeScorecard` mutation: `imageKey` をオプションで受け取り、`finally` ブロックで解析完了後（成功・失敗問わず）に削除
    - `analyzeBatch` mutation: `images: [{ url, key? }]` 形式に変更し、各画像を解析後に削除
  - `app/scan-card.tsx`: `analyzeMutation.mutateAsync` に `imageKey: uploadResult.imageKey` を追加

### 5. OCRフィールド修正 ✅
- **日付形式**: MM/DD → YYYYMMDD（カードの8桁ボックスに合わせた）
- **Length単位**: yd → m（メートル直入力）
- **Dist(prev)桁数**: 2桁 → 3桁まで
- **lengthYards→lengthMeters**: OcrPuttData、OCRレビュー画面、テスト、変換レイヤーで変更

## 次回やるべきこと
1. ~~ホールナビゲーターのクリップ問題を確認・修正~~ ✅ 修正済み
2. ~~OCR画像の自動削除~~ ✅ 実装済み
3. OCRスキャン→レビュー→保存の一連フローの動作確認
4. hole-inputが正常に動作するか確認（前セッションでtRPCクエリ形式を修正済み）
5. データリセット機能（個別・全削除）の動作確認
6. DBカラム名のリネーム: `lengthYards` → `lengthMeters`（drizzle schema・migration・golfRouter・api-golf.ts）
7. Vercelサーバーレス移行（Railway ¥750/月削減）
