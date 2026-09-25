import { COOKIE_NAME, ONE_YEAR_MS } from "../../shared/const.js";
import type { Express, Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import { getUserByOpenId, upsertUser } from "../db";
import { getSessionCookieOptions } from "./cookies";
import { ENV } from "./env";

function buildUserResponse(user: any) {
  return {
    id: user?.id ?? null,
    openId: user?.openId ?? null,
    name: user?.name ?? null,
    email: user?.email ?? null,
    loginMethod: user?.loginMethod ?? null,
    lastSignedIn: (user?.lastSignedIn ?? new Date()).toISOString(),
  };
}

function parseCookies(cookieHeader: string): Record<string, string> {
  return Object.fromEntries(
    cookieHeader.split(";").map((c) => {
      const [k, ...v] = c.trim().split("=");
      return [k.trim(), v.join("=")];
    }),
  );
}

async function getSupabaseUser(token: string) {
  if (!ENV.supabaseUrl || !ENV.supabaseServiceRoleKey) return null;
  const supabase = createClient(ENV.supabaseUrl, ENV.supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

export function registerOAuthRoutes(app: Express) {
  // Logout - clear session cookie
  app.post("/api/auth/logout", (req: Request, res: Response) => {
    const cookieOptions = getSessionCookieOptions(req);
    res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    res.json({ success: true });
  });

  // Get current authenticated user
  // Accepts: Authorization: Bearer <supabase_access_token>
  // or cookie: app_session_id=<supabase_access_token>
  app.get("/api/auth/me", async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      const cookieHeader = req.headers.cookie;

      let token: string | null = null;
      if (authHeader?.startsWith("Bearer ")) {
        token = authHeader.slice(7).trim();
      }
      if (!token && cookieHeader) {
        const cookies = parseCookies(cookieHeader);
        token = cookies[COOKIE_NAME] ?? null;
      }

      if (!token) {
        res.status(401).json({ error: "Not authenticated", user: null });
        return;
      }

      const supabaseUser = await getSupabaseUser(token);
      if (!supabaseUser) {
        res.status(401).json({ error: "Invalid token", user: null });
        return;
      }

      // Sync user to our DB
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

      const user = await getUserByOpenId(supabaseUser.id);
      if (!user) {
        res.status(404).json({ error: "User not found", user: null });
        return;
      }

      res.json({ user: buildUserResponse(user) });
    } catch (error) {
      console.error("[Auth] /api/auth/me failed:", error);
      res.status(401).json({ error: "Not authenticated", user: null });
    }
  });

  // Store Supabase access token as session cookie
  // Called by frontend after successful Supabase login to enable cookie-based auth
  app.post("/api/auth/session", async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) {
        res.status(400).json({ error: "Bearer token required" });
        return;
      }
      const token = authHeader.slice(7).trim();

      const supabaseUser = await getSupabaseUser(token);
      if (!supabaseUser) {
        res.status(401).json({ error: "Invalid token" });
        return;
      }

      // Sync user to our DB
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

      const user = await getUserByOpenId(supabaseUser.id);

      // Set cookie for web session
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      res.json({ success: true, user: buildUserResponse(user) });
    } catch (error) {
      console.error("[Auth] /api/auth/session failed:", error);
      res.status(401).json({ error: "Invalid token" });
    }
  });
}
