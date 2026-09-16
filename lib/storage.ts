/**
 * storage.ts
 *
 * Backward-compatible re-export layer.
 *
 * Most functions are delegated to lib/api-golf.ts (server via tRPC).
 * getUserProfile / saveUserProfile also fall back to AsyncStorage so the app
 * remains usable before the user is authenticated (e.g. profile name is stored
 * locally until a server round-trip can succeed).
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  UserProfile,
  Putter,
  GolfCourse,
  Round,
  HoleData,
  STORAGE_KEYS,
  DEFAULT_USER_PROFILE,
} from "./types";

import * as ApiGolf from "./api-golf";
import {
  enqueueHoleSave,
  flushPendingHoleSaves,
  getPendingHoleSaveCount,
  getPendingHolesForRound,
  isNetworkError,
} from "./offline-queue";

// ─── ID generator (kept for backward compat; not used for server data) ────────

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// ─── User Profile ─────────────────────────────────────────────────────────────
// Falls back to AsyncStorage so an unauthenticated user can still store a name.

export async function getUserProfile(): Promise<UserProfile | null> {
  try {
    const profile = await ApiGolf.getUserProfile();
    if (profile) {
      // 名前はサーバー(users.name)が正。未設定なら旧バージョンで端末に保存した名前を補う。
      if (!profile.name) {
        try {
          const local = await AsyncStorage.getItem(STORAGE_KEYS.USER_PROFILE);
          if (local) {
            const localProfile: UserProfile = JSON.parse(local);
            if (localProfile.name) profile.name = localProfile.name;
          }
        } catch {
          // Ignore AsyncStorage read errors
        }
      }
      return profile;
    }
  } catch {
    // API unavailable — fall through to local storage
  }

  // AsyncStorage fallback
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.USER_PROFILE);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error("[storage] Error getting user profile from AsyncStorage:", error);
    return null;
  }
}

export async function saveUserProfile(
  profile: Partial<UserProfile>,
): Promise<UserProfile> {
  // Always persist to AsyncStorage (covers offline / unauthenticated case)
  let localProfile: UserProfile;
  try {
    const existing = await AsyncStorage.getItem(STORAGE_KEYS.USER_PROFILE);
    const now = new Date().toISOString();
    const parsed: UserProfile | null = existing ? JSON.parse(existing) : null;
    localProfile = parsed
      ? { ...parsed, ...profile, updatedAt: now }
      : {
          id: generateId(),
          ...DEFAULT_USER_PROFILE,
          ...profile,
          createdAt: now,
          updatedAt: now,
        };
    await AsyncStorage.setItem(STORAGE_KEYS.USER_PROFILE, JSON.stringify(localProfile));
  } catch (error) {
    console.error("[storage] Error saving user profile to AsyncStorage:", error);
    const now = new Date().toISOString();
    localProfile = {
      id: generateId(),
      ...DEFAULT_USER_PROFILE,
      ...profile,
      createdAt: now,
      updatedAt: now,
    };
  }

  // Best-effort server sync (non-fatal on failure)
  try {
    const serverProfile = await ApiGolf.saveUserProfile(profile);
    return { ...serverProfile, name: serverProfile.name || localProfile.name };
  } catch {
    // Server unavailable — return local data
    return localProfile;
  }
}

// ─── Putters ──────────────────────────────────────────────────────────────────

export async function getPutters(): Promise<Putter[]> {
  return ApiGolf.getPutters();
}

export async function getPutter(id: string): Promise<Putter | null> {
  return ApiGolf.getPutter(id);
}

export async function savePutter(
  putter: Omit<Putter, "id" | "createdAt" | "updatedAt">,
): Promise<Putter> {
  return ApiGolf.savePutter(putter);
}

export async function updatePutter(
  id: string,
  updates: Partial<Putter>,
): Promise<Putter | null> {
  return ApiGolf.updatePutter(id, updates);
}

export async function deletePutter(id: string): Promise<boolean> {
  return ApiGolf.deletePutter(id);
}

// ─── Courses ──────────────────────────────────────────────────────────────────

export async function getCourses(): Promise<GolfCourse[]> {
  return ApiGolf.getCourses();
}

export async function saveCourse(
  course: Omit<GolfCourse, "id" | "createdAt">,
): Promise<GolfCourse> {
  return ApiGolf.saveCourse(course);
}

export async function deleteCourse(id: string): Promise<boolean> {
  return ApiGolf.deleteCourse(id);
}

// ─── Rounds ───────────────────────────────────────────────────────────────────

export async function getRounds(): Promise<Round[]> {
  return ApiGolf.getRounds();
}

export async function getRoundsWithHoles(fromDate?: string): Promise<Round[]> {
  return ApiGolf.getRoundsWithHoles(fromDate);
}

export async function getRound(id: string): Promise<Round | null> {
  return ApiGolf.getRound(id);
}

export async function saveRound(
  round: Omit<Round, "id" | "createdAt" | "updatedAt">,
): Promise<Round> {
  return ApiGolf.saveRound(round);
}

export async function updateRound(
  id: string,
  updates: Partial<Round>,
): Promise<Round | null> {
  return ApiGolf.updateRound(id, updates);
}

export async function deleteRound(id: string): Promise<boolean> {
  return ApiGolf.deleteRound(id);
}

export async function resetRoundHoles(id: string): Promise<boolean> {
  return ApiGolf.resetRoundHoles(id);
}

export async function deleteAllRounds(): Promise<boolean> {
  return ApiGolf.deleteAllRounds();
}

// ─── Holes ────────────────────────────────────────────────────────────────────

export type SaveHolesOutcome = {
  roundId: string;
  holes: HoleData[];
  totalPutts: number;
  /** true = オフラインのため端末に保留した（接続後に自動送信） */
  queued?: boolean;
};

/**
 * ホール保存。サーバーに届かないとき（オフライン等）は端末のキューに積み、
 * ローカル計算の結果を返して入力を続けられるようにする。
 */
export async function saveHolesForRound(
  roundId: string,
  holes: HoleData[],
): Promise<SaveHolesOutcome> {
  // 先に溜まっている保存があれば流す（順序を保つため）
  await flushPendingHoleSaves(ApiGolf.saveHolesForRound).catch(() => undefined);
  try {
    return await ApiGolf.saveHolesForRound(roundId, holes);
  } catch (error) {
    if (!isNetworkError(error)) throw error;
    await enqueueHoleSave(roundId, holes);
    const padded: HoleData[] = Array.from({ length: 18 }, (_, i) => {
      const num = i + 1;
      return (
        holes.find((h) => h.holeNumber === num) ?? {
          holeNumber: num,
          scoreResult: "par",
          totalPutts: 0,
          putts: [],
        }
      );
    });
    return {
      roundId,
      holes: padded,
      totalPutts: padded.reduce((sum, h) => sum + h.totalPutts, 0),
      queued: true,
    };
  }
}

/** 保留中の保存を再送する（画面のフォーカス時などに呼ぶ） */
export async function syncPendingHoleSaves(): Promise<{ sent: number; remaining: number }> {
  return flushPendingHoleSaves(ApiGolf.saveHolesForRound);
}

export async function pendingHoleSaveCount(): Promise<number> {
  return getPendingHoleSaveCount();
}

/** 保留中のホールがあれば、サーバーから取得したラウンドに重ねて返す（表示用） */
export async function getRoundWithPending(id: string): Promise<Round | null> {
  const round = await ApiGolf.getRound(id);
  if (!round) return null;
  const pending = await getPendingHolesForRound(id);
  if (!pending) return round;
  const holes = round.holes.map((h) => pending.find((p) => p.holeNumber === h.holeNumber) ?? h);
  return { ...round, holes, totalPutts: holes.reduce((s, h) => s + h.totalPutts, 0) };
}

// ─── Utility ──────────────────────────────────────────────────────────────────

/**
 * clearAllData — clears local AsyncStorage only.
 * Server data is not deleted (use account deletion for that).
 */
export async function clearAllData(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.USER_PROFILE,
      STORAGE_KEYS.PUTTERS,
      STORAGE_KEYS.COURSES,
      STORAGE_KEYS.ROUNDS,
    ]);
  } catch (error) {
    console.error("[storage] Error clearing local data:", error);
    throw error;
  }
}
