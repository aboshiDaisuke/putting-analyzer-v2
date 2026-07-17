import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase";

/**
 * セッション状態の単一ソース。
 *   undefined = 読み込み中 / null = 未ログイン / Session = ログイン済み
 *
 * これを各レイアウト・画面が参照することで、認証が解決する前に
 * 保護されたデータ取得（401 になる）を実行してしまうのを防ぐ。
 */
const SessionContext = createContext<Session | null | undefined>(undefined);

export function SessionProvider({ children }: { children: ReactNode }) {
  // undefined = loading, null = logged out, Session = logged in
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    // 初期セッション取得
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    // 認証状態の変化を購読
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <SessionContext.Provider value={session}>{children}</SessionContext.Provider>
  );
}

/** undefined = 読み込み中 / null = 未ログイン / Session = ログイン済み */
export function useSession() {
  return useContext(SessionContext);
}
