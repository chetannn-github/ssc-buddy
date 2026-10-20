import { useEffect, useRef } from "react";
import { Animated, Easing } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors } from "../theme";

/** Keep the same glyph mounted while reversing smoothly from its current angle. */
export function DropdownChevron({ open, size = 18, color = colors.muted }: { open: boolean; size?: number; color?: string }) {
  const rotation = useRef(new Animated.Value(open ? 1 : 0)).current;
  useEffect(() => {
    const animation = Animated.timing(rotation, {
      toValue: open ? 1 : 0, duration: 220, easing: Easing.inOut(Easing.cubic), useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [open, rotation]);
  return <Animated.View pointerEvents="none" style={{ transform: [{ rotate: rotation.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] }) }] }}>
    <MaterialCommunityIcons name="chevron-down" size={size} color={color} />
  </Animated.View>;
}
