import { useEffect, useState, useCallback } from "react";
import { ScrollView, Text, View, TouchableOpacity, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";

import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { getRounds, getUserProfile } from "@/lib/storage";
import { calculateBasicStats, calculateOnePuttRate, calculateThreePuttRate, formatDate } from "@/lib/analytics";
import { Round, UserProfile } from "@/lib/types";

export default function HomeScreen() {
  const router = useRouter();
  const colors = useColors();
  const [rounds, setRounds] = useState<Round[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    const [roundsData, profileData] = await Promise.all([
      getRounds(),
      getUserProfile(),
    ]);
    setRounds(roundsData);
    setProfile(profileData);
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
        contentContainerStyle={{ flexGrow: 1 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View className="flex-1 p-4 gap-6">
          {/* ヘッダー */}
          <View className="flex-row items-center justify-between">
            <View>
              <Text className="text-2xl font-bold text-foreground">
                {profile?.name ? `${profile.name}さん` : "パッティング分析"}
              </Text>
              <Text className="text-sm text-muted">
                {new Date().toLocaleDateString("ja-JP", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </Text>
            </View>
          </View>

          {/* クイックスタッツ */}
          <View className="bg-surface rounded-2xl p-4 border border-border">
            <Text className="text-lg font-semibold text-foreground mb-4">
              パフォーマンス概要
            </Text>
            <View className="flex-row justify-between">
              <StatCard
                label="総ラウンド"
                value={stats.totalRounds.toString()}
                unit="回"
              />
              <StatCard
                label="平均パット"
                value={stats.averagePuttsPerHole.toFixed(2)}
                unit="/ホール"
              />
              <StatCard
                label="1パット率"
                value={onePuttRate.toFixed(1)}
                unit="%"
                highlight={onePuttRate > 30}
              />
              <StatCard
                label="3パット率"
                value={threePuttRate.toFixed(1)}
                unit="%"
                warning={threePuttRate > 10}
              />
            </View>
          </View>

          {/* アクションボタン */}
          <View className="flex-row gap-3">
            <TouchableOpacity
              className="flex-1 bg-primary rounded-xl p-4 items-center"
              style={{ opacity: 1 }}
              onPress={() => router.push("/new-round" as any)}
              activeOpacity={0.8}
            >
              <IconSymbol name="plus" size={24} color="#FFFFFF" />
              <Text className="text-white font-semibold mt-2">新規ラウンド</Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="flex-1 bg-surface rounded-xl p-4 items-center border border-border"
              onPress={() => router.push("/scan-card" as any)}
              activeOpacity={0.8}
            >
              <IconSymbol name="camera.fill" size={24} color={colors.foreground} />
              <Text className="text-foreground font-semibold mt-2">カード撮影</Text>
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
                  <Text className="text-primary text-sm">すべて見る</Text>
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
              <View className="bg-surface rounded-xl p-6 items-center border border-border">
                <IconSymbol name="flag.fill" size={48} color={colors.muted} />
                <Text className="text-muted mt-3 text-center">
                  まだラウンドデータがありません
                </Text>
                <Text className="text-muted text-sm text-center mt-1">
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

function StatCard({
  label,
  value,
  unit,
  highlight,
  warning,
}: {
  label: string;
  value: string;
  unit: string;
  highlight?: boolean;
  warning?: boolean;
}) {
  return (
    <View className="items-center flex-1">
      <Text
        className={`text-2xl font-bold ${
          highlight ? "text-success" : warning ? "text-error" : "text-foreground"
        }`}
      >
        {value}
      </Text>
      <Text className="text-xs text-muted">{unit}</Text>
      <Text className="text-xs text-muted mt-1">{label}</Text>
    </View>
  );
}

function RoundCard({ round, onPress }: { round: Round; onPress: () => void }) {
  const colors = useColors();
  
  return (
    <TouchableOpacity
      className="bg-surface rounded-xl p-4 border border-border"
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-1">
          <Text className="text-foreground font-semibold">{round.courseName}</Text>
          <Text className="text-muted text-sm mt-1">{formatDate(round.date)}</Text>
        </View>
        <View className="items-end">
          <Text className="text-2xl font-bold text-primary">{round.totalPutts}</Text>
          <Text className="text-xs text-muted">パット</Text>
        </View>
        <IconSymbol
          name="chevron.right"
          size={20}
          color={colors.muted}
          style={{ marginLeft: 8 }}
        />
      </View>
      <View className="flex-row mt-3 gap-2">
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
      className={`px-2 py-1 rounded-full ${
        variant === "success" ? "bg-success/20" : "bg-border"
      }`}
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
