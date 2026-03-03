/**
 * Vercel Serverless Function: tRPC catch-all handler
 * Routes: /api/trpc/*
 *
 * Node.js IncomingMessage を Web API Request に変換して fetchRequestHandler に渡す。
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "../../server/routers";
import { createFetchContext } from "../../server/_core/context";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  // Build URL from Node.js request
  const proto =
    (Array.isArray(req.headers["x-forwarded-proto"])
      ? req.headers["x-forwarded-proto"][0]
      : req.headers["x-forwarded-proto"]) ?? "https";
  const host = req.headers.host ?? "localhost";
  const url = `${proto}://${host}${req.url ?? "/"}`;

  // Convert Node.js headers to Web API Headers
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value == null) continue;
    headers.append(key, Array.isArray(value) ? value.join(", ") : value);
  }

  // Read body for POST/PUT/PATCH
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  let bodyBuffer: Buffer | undefined;
  if (hasBody) {
    bodyBuffer = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      req.on("end", () => resolve(Buffer.concat(chunks)));
      req.on("error", reject);
    });
  }

  const webReq = new Request(url, {
    method: req.method ?? "GET",
    headers,
    // Buffer extends Uint8Array; cast to satisfy BodyInit type
    body: bodyBuffer && bodyBuffer.length > 0 ? new Uint8Array(bodyBuffer) : undefined,
  });

  // Handle via tRPC fetch adapter
  const webRes = await fetchRequestHandler({
    endpoint: "/api/trpc",
    req: webReq,
    router: appRouter,
    createContext: () => createFetchContext(webReq),
    onError({ error }) {
      if (error.code === "INTERNAL_SERVER_ERROR") {
        console.error("[tRPC]", error);
      }
    },
  });

  // Write response back to Node.js ServerResponse
  res.statusCode = webRes.status;
  webRes.headers.forEach((value, key) => res.setHeader(key, value));
  const responseBuffer = Buffer.from(await webRes.arrayBuffer());
  res.end(responseBuffer);
}
