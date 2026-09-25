import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { createClient } from "@supabase/supabase-js";
import type { User } from "../../drizzle/schema";
import { getUserByOpenId, upsertUser } from "../db";
import { COOKIE_NAME } from "../../shared/const.js";
import { ENV } from "./env";

export type TrpcContext = {
  user: User | null;
};

function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const cookie of cookieHeader.split(";")) {
    const [key, ...value] = cookie.trim().split("=");
    if (key) cookies[key.trim()] = value.join("=").trim();
  }
  return cookies;
}

/** Supabase access token → local DB User。auth API routes と tRPC context で共用 */
export async function resolveUserFromToken(token: string): Promise<User | null> {
  if (!token || !ENV.supabaseUrl || !ENV.supabaseServiceRoleKey) return null;

  const supabase = createClient(ENV.supabaseUrl, ENV.supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const {
    data: { user: supabaseUser },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !supabaseUser) return null;

  await upsertUser({
    openId: supabaseUser.id,
    name:
      supabaseUser.user_metadata?.full_name ??
      supabaseUser.user_metadata?.name ??
      null,
    email: supabaseUser.email ?? null,
    loginMethod: supabaseUser.app_metadata?.provider ?? null,
    lastSignedIn: new Date(),
  });

  return (await getUserByOpenId(supabaseUser.id)) ?? null;
}

/** Express dev server 用 context */
export async function createContext(opts: CreateExpressContextOptions): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    const authHeader = opts.req.headers.authorization;
    const cookieHeader = opts.req.headers.cookie;

    let token: string | null = null;
    if (authHeader?.startsWith("Bearer ")) token = authHeader.slice(7).trim();
    if (!token && cookieHeader) {
      const cookies = parseCookies(cookieHeader);
      token = cookies[COOKIE_NAME] ?? null;
    }

    if (token) user = await resolveUserFromToken(token);
  } catch {
    user = null;
  }

  return { user };
}

/** Vercel fetch adapter 用 context */
export async function createFetchContext(req: Request): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    const authHeader = req.headers.get("authorization");
    const cookieHeader = req.headers.get("cookie");

    let token: string | null = null;
    if (authHeader?.startsWith("Bearer ")) token = authHeader.slice(7).trim();
    if (!token && cookieHeader) {
      const cookies = parseCookies(cookieHeader);
      token = cookies[COOKIE_NAME] ?? null;
    }

    if (token) user = await resolveUserFromToken(token);
  } catch {
    user = null;
  }

  return { user };
}
