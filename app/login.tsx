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
import { supabase } from "@/lib/supabase";
import { useColors } from "@/hooks/use-colors";

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
      const redirectTo =
        typeof window !== "undefined"
          ? `${window.location.origin}/oauth/callback`
          : "putting-analyzer-v2://oauth/callback";
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
          {/* Logo / Title */}
          <View style={{ alignItems: "center", marginBottom: 40 }}>
            <Text style={{ fontSize: 40, marginBottom: 12 }}>⛳️</Text>
            <Text
              style={{ fontSize: 28, fontWeight: "bold", color: colors.tint, marginBottom: 4 }}
            >
              パッティング分析
            </Text>
            <Text style={{ fontSize: 14, color: colors.muted }}>
              あなたのパッティングを記録・分析
            </Text>
          </View>

          {/* Card */}
          <View
            style={{
              backgroundColor: colors.surface,
              borderRadius: 16,
              padding: 24,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.08,
              shadowRadius: 8,
              elevation: 3,
            }}
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
                      color: mode === m ? "#fff" : colors.muted,
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
            {error && (
              <View
                style={{
                  backgroundColor: "#fee2e2",
                  borderRadius: 8,
                  padding: 12,
                  marginBottom: 16,
                }}
              >
                <Text style={{ color: "#991b1b", fontSize: 13 }}>{error}</Text>
              </View>
            )}

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
              style={{
                backgroundColor: colors.tint,
                borderRadius: 12,
                paddingVertical: 14,
                alignItems: "center",
                marginBottom: 16,
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 16 }}>
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
              <Text style={{ fontSize: 18 }}>G</Text>
              <Text style={{ color: colors.text, fontWeight: "600", fontSize: 15 }}>
                Googleでログイン
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
