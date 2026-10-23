import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { FavouriteStar } from "./FavouriteStar";
import { colors, createThemedStyles } from "../theme";

const GAP = 8;
const COLUMNS = 3;

export function PinnedChapterGrid({ chapters, onOpen }: {
  chapters: { id: string; name: string }[];
  onOpen: (id: string) => void;
}) {
  const [width, setWidth] = useState(0);
  const [textWidths, setTextWidths] = useState<Record<string, number>>({});
  const unit = (width + GAP) / COLUMNS;
  const measured = width > 0 && chapters.every(({ name }) => textWidths[name] !== undefined);

  return <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
    {/* Measure the same font at its natural width, including system text scaling. */}
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={s.measurements}>
      <View style={s.measureRow}>{[...new Set(chapters.map(({ name }) => name))].map((name) => <Text key={name} style={s.measureText} onLayout={(event) => {
        const next = event.nativeEvent.layout.width;
        setTextWidths((current) => current[name] === next ? current : { ...current, [name]: next });
      }}>{name}</Text>)}</View>
    </View>
    <View style={[s.grid, { opacity: measured ? 1 : 0 }]}>
      {chapters.map(({ id, name }) => {
        // A long label spans whole columns; the next row keeps the same starts.
        const span = Math.min(COLUMNS, Math.max(1, Math.ceil(((textWidths[name] ?? 0) + 16 + 6 + 4 + GAP) / (unit || 1))));
        return <Pressable key={id} accessibilityRole="button" accessibilityLabel={name} onPress={() => onOpen(id)} style={[s.item, { width: Math.max(0, span * unit - GAP) }]}>
          <FavouriteStar size={16} color={colors.accent} />
          <Text style={s.label}>{name}</Text>
        </Pressable>;
      })}
    </View>
  </View>;
}

const s = createThemedStyles({
  measurements: { position: "absolute", left: 0, right: 0, height: 0, overflow: "hidden", opacity: 0 },
  measureRow: { width: 10000, alignItems: "flex-start" },
  measureText: { color: colors.text, fontSize: 13, fontWeight: "700" },
  grid: { flexDirection: "row", flexWrap: "wrap", columnGap: GAP, rowGap: 2, marginTop: 2 },
  item: { minHeight: 34, flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 6, paddingRight: 4 },
  label: { color: "#e4e4e7", fontSize: 13, fontWeight: "700", flexShrink: 1, minWidth: 0 },
});
