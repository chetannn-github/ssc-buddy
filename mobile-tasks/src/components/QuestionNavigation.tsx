import { createThemedStyles } from "../theme";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { colors } from "../theme";
import {
  QUESTION_PALETTE_GAP,
  QUESTION_PALETTE_ITEM_WIDTH,
  questionPaletteEndPadding,
  questionPaletteOffset,
} from "../domain/question-navigation";

export function QuestionPalette({
  count,
  current,
  onCurrent,
  getItemStyle,
  getTextStyle,
}: {
  count: number;
  current: number;
  onCurrent: (index: number) => void;
  getItemStyle?: (index: number) => StyleProp<ViewStyle>;
  getTextStyle?: (index: number) => StyleProp<TextStyle>;
}) {
  const scroll = useRef<ScrollView>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const align = useCallback((index: number, animated: boolean) => {
    if (viewportWidth <= 0) return;
    scroll.current?.scrollTo({ x: questionPaletteOffset(index, viewportWidth), y: 0, animated });
  }, [viewportWidth]);
  useEffect(() => {
    align(current, true);
  }, [align, current, count, viewportWidth]);

  return (
    <ScrollView
      ref={scroll}
      style={styles.spacing}
      horizontal
      directionalLockEnabled
      showsHorizontalScrollIndicator={false}
      onLayout={(event) => setViewportWidth(event.nativeEvent.layout.width)}
      onContentSizeChange={() => align(current, false)}
      contentContainerStyle={[
        styles.row,
        { paddingRight: questionPaletteEndPadding(viewportWidth) },
      ]}
    >
      {Array.from({ length: count }, (_, index) => (
        <Pressable
          key={index}
          accessibilityRole="button"
          accessibilityLabel={`Question ${index + 1}`}
          accessibilityState={{ selected: index === current }}
          onPress={() => {
            onCurrent(index);
            align(index, true);
          }}
          style={[styles.item, index === current && styles.current, getItemStyle?.(index)]}
        >
          <Text style={[styles.number, getTextStyle?.(index)]}>{index + 1}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = createThemedStyles({
  spacing: { marginTop: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: QUESTION_PALETTE_GAP },
  item: {
    width: QUESTION_PALETTE_ITEM_WIDTH,
    height: 35,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2b2b2b",
  },
  current: { borderWidth: 1, borderColor: colors.accent },
  number: { color: colors.text, fontSize: 11, fontWeight: "700" },
});
