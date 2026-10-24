import { useEffect, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";

export function AnimatedTimeChips({ options, labels, disabledOptions = [], value, onChange, disabled = false, suffix = "", color, ink, muted = "#c6c6c6", background = "#202020", radius = 20, gap = 8, height = 40, borderColor, textStyle, style, vertical = false, optionWidths, icons }: {
  options: readonly number[];
  labels?: readonly string[];
  disabledOptions?: readonly number[];
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  suffix?: string;
  color: string;
  ink: string;
  muted?: string;
  background?: string;
  radius?: number;
  gap?: number;
  height?: number;
  borderColor?: string;
  textStyle?: StyleProp<TextStyle>;
  style?: StyleProp<ViewStyle>;
  vertical?: boolean;
  optionWidths?: readonly number[];
  icons?: readonly ReactNode[];
}) {
  const index = options.indexOf(value);
  const position = useRef(new Animated.Value(Math.max(0, index))).current;
  const visibility = useRef(new Animated.Value(index < 0 ? 0 : 1)).current;
  const [width, setWidth] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active) setReducedMotion(value); }).catch(() => undefined);
    const listener = AccessibilityInfo.addEventListener("reduceMotionChanged", setReducedMotion);
    return () => { active = false; listener.remove(); };
  }, []);
  useEffect(() => {
    if (reducedMotion) {
      if (index >= 0) position.setValue(index);
      visibility.setValue(index < 0 ? 0 : 1);
      return;
    }
    const config = { duration: 240, easing: Easing.inOut(Easing.cubic), useNativeDriver: true };
    const animation = Animated.parallel([
      ...(index >= 0 ? [Animated.timing(position, { ...config, toValue: index })] : []),
      Animated.timing(visibility, { ...config, toValue: index < 0 ? 0 : 1 }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [index, reducedMotion, position, visibility]);
  const chipWidth = Math.max(0, (width - gap * (options.length - 1)) / options.length);
  const variable=!!optionWidths&&!vertical&&options.length>1;
  const baseWidth=variable?optionWidths[0]!:chipWidth;
  const offsets=options.map((_,index)=>optionWidths?.slice(0,index).reduce((sum,value)=>sum+value+gap,0)??index*(chipWidth+gap));
  const positions=options.map((_,index)=>index);
  return <View onLayout={event => setWidth(event.nativeEvent.layout.width)} style={[styles.row, { gap, minHeight: vertical ? height * options.length + gap * (options.length - 1) : height, flexDirection: vertical ? "column" : "row" }, style]}>
    <View pointerEvents="none" accessible={false} style={[StyleSheet.absoluteFill, styles.row, { gap, flexDirection: vertical ? "column" : "row" }]}>
      {options.map((option,index) => <View key={option} style={{ flex: optionWidths&&!vertical?undefined:1, width:!vertical?optionWidths?.[index]:undefined, borderRadius: radius, backgroundColor: background, borderWidth: borderColor ? 1 : 0, borderColor, opacity: disabled || disabledOptions.includes(option) ? 0.45 : 1 }} />)}
    </View>
    {width > 0 && <Animated.View pointerEvents="none" accessible={false} style={[StyleSheet.absoluteFill, vertical ? { bottom: undefined, height, transform: [{ translateY: Animated.multiply(position, height + gap) }] } : variable ? {right:undefined,width:baseWidth,transform:[{translateX:position.interpolate({inputRange:positions,outputRange:offsets.map((offset,index)=>offset+(optionWidths![index]!-baseWidth)/2),extrapolate:"clamp"})},{scaleX:position.interpolate({inputRange:positions,outputRange:optionWidths!.map(value=>value/baseWidth),extrapolate:"clamp"})}]} : { right: undefined, width: chipWidth, transform: [{ translateX: Animated.multiply(position, chipWidth + gap) }] }, { borderRadius: radius, backgroundColor: color, opacity: visibility }]} />}
    {options.map((option, optionIndex) => {
      const selected = Animated.multiply(visibility, position.interpolate({ inputRange: [optionIndex - 1, optionIndex, optionIndex + 1], outputRange: [0, 1, 0], extrapolate: "clamp" }));
      const unavailable = disabled || disabledOptions.includes(option);
      const label = labels?.[optionIndex] ?? `${option}${suffix}`;
      return <Pressable key={option} accessibilityRole="button" accessibilityLabel={labels?.[optionIndex] ?? `${option} minutes`} accessibilityState={{ selected: value === option, disabled: unavailable }} disabled={unavailable} onPress={() => onChange(option)} style={[styles.chip, { minHeight: height, opacity: unavailable ? 0.45 : 1 },optionWidths&&!vertical?{flex:0,width:optionWidths[optionIndex]}:undefined]}>
        <Animated.View pointerEvents="none" accessible={false} style={{ transform: [{ scale: selected.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) }] }}>
          <Animated.Text numberOfLines={1} allowFontScaling={false} style={[styles.text, textStyle, { color: muted, opacity: selected.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]}>{icons?.[optionIndex]}{icons?.[optionIndex]?" ":""}{label}</Animated.Text>
          <Animated.Text numberOfLines={1} allowFontScaling={false} style={[styles.text, textStyle, styles.selectedText, { color: ink, opacity: selected }]}>{icons?.[optionIndex]}{icons?.[optionIndex]?" ":""}{label}</Animated.Text>
        </Animated.View>
      </Pressable>;
    })}
  </View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: "row" },
  chip: { flex: 1, alignItems: "center", justifyContent: "center" },
  text: { fontSize: 12, fontWeight: "600", textAlign: "center", includeFontPadding: false },
  selectedText: { position: "absolute", top: 0, left: 0, right: 0 },
});
