import { useState, useEffect } from "react";
import {
  ScrollView,
  Text,
  View,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { getPutters, getCourses, saveRound } from "@/lib/storage";
import {
  Putter,
  GolfCourse,
  GrassType,
  GreenCondition,
  Weather,
  WindSpeed,
  RoundType,
  CompetitionFormat,
  Round,
  HoleData,
  LABELS,
} from "@/lib/types";

export default function NewRoundScreen() {
  const router = useRouter();
  const colors = useColors();

  const [step, setStep] = useState(1);
  const [putters, setPutters] = useState<Putter[]>([]);
  const [courses, setCourses] = useState<GolfCourse[]>([]);

  // Step 1: 日時・天気
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [weather, setWeather] = useState<Weather>("sunny");
  const [windSpeed, setWindSpeed] = useState<WindSpeed>("calm");
  const [temperature, setTemperature] = useState("");

  // Step 2: コース
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [courseName, setCourseName] = useState("");
  const [frontNineGreen, setFrontNineGreen] = useState("");
  const [backNineGreen, setBackNineGreen] = useState("");

  // Step 3: グリーン環境
  const [grassType, setGrassType] = useState<GrassType>("bent");
  const [stimpmeter, setStimpmeter] = useState("9.0");
  const [mowingHeight, setMowingHeight] = useState("");
  const [compaction, setCompaction] = useState("");
  const [greenCondition, setGreenCondition] = useState<GreenCondition>("good");

  // Step 4: ラウンド種別・パター
  const [roundType, setRoundType] = useState<RoundType>("private");
  const [competitionFormat, setCompetitionFormat] = useState<CompetitionFormat>("stroke");
  const [selectedPutterId, setSelectedPutterId] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      const [puttersData, coursesData] = await Promise.all([
        getPutters(),
        getCourses(),
      ]);
      setPutters(puttersData);
      setCourses(coursesData);
      if (puttersData.length > 0) {
        const acePutter = puttersData.find((p) => p.ranking === "ace");
        setSelectedPutterId(acePutter?.id || puttersData[0].id);
      }
    };
    loadData();
  }, []);

  const handleCourseSelect = (course: GolfCourse) => {
    setSelectedCourseId(course.id);
    setCourseName(course.name);
    if (course.greens.length > 0) {
      setFrontNineGreen(course.greens[0]);
      setBackNineGreen(course.greens[0]);
    }
  };

  const handleCreateRound = async () => {
    if (!courseName) {
      Alert.alert("エラー", "コース名を入力してください");
      return;
    }
    if (!selectedPutterId) {
      Alert.alert("エラー", "使用パターを選択してください");
      return;
    }

    const selectedPutter = putters.find((p) => p.id === selectedPutterId);

    // 空の18ホールデータを作成
    const emptyHoles: HoleData[] = Array.from({ length: 18 }, (_, i) => ({
      holeNumber: i + 1,
      scoreResult: "par",
      totalPutts: 2,
      putts: [],
    }));

    const roundData: Omit<Round, "id" | "createdAt" | "updatedAt"> = {
      date: new Date(date).toISOString(),
      weather,
      temperature: temperature ? parseFloat(temperature) : undefined,
      windSpeed,
      courseId: selectedCourseId || "",
      courseName,
      frontNineGreen,
      backNineGreen,
      roundType,
      competitionFormat,
      grassType,
      stimpmeter: parseFloat(stimpmeter) || 9.0,
      mowingHeight: mowingHeight ? parseFloat(mowingHeight) : undefined,
      compaction: compaction ? parseFloat(compaction) : undefined,
      greenCondition,
      putterId: selectedPutterId,
      putterName: selectedPutter
        ? `${selectedPutter.brandName} ${selectedPutter.productName}`
        : "",
      holes: emptyHoles,
      totalPutts: 36, // デフォルト値（後で更新）
    };

    try {
      const newRound = await saveRound(roundData);
      router.replace(`/hole-input/${newRound.id}` as any);
    } catch (error) {
      Alert.alert("エラー", "ラウンドの作成に失敗しました");
    }
  };

  const renderStep1 = () => (
    <View className="gap-4">
      <Text className="text-lg font-semibold text-foreground">日時・天気</Text>

      <View>
        <Text className="text-muted text-sm mb-2">日付</Text>
        <TextInput
          className="bg-background border border-border rounded-lg px-3 py-3 text-foreground"
          value={date}
          onChangeText={setDate}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={colors.muted}
        />
      </View>

      <View>
        <Text className="text-muted text-sm mb-2">天気</Text>
        <View className="flex-row flex-wrap gap-2">
          {(Object.keys(LABELS.weather) as Weather[]).map((w) => (
            <TouchableOpacity
              key={w}
              className={`px-4 py-2 rounded-lg border ${
                weather === w
                  ? "bg-primary border-primary"
                  : "bg-surface border-border"
              }`}
              onPress={() => setWeather(w)}
            >
              <Text
                className={weather === w ? "text-white" : "text-foreground"}
              >
                {LABELS.weather[w]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View>
        <Text className="text-muted text-sm mb-2">風速</Text>
        <View className="flex-row flex-wrap gap-2">
          {(Object.keys(LABELS.windSpeed) as WindSpeed[]).map((w) => (
            <TouchableOpacity
              key={w}
              className={`px-4 py-2 rounded-lg border ${
                windSpeed === w
                  ? "bg-primary border-primary"
                  : "bg-surface border-border"
              }`}
              onPress={() => setWindSpeed(w)}
            >
              <Text
                className={windSpeed === w ? "text-white" : "text-foreground"}
              >
                {LABELS.windSpeed[w]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View>
        <Text className="text-muted text-sm mb-2">気温（℃）</Text>
        <TextInput
          className="bg-background border border-border rounded-lg px-3 py-3 text-foreground"
          value={temperature}
          onChangeText={setTemperature}
          placeholder="25"
          placeholderTextColor={colors.muted}
          keyboardType="decimal-pad"
        />
      </View>
    </View>
  );

  const renderStep2 = () => (
    <View className="gap-4">
      <Text className="text-lg font-semibold text-foreground">コース情報</Text>

      {courses.length > 0 && (
        <View>
          <Text className="text-muted text-sm mb-2">登録コースから選択</Text>
          <View className="gap-2">
            {courses.map((course) => (
              <TouchableOpacity
                key={course.id}
                className={`p-3 rounded-lg border ${
                  selectedCourseId === course.id
                    ? "bg-primary/10 border-primary"
                    : "bg-surface border-border"
                }`}
                onPress={() => handleCourseSelect(course)}
              >
                <Text
                  className={
                    selectedCourseId === course.id
                      ? "text-primary font-medium"
                      : "text-foreground"
                  }
                >
                  {course.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      <View>
        <Text className="text-muted text-sm mb-2">コース名</Text>
        <TextInput
          className="bg-background border border-border rounded-lg px-3 py-3 text-foreground"
          value={courseName}
          onChangeText={(text) => {
            setCourseName(text);
            setSelectedCourseId(null);
          }}
          placeholder="ゴルフコース名"
          placeholderTextColor={colors.muted}
        />
      </View>

      <View className="flex-row gap-3">
        <View className="flex-1">
          <Text className="text-muted text-sm mb-2">使用グリーン（1-9H）</Text>
          <TextInput
            className="bg-background border border-border rounded-lg px-3 py-3 text-foreground"
            value={frontNineGreen}
            onChangeText={setFrontNineGreen}
            placeholder="A"
            placeholderTextColor={colors.muted}
          />
        </View>
        <View className="flex-1">
          <Text className="text-muted text-sm mb-2">使用グリーン（10-18H）</Text>
          <TextInput
            className="bg-background border border-border rounded-lg px-3 py-3 text-foreground"
            value={backNineGreen}
            onChangeText={setBackNineGreen}
            placeholder="A"
            placeholderTextColor={colors.muted}
          />
        </View>
      </View>
    </View>
  );

  const renderStep3 = () => (
    <View className="gap-4">
      <Text className="text-lg font-semibold text-foreground">グリーン環境</Text>

      <View>
        <Text className="text-muted text-sm mb-2">芝の種類</Text>
        <View className="flex-row flex-wrap gap-2">
          {(Object.keys(LABELS.grassType) as GrassType[]).map((g) => (
            <TouchableOpacity
              key={g}
              className={`px-4 py-2 rounded-lg border ${
                grassType === g
                  ? "bg-primary border-primary"
                  : "bg-surface border-border"
              }`}
              onPress={() => setGrassType(g)}
            >
              <Text
                className={grassType === g ? "text-white" : "text-foreground"}
              >
                {LABELS.grassType[g]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View>
        <Text className="text-muted text-sm mb-2">スティンプメーター（フィート）</Text>
        <TextInput
          className="bg-background border border-border rounded-lg px-3 py-3 text-foreground"
          value={stimpmeter}
          onChangeText={setStimpmeter}
          placeholder="9.0"
          placeholderTextColor={colors.muted}
          keyboardType="decimal-pad"
        />
      </View>

      <View className="flex-row gap-3">
        <View className="flex-1">
          <Text className="text-muted text-sm mb-2">刈り高（mm）</Text>
          <TextInput
            className="bg-background border border-border rounded-lg px-3 py-3 text-foreground"
            value={mowingHeight}
            onChangeText={setMowingHeight}
            placeholder="3.3"
            placeholderTextColor={colors.muted}
            keyboardType="decimal-pad"
          />
        </View>
        <View className="flex-1">
          <Text className="text-muted text-sm mb-2">コンパクション</Text>
          <TextInput
            className="bg-background border border-border rounded-lg px-3 py-3 text-foreground"
            value={compaction}
            onChangeText={setCompaction}
            placeholder=""
            placeholderTextColor={colors.muted}
            keyboardType="decimal-pad"
          />
        </View>
      </View>

      <View>
        <Text className="text-muted text-sm mb-2">グリーンコンディション</Text>
        <View className="flex-row gap-2">
          {(Object.keys(LABELS.greenCondition) as GreenCondition[]).map((c) => (
            <TouchableOpacity
              key={c}
              className={`flex-1 py-3 rounded-lg border items-center ${
                greenCondition === c
                  ? "bg-primary border-primary"
                  : "bg-surface border-border"
              }`}
              onPress={() => setGreenCondition(c)}
            >
              <Text
                className={
                  greenCondition === c ? "text-white font-medium" : "text-foreground"
                }
              >
                {LABELS.greenCondition[c]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );

  const renderStep4 = () => (
    <View className="gap-4">
      <Text className="text-lg font-semibold text-foreground">
        ラウンド種別・使用パター
      </Text>

      <View>
        <Text className="text-muted text-sm mb-2">ラウンド種別</Text>
        <View className="flex-row flex-wrap gap-2">
          {(Object.keys(LABELS.roundType) as RoundType[]).map((r) => (
            <TouchableOpacity
              key={r}
              className={`px-4 py-2 rounded-lg border ${
                roundType === r
                  ? "bg-primary border-primary"
                  : "bg-surface border-border"
              }`}
              onPress={() => setRoundType(r)}
            >
              <Text
                className={roundType === r ? "text-white" : "text-foreground"}
              >
                {LABELS.roundType[r]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View>
        <Text className="text-muted text-sm mb-2">競技形式</Text>
        <View className="flex-row gap-2">
          {(Object.keys(LABELS.competitionFormat) as CompetitionFormat[]).map(
            (f) => (
              <TouchableOpacity
                key={f}
                className={`flex-1 py-3 rounded-lg border items-center ${
                  competitionFormat === f
                    ? "bg-primary border-primary"
                    : "bg-surface border-border"
                }`}
                onPress={() => setCompetitionFormat(f)}
              >
                <Text
                  className={
                    competitionFormat === f ? "text-white" : "text-foreground"
                  }
                >
                  {LABELS.competitionFormat[f]}
                </Text>
              </TouchableOpacity>
            )
          )}
        </View>
      </View>

      <View>
        <Text className="text-muted text-sm mb-2">使用パター</Text>
        {putters.length > 0 ? (
          <View className="gap-2">
            {putters.map((putter) => (
              <TouchableOpacity
                key={putter.id}
                className={`p-3 rounded-lg border ${
                  selectedPutterId === putter.id
                    ? "bg-primary/10 border-primary"
                    : "bg-surface border-border"
                }`}
                onPress={() => setSelectedPutterId(putter.id)}
              >
                <View className="flex-row items-center justify-between">
                  <Text
                    className={
                      selectedPutterId === putter.id
                        ? "text-primary font-medium"
                        : "text-foreground"
                    }
                  >
                    {putter.brandName} {putter.productName}
                  </Text>
                  <View className="bg-border px-2 py-0.5 rounded">
                    <Text className="text-muted text-xs">
                      {LABELS.putterRanking[putter.ranking]}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <View className="bg-surface border border-border rounded-lg p-4 items-center">
            <Text className="text-muted">パターが登録されていません</Text>
            <TouchableOpacity
              className="mt-2"
              onPress={() => router.push("/putter-form" as any)}
            >
              <Text className="text-primary">パターを登録する</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );

  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        {/* ヘッダー */}
        <View className="flex-row items-center justify-between p-4 border-b border-border">
          <TouchableOpacity onPress={() => router.back()}>
            <IconSymbol name="arrow.left" size={24} color={colors.foreground} />
          </TouchableOpacity>
          <Text className="text-lg font-semibold text-foreground">
            新規ラウンド
          </Text>
          <View style={{ width: 24 }} />
        </View>

        {/* ステップインジケーター */}
        <View className="flex-row justify-center gap-2 py-4">
          {[1, 2, 3, 4].map((s) => (
            <View
              key={s}
              className={`w-2 h-2 rounded-full ${
                s === step ? "bg-primary" : s < step ? "bg-primary/50" : "bg-border"
              }`}
            />
          ))}
        </View>

        <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 16 }}>
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
          {step === 4 && renderStep4()}
        </ScrollView>

        {/* ナビゲーションボタン */}
        <View className="flex-row gap-3 p-4 border-t border-border">
          {step > 1 && (
            <TouchableOpacity
              className="flex-1 py-3 rounded-xl border border-border items-center"
              onPress={() => setStep(step - 1)}
            >
              <Text className="text-foreground font-medium">戻る</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            className="flex-1 py-3 rounded-xl bg-primary items-center"
            onPress={() => {
              if (step < 4) {
                setStep(step + 1);
              } else {
                handleCreateRound();
              }
            }}
          >
            <Text className="text-white font-medium">
              {step < 4 ? "次へ" : "ラウンド開始"}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
