import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase";
import { loadDemoFlag, onDemoModeChange } from "@/lib/demo-mode";

/**
 * セッション状態の単一ソース。
 *   undefined = 読み込み中 / null = 未ログイン / Session = ログイン済み（またはデモモード）
 *
 * これを各レイアウト・画面が参照することで、認証が解決する前に
 * 保護されたデータ取得（401 になる）を実行してしまうのを防ぐ。
 */
type SessionState = { session: Session | null | undefined; demo: boolean };

const SessionContext = createContext<SessionState>({ session: undefined, demo: false });

/** デモモード中に「ログイン済み」として扱うための印（中身は使わない） */
const DEMO_SESSION = { demo: true } as unknown as Session;

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [demo, setDemo] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    loadDemoFlag().then(setDemo);
    const off = onDemoModeChange(setDemo);

    // 初期セッション取得（Supabase が止まっていても読み込み中のままにしない）
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => setSession(session))
      .catch(() => setSession(null));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => {
      off();
      subscription.unsubscribe();
    };
  }, []);

  const value: SessionState =
    demo === undefined
      ? { session: undefined, demo: false }
      : demo
        ? { session: DEMO_SESSION, demo: true }
        : { session, demo: false };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/** undefined = 読み込み中 / null = 未ログイン / Session = ログイン済み（デモ含む） */
export function useSession() {
  return useContext(SessionContext).session;
}

/** デモモード中か */
export function useIsDemo() {
  return useContext(SessionContext).demo;
}
