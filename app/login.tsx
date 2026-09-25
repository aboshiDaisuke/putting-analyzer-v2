import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Linking from "expo-linking";
import { supabase } from "@/lib/supabase";
import { setDemoMode } from "@/lib/demo-mode";
import { useColors } from "@/hooks/use-colors";
import { ErrorBanner } from "@/components/ui/error-banner";
import { shadowLg, shadowPrimary } from "@/lib/card-shadow";
import { GreenScene } from "@/components/green/green-scene";
import { STAGE } from "@/components/green/green-types";

type Mode = "signin" | "signup";

export default function LoginScreen() {
  const colors = useColors();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      setError("メールアドレスとパスワードを入力してください");
      return;
    }
    setLoading(true);
    setMessage(null);
    setError(null);
    try {
      if (mode === "signup") {
        const { error: err } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (err) {
          setError(err.message);
        } else {
          setMessage("確認メールを送信しました。メールを確認してアカウントを有効化してください。");
        }
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (err) {
          setError(err.message);
        }
        // On success, useAuth in _layout.tsx will redirect automatically
      }
    } catch (e) {
      setError("ネットワークエラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      // Web: 同一オリジンの /oauth/callback。ネイティブ: app.config.ts の scheme から生成
      // （例: puttinganalyzer://oauth/callback）。文字列を直書きするとスキーム変更時にずれる。
      const redirectTo =
        Platform.OS === "web" && typeof window !== "undefined"
          ? `${window.location.origin}/oauth/callback`
          : Linking.createURL("oauth/callback");
      const { error: err } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });
      if (err) setError(err.message);
    } catch {
      setError("Googleログインに失敗しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* ヒーロー: 3D グリーン */}
          <View style={{ borderRadius: 26, overflow: "hidden", marginBottom: 20, maxWidth: 480, width: "100%", alignSelf: "center" }}>
            <GreenScene mode="hero" height={230} radius={0} accessibilityLabel="グリーン上でボールがカップに入るアニメーション" />
            <View pointerEvents="none" style={{ position: "absolute", left: 20, top: 18, right: 20 }}>
              <Text style={{ fontSize: 28, fontWeight: "900", color: STAGE.text, letterSpacing: -0.4 }}>パッティング分析</Text>
              <Text style={{ fontSize: 15, color: STAGE.textMuted, marginTop: 4, lineHeight: 21 }}>
                カードに書いて撮るだけ。{"\n"}どこで何打失っているかが分かる
              </Text>
            </View>
          </View>

          {/* Card */}
          <View
            style={[
              {
                backgroundColor: colors.surface,
                borderRadius: 24,
                padding: 24,
                maxWidth: 480,
                width: "100%",
                alignSelf: "center",
                borderWidth: 1,
                borderColor: colors.border,
              },
              shadowLg,
            ]}
          >
            {/* Mode toggle */}
            <View
              style={{
                flexDirection: "row",
                backgroundColor: colors.background,
                borderRadius: 8,
                padding: 4,
                marginBottom: 24,
              }}
            >
              {(["signin", "signup"] as Mode[]).map((m) => (
                <TouchableOpacity
                  key={m}
                  onPress={() => { setMode(m); setMessage(null); }}
                  style={{
                    flex: 1,
                    paddingVertical: 8,
                    borderRadius: 6,
                    alignItems: "center",
                    backgroundColor: mode === m ? colors.tint : "transparent",
                  }}
                >
                  <Text
                    style={{
                      fontWeight: "600",
                      color: mode === m ? colors.onPrimary : colors.muted,
                    }}
                  >
                    {m === "signin" ? "ログイン" : "新規登録"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Email */}
            <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 6 }}>
              メールアドレス
            </Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="example@email.com"
              placeholderTextColor={colors.muted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              style={{
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 10,
                paddingHorizontal: 14,
                paddingVertical: 12,
                fontSize: 16,
                color: colors.text,
                backgroundColor: colors.background,
                marginBottom: 16,
              }}
            />

            {/* Password */}
            <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 6 }}>
              パスワード
            </Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="6文字以上"
              placeholderTextColor={colors.muted}
              secureTextEntry
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              style={{
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 10,
                paddingHorizontal: 14,
                paddingVertical: 12,
                fontSize: 16,
                color: colors.text,
                backgroundColor: colors.background,
                marginBottom: 20,
              }}
            />

            {/* Error */}
            {error && <ErrorBanner message={error} style={{ marginBottom: 16 }} />}

            {/* Success Message */}
            {message && (
              <View
                style={{
                  backgroundColor: "#d1fae5",
                  borderRadius: 8,
                  padding: 12,
                  marginBottom: 16,
                }}
              >
                <Text style={{ color: "#065f46", fontSize: 13 }}>{message}</Text>
              </View>
            )}

            {/* Submit button */}
            <TouchableOpacity
              onPress={handleSubmit}
              disabled={loading}
              style={[
                {
                  backgroundColor: colors.tint,
                  borderRadius: 14,
                  paddingVertical: 15,
                  alignItems: "center",
                  marginBottom: 16,
                  opacity: loading ? 0.7 : 1,
                },
                shadowPrimary,
              ]}
            >
              {loading ? (
                <ActivityIndicator color={colors.onPrimary} />
              ) : (
                <Text style={{ color: colors.onPrimary, fontWeight: "bold", fontSize: 16 }}>
                  {mode === "signin" ? "ログイン" : "アカウント作成"}
                </Text>
              )}
            </TouchableOpacity>

            {/* Divider */}
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 16 }}>
              <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
              <Text style={{ marginHorizontal: 12, color: colors.muted, fontSize: 12 }}>
                または
              </Text>
              <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
            </View>

            {/* Google */}
            <TouchableOpacity
              onPress={handleGoogleLogin}
              disabled={loading}
              style={{
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 12,
                paddingVertical: 14,
                alignItems: "center",
                flexDirection: "row",
                justifyContent: "center",
                gap: 8,
                backgroundColor: colors.background,
                opacity: loading ? 0.7 : 1,
              }}
            >
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  backgroundColor: "#FFFFFF",
                  borderWidth: 1,
                  borderColor: colors.border,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: "700", color: "#4285F4" }}>G</Text>
              </View>
              <Text style={{ color: colors.text, fontWeight: "600", fontSize: 15 }}>
                Googleでログイン
              </Text>
            </TouchableOpacity>

            {/* デモ */}
            <TouchableOpacity
              onPress={() => void setDemoMode(true)}
              disabled={loading}
              accessibilityRole="button"
              style={{ paddingVertical: 14, alignItems: "center", marginTop: 8 }}
            >
              <Text style={{ color: colors.tint, fontWeight: "700", fontSize: 15 }}>
                ログインせずにデモを見る
              </Text>
              <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>
                サンプルの22ラウンドで分析を体験できます
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
