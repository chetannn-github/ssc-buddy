import type { ReactNode } from "react";
import { Pressable, type GestureResponderEvent, type StyleProp, type ViewStyle } from "react-native";

export function LiquidSpillCard({ children, style, onLongPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onLongPress?: (event: GestureResponderEvent) => void }) {
  return <Pressable onLongPress={onLongPress} delayLongPress={500} style={style}>{children}</Pressable>;
}
