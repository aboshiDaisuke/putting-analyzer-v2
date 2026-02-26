import { useCallback, useState } from "react";
import { FlatList, Text, View, TouchableOpacity, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";

import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { getRounds, deleteRound } from "@/lib/storage";
import { formatDate } from "@/lib/analytics";
import { Round, LABELS } from "@/lib/types";

export default function RoundsScreen() {
  const router = useRouter();
  const colors = useColors();
  const [rounds, setRounds] = useState<Round[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadRounds = useCallback(async () => {
    const data = await getRounds();
    setRounds(data);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadRounds();
    }, [loadRounds])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadRounds();
    setRefreshing(false);
  }, [loadRounds]);

  const handleDelete = useCallback((round: Round) => {
    Alert.alert(
      "ラウンドを削除",
      `${round.courseName}のラウンドデータを削除しますか？`,
      [
        { text: "キャンセル", style: "cancel" },
        {
          text: "削除",
          style: "destructive",
          onPress: async () => {
            await deleteRound(round.id);
            loadRounds();
          },
        },
      ]
    );
  }, [loadRounds]);

  const renderItem = ({ item }: { item: Round }) => (
    <TouchableOpacity
      className="bg-surface rounded-xl p-4 mb-3 border border-border"
      onPress={() => router.push(`/round/${item.id}` as any)}
      activeOpacity={0.8}
    >
      <View className="flex-row items-start justify-between">
        <View className="flex-1">
          <Text className="text-foreground font-semibold text-lg">
            {item.courseName}
          </Text>
          <Text className="text-muted text-sm mt-1">{formatDate(item.date)}</Text>
          <View className="flex-row mt-2 gap-2 flex-wrap">
            <Badge label={LABELS.grassType[item.grassType]} />
            <Badge label={`${item.stimpmeter}ft`} />
            <Badge label={LABELS.greenCondition[item.greenCondition]} />
            <Badge label={LABELS.weather[item.weather]} />
          </View>
        </View>
        <View className="items-end ml-3">
          <Text className="text-3xl font-bold text-primary">{item.totalPutts}</Text>
          <Text className="text-xs text-muted">パット</Text>
          <Text className="text-sm text-muted mt-1">
            {(item.totalPutts / item.holes.length).toFixed(2)}/H
          </Text>
        </View>
      </View>
      <View className="flex-row items-center justify-between mt-3 pt-3 border-t border-border">
        <Text className="text-muted text-sm">
          {item.putterName}
        </Text>
        <View className="flex-row items-center gap-3">
          <TouchableOpacity
            onPress={() => handleDelete(item)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <IconSymbol name="trash.fill" size={20} color={colors.error} />
          </TouchableOpacity>
          <IconSymbol name="chevron.right" size={20} color={colors.muted} />
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <ScreenContainer className="p-4">
      <View className="flex-row items-center justify-between mb-4">
        <Text className="text-2xl font-bold text-foreground">ラウンド履歴</Text>
        <TouchableOpacity
          className="bg-primary rounded-full p-2"
          onPress={() => router.push("/new-round" as any)}
          activeOpacity={0.8}
        >
          <IconSymbol name="plus" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {rounds.length > 0 ? (
        <FlatList
          data={rounds}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          refreshing={refreshing}
          onRefresh={onRefresh}
        />
      ) : (
        <View className="flex-1 items-center justify-center">
          <IconSymbol name="flag.fill" size={64} color={colors.muted} />
          <Text className="text-muted text-lg mt-4">ラウンドデータがありません</Text>
          <Text className="text-muted text-sm mt-2 text-center">
            「+」ボタンから新しいラウンドを記録しましょう
          </Text>
        </View>
      )}
    </ScreenContainer>
  );
}

function Badge({ label }: { label: string }) {
  return (
    <View className="px-2 py-1 rounded-full bg-border">
      <Text className="text-xs text-muted">{label}</Text>
    </View>
  );
}
