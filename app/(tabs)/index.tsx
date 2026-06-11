import { useEffect, useState, useCallback } from "react";
import { ScrollView, Text, View, TouchableOpacity, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";

import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { cardShadow } from "@/lib/card-shadow";
import { getRounds, getUserProfile } from "@/lib/storage";
import { supabase } from "@/lib/supabase";
import { calculateBasicStats, calculateOnePuttRate, calculateThreePuttRate, formatDate } from "@/lib/analytics";
import { Round, UserProfile } from "@/lib/types";

export default function HomeScreen() {
  const router = useRouter();
  const colors = useColors();
  const [rounds, setRounds] = useState<Round[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      // 認証ガードのリダイレクト前に一瞬マウントされるため、
      // 未ログイン時はクエリを投げない（401の未処理エラーで dev のLogBoxが全画面になる）
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

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

  const stats = calculateBasicStats(rounds);
  const onePuttRate = calculateOnePuttRate(rounds);
  const threePuttRate = calculateThreePuttRate(rounds);
  const recentRounds = rounds.slice(0, 3);

  return (
    <ScreenContainer>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 16 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <View className="p-4 gap-5">
          {/* ヘッダー */}
          <View className="bg-primary rounded-2xl p-5" style={cardShadow}>
            <Text className="text-sm" style={{ color: "rgba(255,255,255,0.7)" }}>
              {new Date().toLocaleDateString("ja-JP", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </Text>
            <Text className="text-white text-2xl font-bold mt-1">
              {profile?.name ? `${profile.name}さん` : "Putting Analyzer"}
            </Text>
            <View className="flex-row items-center mt-3 gap-2">
              <View className="rounded-full px-3 py-1" style={{ backgroundColor: "rgba(255,255,255,0.2)" }}>
                <Text className="text-white text-xs">
                  {stats.totalRounds > 0 ? `${stats.totalRounds}ラウンド記録` : "記録なし"}
                </Text>
              </View>
            </View>
          </View>

          {/* メインスタッツ */}
          <View className="flex-row gap-3">
            <View className="flex-1 bg-surface rounded-2xl p-4 border border-border items-center" style={cardShadow}>
              <Text className="text-xs text-muted mb-1">平均パット</Text>
              <Text className="text-3xl font-bold text-primary">
                {stats.averagePuttsPerHole.toFixed(1)}
              </Text>
              <Text className="text-xs text-muted">/ホール</Text>
            </View>
            <View className="flex-1 bg-surface rounded-2xl p-4 border border-border items-center" style={cardShadow}>
              <Text className="text-xs text-muted mb-1">1パット率</Text>
              <Text className={`text-3xl font-bold ${onePuttRate > 30 ? "text-success" : "text-foreground"}`}>
                {onePuttRate.toFixed(0)}
                <Text className="text-lg">%</Text>
              </Text>
              <ProgressBar value={onePuttRate} max={50} color="success" />
            </View>
            <View className="flex-1 bg-surface rounded-2xl p-4 border border-border items-center" style={cardShadow}>
              <Text className="text-xs text-muted mb-1">3パット率</Text>
              <Text className={`text-3xl font-bold ${threePuttRate > 10 ? "text-error" : "text-foreground"}`}>
                {threePuttRate.toFixed(0)}
                <Text className="text-lg">%</Text>
              </Text>
              <ProgressBar value={threePuttRate} max={30} color="error" />
            </View>
          </View>

          {/* アクションボタン */}
          <View className="flex-row gap-3">
            <TouchableOpacity
              className="flex-1 bg-primary rounded-xl p-4 flex-row items-center justify-center gap-2"
              onPress={() => router.push("/new-round" as any)}
              activeOpacity={0.8}
            >
              <IconSymbol name="plus" size={20} color="#FFFFFF" />
              <Text className="text-white font-semibold">新規ラウンド</Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="flex-1 bg-accent rounded-xl p-4 flex-row items-center justify-center gap-2"
              onPress={() => router.push("/(tabs)/analytics")}
              activeOpacity={0.8}
            >
              <IconSymbol name="chart.bar.fill" size={20} color="#FFFFFF" />
              <Text className="text-white font-semibold">分析を見る</Text>
            </TouchableOpacity>
          </View>

          {/* 最近のラウンド */}
          <View>
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-lg font-semibold text-foreground">
                最近のラウンド
              </Text>
              {rounds.length > 0 && (
                <TouchableOpacity onPress={() => router.push("/(tabs)/rounds")}>
                  <Text className="text-accent text-sm font-medium">すべて見る</Text>
                </TouchableOpacity>
              )}
            </View>
            {recentRounds.length > 0 ? (
              <View className="gap-3">
                {recentRounds.map((round) => (
                  <RoundCard
                    key={round.id}
                    round={round}
                    onPress={() => router.push(`/round/${round.id}` as any)}
                  />
                ))}
              </View>
            ) : (
              <View className="bg-surface rounded-2xl p-8 items-center border border-border">
                <IconSymbol name="flag.fill" size={48} color={colors.accent} />
                <Text className="text-foreground font-semibold mt-4 text-center">
                  ラウンドデータがありません
                </Text>
                <Text className="text-muted text-sm text-center mt-2">
                  「新規ラウンド」からデータを記録しましょう
                </Text>
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

function ProgressBar({ value, max, color }: { value: number; max: number; color: "success" | "error" }) {
  const width = Math.min((value / max) * 100, 100);
  return (
    <View className="w-full h-1.5 bg-border rounded-full mt-2 overflow-hidden">
      <View
        className={`h-full rounded-full ${color === "success" ? "bg-success" : "bg-error"}`}
        style={{ width: `${width}%` }}
      />
    </View>
  );
}

function RoundCard({ round, onPress }: { round: Round; onPress: () => void }) {
  const colors = useColors();
  const holesPlayed = round.holes?.length ?? 0;
  const avgPutts = holesPlayed > 0 ? (round.totalPutts / holesPlayed).toFixed(1) : "-";

  return (
    <TouchableOpacity
      className="bg-surface rounded-2xl p-4 border border-border"
      style={cardShadow}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-1">
          <Text className="text-foreground font-semibold text-base">{round.courseName}</Text>
          <Text className="text-muted text-xs mt-1">{formatDate(round.date)}</Text>
        </View>
        <View className="items-center rounded-xl px-4 py-2" style={{ backgroundColor: `${colors.primary}18` }}>
          <Text className="text-2xl font-bold text-primary">{round.totalPutts}</Text>
          <Text className="text-[10px]" style={{ color: `${colors.primary}B3` }}>PUTTS</Text>
        </View>
        <IconSymbol
          name="chevron.right"
          size={16}
          color={colors.muted}
          style={{ marginLeft: 8 }}
        />
      </View>
      <View className="flex-row mt-3 gap-2 items-center">
        <Badge label={round.grassType === "bent" ? "ベント" : round.grassType === "korai" ? "高麗" : round.grassType} />
        <Badge label={`${round.stimpmeter}ft`} />
        <Badge
          label={
            round.greenCondition === "excellent"
              ? "優"
              : round.greenCondition === "good"
              ? "良"
              : "可"
          }
          variant={round.greenCondition === "excellent" ? "success" : "default"}
        />
        <View className="flex-1" />
        <Text className="text-xs text-muted">
          平均 <Text className="font-semibold text-foreground">{avgPutts}</Text>/H
        </Text>
      </View>
    </TouchableOpacity>
  );
}

function Badge({
  label,
  variant = "default",
}: {
  label: string;
  variant?: "default" | "success";
}) {
  return (
    <View
      className="px-2.5 py-1 rounded-full"
      style={{ backgroundColor: variant === "success" ? "rgba(46,125,50,0.15)" : "rgba(26,71,42,0.08)" }}
    >
      <Text
        className={`text-xs ${
          variant === "success" ? "text-success" : "text-muted"
        }`}
      >
        {label}
      </Text>
    </View>
  );
}
