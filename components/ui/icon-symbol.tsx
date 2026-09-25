// Fallback for using MaterialIcons on Android and web.

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { SymbolWeight, SymbolViewProps } from "expo-symbols";
import { ComponentProps } from "react";
import { OpaqueColorValue, type StyleProp, type TextStyle } from "react-native";

type IconMapping = Record<SymbolViewProps["name"], ComponentProps<typeof MaterialIcons>["name"]>;
type IconSymbolName = keyof typeof MAPPING;

/**
 * Add your SF Symbols to Material Icons mappings here.
 * - see Material Icons in the [Icons Directory](https://icons.expo.fyi).
 * - see SF Symbols in the [SF Symbols](https://developer.apple.com/sf-symbols/) app.
 */
const MAPPING = {
  "house.fill": "home",
  "paperplane.fill": "send",
  "chevron.left.forwardslash.chevron.right": "code",
  "chevron.right": "chevron-right",
  "list.bullet": "list",
  "chart.bar.fill": "bar-chart",
  "person.fill": "person",
  "plus": "add",
  "camera.fill": "camera-alt",
  "gearshape.fill": "settings",
  "flag.fill": "flag",
  "pencil": "edit",
  "trash.fill": "delete",
  "checkmark.circle.fill": "check-circle",
  "xmark.circle.fill": "cancel",
  "arrow.left": "arrow-back",
  "arrow.right": "arrow-forward",
  "printer.fill": "print",
  "info.circle": "info-outline",
  "doc.text": "description",
  "sparkles": "auto-awesome",
  "target": "gps-fixed",
  "arrow.up.right": "trending-up",
  "slider.horizontal.3": "tune",
  "play.fill": "play-arrow",
  "rectangle.portrait.and.arrow.right": "logout",
  "square.and.arrow.up": "ios-share",
  "bolt.fill": "flash-on",
  "bolt.slash.fill": "flash-off",
  "photo.on.rectangle": "photo-library",
  "checkmark": "check",
  "exclamationmark.triangle.fill": "warning",
  "chevron.down": "expand-more",
  "arrow.clockwise": "refresh",
  "minus": "remove",
  "keyboard": "keyboard",
  "viewfinder": "center-focus-strong",
} as IconMapping;

/**
 * An icon component that uses native SF Symbols on iOS, and Material Icons on Android and web.
 * This ensures a consistent look across platforms, and optimal resource usage.
 * Icon `name`s are based on SF Symbols and require manual mapping to Material Icons.
 */
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  return <MaterialIcons color={color} size={size} name={MAPPING[name]} style={style} />;
}
