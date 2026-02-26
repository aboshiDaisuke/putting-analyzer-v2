import { useCallback, useState } from "react";
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
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";

import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import {
  getUserProfile,
  saveUserProfile,
  getPutters,
  deletePutter,
  getCourses,
  deleteCourse,
} from "@/lib/storage";
import { UserProfile, Putter, GolfCourse, LABELS } from "@/lib/types";

export default function ProfileScreen() {
  const router = useRouter();
  const colors = useColors();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [putters, setPutters] = useState<Putter[]>([]);
  const [courses, setCourses] = useState<GolfCourse[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editHandicap, setEditHandicap] = useState("");
  const [editStrideLength, setEditStrideLength] = useState("");

  const loadData = useCallback(async () => {
    const [profileData, puttersData, coursesData] = await Promise.all([
      getUserProfile(),
      getPutters(),
      getCourses(),
    ]);
    setProfile(profileData);
    setPutters(puttersData);
    setCourses(coursesData);
    if (profileData) {
      setEditName(profileData.name);
      setEditHandicap(profileData.handicap.toString());
      setEditStrideLength(profileData.strideLength.toString());
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handleSaveProfile = async () => {
    const updated = await saveUserProfile({
      name: editName,
      handicap: parseFloat(editHandicap) || 0,
      strideLength: parseFloat(editStrideLength) || 0.7,
    });
    setProfile(updated);
    setIsEditing(false);
  };

  const handleDeletePutter = (putter: Putter) => {
    Alert.alert(
      "パターを削除",
      `${putter.brandName} ${putter.productName}を削除しますか？`,
      [
        { text: "キャンセル", style: "cancel" },
        {
          text: "削除",
          style: "destructive",
          onPress: async () => {
            await deletePutter(putter.id);
            loadData();
          },
        },
      ]
    );
  };

  const handleDeleteCourse = (course: GolfCourse) => {
    Alert.alert("コースを削除", `${course.name}を削除しますか？`, [
      { text: "キャンセル", style: "cancel" },
      {
        text: "削除",
        style: "destructive",
        onPress: async () => {
          await deleteCourse(course.id);
          loadData();
        },
      },
    ]);
  };

  return (
    <ScreenContainer>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
          <View className="p-4 gap-4">
            <Text className="text-2xl font-bold text-foreground">プロフィール</Text>

            {/* ユーザー情報 */}
            <View className="bg-surface rounded-2xl p-4 border border-border">
              <View className="flex-row items-center justify-between mb-4">
                <Text className="text-lg font-semibold text-foreground">
                  基本情報
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    if (isEditing) {
                      handleSaveProfile();
                    } else {
                      setIsEditing(true);
                    }
                  }}
                >
                  <Text className="text-primary font-medium">
                    {isEditing ? "保存" : "編集"}
                  </Text>
                </TouchableOpacity>
              </View>

              {isEditing ? (
                <View className="gap-4">
                  <View>
                    <Text className="text-muted text-sm mb-1">名前</Text>
                    <TextInput
                      className="bg-background border border-border rounded-lg px-3 py-2 text-foreground"
                      value={editName}
                      onChangeText={setEditName}
                      placeholder="名前を入力"
                      placeholderTextColor={colors.muted}
                      returnKeyType="done"
                    />
                  </View>
                  <View>
                    <Text className="text-muted text-sm mb-1">ハンディキャップ</Text>
                    <TextInput
                      className="bg-background border border-border rounded-lg px-3 py-2 text-foreground"
                      value={editHandicap}
                      onChangeText={setEditHandicap}
                      placeholder="0"
                      placeholderTextColor={colors.muted}
                      keyboardType="decimal-pad"
                      returnKeyType="done"
                    />
                  </View>
                  <View>
                    <Text className="text-muted text-sm mb-1">歩幅（メートル）</Text>
                    <TextInput
                      className="bg-background border border-border rounded-lg px-3 py-2 text-foreground"
                      value={editStrideLength}
                      onChangeText={setEditStrideLength}
                      placeholder="0.7"
                      placeholderTextColor={colors.muted}
                      keyboardType="decimal-pad"
                      returnKeyType="done"
                    />
                    <Text className="text-muted text-xs mt-1">
                      歩数から距離を計算するために使用します
                    </Text>
                  </View>
                </View>
              ) : (
                <View className="gap-3">
                  <InfoRow label="名前" value={profile?.name || "未設定"} />
                  <InfoRow
                    label="ハンディキャップ"
                    value={profile?.handicap?.toString() || "未設定"}
                  />
                  <InfoRow
                    label="歩幅"
                    value={profile?.strideLength ? `${profile.strideLength}m` : "未設定"}
                  />
                </View>
              )}
            </View>

            {/* マイパター */}
            <View className="bg-surface rounded-2xl p-4 border border-border">
              <View className="flex-row items-center justify-between mb-4">
                <Text className="text-lg font-semibold text-foreground">
                  マイパター
                </Text>
                <TouchableOpacity
                  onPress={() => router.push("/putter-form" as any)}
                  className="bg-primary rounded-full px-3 py-1.5 flex-row items-center gap-1"
                  activeOpacity={0.7}
                >
                  <IconSymbol name="plus" size={16} color="#FFFFFF" />
                  <Text className="text-white text-sm font-medium">追加</Text>
                </TouchableOpacity>
              </View>

              {putters.length > 0 ? (
                <View className="gap-3">
                  {putters.map((putter) => (
                    <View
                      key={putter.id}
                      className="flex-row items-center justify-between py-3 border-b border-border"
                    >
                      <View className="flex-1">
                        <View className="flex-row items-center gap-2 flex-wrap">
                          <Text className="text-foreground font-medium">
                            {putter.brandName} {putter.productName}
                          </Text>
                          <View className="bg-primary/20 px-2 py-0.5 rounded">
                            <Text className="text-primary text-xs font-medium">
                              {LABELS.putterRanking[putter.ranking]}
                            </Text>
                          </View>
                        </View>
                        <Text className="text-muted text-sm mt-1">
                          {putter.length}" / {putter.weight}g
                        </Text>
                      </View>
                      <View className="flex-row gap-3 ml-2">
                        <TouchableOpacity
                          onPress={() =>
                            router.push(`/putter-form?id=${putter.id}` as any)
                          }
                          className="p-2"
                        >
                          <IconSymbol
                            name="pencil"
                            size={20}
                            color={colors.primary}
                          />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleDeletePutter(putter)}
                          className="p-2"
                        >
                          <IconSymbol
                            name="trash.fill"
                            size={20}
                            color={colors.error}
                          />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <View className="py-6 items-center">
                  <Text className="text-muted text-center mb-3">
                    パターが登録されていません
                  </Text>
                  <TouchableOpacity
                    onPress={() => router.push("/putter-form" as any)}
                    className="bg-primary/10 border border-primary rounded-xl px-4 py-2"
                    activeOpacity={0.7}
                  >
                    <Text className="text-primary font-medium">最初のパターを登録する</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* 登録コース */}
            <View className="bg-surface rounded-2xl p-4 border border-border">
              <View className="flex-row items-center justify-between mb-4">
                <Text className="text-lg font-semibold text-foreground">
                  登録コース
                </Text>
                <TouchableOpacity
                  onPress={() => router.push("/course-form" as any)}
                  className="bg-primary rounded-full p-1"
                >
                  <IconSymbol name="plus" size={20} color="#FFFFFF" />
                </TouchableOpacity>
              </View>

              {courses.length > 0 ? (
                <View className="gap-2">
                  {courses.map((course) => (
                    <View
                      key={course.id}
                      className="flex-row items-center justify-between py-2 border-b border-border"
                    >
                      <View className="flex-1">
                        <Text className="text-foreground">{course.name}</Text>
                        {course.greens.length > 0 && (
                          <Text className="text-muted text-sm">
                            グリーン: {course.greens.join(", ")}
                          </Text>
                        )}
                      </View>
                      <TouchableOpacity onPress={() => handleDeleteCourse(course)}>
                        <IconSymbol
                          name="trash.fill"
                          size={20}
                          color={colors.error}
                        />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              ) : (
                <Text className="text-muted text-center py-4">
                  コースが登録されていません
                </Text>
              )}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between">
      <Text className="text-muted">{label}</Text>
      <Text className="text-foreground font-medium">{value}</Text>
    </View>
  );
}
