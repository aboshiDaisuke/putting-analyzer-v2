import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { createClient } from "@supabase/supabase-js";
import type { User } from "../../drizzle/schema";
import { getUserByOpenId, upsertUser } from "../db";
import { COOKIE_NAME } from "../../shared/const.js";
import { ENV } from "./env";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
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

export async function createContext(opts: CreateExpressContextOptions): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    const authHeader = opts.req.headers.authorization;
    const cookieHeader = opts.req.headers.cookie;

    let token: string | null = null;

    // Extract token from Authorization header (Bearer token)
    if (authHeader?.startsWith("Bearer ")) {
      token = authHeader.slice(7).trim();
    }

    // Fallback: check session cookie
    if (!token && cookieHeader) {
      const cookies = parseCookies(cookieHeader);
      token = cookies[COOKIE_NAME] ?? null;
    }

    if (token && ENV.supabaseUrl && ENV.supabaseServiceRoleKey) {
      const supabase = createClient(ENV.supabaseUrl, ENV.supabaseServiceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      const {
        data: { user: supabaseUser },
        error,
      } = await supabase.auth.getUser(token);

      if (!error && supabaseUser) {
        // Sync user to our DB on each authenticated request
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
        user = (await getUserByOpenId(supabaseUser.id)) ?? null;
      }
    }
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
