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
import { useRouter, useLocalSearchParams } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { getPutters, savePutter, updatePutter } from "@/lib/storage";
import { LABELS } from "@/lib/types";

type PutterRanking = "ace" | "2nd" | "3rd" | "4th" | "5th";

export default function PutterFormScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const colors = useColors();

  const [isEditing, setIsEditing] = useState(false);
  const [brandName, setBrandName] = useState("");
  const [productName, setProductName] = useState("");
  const [length, setLength] = useState("");
  const [lieAngle, setLieAngle] = useState("");
  const [weight, setWeight] = useState("");
  const [gripName, setGripName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [ranking, setRanking] = useState<PutterRanking>("ace");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (id) {
      setIsEditing(true);
      loadPutter(id);
    }
  }, [id]);

  const loadPutter = async (putterId: string) => {
    const putters = await getPutters();
    const putter = putters.find((p) => p.id === putterId);
    if (putter) {
      setBrandName(putter.brandName);
      setProductName(putter.productName);
      setLength(putter.length.toString());
      setLieAngle(putter.lieAngle.toString());
      setWeight(putter.weight.toString());
      setGripName(putter.gripName);
      setStartDate(putter.startDate);
      setRanking(putter.ranking);
    }
  };

  const handleSave = async () => {
    // バリデーション
    if (!brandName.trim()) {
      Alert.alert("入力エラー", "ブランド名を入力してください");
      return;
    }
    if (!productName.trim()) {
      Alert.alert("入力エラー", "商品名を入力してください");
      return;
    }

    setIsSaving(true);

    const putterData = {
      brandName: brandName.trim(),
      productName: productName.trim(),
      length: parseFloat(length) || 34,
      lieAngle: parseFloat(lieAngle) || 70,
      weight: parseFloat(weight) || 350,
      gripName: gripName.trim(),
      startDate: startDate || new Date().toISOString().split("T")[0],
      usageCount: 0,
      ranking,
    };

    try {
      if (isEditing && id) {
        await updatePutter(id, putterData);
        Alert.alert("完了", "パターを更新しました", [
          { text: "OK", onPress: () => router.back() },
        ]);
      } else {
        await savePutter(putterData);
        Alert.alert("完了", "パターを登録しました", [
          { text: "OK", onPress: () => router.back() },
        ]);
      }
    } catch (error) {
      console.error("Save error:", error);
      Alert.alert("エラー", "保存に失敗しました。もう一度お試しください。");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        {/* ヘッダー */}
        <View className="flex-row items-center justify-between p-4 border-b border-border bg-surface">
          <TouchableOpacity 
            onPress={() => router.back()}
            className="p-2 -ml-2"
          >
            <IconSymbol name="arrow.left" size={24} color={colors.foreground} />
          </TouchableOpacity>
          <Text className="text-lg font-bold text-foreground">
            {isEditing ? "パター編集" : "パター登録"}
          </Text>
          <TouchableOpacity 
            onPress={handleSave}
            disabled={isSaving}
            className="bg-primary px-4 py-2 rounded-lg"
            style={{ opacity: isSaving ? 0.5 : 1 }}
          >
            <Text className="text-white font-semibold">
              {isSaving ? "保存中..." : "保存"}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView 
          contentContainerStyle={{ flexGrow: 1, padding: 16 }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="gap-5">
            {/* 必須項目セクション */}
            <View className="bg-surface rounded-2xl p-4 border border-border">
              <Text className="text-base font-semibold text-foreground mb-4">
                基本情報（必須）
              </Text>
              
              <View className="gap-4">
                <View>
                  <Text className="text-muted text-sm mb-2">ブランド名 *</Text>
                  <TextInput
                    className="bg-background border border-border rounded-xl px-4 py-3 text-foreground text-base"
                    value={brandName}
                    onChangeText={setBrandName}
                    placeholder="例: Scotty Cameron"
                    placeholderTextColor={colors.muted}
                    returnKeyType="next"
                    autoCapitalize="words"
                  />
                </View>

                <View>
                  <Text className="text-muted text-sm mb-2">商品名 *</Text>
                  <TextInput
                    className="bg-background border border-border rounded-xl px-4 py-3 text-foreground text-base"
                    value={productName}
                    onChangeText={setProductName}
                    placeholder="例: Newport 2"
                    placeholderTextColor={colors.muted}
                    returnKeyType="next"
                    autoCapitalize="words"
                  />
                </View>
              </View>
            </View>

            {/* スペックセクション */}
            <View className="bg-surface rounded-2xl p-4 border border-border">
              <Text className="text-base font-semibold text-foreground mb-4">
                スペック（任意）
              </Text>
              
              <View className="gap-4">
                <View className="flex-row gap-3">
                  <View className="flex-1">
                    <Text className="text-muted text-sm mb-2">長さ（インチ）</Text>
                    <TextInput
                      className="bg-background border border-border rounded-xl px-4 py-3 text-foreground text-base"
                      value={length}
                      onChangeText={setLength}
                      placeholder="34"
                      placeholderTextColor={colors.muted}
                      keyboardType="decimal-pad"
                      returnKeyType="done"
                    />
                  </View>
                  <View className="flex-1">
                    <Text className="text-muted text-sm mb-2">ライ角（度）</Text>
                    <TextInput
                      className="bg-background border border-border rounded-xl px-4 py-3 text-foreground text-base"
                      value={lieAngle}
                      onChangeText={setLieAngle}
                      placeholder="70"
                      placeholderTextColor={colors.muted}
                      keyboardType="decimal-pad"
                      returnKeyType="done"
                    />
                  </View>
                </View>

                <View className="flex-row gap-3">
                  <View className="flex-1">
                    <Text className="text-muted text-sm mb-2">重量（g）</Text>
                    <TextInput
                      className="bg-background border border-border rounded-xl px-4 py-3 text-foreground text-base"
                      value={weight}
                      onChangeText={setWeight}
                      placeholder="350"
                      placeholderTextColor={colors.muted}
                      keyboardType="decimal-pad"
                      returnKeyType="done"
                    />
                  </View>
                  <View className="flex-1">
                    <Text className="text-muted text-sm mb-2">グリップ</Text>
                    <TextInput
                      className="bg-background border border-border rounded-xl px-4 py-3 text-foreground text-base"
                      value={gripName}
                      onChangeText={setGripName}
                      placeholder="SuperStroke"
                      placeholderTextColor={colors.muted}
                      returnKeyType="done"
                    />
                  </View>
                </View>

                <View>
                  <Text className="text-muted text-sm mb-2">使用開始日</Text>
                  <TextInput
                    className="bg-background border border-border rounded-xl px-4 py-3 text-foreground text-base"
                    value={startDate}
                    onChangeText={setStartDate}
                    placeholder="YYYY-MM-DD（例: 2024-01-01）"
                    placeholderTextColor={colors.muted}
                    returnKeyType="done"
                  />
                </View>
              </View>
            </View>

            {/* 位置づけセクション */}
            <View className="bg-surface rounded-2xl p-4 border border-border">
              <Text className="text-base font-semibold text-foreground mb-4">
                位置づけ
              </Text>
              <Text className="text-muted text-sm mb-3">
                このパターの使用優先度を選択してください
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {(Object.keys(LABELS.putterRanking) as PutterRanking[]).map(
                  (r) => (
                    <TouchableOpacity
                      key={r}
                      className={`px-5 py-3 rounded-xl border-2 ${
                        ranking === r
                          ? "bg-primary border-primary"
                          : "bg-background border-border"
                      }`}
                      onPress={() => setRanking(r)}
                      activeOpacity={0.7}
                    >
                      <Text
                        className={`font-medium ${
                          ranking === r ? "text-white" : "text-foreground"
                        }`}
                      >
                        {LABELS.putterRanking[r]}
                      </Text>
                    </TouchableOpacity>
                  )
                )}
              </View>
            </View>

            {/* 下部の余白 */}
            <View className="h-8" />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
