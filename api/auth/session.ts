/**
 * Vercel Serverless Function: POST /api/auth/session
 * Supabase access token を検証し、セッションクッキーをセットする
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { resolveUserFromToken } from "../../server/_core/context";
import { COOKIE_NAME, ONE_YEAR_MS } from "../../shared/const.js";

function jsonResponse(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "POST") {
    jsonResponse(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      jsonResponse(res, 400, { error: "Bearer token required" });
      return;
    }
    const token = authHeader.slice(7).trim();

    const user = await resolveUserFromToken(token);
    if (!user) {
      jsonResponse(res, 401, { error: "Invalid token" });
      return;
    }

    const maxAgeSeconds = Math.floor(ONE_YEAR_MS / 1000);
    res.setHeader(
      "Set-Cookie",
      `${COOKIE_NAME}=${token}; HttpOnly; Path=/; SameSite=None; Secure; Max-Age=${maxAgeSeconds}`,
    );
    jsonResponse(res, 200, { success: true, user });
  } catch (err) {
    console.error("[Auth] /api/auth/session failed:", err);
    jsonResponse(res, 401, { error: "Invalid token" });
  }
}
