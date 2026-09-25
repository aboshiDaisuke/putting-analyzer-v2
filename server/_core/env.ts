export const ENV = {
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  supabaseUrl: process.env.SUPABASE_URL ?? "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  // OCRに使うGeminiモデル。コスト/精度の比較検証用に差し替え可能
  // 既定: gemini-3.1-flash-lite（安定版・$0.25/$1.50 per 1M tokens — 旧gemini-2.5-flashより安価で新世代）
  // 高精度: gemini-3.5-flash（$1.50/$9.00） ※gemini-2.5系は2026/10/16に廃止予定
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-3.1-flash-lite",
};
