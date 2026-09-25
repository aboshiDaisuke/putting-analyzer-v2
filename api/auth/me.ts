/**
 * Vercel Serverless Function: GET /api/auth/me
 * 現在ログイン中のユーザー情報を返す
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { resolveUserFromToken } from "../../server/_core/context";
import { COOKIE_NAME } from "../../shared/const.js";

function parseCookies(header: string): Record<string, string> {
  return Object.fromEntries(
    header.split(";").map((c) => {
      const [k, ...v] = c.trim().split("=");
      return [k.trim(), v.join("=")];
    }),
  );
}

function jsonResponse(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "GET") {
    jsonResponse(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const authHeader = req.headers.authorization;
    const cookieHeader = req.headers.cookie;

    let token: string | null = null;
    if (authHeader?.startsWith("Bearer ")) token = authHeader.slice(7).trim();
    if (!token && cookieHeader) {
      token = parseCookies(cookieHeader)[COOKIE_NAME] ?? null;
    }

    if (!token) {
      jsonResponse(res, 401, { error: "Not authenticated", user: null });
      return;
    }

    const user = await resolveUserFromToken(token);
    if (!user) {
      jsonResponse(res, 401, { error: "Invalid token", user: null });
      return;
    }

    jsonResponse(res, 200, { user });
  } catch (err) {
    console.error("[Auth] /api/auth/me failed:", err);
    jsonResponse(res, 401, { error: "Not authenticated", user: null });
  }
}
