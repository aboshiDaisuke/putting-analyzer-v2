import { useCallback, useState } from "react";
import {
  ScrollView,
  Text,
  View,
  TouchableOpacity,
  TextInput,
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
  deleteAllRounds,
} from "@/lib/storage";
import { UserProfile, Putter, GolfCourse, LABELS } from "@/lib/types";
import { supabase } from "@/lib/supabase";

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
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showDeletePutterConfirm, setShowDeletePutterConfirm] = useState<string | null>(null);
  const [showDeleteCourseConfirm, setShowDeleteCourseConfirm] = useState<string | null>(null);
  const [showDeleteAllRoundsConfirm, setShowDeleteAllRoundsConfirm] = useState(false);
  const [isDeletingAllRounds, setIsDeletingAllRounds] = useState(false);

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

  const handleConfirmDeletePutter = async (putterId: string) => {
    await deletePutter(putterId);
    setShowDeletePutterConfirm(null);
    loadData();
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setShowLogoutConfirm(false);
  };

  const handleConfirmDeleteCourse = async (courseId: string) => {
    await deleteCourse(courseId);
    setShowDeleteCourseConfirm(null);
    loadData();
  };

  const handleConfirmDeleteAllRounds = async () => {
    setIsDeletingAllRounds(true);
    try {
      await deleteAllRounds();
      setShowDeleteAllRoundsConfirm(false);
    } finally {
      setIsDeletingAllRounds(false);
    }
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
                    <View key={putter.id}>
                      <View
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
                            onPress={() =>
                              setShowDeletePutterConfirm(
                                showDeletePutterConfirm === putter.id ? null : putter.id
                              )
                            }
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
                      {showDeletePutterConfirm === putter.id && (
                        <View style={{ backgroundColor: "#fee2e2", borderRadius: 8, padding: 12, marginTop: 8 }}>
                          <Text style={{ color: "#991b1b", fontSize: 13, marginBottom: 8 }}>削除しますか？</Text>
                          <View style={{ flexDirection: "row", gap: 8 }}>
                            <TouchableOpacity
                              onPress={() => setShowDeletePutterConfirm(null)}
                              style={{ flex: 1, padding: 8, borderWidth: 1, borderColor: "#d1d5db", borderRadius: 6, alignItems: "center" }}
                            >
                              <Text>キャンセル</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => handleConfirmDeletePutter(putter.id)}
                              style={{ flex: 1, padding: 8, backgroundColor: "#dc2626", borderRadius: 6, alignItems: "center" }}
                            >
                              <Text style={{ color: "white" }}>削除</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      )}
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
                    <View key={course.id}>
                      <View
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
                        <TouchableOpacity
                          onPress={() =>
                            setShowDeleteCourseConfirm(
                              showDeleteCourseConfirm === course.id ? null : course.id
                            )
                          }
                        >
                          <IconSymbol
                            name="trash.fill"
                            size={20}
                            color={colors.error}
                          />
                        </TouchableOpacity>
                      </View>
                      {showDeleteCourseConfirm === course.id && (
                        <View style={{ backgroundColor: "#fee2e2", borderRadius: 8, padding: 12, marginTop: 8 }}>
                          <Text style={{ color: "#991b1b", fontSize: 13, marginBottom: 8 }}>削除しますか？</Text>
                          <View style={{ flexDirection: "row", gap: 8 }}>
                            <TouchableOpacity
                              onPress={() => setShowDeleteCourseConfirm(null)}
                              style={{ flex: 1, padding: 8, borderWidth: 1, borderColor: "#d1d5db", borderRadius: 6, alignItems: "center" }}
                            >
                              <Text>キャンセル</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => handleConfirmDeleteCourse(course.id)}
                              style={{ flex: 1, padding: 8, backgroundColor: "#dc2626", borderRadius: 6, alignItems: "center" }}
                            >
                              <Text style={{ color: "white" }}>削除</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              ) : (
                <Text className="text-muted text-center py-4">
                  コースが登録されていません
                </Text>
              )}
            </View>

            {/* 全ラウンドデータを削除 */}
            {showDeleteAllRoundsConfirm ? (
              <View className="bg-surface rounded-2xl p-4 border border-border gap-3" style={{ borderColor: "#dc2626" }}>
                <Text className="text-foreground font-semibold text-center">
                  全ラウンドデータを削除しますか？
                </Text>
                <Text className="text-muted text-sm text-center">
                  全てのラウンド・ホール・パット記録が削除されます。この操作は元に戻せません。
                </Text>
                <View className="flex-row gap-3">
                  <TouchableOpacity
                    onPress={() => setShowDeleteAllRoundsConfirm(false)}
                    className="flex-1 border border-border rounded-xl py-3 items-center"
                    activeOpacity={0.7}
                    disabled={isDeletingAllRounds}
                  >
                    <Text className="text-foreground font-medium">キャンセル</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleConfirmDeleteAllRounds}
                    className="flex-1 rounded-xl py-3 items-center"
                    style={{ backgroundColor: colors.error, opacity: isDeletingAllRounds ? 0.6 : 1 }}
                    activeOpacity={0.7}
                    disabled={isDeletingAllRounds}
                  >
                    <Text className="text-white font-medium">
                      {isDeletingAllRounds ? "削除中..." : "全て削除"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                onPress={() => setShowDeleteAllRoundsConfirm(true)}
                className="bg-surface rounded-2xl p-4 border border-border flex-row items-center justify-center gap-2"
                activeOpacity={0.7}
              >
                <IconSymbol name="trash.fill" size={20} color={colors.error} />
                <Text style={{ color: colors.error }} className="font-semibold text-base">
                  全ラウンドデータを削除
                </Text>
              </TouchableOpacity>
            )}

            {/* ログアウト */}
            {showLogoutConfirm ? (
              <View className="bg-surface rounded-2xl p-4 border border-border gap-3">
                <Text className="text-foreground font-semibold text-center">ログアウトしますか？</Text>
                <View className="flex-row gap-3">
                  <TouchableOpacity
                    onPress={() => setShowLogoutConfirm(false)}
                    className="flex-1 border border-border rounded-xl py-3 items-center"
                    activeOpacity={0.7}
                  >
                    <Text className="text-foreground font-medium">キャンセル</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleLogout}
                    className="flex-1 rounded-xl py-3 items-center"
                    style={{ backgroundColor: colors.error }}
                    activeOpacity={0.7}
                  >
                    <Text className="text-white font-medium">ログアウト</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                onPress={() => setShowLogoutConfirm(true)}
                className="bg-surface rounded-2xl p-4 border border-border flex-row items-center justify-center gap-2"
                activeOpacity={0.7}
              >
                <IconSymbol name="rectangle.portrait.and.arrow.right" size={20} color={colors.error} />
                <Text style={{ color: colors.error }} className="font-semibold text-base">
                  ログアウト
                </Text>
              </TouchableOpacity>
            )}

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
