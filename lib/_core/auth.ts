import { supabase } from "@/lib/supabase";

export type User = {
  id: number;
  openId: string;
  name: string | null;
  email: string | null;
  loginMethod: string | null;
  lastSignedIn: Date;
};

// In-memory token cache to avoid repeated getSession() calls
let _cachedToken: string | null = null;
let _cachedTokenExpiry: number = 0;

// Listen to auth state changes to keep cache in sync
supabase.auth.onAuthStateChange((_event, session) => {
  if (session?.access_token) {
    _cachedToken = session.access_token;
    // expires_at is a Unix timestamp in seconds
    _cachedTokenExpiry = (session.expires_at ?? 0) * 1000 - 30_000; // 30s before expiry
  } else {
    _cachedToken = null;
    _cachedTokenExpiry = 0;
  }
});

/**
 * Get the current session access token from Supabase.
 * Uses an in-memory cache to avoid calling getSession() on every request.
 */
export async function getSessionToken(): Promise<string | null> {
  try {
    // Return cached token if still valid
    if (_cachedToken && Date.now() < _cachedTokenExpiry) {
      return _cachedToken;
    }
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) {
      _cachedToken = session.access_token;
      _cachedTokenExpiry = (session.expires_at ?? 0) * 1000 - 30_000;
    } else {
      _cachedToken = null;
    }
    return _cachedToken;
  } catch (error) {
    console.error("[Auth] Failed to get session token:", error);
    return null;
  }
}
