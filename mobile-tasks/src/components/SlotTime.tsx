import { useEffect, useRef } from "react";
import { AccessibilityInfo, Animated, Easing, Text, View } from "react-native";

function Digit({ value, size, color }: { value: string; size: number; color: string }) {
  const offset = useRef(new Animated.Value(0)).current;
  const previous = useRef(value);
  const old = previous.current;
  useEffect(() => {
    if (previous.current === value) return;
    previous.current = value;
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then(reduce => {
      if (cancelled || reduce) return;
      offset.setValue(1);
      Animated.timing(offset, { toValue: 0, duration: 750, easing: Easing.bezier(0.22, 1, 0.36, 1), useNativeDriver: true }).start();
    });
    return () => { cancelled = true; offset.stopAnimation(); offset.setValue(0); };
  }, [value, offset]);
  const height = size * 1.2;
  const text = { color, fontSize: size, lineHeight: height, fontWeight: "700" as const, fontVariant: ["tabular-nums" as const], textAlign: "center" as const };
  return <View style={{ height, width: size * 0.64, overflow: "hidden" }}>
    <Animated.View style={{ transform: [{ translateY: offset.interpolate({ inputRange: [0, 1], outputRange: [-height, 0] }) }] }}>
      <Text style={text}>{old}</Text><Text style={text}>{value}</Text>
    </Animated.View>
  </View>;
}

export function SlotTime({ value, color, size = 48 }: { value: string; color: string; size?: number }) {
  return <View accessible accessibilityLabel={value} style={{ flexDirection: "row", justifyContent: "center", marginVertical: 16 }}>
    {Array.from(value, (digit, index) => /\d/.test(digit)
      ? <Digit key={value.length - index} value={digit} color={color} size={size} />
      : <Text key={value.length - index} style={{ color, fontSize: size, lineHeight: size * 1.2, fontWeight: "700" }}>{digit}</Text>)}
  </View>;
}
