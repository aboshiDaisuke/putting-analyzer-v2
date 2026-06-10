import { useEffect } from "react";
import { Text, TouchableOpacity, View, type ViewStyle } from "react-native";

import { useColors } from "@/hooks/use-colors";
import { hapticWarning } from "@/lib/haptics";

/**
 * テーマ対応のインライン削除確認ボックス。
 * 旧実装で各画面にハードコードされていた #fee2e2 / #991b1b / #dc2626 を置き換える共通コンポーネント。
 * 表示時に警告ハプティクスを発火する。
 */
export function ConfirmBox({
  message,
  detail,
  confirmLabel = "削除する",
  cancelLabel = "キャンセル",
  variant = "error",
  onConfirm,
  onCancel,
  style,
}: {
  message: string;
  detail?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "error" | "warning";
  onConfirm: () => void;
  onCancel: () => void;
  style?: ViewStyle;
}) {
  const colors = useColors();
  const accent = variant === "warning" ? colors.warning : colors.error;

  useEffect(() => {
    hapticWarning();
  }, []);

  return (
    <View
      style={[
        {
          backgroundColor: `${accent}1A`, // accent 10%
          borderWidth: 1,
          borderColor: `${accent}4D`, // accent 30%
          borderRadius: 8,
          padding: 12,
        },
        style,
      ]}
    >
      <Text style={{ color: accent, fontSize: 13, fontWeight: "600", marginBottom: detail ? 4 : 8 }}>
        {message}
      </Text>
      {detail ? (
        <Text style={{ color: accent, fontSize: 12, marginBottom: 8 }}>{detail}</Text>
      ) : null}
      <View style={{ flexDirection: "row", gap: 8 }}>
        <TouchableOpacity
          onPress={onCancel}
          activeOpacity={0.7}
          style={{
            flex: 1,
            padding: 8,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 6,
            alignItems: "center",
          }}
        >
          <Text style={{ color: colors.foreground, fontSize: 13 }}>{cancelLabel}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onConfirm}
          activeOpacity={0.7}
          style={{
            flex: 1,
            padding: 8,
            backgroundColor: accent,
            borderRadius: 6,
            alignItems: "center",
          }}
        >
          <Text style={{ color: "#FFF", fontSize: 13, fontWeight: "600" }}>{confirmLabel}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
