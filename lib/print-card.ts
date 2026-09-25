import { Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";

/** 印刷用カード（public/scorecard/）の置き場所 */
export const PRINT_CARD_PATH = "/scorecard/putting-card-v3.html";
export const PRINT_CARD_PDF_PATH = "/scorecard/putting-card-v3.pdf";

// ネイティブでは Web 版（Vercel）に置いた HTML を開く
const WEB_ORIGIN = process.env.EXPO_PUBLIC_WEB_URL || "https://putting-analyzer-v2.vercel.app";

/** 印刷用カードを開く（Web: 新しいタブ / ネイティブ: アプリ内ブラウザ） */
export async function openPrintCard(): Promise<void> {
  if (Platform.OS === "web") {
    window.open(PRINT_CARD_PATH, "_blank", "noopener");
    return;
  }
  await WebBrowser.openBrowserAsync(`${WEB_ORIGIN}${PRINT_CARD_PATH}`);
}
