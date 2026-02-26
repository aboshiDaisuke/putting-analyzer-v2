import { useState, useEffect, useCallback } from "react";
import {
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Alert,
  TextInput,
  FlatList,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import type { OcrHoleData, OcrPuttData } from "@/lib/ocr-utils";
import { convertOcrBatchToHoles } from "@/lib/ocr-utils";
import { saveRound, getUserProfile } from "@/lib/storage";
import type { Round } from "@/lib/types";

// カード表記のラベル
const RESULT_OPTIONS = ["E", "Ba", "P", "Bo", "D+"] as const;
const LINE_UD_OPTIONS = ["F", "U", "D", "UD", "DU"] as const;
const LINE_LR_OPTIONS = ["St", "L", "R", "LR", "RL"] as const;
const MENTAL_OPTIONS = ["P", 1, 2, 3, 4, 5, "N"] as const;

const RESULT_LABELS: Record<string, string> = {
  E: "E", Ba: "Ba", P: "P", Bo: "Bo", "D+": "D+",
};
const LINE_UD_LABELS: Record<string, string> = {
  F: "F", U: "U", D: "D", UD: "UD", DU: "DU",
};
const LINE_LR_LABELS: Record<string, string> = {
  St: "St", L: "L", R: "R", LR: "LR", RL: "RL",
};

// 小さな選択ボタン
function MiniSelect({
  options,
  value,
  onChange,
  labels,
  colors,
}: {
  options: readonly (string | number)[];
  value: string | number | null;
  onChange: (v: any) => void;
  labels?: Record<string, string>;
  colors: any;
}) {
  return (
    <View style={{ flexDirection: "row", gap: 3, flexWrap: "wrap" }}>
      {options.map((opt) => {
        const selected = value === opt || String(value) === String(opt);
        const label = labels ? labels[String(opt)] || String(opt) : String(opt);
        return (
          <TouchableOpacity
            key={String(opt)}
            onPress={() => onChange(selected ? null : opt)}
            style={{
              paddingHorizontal: 8,
              paddingVertical: 4,
              borderRadius: 6,
              backgroundColor: selected ? colors.primary : colors.surface,
              borderWidth: 1,
              borderColor: selected ? colors.primary : colors.border,
              minWidth: 28,
              alignItems: "center",
            }}
          >
            <Text
              style={{
                color: selected ? "#FFF" : colors.foreground,
                fontSize: 11,
                fontWeight: "600",
              }}
            >
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default function OcrReviewScreen() {
  const router = useRouter();
  const colors = useColors();
  const { data } = useLocalSearchParams<{ data: string }>();

  const [ocrResults, setOcrResults] = useState<OcrHoleData[]>([]);
  const [expandedHole, setExpandedHole] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (data) {
      try {
        const parsed = JSON.parse(data);
        setOcrResults(Array.isArray(parsed) ? parsed : [parsed]);
      } catch (e) {
        console.error("Failed to parse OCR data:", e);
      }
    }
  }, [data]);

  const updatePuttField = useCallback(
    (holeIndex: number, puttIndex: number, field: keyof OcrPuttData, value: any) => {
      setOcrResults((prev) => {
        const updated = [...prev];
        const putts = [...updated[holeIndex].putts];
        putts[puttIndex] = { ...putts[puttIndex], [field]: value };
        updated[holeIndex] = { ...updated[holeIndex], putts };
        return updated;
      });
    },
    []
  );

  const updateHoleField = useCallback(
    (holeIndex: number, field: keyof OcrHoleData, value: any) => {
      setOcrResults((prev) => {
        const updated = [...prev];
        updated[holeIndex] = { ...updated[holeIndex], [field]: value };
        return updated;
      });
    },
    []
  );

  const handleSaveToRound = async () => {
    if (ocrResults.length === 0) return;

    setIsSaving(true);
    try {
      const profile = await getUserProfile();
      const strideLength = profile?.strideLength || 0.7;

      const holes = convertOcrBatchToHoles(ocrResults, strideLength);

      if (holes.length === 0) {
        Alert.alert("エラー", "有効なホールデータがありません");
        setIsSaving(false);
        return;
      }

      const firstResult = ocrResults[0];
      const dateStr = firstResult.date || "";
      const courseName = firstResult.course || "未設定";

      const now = new Date();
      let roundDate = now.toISOString();
      if (dateStr) {
        const parts = dateStr.split("/");
        if (parts.length === 2) {
          const month = parseInt(parts[0], 10);
          const day = parseInt(parts[1], 10);
          if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
            roundDate = new Date(now.getFullYear(), month - 1, day).toISOString();
          }
        }
      }

      const totalPutts = holes.reduce((sum, h) => sum + h.totalPutts, 0);

      const newRound: Omit<Round, "id" | "createdAt" | "updatedAt"> = {
        date: roundDate,
        weather: "sunny",
        windSpeed: "calm",
        courseId: "",
        courseName,
        frontNineGreen: "A",
        backNineGreen: "A",
        roundType: "private",
        competitionFormat: "stroke",
        grassType: "bent",
        stimpmeter: 9.0,
        greenCondition: "good",
        putterId: "",
        putterName: "",
        holes,
        totalPutts,
      };

      await saveRound(newRound);

      Alert.alert(
        "保存完了",
        `${holes.length}ホール分のデータを保存しました。\n\nラウンド詳細画面で環境情報を追加設定できます。`,
        [
          {
            text: "ラウンド一覧へ",
            onPress: () => router.replace("/(tabs)/rounds" as any),
          },
        ]
      );
    } catch (error) {
      console.error("Save error:", error);
      Alert.alert("エラー", "保存に失敗しました");
    } finally {
      setIsSaving(false);
    }
  };

  const renderPuttSection = (
    puttData: OcrPuttData,
    holeIndex: number,
    puttIndex: number
  ) => {
    const isEmpty =
      !puttData.cupIn &&
      puttData.distPrev === null &&
      puttData.lengthSteps === null &&
      puttData.result === null &&
      puttData.touch === null &&
      puttData.lineUD === null &&
      puttData.lineLR === null &&
      puttData.mental === null;

    const puttLabel = puttData.puttNumber === 1 ? "1st" : puttData.puttNumber === 2 ? "2nd" : "3rd";

    if (isEmpty) {
      return (
        <View key={puttIndex} className="mt-2 p-3 bg-background rounded-xl border border-border">
          <Text className="text-muted text-sm text-center">
            {puttLabel} Putt: データなし
          </Text>
        </View>
      );
    }

    return (
      <View key={puttIndex} className="mt-2 p-3 bg-background rounded-xl border border-border">
        <Text className="text-foreground font-semibold text-sm mb-2">
          {puttLabel} Putt
        </Text>

        {/* In（カップイン） */}
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
          <Text style={{ color: colors.muted, fontSize: 11, width: 80 }}>In:</Text>
          <TouchableOpacity
            onPress={() => updatePuttField(holeIndex, puttIndex, "cupIn", !puttData.cupIn)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
            }}
          >
            <View
              style={{
                width: 20,
                height: 20,
                borderRadius: 4,
                borderWidth: 2,
                borderColor: puttData.cupIn ? colors.success : colors.border,
                backgroundColor: puttData.cupIn ? colors.success : "transparent",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {puttData.cupIn && (
                <Text style={{ color: "#FFF", fontSize: 12, fontWeight: "bold" }}>✓</Text>
              )}
            </View>
            <Text style={{ color: puttData.cupIn ? colors.success : colors.muted, fontSize: 12 }}>
              {puttData.cupIn ? "カップイン" : ""}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Dist(prev) */}
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
          <Text style={{ color: colors.muted, fontSize: 11, width: 80 }}>Dist(prev):</Text>
          <TextInput
            style={{
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 6,
              paddingHorizontal: 8,
              paddingVertical: 3,
              color: colors.foreground,
              width: 50,
              fontSize: 13,
              textAlign: "center",
            }}
            value={puttData.distPrev?.toString() || ""}
            onChangeText={(v) =>
              updatePuttField(holeIndex, puttIndex, "distPrev", v ? parseInt(v, 10) : null)
            }
            keyboardType="number-pad"
            placeholder="--"
            placeholderTextColor={colors.muted}
          />
          <Text style={{ color: colors.muted, fontSize: 11, marginLeft: 4 }}>yd</Text>
        </View>

        {/* Result */}
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
          <Text style={{ color: colors.muted, fontSize: 11, width: 80 }}>Result:</Text>
          <MiniSelect
            options={RESULT_OPTIONS}
            value={puttData.result}
            onChange={(v: any) => updatePuttField(holeIndex, puttIndex, "result", v)}
            labels={RESULT_LABELS}
            colors={colors}
          />
        </View>

        {/* Length */}
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
          <Text style={{ color: colors.muted, fontSize: 11, width: 80 }}>Length:</Text>
          <TextInput
            style={{
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 6,
              paddingHorizontal: 8,
              paddingVertical: 3,
              color: colors.foreground,
              width: 50,
              fontSize: 13,
              textAlign: "center",
            }}
            value={puttData.lengthSteps?.toString() || ""}
            onChangeText={(v) =>
              updatePuttField(holeIndex, puttIndex, "lengthSteps", v ? parseInt(v, 10) : null)
            }
            keyboardType="number-pad"
            placeholder="--"
            placeholderTextColor={colors.muted}
          />
          <Text style={{ color: colors.muted, fontSize: 11, marginLeft: 4, marginRight: 8 }}>st</Text>
          <TextInput
            style={{
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 6,
              paddingHorizontal: 8,
              paddingVertical: 3,
              color: colors.foreground,
              width: 50,
              fontSize: 13,
              textAlign: "center",
            }}
            value={puttData.lengthYards?.toString() || ""}
            onChangeText={(v) =>
              updatePuttField(holeIndex, puttIndex, "lengthYards", v ? parseInt(v, 10) : null)
            }
            keyboardType="number-pad"
            placeholder="--"
            placeholderTextColor={colors.muted}
          />
          <Text style={{ color: colors.muted, fontSize: 11, marginLeft: 4 }}>yd</Text>
        </View>

        {/* Missed Direction */}
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
          <Text style={{ color: colors.muted, fontSize: 11, width: 80 }}>Missed Dir:</Text>
          <MiniSelect
            options={[1, 2, 3, 4, 5]}
            value={puttData.missedDirection}
            onChange={(v: any) => updatePuttField(holeIndex, puttIndex, "missedDirection", v)}
            colors={colors}
          />
        </View>

        {/* Touch */}
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
          <Text style={{ color: colors.muted, fontSize: 11, width: 80 }}>Touch:</Text>
          <MiniSelect
            options={[1, 2, 3, 4, 5]}
            value={puttData.touch}
            onChange={(v: any) => updatePuttField(holeIndex, puttIndex, "touch", v)}
            colors={colors}
          />
          <Text style={{ color: colors.muted, fontSize: 10, marginLeft: 4 }}>弱←→強</Text>
        </View>

        {/* Line U/D */}
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
          <Text style={{ color: colors.muted, fontSize: 11, width: 80 }}>Line(U/D):</Text>
          <MiniSelect
            options={LINE_UD_OPTIONS}
            value={puttData.lineUD}
            onChange={(v: any) => updatePuttField(holeIndex, puttIndex, "lineUD", v)}
            labels={LINE_UD_LABELS}
            colors={colors}
          />
        </View>

        {/* Line L/R */}
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
          <Text style={{ color: colors.muted, fontSize: 11, width: 80 }}>Line(L/R):</Text>
          <MiniSelect
            options={LINE_LR_OPTIONS}
            value={puttData.lineLR}
            onChange={(v: any) => updatePuttField(holeIndex, puttIndex, "lineLR", v)}
            labels={LINE_LR_LABELS}
            colors={colors}
          />
        </View>

        {/* Mental */}
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Text style={{ color: colors.muted, fontSize: 11, width: 80 }}>Mental:</Text>
          <MiniSelect
            options={MENTAL_OPTIONS}
            value={puttData.mental}
            onChange={(v: any) => updatePuttField(holeIndex, puttIndex, "mental", v)}
            colors={colors}
          />
        </View>
      </View>
    );
  };

  const renderHoleItem = ({ item, index }: { item: OcrHoleData; index: number }) => {
    const isExpanded = expandedHole === index;
    const holeNum = item.hole || "?";

    // サマリー情報
    const firstPutt = item.putts[0];
    const resultText = firstPutt?.result || "--";
    const stepsText = firstPutt?.lengthSteps ? `${firstPutt.lengthSteps}歩` : "--";
    const puttCount = item.putts.filter(
      (p) =>
        p.cupIn ||
        p.distPrev !== null ||
        p.result !== null ||
        p.lengthSteps !== null ||
        p.touch !== null
    ).length;

    return (
      <View className="mb-3 bg-surface rounded-xl border border-border overflow-hidden">
        {/* ホールヘッダー */}
        <TouchableOpacity
          className="flex-row items-center justify-between p-4"
          onPress={() => setExpandedHole(isExpanded ? null : index)}
        >
          <View className="flex-row items-center gap-3">
            <View className="w-10 h-10 rounded-full bg-primary items-center justify-center">
              <Text className="text-white font-bold text-lg">{holeNum}</Text>
            </View>
            <View>
              <Text className="text-foreground font-medium">
                Hole {holeNum} · {puttCount}パット
              </Text>
              <Text className="text-muted text-xs">
                Result: {resultText} · Length: {stepsText}
              </Text>
            </View>
          </View>
          <IconSymbol
            name={isExpanded ? "chevron.right" : "chevron.right"}
            size={16}
            color={colors.muted}
            style={{ transform: [{ rotate: isExpanded ? "90deg" : "0deg" }] }}
          />
        </TouchableOpacity>

        {/* 展開時の詳細 */}
        {isExpanded && (
          <View className="px-4 pb-4">
            {/* ホール番号・日付・コース編集 */}
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.muted, fontSize: 11, marginBottom: 2 }}>Hole</Text>
                <TextInput
                  style={{
                    backgroundColor: colors.background,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 6,
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    color: colors.foreground,
                    fontSize: 14,
                    textAlign: "center",
                  }}
                  value={item.hole?.toString() || ""}
                  onChangeText={(v) =>
                    updateHoleField(index, "hole", v ? parseInt(v, 10) : null)
                  }
                  keyboardType="number-pad"
                  placeholder="--"
                  placeholderTextColor={colors.muted}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.muted, fontSize: 11, marginBottom: 2 }}>Date</Text>
                <TextInput
                  style={{
                    backgroundColor: colors.background,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 6,
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    color: colors.foreground,
                    fontSize: 14,
                    textAlign: "center",
                  }}
                  value={item.date || ""}
                  onChangeText={(v) => updateHoleField(index, "date", v)}
                  placeholder="MM/DD"
                  placeholderTextColor={colors.muted}
                />
              </View>
              <View style={{ flex: 2 }}>
                <Text style={{ color: colors.muted, fontSize: 11, marginBottom: 2 }}>Course</Text>
                <TextInput
                  style={{
                    backgroundColor: colors.background,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 6,
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    color: colors.foreground,
                    fontSize: 14,
                  }}
                  value={item.course || ""}
                  onChangeText={(v) => updateHoleField(index, "course", v)}
                  placeholder="コース名"
                  placeholderTextColor={colors.muted}
                />
              </View>
            </View>

            {/* パットセクション */}
            {item.putts.map((putt, puttIndex) =>
              renderPuttSection(putt, index, puttIndex)
            )}
          </View>
        )}
      </View>
    );
  };

  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      {/* ヘッダー */}
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-border">
        <TouchableOpacity onPress={() => router.back()}>
          <IconSymbol name="arrow.left" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text className="text-lg font-semibold text-foreground">読み取り結果</Text>
        <TouchableOpacity
          onPress={handleSaveToRound}
          disabled={isSaving}
          style={{ opacity: isSaving ? 0.5 : 1 }}
        >
          <Text className="text-primary font-semibold">
            {isSaving ? "保存中..." : "保存"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* 説明 */}
      <View className="px-4 py-2 bg-surface/50">
        <Text className="text-muted text-xs">
          AIが読み取った結果です。各ホールをタップして内容を確認・修正できます。
        </Text>
      </View>

      {/* ホールリスト */}
      <FlatList
        data={ocrResults}
        keyExtractor={(_, index) => index.toString()}
        renderItem={renderHoleItem}
        contentContainerStyle={{ padding: 16 }}
      />
    </ScreenContainer>
  );
}
