import { useState, useCallback } from "react";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";

import { ScreenContainer } from "@/components/screen-container";
import { HomeDashboard } from "@/components/home-dashboard";
import { useBaseline } from "@/hooks/use-baseline";
import { setDemoMode } from "@/lib/demo-mode";
import { openPrintCard } from "@/lib/print-card";
import { useIsDemo } from "@/lib/session-context";
import { getRoundsWithHoles, getUserProfile, pendingHoleSaveCount, syncPendingHoleSaves } from "@/lib/storage";
import { Round, UserProfile } from "@/lib/types";

export default function HomeScreen() {
  const router = useRouter();
  const isDemo = useIsDemo();
  const [rounds, setRounds] = useState<Round[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingSaves, setPendingSaves] = useState(0);
  const [baseline] = useBaseline(profile?.handicap);

  const loadData = useCallback(async () => {
    // 認証は (tabs)/_layout のガードで解決済み。ここでは取得失敗のみ握りつぶす。
    try {
      // オフライン中に溜めたホール保存があれば先に送る
      await syncPendingHoleSaves().catch(() => undefined);
      const [roundsData, profileData, pending] = await Promise.all([
        getRoundsWithHoles(),
        getUserProfile(),
        pendingHoleSaveCount(),
      ]);
      setRounds(roundsData);
      setProfile(profileData);
      setPendingSaves(pending);
    } catch (error) {
      console.warn("[home] loadData failed:", error);
      setPendingSaves(await pendingHoleSaveCount().catch(() => 0));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  return (
    <ScreenContainer>
      <HomeDashboard
        rounds={rounds}
        profile={profile}
        baseline={baseline}
        isDemo={isDemo}
        pendingSaves={pendingSaves}
        refreshing={refreshing}
        onRefresh={onRefresh}
        onNewRound={() => router.push("/new-round" as never)}
        onScan={() => router.push("/scan-card" as never)}
        onPrintCard={() => void openPrintCard()}
        onOpenAnalytics={() => router.push("/(tabs)/analytics")}
        onOpenRounds={() => router.push("/(tabs)/rounds")}
        onOpenRound={(id) => router.push(`/round/${id}` as never)}
        onExitDemo={() => void setDemoMode(false)}
      />
    </ScreenContainer>
  );
}
