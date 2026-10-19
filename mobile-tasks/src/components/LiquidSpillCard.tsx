import type { ReactNode } from "react";
import { Pressable, type StyleProp, type ViewStyle } from "react-native";

export function LiquidSpillCard({ children, style, onLongPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onLongPress?: () => void }) {
  return <Pressable onLongPress={onLongPress} delayLongPress={500} style={style}>{children}</Pressable>;
}
