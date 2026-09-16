import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (k: string) => store.get(k) ?? null,
    setItem: async (k: string, v: string) => void store.set(k, v),
    removeItem: async (k: string) => void store.delete(k),
  },
}));

import {
  enqueueHoleSave,
  flushPendingHoleSaves,
  getPendingHoleSaves,
  isNetworkError,
} from "../offline-queue";
import type { HoleData } from "../types";

const hole = (n: number, putts = 2): HoleData => ({ holeNumber: n, scoreResult: "par", totalPutts: putts, putts: [] });

describe("offline-queue", () => {
  beforeEach(() => store.clear());

  it("recognises fetch/network failures but not server errors", () => {
    expect(isNetworkError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isNetworkError(new Error("Network request failed"))).toBe(true);
    expect(isNetworkError(new Error("Round not found"))).toBe(false);
  });

  it("merges saves for the same round hole by hole", async () => {
    await enqueueHoleSave("10", [hole(1), hole(2, 3)]);
    await enqueueHoleSave("10", [hole(2, 1), hole(3)]);
    await enqueueHoleSave("11", [hole(1)]);
    const q = await getPendingHoleSaves();
    expect(q).toHaveLength(2);
    expect(q[0].holes.map((h) => [h.holeNumber, h.totalPutts])).toEqual([[1, 2], [2, 1], [3, 2]]);
  });

  it("flushes in order, stops on network error and drops server rejections", async () => {
    await enqueueHoleSave("1", [hole(1)]);
    await enqueueHoleSave("2", [hole(1)]);
    await enqueueHoleSave("3", [hole(1)]);
    const calls: string[] = [];
    const first = await flushPendingHoleSaves(async (roundId) => {
      calls.push(roundId);
      if (roundId === "2") throw new Error("Round not found"); // 4xx 相当 → 破棄
      if (roundId === "3") throw new TypeError("Failed to fetch"); // オフライン → 残す
    });
    expect(calls).toEqual(["1", "2", "3"]);
    expect(first).toEqual({ sent: 1, remaining: 1 });
    expect((await getPendingHoleSaves()).map((q) => q.roundId)).toEqual(["3"]);

    const second = await flushPendingHoleSaves(async () => undefined);
    expect(second).toEqual({ sent: 1, remaining: 0 });
    expect(await getPendingHoleSaves()).toEqual([]);
  });
});
