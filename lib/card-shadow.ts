// エレベーション（影）スケール。フラットな border 表現を避け、ネイティブアプリらしい
// 階層的な奥行きを出す。用途別に sm / md / lg を使い分け、CTA には緑の色付き影で
// プレミアム感を加える。web は boxShadow、iOS は shadow*、Android は elevation。
import { Platform, type ViewStyle } from "react-native";

function shadow(
  y: number,
  blur: number,
  opacity: number,
  elevation: number,
  color = "#0B2E1A",
): ViewStyle {
  return Platform.select({
    ios: {
      shadowColor: color,
      shadowOffset: { width: 0, height: y },
      shadowOpacity: opacity,
      shadowRadius: blur,
    },
    android: { elevation },
    default: {
      boxShadow: `0px ${y}px ${blur}px rgba(11,46,26,${opacity})`,
    } as ViewStyle,
  }) as ViewStyle;
}

/** 控えめ: チップ・小さなカード */
export const shadowSm = shadow(1, 4, 0.07, 2);
/** 標準: 一覧カード・パネル */
export const shadowMd = shadow(6, 16, 0.1, 5);
/** 強め: ヒーロー・フローティング要素 */
export const shadowLg = shadow(14, 30, 0.16, 12);
/** 緑の色付き影: 主要CTAの浮き上がり（プレミアム感） */
export const shadowPrimary = shadow(8, 18, 0.32, 8, "#1A472A");

/** 後方互換: 既存の控えめなカード影 */
export const cardShadow = shadowSm;
