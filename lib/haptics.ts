// ハプティクスユーティリティ。Webでは無効（expo-hapticsはネイティブのみ動作）
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

const isNative = Platform.OS === "ios" || Platform.OS === "android";

/** 保存・登録などの成功時フィードバック */
export function hapticSuccess() {
  if (isNative) {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }
}

/** 削除確認の表示など、注意を促すフィードバック */
export function hapticWarning() {
  if (isNative) {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  }
}

/** ボタン押下などの軽いフィードバック */
export function hapticLight() {
  if (isNative) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }
}
