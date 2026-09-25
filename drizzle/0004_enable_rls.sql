-- Row Level Security を有効化し、anon / authenticated ロールの直接アクセスを遮断する。
--
-- 背景:
--   anon key は Web バンドルに含まれるため、RLS が無効だと Supabase の REST API
--   (PostgREST) 経由で誰でも全ユーザーのデータを読み書きできてしまう。
--   このアプリはクライアントから PostgREST を使わず、サーバー（tRPC + Drizzle）が
--   DATABASE_URL のロール（テーブル所有者）で接続し、userId でスコープしている。
--
-- 方針:
--   1. 7テーブルで RLS を有効化する（FORCE はしない）。
--      テーブル所有者は FORCE ROW LEVEL SECURITY を指定しない限り RLS を素通りするため、
--      サーバーの Drizzle 経由アクセスはポリシー無しでも従来通り動作する。
--   2. 念のため anon / authenticated への権限も取り消す（ポリシーを追加しない限り
--      PostgREST からは何も見えない）。将来クライアントから直接読ませたくなったら、
--      GRANT と `auth.uid()` ベースのポリシーをここに追加すること。
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "userProfiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "putters" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "courses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "rounds" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "holes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "putts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON TABLE "users", "userProfiles", "putters", "courses", "rounds", "holes", "putts" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
