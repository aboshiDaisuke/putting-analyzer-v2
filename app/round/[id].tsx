import { useState, useEffect } from "react";
import { ScrollView, Text, View, TouchableOpacity, Alert } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { getRound, deleteRound } from "@/lib/storage";
import { formatDate } from "@/lib/analytics";
import { Round, LABELS } from "@/lib/types";

export default function RoundDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();

  const [round, setRound] = useState<Round | null>(null);

  useEffect(() => {
    const loadRound = async () => {
      if (!id) return;
      const data = await getRound(id);
      setRound(data);
    };
    loadRound();
  }, [id]);

  const handleDelete = () => {
    if (!round) return;
    Alert.alert(
      "ラウンドを削除",
      "このラウンドデータを削除しますか？",
      [
        { text: "キャンセル", style: "cancel" },
        {
          text: "削除",
          style: "destructive",
          onPress: async () => {
            await deleteRound(round.id);
            router.back();
          },
        },
      ]
    );
  };

  if (!round) {
    return (
      <ScreenContainer className="items-center justify-center">
        <Text className="text-muted">読み込み中...</Text>
      </ScreenContainer>
    );
  }

  const avgPutts = round.totalPutts / round.holes.length;
  const onePuttCount = round.holes.filter((h) => h.totalPutts === 1).length;
  const threePuttCount = round.holes.filter((h) => h.totalPutts >= 3).length;

  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      {/* ヘッダー */}
      <View className="flex-row items-center justify-between p-4 border-b border-border">
        <TouchableOpacity onPress={() => router.back()}>
          <IconSymbol name="arrow.left" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text className="text-lg font-semibold text-foreground">
          ラウンド詳細
        </Text>
        <TouchableOpacity onPress={handleDelete}>
          <IconSymbol name="trash.fill" size={24} color={colors.error} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 16 }}>
        {/* 基本情報 */}
        <View className="bg-surface rounded-2xl p-4 border border-border mb-4">
          <Text className="text-xl font-bold text-foreground mb-1">
            {round.courseName}
          </Text>
          <Text className="text-muted">{formatDate(round.date)}</Text>

          <View className="flex-row flex-wrap gap-2 mt-3">
            <Badge label={LABELS.weather[round.weather]} />
            <Badge label={LABELS.windSpeed[round.windSpeed]} />
            <Badge label={LABELS.grassType[round.grassType]} />
            <Badge label={`${round.stimpmeter}ft`} />
            <Badge label={LABELS.greenCondition[round.greenCondition]} />
          </View>

          <View className="mt-4 pt-4 border-t border-border">
            <Text className="text-muted text-sm">使用パター</Text>
            <Text className="text-foreground font-medium mt-1">
              {round.putterName}
            </Text>
          </View>
        </View>

        {/* サマリー */}
        <View className="bg-surface rounded-2xl p-4 border border-border mb-4">
          <Text className="text-lg font-semibold text-foreground mb-4">
            パフォーマンス
          </Text>
          <View className="flex-row justify-between">
            <SummaryItem label="総パット" value={round.totalPutts.toString()} />
            <SummaryItem label="平均" value={avgPutts.toFixed(2)} unit="/H" />
            <SummaryItem
              label="1パット"
              value={onePuttCount.toString()}
              highlight
            />
            <SummaryItem
              label="3パット"
              value={threePuttCount.toString()}
              warning={threePuttCount > 0}
            />
          </View>
        </View>

        {/* ホール別データ */}
        <View className="bg-surface rounded-2xl p-4 border border-border">
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-lg font-semibold text-foreground">
              ホール別データ
            </Text>
            <TouchableOpacity
              onPress={() => router.push(`/hole-input/${round.id}` as any)}
            >
              <Text className="text-primary">編集</Text>
            </TouchableOpacity>
          </View>

          {/* OUT (1-9) */}
          <Text className="text-muted text-sm mb-2">OUT</Text>
          <View className="flex-row mb-4">
            {round.holes.slice(0, 9).map((hole) => (
              <View key={hole.holeNumber} className="flex-1 items-center">
                <Text className="text-muted text-xs">{hole.holeNumber}</Text>
                <View
                  className={`w-8 h-8 rounded-full items-center justify-center mt-1 ${
                    hole.totalPutts === 1
                      ? "bg-success"
                      : hole.totalPutts >= 3
                      ? "bg-error"
                      : "bg-primary"
                  }`}
                >
                  <Text className="text-white font-bold">{hole.totalPutts}</Text>
                </View>
                <Text className="text-muted text-xs mt-1">
                  {LABELS.scoreResult[hole.scoreResult].charAt(0)}
                </Text>
              </View>
            ))}
          </View>

          {/* IN (10-18) */}
          <Text className="text-muted text-sm mb-2">IN</Text>
          <View className="flex-row">
            {round.holes.slice(9, 18).map((hole) => (
              <View key={hole.holeNumber} className="flex-1 items-center">
                <Text className="text-muted text-xs">{hole.holeNumber}</Text>
                <View
                  className={`w-8 h-8 rounded-full items-center justify-center mt-1 ${
                    hole.totalPutts === 1
                      ? "bg-success"
                      : hole.totalPutts >= 3
                      ? "bg-error"
                      : "bg-primary"
                  }`}
                >
                  <Text className="text-white font-bold">{hole.totalPutts}</Text>
                </View>
                <Text className="text-muted text-xs mt-1">
                  {LABELS.scoreResult[hole.scoreResult].charAt(0)}
                </Text>
              </View>
            ))}
          </View>

          {/* 合計 */}
          <View className="flex-row justify-between mt-4 pt-4 border-t border-border">
            <View>
              <Text className="text-muted text-sm">OUT</Text>
              <Text className="text-foreground font-bold text-lg">
                {round.holes.slice(0, 9).reduce((sum, h) => sum + h.totalPutts, 0)}
              </Text>
            </View>
            <View>
              <Text className="text-muted text-sm">IN</Text>
              <Text className="text-foreground font-bold text-lg">
                {round.holes.slice(9, 18).reduce((sum, h) => sum + h.totalPutts, 0)}
              </Text>
            </View>
            <View>
              <Text className="text-muted text-sm">TOTAL</Text>
              <Text className="text-primary font-bold text-lg">
                {round.totalPutts}
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
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

function SummaryItem({
  label,
  value,
  unit,
  highlight,
  warning,
}: {
  label: string;
  value: string;
  unit?: string;
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
        {unit && <Text className="text-sm">{unit}</Text>}
      </Text>
      <Text className="text-xs text-muted mt-1">{label}</Text>
    </View>
  );
}
