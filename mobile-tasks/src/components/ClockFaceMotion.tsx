import type { ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";

export function ClockFaceMotion({children,style}:{mode:string;children:ReactNode;style?:StyleProp<ViewStyle>}) {
  return <View style={style}>{children}</View>;
}
