import { useState, useCallback } from "react";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";

import { ScreenContainer } from "@/components/screen-container";
import { HomeDashboard } from "@/components/home-dashboard";
import { getRounds, getUserProfile } from "@/lib/storage";
import { Round, UserProfile } from "@/lib/types";

export default function HomeScreen() {
  const router = useRouter();
  const [rounds, setRounds] = useState<Round[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    // 認証は (tabs)/_layout のガードで解決済み。ここでは取得失敗のみ握りつぶす。
    try {
      const [roundsData, profileData] = await Promise.all([
        getRounds(),
        getUserProfile(),
      ]);
      setRounds(roundsData);
      setProfile(profileData);
    } catch (error) {
      console.warn("[home] loadData failed:", error);
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
        refreshing={refreshing}
        onRefresh={onRefresh}
        onNewRound={() => router.push("/new-round" as any)}
        onOpenAnalytics={() => router.push("/(tabs)/analytics")}
        onOpenRounds={() => router.push("/(tabs)/rounds")}
        onOpenRound={(id) => router.push(`/round/${id}` as any)}
      />
    </ScreenContainer>
  );
}
