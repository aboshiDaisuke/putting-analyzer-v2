import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { decodeJwt } from "jose";
import type { User } from "../../drizzle/schema";
import { getUserByOpenId, upsertUser } from "../db";
import { ENV } from "./env";

export type TrpcContext = {
  user: User | null;
};

// ─── Supabase Auth クライアント（サーバー側・シングルトン） ────────────────────
let _supabase: SupabaseClient | null = null;
function getAuthClient(): SupabaseClient | null {
  if (!ENV.supabaseUrl || !ENV.supabaseServiceRoleKey) return null;
  if (!_supabase) {
    _supabase = createClient(ENV.supabaseUrl, ENV.supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return _supabase;
}

// ─── トークン → ユーザー のインメモリキャッシュ ─────────────────────────────
// 1リクエストごとに Supabase Auth へ問い合わせて users を UPDATE していたのをやめ、
// 同じアクセストークンはウォームなプロセス内で短時間キャッシュする。
// TTL は JWT の exp を上限として最大 CACHE_TTL_MS。
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;
// lastSignedIn / 名前・メールの同期はこの間隔でだけ行う
const USER_SYNC_INTERVAL_MS = 60 * 60 * 1000;

type CacheEntry = { user: User; expiresAt: number };
const userCache = new Map<string, CacheEntry>();

function jwtExpiryMs(token: string): number | null {
  try {
    const { exp } = decodeJwt(token);
    return typeof exp === "number" ? exp * 1000 : null;
  } catch {
    return null;
  }
}

function cacheSet(token: string, user: User) {
  const now = Date.now();
  const exp = jwtExpiryMs(token);
  const expiresAt = Math.min(now + CACHE_TTL_MS, exp ?? Number.POSITIVE_INFINITY);
  if (expiresAt <= now) return;
  if (userCache.size >= CACHE_MAX_ENTRIES) {
    // 古いものから雑に間引く（Map は挿入順）
    const oldest = userCache.keys().next().value;
    if (oldest !== undefined) userCache.delete(oldest);
  }
  userCache.set(token, { user, expiresAt });
}

function cacheGet(token: string): User | null {
  const entry = userCache.get(token);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    userCache.delete(token);
    return null;
  }
  return entry.user;
}

/** テスト・デバッグ用: キャッシュを空にする */
export function clearUserCache() {
  userCache.clear();
}

/** Supabase access token → local DB User。 */
export async function resolveUserFromToken(token: string): Promise<User | null> {
  if (!token) return null;

  const cached = cacheGet(token);
  if (cached) return cached;

  const supabase = getAuthClient();
  if (!supabase) return null;

  const {
    data: { user: supabaseUser },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !supabaseUser) return null;

  let user = await getUserByOpenId(supabaseUser.id);
  const needsSync =
    !user || Date.now() - user.lastSignedIn.getTime() > USER_SYNC_INTERVAL_MS;

  if (needsSync) {
    await upsertUser({
      openId: supabaseUser.id,
      name:
        supabaseUser.user_metadata?.full_name ??
        supabaseUser.user_metadata?.name ??
        user?.name ??
        null,
      email: supabaseUser.email ?? null,
      loginMethod: supabaseUser.app_metadata?.provider ?? null,
      lastSignedIn: new Date(),
    });
    user = await getUserByOpenId(supabaseUser.id);
  }

  if (!user) return null;
  cacheSet(token, user);
  return user;
}

function bearerToken(authHeader: string | undefined | null): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  return token || null;
}

/** Express dev server 用 context（Authorization: Bearer <supabase access token>） */
export async function createContext(opts: CreateExpressContextOptions): Promise<TrpcContext> {
  try {
    const token = bearerToken(opts.req.headers.authorization);
    return { user: token ? await resolveUserFromToken(token) : null };
  } catch {
    return { user: null };
  }
}

/** Vercel fetch adapter 用 context */
export async function createFetchContext(req: Request): Promise<TrpcContext> {
  try {
    const token = bearerToken(req.headers.get("authorization"));
    return { user: token ? await resolveUserFromToken(token) : null };
  } catch {
    return { user: null };
  }
}
