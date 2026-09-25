import "@/global.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";
import { Platform } from "react-native";
import "@/lib/_core/nativewind-pressable";
import { ThemeProvider } from "@/lib/theme-provider";
import {
  SafeAreaProvider,
  initialWindowMetrics,
} from "react-native-safe-area-context";
import type { EdgeInsets, Rect } from "react-native-safe-area-context";

import { trpc, createTRPCClient } from "@/lib/trpc";
import { supabase } from "@/lib/supabase";
import type { Session } from "@supabase/supabase-js";

const DEFAULT_WEB_INSETS: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
const DEFAULT_WEB_FRAME: Rect = { x: 0, y: 0, width: 0, height: 0 };

export const unstable_settings = {
  anchor: "(tabs)",
};

/** Auth guard: redirects to /login when unauthenticated */
function AuthGuard({ session }: { session: Session | null | undefined }) {
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    // session === undefined means "still loading"
    if (session === undefined) return;

    const currentRoute = segments[0] as string | undefined;
    const isPublicRoute =
      currentRoute === "login" ||
      currentRoute === "oauth";

    if (!session && !isPublicRoute) {
      router.replace("/login");
    } else if (session && (currentRoute === "login" || currentRoute === "oauth")) {
      router.replace("/(tabs)");
    }
  }, [session, segments]);

  return null;
}

export default function RootLayout() {
  const initialInsets = initialWindowMetrics?.insets ?? DEFAULT_WEB_INSETS;
  const initialFrame = initialWindowMetrics?.frame ?? DEFAULT_WEB_FRAME;

  // session: undefined = loading, null = logged out, Session = logged in
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Create clients once and reuse them
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Disable automatic refetching on window focus for mobile
            refetchOnWindowFocus: false,
            // Retry failed requests once
            retry: 1,
            // Cache data for 5 minutes (reduces redundant API calls on tab switch)
            staleTime: 1000 * 60 * 5,
            // Keep unused data in cache for 10 minutes
            gcTime: 1000 * 60 * 10,
          },
        },
      }),
  );
  const [trpcClient] = useState(() => createTRPCClient());

  // Ensure minimum padding for top and bottom on mobile
  const providerInitialMetrics = useMemo(() => {
    const metrics = initialWindowMetrics ?? { insets: initialInsets, frame: initialFrame };
    return {
      ...metrics,
      insets: {
        ...metrics.insets,
        top: Math.max(metrics.insets.top, 16),
        bottom: Math.max(metrics.insets.bottom, 12),
      },
    };
  }, [initialInsets, initialFrame]);

  const content = (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          <AuthGuard session={session} />
          {/* Default to hiding native headers so raw route segments don't appear */}
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="login" />
            <Stack.Screen name="oauth/callback" />
          </Stack>
          <StatusBar style="auto" />
        </QueryClientProvider>
      </trpc.Provider>
    </GestureHandlerRootView>
  );

  return (
    <ThemeProvider>
      <SafeAreaProvider initialMetrics={providerInitialMetrics}>
        {content}
      </SafeAreaProvider>
    </ThemeProvider>
  );
}
