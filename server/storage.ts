// Supabase Storage helpers for file upload/download

import { createClient } from "@supabase/supabase-js";
import { ENV } from "./_core/env";

const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? "scorecards";

function getSupabaseClient() {
  if (!ENV.supabaseUrl || !ENV.supabaseServiceRoleKey) {
    throw new Error(
      "Supabase credentials missing: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY",
    );
  }
  return createClient(ENV.supabaseUrl, ENV.supabaseServiceRoleKey);
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const supabase = getSupabaseClient();
  const key = normalizeKey(relKey);

  const fileBuffer =
    typeof data === "string"
      ? Buffer.from(data)
      : data instanceof Buffer
        ? data
        : Buffer.from(data);

  const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(key, fileBuffer, {
    contentType,
    upsert: true,
  });

  if (error) {
    throw new Error(`Storage upload failed: ${error.message}`);
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(key);

  return { key, url: publicUrl };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const supabase = getSupabaseClient();
  const key = normalizeKey(relKey);

  const {
    data: { publicUrl },
  } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(key);

  return { key, url: publicUrl };
}

export async function storageDelete(relKey: string): Promise<void> {
  const supabase = getSupabaseClient();
  const key = normalizeKey(relKey);

  const { error } = await supabase.storage.from(STORAGE_BUCKET).remove([key]);

  if (error) {
    // 分析は成功しているためエラーはログのみ（例外は投げない）
    console.error(`Storage delete failed for key "${key}": ${error.message}`);
  }
}
