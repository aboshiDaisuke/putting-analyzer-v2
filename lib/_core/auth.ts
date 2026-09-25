import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { USER_INFO_KEY } from "@/constants/oauth";
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

/**
 * @deprecated Session management is handled by Supabase automatically.
 * Kept for backward compatibility.
 */
export async function setSessionToken(_token: string): Promise<void> {
  // No-op: Supabase manages tokens automatically
}

/**
 * Sign out from Supabase, clearing all local session data.
 */
export async function removeSessionToken(): Promise<void> {
  try {
    await supabase.auth.signOut();
  } catch (error) {
    console.error("[Auth] Failed to sign out:", error);
  }
}

export async function getUserInfo(): Promise<User | null> {
  try {
    let info: string | null = null;
    if (Platform.OS === "web") {
      info = window.localStorage.getItem(USER_INFO_KEY);
    } else {
      info = await SecureStore.getItemAsync(USER_INFO_KEY);
    }

    if (!info) return null;
    const user = JSON.parse(info);
    return user;
  } catch (error) {
    console.error("[Auth] Failed to get user info:", error);
    return null;
  }
}

export async function setUserInfo(user: User): Promise<void> {
  try {
    if (Platform.OS === "web") {
      window.localStorage.setItem(USER_INFO_KEY, JSON.stringify(user));
      return;
    }
    await SecureStore.setItemAsync(USER_INFO_KEY, JSON.stringify(user));
  } catch (error) {
    console.error("[Auth] Failed to set user info:", error);
  }
}

export async function clearUserInfo(): Promise<void> {
  try {
    if (Platform.OS === "web") {
      window.localStorage.removeItem(USER_INFO_KEY);
      return;
    }
    await SecureStore.deleteItemAsync(USER_INFO_KEY);
  } catch (error) {
    console.error("[Auth] Failed to clear user info:", error);
  }
}
