/**
 * offline-queue.ts — 電波の無いコース上でもホール入力を失わないための保存キュー。
 *
 * saveHolesForRound がネットワーク起因で失敗したとき、内容を AsyncStorage に積んでおき、
 * 次にアプリが前面に来たとき / 次の保存の前に順番に再送する。
 * 同じラウンドの保存は1件にまとめる（後の保存がホール単位で上書き）。
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { HoleData } from "./types";

const KEY = "putting_analyzer_pending_hole_saves";

export type PendingHoleSave = {
  roundId: string;
  holes: HoleData[];
  queuedAt: string;
};

/** fetch がサーバーに届かなかった（オフライン・DNS失敗・タイムアウト）ときのエラーか */
export function isNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    err.name === "TypeError" && msg.includes("fetch") || // Web: "Failed to fetch"
    msg.includes("network request failed") || // React Native
    msg.includes("load failed") || // Safari
    msg.includes("networkerror") ||
    msg.includes("network error") ||
    msg.includes("timeout")
  );
}

export async function getPendingHoleSaves(): Promise<PendingHoleSave[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeQueue(items: PendingHoleSave[]): Promise<void> {
  try {
    if (items.length === 0) await AsyncStorage.removeItem(KEY);
    else await AsyncStorage.setItem(KEY, JSON.stringify(items));
  } catch (e) {
    console.error("[offline-queue] write failed:", e);
  }
}

/** ラウンド単位でマージしながら積む（同じホール番号は新しい方で上書き） */
export async function enqueueHoleSave(roundId: string, holes: HoleData[]): Promise<void> {
  const queue = await getPendingHoleSaves();
  const existing = queue.find((q) => q.roundId === roundId);
  if (existing) {
    const byNumber = new Map(existing.holes.map((h) => [h.holeNumber, h]));
    for (const h of holes) byNumber.set(h.holeNumber, h);
    existing.holes = [...byNumber.values()].sort((a, b) => a.holeNumber - b.holeNumber);
    existing.queuedAt = new Date().toISOString();
  } else {
    queue.push({ roundId, holes, queuedAt: new Date().toISOString() });
  }
  await writeQueue(queue);
}

export async function getPendingHoleSaveCount(): Promise<number> {
  return (await getPendingHoleSaves()).length;
}

export async function getPendingHolesForRound(roundId: string): Promise<HoleData[] | null> {
  const item = (await getPendingHoleSaves()).find((q) => q.roundId === roundId);
  return item ? item.holes : null;
}

/**
 * キューを先頭から再送する。ネットワーク起因の失敗で止める（残りは次回）。
 * サーバーが 4xx 等で拒否した項目は破棄する（永久に詰まらないように）。
 */
export async function flushPendingHoleSaves(
  send: (roundId: string, holes: HoleData[]) => Promise<unknown>,
): Promise<{ sent: number; remaining: number }> {
  const queue = await getPendingHoleSaves();
  if (queue.length === 0) return { sent: 0, remaining: 0 };
  let sent = 0;
  const remaining: PendingHoleSave[] = [];
  for (let i = 0; i < queue.length; i++) {
    const item = queue[i];
    try {
      await send(item.roundId, item.holes);
      sent++;
    } catch (e) {
      if (isNetworkError(e)) {
        remaining.push(...queue.slice(i));
        break;
      }
      console.warn(`[offline-queue] dropped save for round ${item.roundId}:`, e);
    }
  }
  await writeQueue(remaining);
  return { sent, remaining: remaining.length };
}
