import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucket = process.env.SUPABASE_STORAGE_BUCKET || "scorecards";

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

async function main() {
  // 上のガードで存在確認済み（TSはモジュール変数の絞り込みを関数内へ伝播しない）
  const supabase = createClient(supabaseUrl!, supabaseKey!);
  const buf = readFileSync("assets/scorecard-template.jpg");

  const { error } = await supabase.storage
    .from(bucket)
    .upload("template/scorecard-template.jpg", buf, {
      contentType: "image/jpeg",
      upsert: true,
    });

  if (error) {
    console.error("Upload error:", error);
    process.exit(1);
  }

  const { data } = supabase.storage
    .from(bucket)
    .getPublicUrl("template/scorecard-template.jpg");

  console.log("URL:", data.publicUrl);
}

main();
