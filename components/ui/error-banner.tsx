import { Text, View, type ViewStyle } from "react-native";

import { useColors } from "@/hooks/use-colors";

/**
 * テーマ対応のエラーバナー。
 * 旧実装で各画面にハードコードされていた #fee2e2 / #991b1b を置き換える共通コンポーネント。
 */
export function ErrorBanner({
  message,
  title,
  style,
}: {
  message: string;
  title?: string;
  style?: ViewStyle;
}) {
  const colors = useColors();
  return (
    <View
      style={[
        {
          backgroundColor: `${colors.error}1A`, // error 10%
          borderWidth: 1,
          borderColor: `${colors.error}4D`, // error 30%
          borderRadius: 8,
          padding: 12,
        },
        style,
      ]}
    >
      {title ? (
        <Text style={{ color: colors.error, fontWeight: "600", fontSize: 13, marginBottom: 4 }}>
          {title}
        </Text>
      ) : null}
      <Text style={{ color: colors.error, fontSize: 13, lineHeight: 19 }}>{message}</Text>
    </View>
  );
}
