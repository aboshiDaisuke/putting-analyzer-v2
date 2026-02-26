# Project TODO

## Phase 0: 完了済み（Manus版で実装済み）

- [x] テーマカラーをゴルフグリーンに更新
- [x] タブナビゲーション設定（ホーム、ラウンド、分析、プロフィール）
- [x] データモデル定義（ユーザー、パター、ラウンド、ホールデータ）
- [x] AsyncStorageによるローカルデータ永続化
- [x] ホーム画面（ダッシュボード、クイックスタッツ、最近のラウンド）
- [x] プロフィール画面（ユーザー情報、歩幅設定）
- [x] マイパター管理機能（登録、編集、削除）
- [x] コース登録機能
- [x] ラウンド新規作成画面（環境情報入力）
- [x] スコアカード撮影・OCR機能（プレースホルダー）
- [x] ホール詳細データ入力画面（18ホール分）
- [x] ラウンド一覧画面
- [x] ラウンド詳細画面
- [x] 分析ダッシュボード（統計グラフ）
- [x] 距離別成功率分析
- [x] ライン別成功率分析
- [x] グリーン環境別パフォーマンス分析
- [x] アプリアイコン生成
- [x] バグ修正: パター登録ができない問題
- [x] パター登録機能の改善（UI/UX向上）
- [x] スコアカードOCR自動読み取り機能の実装
- [x] サーバー側LLM画像解析APIの実装
- [x] スコアカード撮影画面の改修（カメラ/ギャラリー対応）
- [x] OCR読み取り結果の確認・編集画面の実装
- [x] 読み取りデータをラウンドデータに反映する機能
- [x] データモデル更新: カードの全項目に対応
- [x] OCRプロンプト更新: 新カードフォーマットの塗りつぶし判定に対応
- [x] OCRユーティリティ更新: 新データ構造への変換ロジック
- [x] ホール入力画面更新: カードと同じ項目・選択肢に揃える
- [x] OCR結果確認画面更新: 新項目の表示・編集に対応
- [x] 分析ロジック更新: 新項目を使った分析機能

---

## Phase 1: Manus依存の除去・独立Webアプリ化

### 1-1. 認証の置き換え
- [ ] Manus OAuth を削除（`server/_core/oauth.ts`, `server/_core/sdk.ts`, `constants/oauth.ts`）
- [ ] Supabase Auth を導入（メール/Google/Appleログイン）
- [ ] `hooks/use-auth.ts` を Supabase Auth に書き換え
- [ ] `lib/_core/auth.ts` を Supabase セッション管理に書き換え
- [ ] バンドルID `space.manus.*` を独自IDに変更

### 1-2. Manusランタイムの除去
- [ ] `lib/_core/manus-runtime.ts` を削除
- [ ] `server/_core/sdk.ts` を削除
- [ ] `server/_core/types/manusTypes.ts` を削除
- [ ] `app/_layout.tsx` から Manus Runtime 初期化を削除

### 1-3. データベースの移行
- [ ] MySQL/TiDB → Supabase PostgreSQL に切り替え
- [ ] Drizzle ORM の設定を PostgreSQL 用に変更（`drizzle.config.ts`）
- [ ] `drizzle/schema.ts` を PostgreSQL 構文に更新
- [ ] ラウンド・ホール・パター・コース用のテーブルスキーマ追加
- [ ] マイグレーション作成・実行

### 1-4. ストレージの移行
- [ ] Manus S3 proxy → Supabase Storage に切り替え
- [ ] `server/storage.ts` を Supabase Storage API に書き換え
- [ ] スコアカード画像のアップロード/取得を動作確認

### 1-5. OCR/AIの移行
- [ ] Manus SDK 経由のClaude → Google AI Studio Gemini 2.5 Flash に切り替え
- [ ] `server/_core/llm.ts` を Gemini API 直接呼び出しに書き換え
- [ ] OCRプロンプトの動作確認（Geminiでスコアカード画像解析）
- [ ] `server/_core/imageGeneration.ts` → 不要なら削除
- [ ] `server/_core/voiceTranscription.ts` → 不要なら削除

---

## Phase 2: Vercel デプロイ対応

- [ ] Expo Web ビルド設定の確認・修正
- [ ] tRPC API を Vercel Serverless Functions に対応させる
- [ ] 環境変数の設定（Supabase URL/Key、Gemini API Key 等）
- [ ] `vercel.json` の作成（ルーティング設定）
- [ ] Vercel にデプロイして動作確認
- [ ] カスタムドメイン設定（任意）

---

## Phase 3: サービス公開準備

- [ ] Supabase RLS（Row Level Security）の設定
- [ ] ユーザーごとのデータアクセス制御
- [ ] Free / Standard プランの分岐ロジック実装
- [ ] 月2ラウンド制限（Freeプラン）
- [ ] OCR機能の有料プラン限定化
- [ ] Stripe 決済導入（¥500/月 Standard プラン）
- [ ] プライバシーポリシー・利用規約ページ
- [ ] ランディングページの作成

---

## Phase 4: 将来の拡張

- [ ] Premium プラン（¥1,000/月）: AI分析コメント、練習メニュー提案
- [ ] 複数パター比較分析
- [ ] ラウンドデータのCSVエクスポート
- [ ] PWA対応（ホーム画面にインストール）
- [ ] プッシュ通知（ラウンドリマインダー等）
- [ ] ソーシャル機能（フレンドとスタッツ比較）
