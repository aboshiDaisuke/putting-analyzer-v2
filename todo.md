# Project TODO

---

## ✅ 完了済み（すべて実装・デプロイ済み）

### Phase 0: Manus版で実装済みの機能
- [x] テーマカラーをゴルフグリーンに更新
- [x] タブナビゲーション（ホーム、ラウンド、分析、プロフィール）
- [x] データモデル定義（ユーザー、パター、ラウンド、ホールデータ）
- [x] ホーム画面、プロフィール画面、ラウンド一覧・詳細画面
- [x] マイパター管理機能（登録、編集、削除）
- [x] コース登録機能
- [x] ラウンド新規作成、ホール詳細データ入力
- [x] スコアカード撮影・OCR機能（Gemini 2.5 Flash）
- [x] 分析ダッシュボード（距離別・ライン別・グリーン環境別）

### Phase 1: Manus依存の除去・独立Webアプリ化
- [x] Supabase Auth 導入（`lib/_core/auth.ts`, `lib/supabase.ts`, `hooks/use-auth.ts`）
- [x] Supabase PostgreSQL + Drizzle ORM 設定
- [x] ゴルフ用DBテーブル作成（users, userProfiles, putters, courses, rounds, holes, putts）
- [x] Supabase SQL Editorでマイグレーション実行済み
- [x] tRPC routers実装（`server/golfRouter.ts` - userProfile/putters/courses/rounds/holes）
- [x] DB query functions実装（`server/db.ts` - 21関数）
- [x] AsyncStorage → API移行（`lib/storage.ts` → `lib/api-golf.ts`）
- [x] Supabase Storage / Gemini OCR 動作確認済み

### Phase 2: Vercel デプロイ
- [x] `vercel.json` 作成（buildCommand: `npx expo export --platform web`）
- [x] `metro.config.js` 修正（pnpm symlinks + NativeWind cache blockList）
- [x] Vercel 環境変数設定（.envの値をすべてインポート済み）
- [x] GitHub連携・デプロイ成功 → **https://putting-analyzer-v2.vercel.app** で稼働中
- [x] Supabase Auth Redirect URL設定（`https://putting-analyzer-v2.vercel.app/**`）
- [x] ログイン画面作成（`app/login.tsx` - メール/パスワード + Google OAuth）
- [x] 認証ガード実装（`app/_layout.tsx` - 未ログイン時は /login にリダイレクト）

---

## 🔲 次にやること（優先順）

### 【最優先】ログイン動作確認
- [ ] `https://putting-analyzer-v2.vercel.app` を開いてログイン画面が表示されるか確認
- [ ] **新規登録**でアカウント作成（メール + パスワード）
- [ ] ログイン後にホーム画面が表示されるか確認
- [ ] データ保存（パター登録・ラウンド作成）が動作するか確認
- [ ] OCR機能（スコアカード撮影）が動作するか確認

### Googleログイン設定（任意）
- [ ] Supabase Dashboard → Authentication → Providers → Google を有効化
  - Google Cloud Console で OAuth クライアントID/シークレットを取得して設定

### ログアウト機能の追加
- [ ] プロフィール画面にログアウトボタンを追加
  - `supabase.auth.signOut()` を呼ぶだけ

---

## Phase 3: サービス公開準備（将来）

- [ ] Supabase RLS（Row Level Security）の設定
- [ ] Free / Standard プランの分岐ロジック（月2ラウンド制限）
- [ ] Stripe 決済導入（¥500/月 Standard プラン）
- [ ] OCR機能の有料プラン限定化
- [ ] プライバシーポリシー・利用規約ページ
- [ ] ランディングページの作成

---

## Phase 4: 将来の拡張

- [ ] Premium プラン（¥1,000/月）: AI分析コメント、練習メニュー提案
- [ ] 複数パター比較分析
- [ ] ラウンドデータのCSVエクスポート
- [ ] PWA対応（ホーム画面にインストール）

---

## 環境情報

| 項目 | 値 |
|------|-----|
| 本番URL | https://putting-analyzer-v2.vercel.app |
| GitHubリポジトリ | https://github.com/aboshiDaisuke/putting-analyzer-v2 |
| Supabase Project ID | ijrrzinlhqhinlmzunzn |
| Supabase Dashboard | https://supabase.com/dashboard/project/ijrrzinlhqhinlmzunzn |
| Vercel Dashboard | https://vercel.com/dashboard |
| 作業フォルダ | /Users/daisukeaboshi/Desktop/putting-analyzer_2_Claude |

## .env の設定値（参考）

※ 機密情報は .env ファイルを参照（Gitには含めない）
※ Vercel の Environment Variables にも同じ値が設定済み

## 主要ファイル構成

```
app/
  _layout.tsx         ← 認証ガード（Supabaseセッション監視）
  login.tsx           ← ログイン画面（メール/Google）
  oauth/callback.tsx  ← OAuth コールバック処理
  (tabs)/
    index.tsx         ← ホーム画面
    profile.tsx       ← プロフィール・パター・コース管理
    rounds.tsx        ← ラウンド一覧
    analytics.tsx     ← 分析ダッシュボード

server/
  golfRouter.ts       ← tRPC routers（golf CRUD全域）
  db.ts               ← Drizzle ORMクエリ関数（21個）
  _core/context.ts    ← Supabase JWT検証 → DBユーザー解決

lib/
  api-golf.ts         ← tRPC HTTP クライアント（vanilla）
  storage.ts          ← api-golf.tsへの委譲レイヤー
  supabase.ts         ← Supabaseクライアント

api/
  trpc/[...trpc].ts   ← Vercel Serverless Function（tRPCハンドラ）
```
