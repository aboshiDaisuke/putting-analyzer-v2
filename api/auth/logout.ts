/**
 * Vercel Serverless Function: POST /api/auth/logout
 * セッションクッキーをクリアする
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { COOKIE_NAME } from "../../shared/const.js";

function jsonResponse(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

export default function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "POST") {
    jsonResponse(res, 405, { error: "Method not allowed" });
    return;
  }

  // Clear session cookie
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=; HttpOnly; Path=/; SameSite=None; Secure; Max-Age=0`,
  );
  jsonResponse(res, 200, { success: true });
}
