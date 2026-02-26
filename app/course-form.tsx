import { useState } from "react";
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
import { saveCourse } from "@/lib/storage";

export default function CourseFormScreen() {
  const router = useRouter();
  const colors = useColors();

  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [greens, setGreens] = useState<string[]>(["A"]);
  const [newGreen, setNewGreen] = useState("");

  const addGreen = () => {
    if (newGreen.trim() && !greens.includes(newGreen.trim())) {
      setGreens([...greens, newGreen.trim()]);
      setNewGreen("");
    }
  };

  const removeGreen = (green: string) => {
    setGreens(greens.filter((g) => g !== green));
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert("エラー", "コース名は必須です");
      return;
    }

    try {
      await saveCourse({
        name: name.trim(),
        location: location.trim() || undefined,
        greens,
      });
      router.back();
    } catch (error) {
      Alert.alert("エラー", "保存に失敗しました");
    }
  };

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
            コース登録
          </Text>
          <TouchableOpacity onPress={handleSave}>
            <Text className="text-primary font-medium">保存</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 16 }}>
          <View className="gap-4">
            <View>
              <Text className="text-muted text-sm mb-2">コース名 *</Text>
              <TextInput
                className="bg-surface border border-border rounded-lg px-3 py-3 text-foreground"
                value={name}
                onChangeText={setName}
                placeholder="例: ○○カントリークラブ"
                placeholderTextColor={colors.muted}
              />
            </View>

            <View>
              <Text className="text-muted text-sm mb-2">所在地</Text>
              <TextInput
                className="bg-surface border border-border rounded-lg px-3 py-3 text-foreground"
                value={location}
                onChangeText={setLocation}
                placeholder="例: 東京都○○市"
                placeholderTextColor={colors.muted}
              />
            </View>

            <View>
              <Text className="text-muted text-sm mb-2">グリーン</Text>
              <View className="flex-row flex-wrap gap-2 mb-3">
                {greens.map((green) => (
                  <View
                    key={green}
                    className="flex-row items-center bg-primary/20 px-3 py-1 rounded-full"
                  >
                    <Text className="text-primary">{green}</Text>
                    <TouchableOpacity
                      onPress={() => removeGreen(green)}
                      className="ml-2"
                    >
                      <IconSymbol
                        name="xmark.circle.fill"
                        size={16}
                        color={colors.primary}
                      />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
              <View className="flex-row gap-2">
                <TextInput
                  className="flex-1 bg-surface border border-border rounded-lg px-3 py-3 text-foreground"
                  value={newGreen}
                  onChangeText={setNewGreen}
                  placeholder="グリーン名（例: B）"
                  placeholderTextColor={colors.muted}
                  returnKeyType="done"
                  onSubmitEditing={addGreen}
                />
                <TouchableOpacity
                  className="bg-primary px-4 rounded-lg items-center justify-center"
                  onPress={addGreen}
                >
                  <IconSymbol name="plus" size={20} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
