import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * GET /api/health
 * 認証なしの公開エンドポイント（Vercel cron が毎日叩いて Supabase の自動停止を防ぐ）。
 * 接続情報（ホスト名・ユーザー名など）は一切返さない。
 */
export default async function handler(_req: IncomingMessage, res: ServerResponse) {
  let db: "connected" | "failed" = "failed";

  try {
    const { default: postgres } = await import("postgres");
    const sql = postgres(process.env.DATABASE_URL ?? "", { connect_timeout: 8, max: 1 });
    const r = await sql`SELECT 1 as ok`;
    if (r[0]?.ok === 1) db = "connected";
    await sql.end();
  } catch (e: unknown) {
    console.error("[health] DB check failed:", e instanceof Error ? e.message : e);
  }

  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.statusCode = db === "connected" ? 200 : 503;
  res.end(JSON.stringify({ ok: db === "connected", db, timestamp: Date.now() }));
}
