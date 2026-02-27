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

/**
 * Get the current session access token from Supabase.
 * Used by tRPC client and API calls for Bearer auth.
 */
export async function getSessionToken(): Promise<string | null> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ?? null;
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
