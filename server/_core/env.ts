export const ENV = {
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  supabaseUrl: process.env.SUPABASE_URL ?? "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  // OCRに使うGeminiモデル。GEMINI_MODEL で差し替え可能。
  // 既定: gemini-3.5-flash（高精度・$1.50/$9.00 per 1M tokens）— 手書き数字/チェック枠の読み取り精度を優先
  // 低コスト/高速: gemini-3.1-flash-lite（$0.25/$1.50）— 速度・コスト重視のとき GEMINI_MODEL で指定
  // ※gemini-2.5系は2026/10/16に廃止予定のため使用しない
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-3.5-flash",
};
