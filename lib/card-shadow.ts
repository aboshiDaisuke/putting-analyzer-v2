// カードに乗せる控えめな影。border のみのフラットな見た目を避け、ネイティブアプリらしい奥行きを出す。
import { Platform, type ViewStyle } from "react-native";

export const cardShadow: ViewStyle = Platform.select({
  ios: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  android: {
    elevation: 2,
  },
  default: {
    // web
    boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
  } as ViewStyle,
}) as ViewStyle;
