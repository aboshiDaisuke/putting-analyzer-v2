import { useState, useEffect } from "react";
import {
  ScrollView,
  Text,
  View,
  TouchableOpacity,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { getRound, updateRound, getUserProfile } from "@/lib/storage";
import { calculateDistance } from "@/lib/analytics";
import {
  Round,
  HoleData,
  PuttData,
  ScoreResult,
  SlopeUpDown,
  SlopeLeftRight,
  MentalState,
  PuttStrength,
  MissedDirection,
  LABELS,
  createDefaultPutt,
} from "@/lib/types";

// 選択式ボタンコンポーネント
function SelectButton({
  label,
  selected,
  onPress,
  color = "primary",
  compact = false,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  color?: "primary" | "success" | "error" | "warning";
  compact?: boolean;
}) {
  const bgClass = selected
    ? color === "success"
      ? "bg-success"
      : color === "error"
      ? "bg-error"
      : color === "warning"
      ? "bg-warning"
      : "bg-primary"
    : "bg-background border border-border";

  return (
    <TouchableOpacity
      className={`${compact ? "px-2 py-1.5" : "px-3 py-2"} rounded-lg ${bgClass}`}
      onPress={onPress}
    >
      <Text
        className={`${compact ? "text-xs" : "text-sm"} text-center ${
          selected ? "text-white font-medium" : "text-foreground"
        }`}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export default function HoleInputScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();

  const [round, setRound] = useState<Round | null>(null);
  const [currentHole, setCurrentHole] = useState(1);
  const [strideLength, setStrideLength] = useState(0.7);

  // 現在のホールデータ
  const [scoreResult, setScoreResult] = useState<ScoreResult>("par");
  const [putts, setPutts] = useState<PuttData[]>([createDefaultPutt(1)]);
  const [currentPuttIndex, setCurrentPuttIndex] = useState(0);

  // 現在のパットデータ（カードの全項目に対応）
  const [cupIn, setCupIn] = useState(false);
  const [distPrev, setDistPrev] = useState("");
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [lengthSteps, setLengthSteps] = useState("");
  const [lengthYards, setLengthYards] = useState("");
  const [missedDirection, setMissedDirection] = useState<MissedDirection | null>(null);
  const [touch, setTouch] = useState<PuttStrength | null>(null);
  const [lineUD, setLineUD] = useState<SlopeUpDown>("flat");
  const [lineLR, setLineLR] = useState<SlopeLeftRight>("straight");
  const [mental, setMental] = useState<MentalState>(3);

  useEffect(() => {
    const loadData = async () => {
      if (!id) return;
      const [roundData, profile] = await Promise.all([
        getRound(id),
        getUserProfile(),
      ]);
      if (roundData) {
        setRound(roundData);
        loadHoleData(roundData, 1);
      }
      if (profile?.strideLength) {
        setStrideLength(profile.strideLength);
      }
    };
    loadData();
  }, [id]);

  const loadHoleData = (roundData: Round, holeNum: number) => {
    const hole = roundData.holes.find((h) => h.holeNumber === holeNum);
    if (hole && hole.putts.length > 0) {
      setScoreResult(hole.scoreResult);
      setPutts(hole.putts);
      setCurrentPuttIndex(0);
      loadPuttData(hole.putts[0]);
    } else {
      setScoreResult("par");
      const defaultPutt = createDefaultPutt(1);
      setPutts([defaultPutt]);
      setCurrentPuttIndex(0);
      loadPuttData(defaultPutt);
    }
  };

  const loadPuttData = (putt: PuttData) => {
    setCupIn(putt.cupIn);
    setDistPrev(putt.distPrev?.toString() || "");
    setResult(putt.result);
    setLengthSteps(putt.lengthSteps?.toString() || "");
    setLengthYards(putt.lengthYards?.toString() || "");
    setMissedDirection(putt.missedDirection);
    setTouch(putt.touch);
    setLineUD(putt.lineUD);
    setLineLR(putt.lineLR);
    setMental(putt.mental);
  };

  const getCurrentPuttData = (): PuttData => {
    const steps = parseFloat(lengthSteps) || 0;
    return {
      strokeNumber: (currentPuttIndex + 1) as 1 | 2 | 3,
      cupIn,
      distPrev: parseFloat(distPrev) || null,
      result,
      lengthSteps: steps || null,
      lengthYards: parseFloat(lengthYards) || null,
      distanceMeters: calculateDistance(steps, strideLength),
      missedDirection,
      touch,
      lineUD,
      lineLR,
      mental,
    };
  };

  const saveCurrentPutt = () => {
    const newPutts = [...putts];
    newPutts[currentPuttIndex] = getCurrentPuttData();
    setPutts(newPutts);
    return newPutts;
  };

  const switchPutt = (index: number) => {
    const saved = saveCurrentPutt();
    setCurrentPuttIndex(index);
    loadPuttData(saved[index]);
  };

  const addNewPutt = () => {
    const savedPutts = saveCurrentPutt();
    if (savedPutts.length < 3) {
      const newPutt = createDefaultPutt((savedPutts.length + 1) as 1 | 2 | 3);
      const newPutts = [...savedPutts, newPutt];
      setPutts(newPutts);
      setCurrentPuttIndex(newPutts.length - 1);
      loadPuttData(newPutt);
    }
  };

  const deletePutt = (index: number) => {
    if (putts.length <= 1) return;
    const newPutts = putts.filter((_, i) => i !== index);
    newPutts.forEach((p, i) => {
      p.strokeNumber = (i + 1) as 1 | 2 | 3;
    });
    setPutts(newPutts);
    const newIndex = Math.min(currentPuttIndex, newPutts.length - 1);
    setCurrentPuttIndex(newIndex);
    loadPuttData(newPutts[newIndex]);
  };

  const saveHoleAndNavigate = async (nextHole: number | "finish") => {
    if (!round) return;

    const savedPutts = saveCurrentPutt();
    const totalPutts = savedPutts.length;

    const updatedHoles = round.holes.map((h) =>
      h.holeNumber === currentHole
        ? { ...h, scoreResult, totalPutts, putts: savedPutts }
        : h
    );

    const totalRoundPutts = updatedHoles.reduce((sum, h) => sum + h.totalPutts, 0);

    const updatedRound = await updateRound(round.id, {
      holes: updatedHoles,
      totalPutts: totalRoundPutts,
    });

    if (updatedRound) {
      setRound(updatedRound);

      if (nextHole === "finish") {
        router.replace(`/round/${round.id}` as any);
      } else {
        setCurrentHole(nextHole);
        loadHoleData(updatedRound, nextHole);
      }
    }
  };

  const handleFinish = () => {
    Alert.alert("ラウンド終了", "データを保存してラウンドを終了しますか？", [
      { text: "キャンセル", style: "cancel" },
      { text: "終了", onPress: () => saveHoleAndNavigate("finish") },
    ]);
  };

  if (!round) {
    return (
      <ScreenContainer className="items-center justify-center">
        <Text className="text-muted">読み込み中...</Text>
      </ScreenContainer>
    );
  }

  const puttLabels = ["1st", "2nd", "3rd"];

  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        {/* ヘッダー */}
        <View className="flex-row items-center justify-between px-4 py-3 border-b border-border">
          <TouchableOpacity onPress={() => router.back()}>
            <IconSymbol name="arrow.left" size={24} color={colors.foreground} />
          </TouchableOpacity>
          <Text className="text-lg font-semibold text-foreground">
            {round.courseName}
          </Text>
          <TouchableOpacity onPress={handleFinish}>
            <Text className="text-primary font-medium">終了</Text>
          </TouchableOpacity>
        </View>

        {/* ホールナビゲーター */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="border-b border-border"
          contentContainerStyle={{ paddingHorizontal: 8 }}
        >
          {Array.from({ length: 18 }, (_, i) => i + 1).map((hole) => (
            <TouchableOpacity
              key={hole}
              className={`px-4 py-3 ${
                currentHole === hole ? "border-b-2 border-primary" : ""
              }`}
              onPress={() => saveHoleAndNavigate(hole)}
            >
              <Text
                className={`font-medium ${
                  currentHole === hole ? "text-primary" : "text-muted"
                }`}
              >
                {hole}H
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 16 }}>
          {/* スコア結果 (Result) */}
          <View className="mb-4">
            <Text className="text-muted text-sm mb-2 font-medium">Result</Text>
            <View className="flex-row flex-wrap gap-2">
              {(Object.keys(LABELS.scoreResultShort) as ScoreResult[]).map((s) => (
                <SelectButton
                  key={s}
                  label={LABELS.scoreResultShort[s]}
                  selected={scoreResult === s}
                  onPress={() => setScoreResult(s)}
                />
              ))}
            </View>
          </View>

          {/* パットタブ */}
          <View className="flex-row items-center gap-2 mb-4">
            {putts.map((_, index) => (
              <TouchableOpacity
                key={index}
                className={`px-4 py-2 rounded-lg ${
                  currentPuttIndex === index
                    ? "bg-primary"
                    : "bg-surface border border-border"
                }`}
                onPress={() => switchPutt(index)}
              >
                <Text
                  className={
                    currentPuttIndex === index ? "text-white font-medium" : "text-foreground"
                  }
                >
                  {puttLabels[index]} Putt
                </Text>
              </TouchableOpacity>
            ))}
            {putts.length < 3 && (
              <TouchableOpacity
                className="px-3 py-2 rounded-lg border border-dashed border-border"
                onPress={addNewPutt}
              >
                <Text className="text-muted">+ 追加</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* パット詳細入力 - カードの項目順に配置 */}
          <View className="bg-surface rounded-xl p-4 border border-border gap-4">
            {/* In（カップイン） */}
            <TouchableOpacity
              className={`flex-row items-center justify-between p-3 rounded-lg border ${
                cupIn ? "bg-success/20 border-success" : "bg-background border-border"
              }`}
              onPress={() => setCupIn(!cupIn)}
            >
              <Text className={cupIn ? "text-success font-medium" : "text-foreground"}>
                In（カップイン）
              </Text>
              <View
                className={`w-6 h-6 rounded border-2 items-center justify-center ${
                  cupIn ? "bg-success border-success" : "border-border"
                }`}
              >
                {cupIn && (
                  <IconSymbol name="checkmark.circle.fill" size={16} color="#fff" />
                )}
              </View>
            </TouchableOpacity>

            {/* Dist(prev) yd */}
            <View>
              <Text className="text-muted text-sm mb-2 font-medium">Dist(prev) yd</Text>
              <TextInput
                className="bg-background border border-border rounded-lg px-3 py-3 text-foreground text-lg"
                value={distPrev}
                onChangeText={setDistPrev}
                placeholder="--"
                placeholderTextColor={colors.muted}
                keyboardType="number-pad"
                returnKeyType="done"
              />
            </View>

            {/* Length (st / yd) */}
            <View>
              <Text className="text-muted text-sm mb-2 font-medium">
                Length（距離: {calculateDistance(parseFloat(lengthSteps) || 0, strideLength).toFixed(1)}m）
              </Text>
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Text className="text-muted text-xs mb-1">歩数 (st)</Text>
                  <TextInput
                    className="bg-background border border-border rounded-lg px-3 py-3 text-foreground text-lg"
                    value={lengthSteps}
                    onChangeText={setLengthSteps}
                    placeholder="--"
                    placeholderTextColor={colors.muted}
                    keyboardType="number-pad"
                    returnKeyType="done"
                  />
                </View>
                <View className="flex-1">
                  <Text className="text-muted text-xs mb-1">ヤード (yd)</Text>
                  <TextInput
                    className="bg-background border border-border rounded-lg px-3 py-3 text-foreground text-lg"
                    value={lengthYards}
                    onChangeText={setLengthYards}
                    placeholder="--"
                    placeholderTextColor={colors.muted}
                    keyboardType="number-pad"
                    returnKeyType="done"
                  />
                </View>
              </View>
            </View>

            {/* Missed Direction 1-5 */}
            <View>
              <Text className="text-muted text-sm mb-2 font-medium">Missed Direction</Text>
              <View className="flex-row justify-between">
                {([1, 2, 3, 4, 5] as MissedDirection[]).map((d) => (
                  <SelectButton
                    key={d}
                    label={String(d)}
                    selected={missedDirection === d}
                    onPress={() => setMissedDirection(missedDirection === d ? null : d)}
                    color="error"
                    compact
                  />
                ))}
              </View>
            </View>

            {/* Touch (弱1-5強) */}
            <View>
              <Text className="text-muted text-sm mb-2 font-medium">Touch (弱1-5強)</Text>
              <View className="flex-row justify-between">
                {([1, 2, 3, 4, 5] as PuttStrength[]).map((s) => (
                  <SelectButton
                    key={s}
                    label={LABELS.puttStrength[s]}
                    selected={touch === s}
                    onPress={() => setTouch(touch === s ? null : s)}
                    compact
                  />
                ))}
              </View>
            </View>

            {/* Line (U/D) */}
            <View>
              <Text className="text-muted text-sm mb-2 font-medium">Line (U/D)</Text>
              <View className="flex-row flex-wrap gap-2">
                {(Object.keys(LABELS.slopeUpDownShort) as SlopeUpDown[]).map((s) => (
                  <SelectButton
                    key={s}
                    label={LABELS.slopeUpDownShort[s]}
                    selected={lineUD === s}
                    onPress={() => setLineUD(s)}
                    compact
                  />
                ))}
              </View>
            </View>

            {/* Line (L/R) */}
            <View>
              <Text className="text-muted text-sm mb-2 font-medium">Line (L/R)</Text>
              <View className="flex-row flex-wrap gap-2">
                {(Object.keys(LABELS.slopeLeftRightShort) as SlopeLeftRight[]).map((s) => (
                  <SelectButton
                    key={s}
                    label={LABELS.slopeLeftRightShort[s]}
                    selected={lineLR === s}
                    onPress={() => setLineLR(s)}
                    compact
                  />
                ))}
              </View>
            </View>

            {/* Mental (P/N) */}
            <View>
              <Text className="text-muted text-sm mb-2 font-medium">Mental (P/N)</Text>
              <View className="flex-row justify-between">
                {(["P", 1, 2, 3, 4, 5, "N"] as MentalState[]).map((s) => (
                  <SelectButton
                    key={String(s)}
                    label={LABELS.mentalState[s]}
                    selected={mental === s}
                    onPress={() => setMental(s)}
                    color={
                      s === "P" || s === 1
                        ? "success"
                        : s === "N" || s === 5
                        ? "error"
                        : s === 4
                        ? "warning"
                        : "primary"
                    }
                    compact
                  />
                ))}
              </View>
            </View>

            {/* パット削除ボタン */}
            {putts.length > 1 && (
              <TouchableOpacity
                className="flex-row items-center justify-center py-2"
                onPress={() => deletePutt(currentPuttIndex)}
              >
                <IconSymbol name="trash.fill" size={16} color={colors.error} />
                <Text className="text-error ml-1 text-sm">このパットを削除</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>

        {/* ナビゲーションボタン */}
        <View className="flex-row gap-3 p-4 border-t border-border">
          {currentHole > 1 && (
            <TouchableOpacity
              className="flex-1 py-3 rounded-xl border border-border items-center"
              onPress={() => saveHoleAndNavigate(currentHole - 1)}
            >
              <Text className="text-foreground font-medium">前のホール</Text>
            </TouchableOpacity>
          )}
          {currentHole < 18 ? (
            <TouchableOpacity
              className="flex-1 py-3 rounded-xl bg-primary items-center"
              onPress={() => saveHoleAndNavigate(currentHole + 1)}
            >
              <Text className="text-white font-medium">次のホール</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              className="flex-1 py-3 rounded-xl bg-success items-center"
              onPress={handleFinish}
            >
              <Text className="text-white font-medium">ラウンド終了</Text>
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
