import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";

import type { BaselineId } from "@/lib/putting-stats";

const KEY = "putting_analyzer_baseline";
let cached: BaselineId | null = null;
const listeners = new Set<(b: BaselineId) => void>();

/** ハンディキャップから既定の比較基準を決める */
export function defaultBaseline(handicap: number | null | undefined): BaselineId {
  if (handicap == null) return "hc15";
  return handicap <= 5 ? "scratch" : "hc15";
}

/** 比較する基準（ツアー / HC0 / HC15）。端末に保存し、画面間で共有する */
export function useBaseline(handicap?: number | null): [BaselineId, (b: BaselineId) => void] {
  const [value, setValue] = useState<BaselineId>(cached ?? defaultBaseline(handicap));

  useEffect(() => {
    const l = (b: BaselineId) => setValue(b);
    listeners.add(l);
    if (!cached) {
      AsyncStorage.getItem(KEY)
        .then((v) => {
          if (v === "tour" || v === "scratch" || v === "hc15") {
            cached = v;
            setValue(v);
          }
        })
        .catch(() => undefined);
    }
    return () => {
      listeners.delete(l);
    };
  }, []);

  useEffect(() => {
    if (!cached) setValue(defaultBaseline(handicap));
  }, [handicap]);

  const set = useCallback((b: BaselineId) => {
    cached = b;
    listeners.forEach((l) => l(b));
    AsyncStorage.setItem(KEY, b).catch(() => undefined);
  }, []);

  return [value, set];
}
