import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * GET /api/health
 * 認証なしの公開エンドポイント。Supabase（無料プラン）の自動停止を防ぐため、
 * Vercel の日次 cron（vercel.json）と GitHub Actions（.github/workflows/keepalive.yml）が叩く。
 * Supabase は「ユーザーのデータベース利用」が1週間ないと停止するので、SELECT 1 だけでなく実テーブルも読む。
 * 接続情報（ホスト名・ユーザー名など）や件数は一切返さない。
 */
export default async function handler(_req: IncomingMessage, res: ServerResponse) {
  let db: "connected" | "failed" = "failed";

  try {
    const { default: postgres } = await import("postgres");
    const sql = postgres(process.env.DATABASE_URL ?? "", { connect_timeout: 8, max: 1 });
    try {
      const r = await sql`SELECT 1 as ok`;
      await sql`SELECT id FROM rounds LIMIT 1`;
      if (r[0]?.ok === 1) db = "connected";
    } finally {
      await sql.end({ timeout: 2 });
    }
  } catch (e: unknown) {
    console.error("[health] DB check failed:", e instanceof Error ? e.message : e);
  }

  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.statusCode = db === "connected" ? 200 : 503;
  res.end(JSON.stringify({ ok: db === "connected", db, timestamp: Date.now() }));
}
