import { ThemedView } from "@/components/themed-view";
import { supabase } from "@/lib/supabase";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function OAuthCallback() {
  const router = useRouter();
  const [status, setStatus] = useState<"processing" | "success" | "error">("processing");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Get the URL that opened this screen (native deep link)
        const url = await Linking.getInitialURL();

        if (!url) {
          // On web, Supabase handles the session automatically from the URL hash.
          // Just wait a moment and redirect.
          const {
            data: { session },
          } = await supabase.auth.getSession();
          if (session) {
            setStatus("success");
            setTimeout(() => router.replace("/(tabs)"), 500);
          } else {
            setStatus("error");
            setErrorMessage("No session found");
          }
          return;
        }

        // Native: parse the deep link URL for Supabase tokens
        // Supabase returns tokens in the URL fragment: #access_token=...&refresh_token=...
        const parsed = new URL(url);
        const hash = parsed.hash.startsWith("#") ? parsed.hash.slice(1) : parsed.hash;
        const params = new URLSearchParams(hash || parsed.search);

        const accessToken = params.get("access_token");
        const refreshToken = params.get("refresh_token");
        const errorParam = params.get("error");
        const errorDescription = params.get("error_description");

        if (errorParam) {
          setStatus("error");
          setErrorMessage(errorDescription || errorParam);
          return;
        }

        if (accessToken && refreshToken) {
          // Set session in Supabase client
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (error) {
            setStatus("error");
            setErrorMessage(error.message);
            return;
          }

          setStatus("success");
          setTimeout(() => router.replace("/(tabs)"), 800);
          return;
        }

        // PKCE flow: code in query params
        const code = params.get("code");
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            setStatus("error");
            setErrorMessage(error.message);
            return;
          }
          setStatus("success");
          setTimeout(() => router.replace("/(tabs)"), 800);
          return;
        }

        setStatus("error");
        setErrorMessage("Missing authentication parameters");
      } catch (error) {
        setStatus("error");
        setErrorMessage(
          error instanceof Error ? error.message : "Failed to complete authentication",
        );
      }
    };

    handleCallback();
  }, [router]);

  return (
    <SafeAreaView className="flex-1" edges={["top", "bottom", "left", "right"]}>
      <ThemedView className="flex-1 items-center justify-center gap-4 p-5">
        {status === "processing" && (
          <>
            <ActivityIndicator size="large" />
            <Text className="mt-4 text-base leading-6 text-center text-foreground">
              認証を完了しています...
            </Text>
          </>
        )}
        {status === "success" && (
          <>
            <Text className="text-base leading-6 text-center text-foreground">
              認証が完了しました！
            </Text>
            <Text className="text-base leading-6 text-center text-foreground">
              リダイレクトしています...
            </Text>
          </>
        )}
        {status === "error" && (
          <>
            <Text className="mb-2 text-xl font-bold leading-7 text-error">
              認証に失敗しました
            </Text>
            <Text className="text-base leading-6 text-center text-foreground">
              {errorMessage}
            </Text>
          </>
        )}
      </ThemedView>
    </SafeAreaView>
  );
}
