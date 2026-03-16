import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "@shared": path.resolve(__dirname, "./shared"),
      // Stub out React Native and Expo native modules that contain Flow syntax
      "react-native": path.resolve(__dirname, "tests/__mocks__/react-native.ts"),
      "expo-secure-store": path.resolve(
        __dirname,
        "tests/__mocks__/expo-secure-store.ts",
      ),
    },
  },
  test: {
    include: ["lib/__tests__/**/*.test.ts", "tests/**/*.test.ts"],
    environment: "node",
    // Load .env so Supabase client can initialise (URL / anon key)
    env: {
      EXPO_PUBLIC_SUPABASE_URL: "https://placeholder.supabase.co",
      EXPO_PUBLIC_SUPABASE_ANON_KEY: "placeholder-anon-key",
    },
  },
});
