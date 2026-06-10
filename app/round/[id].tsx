import { useState, useEffect } from "react";
import { ScrollView, Text, View, TouchableOpacity } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { ConfirmBox } from "@/components/ui/confirm-box";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { cardShadow } from "@/lib/card-shadow";
import { hapticSuccess } from "@/lib/haptics";
import { getRound, deleteRound, resetRoundHoles } from "@/lib/storage";
import { formatDate } from "@/lib/analytics";
import { Round, LABELS } from "@/lib/types";

export default function RoundDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();

  const [round, setRound] = useState<Round | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const loadRound = async () => {
      if (!id) return;
      setLoadError(null);
      try {
        const data = await getRound(id);
        if (data) {
          setRound(data);
        } else {
          setLoadError("ラウンドデータが見つかりません");
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error("[round-detail] loadRound error:", err);
        setLoadError(`データの読み込みに失敗しました。\n[${errMsg}]`);
      }
    };
    loadRound();
  }, [id, reloadKey]);

  const handleConfirmDelete = async () => {
    if (!round) return;
    await deleteRound(round.id);
    hapticSuccess();
    setShowDeleteConfirm(false);
    router.back();
  };

  const handleConfirmReset = async () => {
    if (!round) return;
    await resetRoundHoles(round.id);
    setShowResetConfirm(false);
    // Clear state and re-fetch to reflect the reset
    setRound(null);
    setReloadKey((k) => k + 1);
  };

  if (!round) {
    return (
      <ScreenContainer className="items-center justify-center">
        {loadError ? (
          <View className="items-center gap-4 px-8">
            <Text style={{ color: colors.error, textAlign: "center", fontSize: 14 }}>{loadError}</Text>
            <TouchableOpacity
              onPress={() => router.back()}
              style={{ paddingHorizontal: 24, paddingVertical: 10, backgroundColor: colors.primary, borderRadius: 8 }}
            >
              <Text style={{ color: "white", fontWeight: "600" }}>戻る</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Text className="text-muted">読み込み中...</Text>
        )}
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
        <TouchableOpacity onPress={() => setShowDeleteConfirm(true)}>
          <IconSymbol name="trash.fill" size={24} color={colors.error} />
        </TouchableOpacity>
      </View>

      {/* 削除確認 */}
      {showDeleteConfirm && (
        <ConfirmBox
          message="このラウンドデータを削除しますか？"
          confirmLabel="削除"
          onCancel={() => setShowDeleteConfirm(false)}
          onConfirm={handleConfirmDelete}
          style={{ margin: 16 }}
        />
      )}

      {/* リセット確認 */}
      {showResetConfirm && (
        <ConfirmBox
          variant="warning"
          message="ホールデータをリセットしますか？"
          detail="パット記録が全て消えます。ラウンド情報（コース・日付等）は残ります。"
          confirmLabel="リセット"
          onCancel={() => setShowResetConfirm(false)}
          onConfirm={handleConfirmReset}
          style={{ margin: 16, marginTop: 0 }}
        />
      )}

      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 16 }}>
        {/* 基本情報 */}
        <View className="bg-surface rounded-2xl p-4 border border-border mb-4" style={cardShadow}>
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
        <View className="bg-surface rounded-2xl p-4 border border-border mb-4" style={cardShadow}>
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
        <View className="bg-surface rounded-2xl p-4 border border-border" style={cardShadow}>
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-lg font-semibold text-foreground">
              ホール別データ
            </Text>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <TouchableOpacity onPress={() => setShowResetConfirm(true)}>
                <Text style={{ color: colors.warning }}>リセット</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => router.push(`/hole-input/${round.id}` as any)}
              >
                <Text className="text-primary">編集</Text>
              </TouchableOpacity>
            </View>
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
