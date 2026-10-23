import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, PanResponder, ScrollView, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors, createThemedStyles } from "../theme";
import { FavouriteStar } from "./FavouriteStar";

type Chapter = { id: string; name: string; completed: number; total: number };
type Drag = { id: string; from: number; to: number; dy: number; startScroll: number; pageY: number };
const ROW = 56;

export function ChapterReorderList({ chapters, pinned, onMove }: {
  chapters: Chapter[]; pinned: string[]; onMove: (id: string, offset: number) => void;
}) {
  const scroll = useRef<ScrollView>(null);
  const viewport = useRef<View>(null);
  const bounds = useRef({ top: 0, height: 360 });
  const offset = useRef(0);
  const drag = useRef<Drag | null>(null);
  const latest = useRef({ chapters, onMove });
  latest.current = { chapters, onMove };
  const [active, setActive] = useState<Drag | null>(null);
  const translation = useRef(new Animated.Value(0)).current;
  const finishing = useRef(false);

  const update = useCallback(() => {
    const current = drag.current;
    if (!current || finishing.current) return;
    const dy = Math.max(-current.from * ROW, Math.min((latest.current.chapters.length - 1 - current.from) * ROW, current.dy + offset.current - current.startScroll));
    translation.setValue(dy);
    const to = Math.max(0, Math.min(latest.current.chapters.length - 1, current.from + Math.round(dy / ROW)));
    if (to !== current.to) { current.to = to; setActive({ ...current }); }
  }, [translation]);

  const begin = useCallback((id: string, index: number, pageY: number) => {
    if (finishing.current || drag.current) return;
    translation.setValue(0);
    drag.current = { id, from: index, to: index, dy: 0, startScroll: offset.current, pageY };
    setActive({ ...drag.current });
    viewport.current?.measureInWindow((_x, top, _width, height) => { bounds.current = { top, height }; });
  }, [translation]);
  const move = useCallback((dy: number, pageY: number) => {
    if (!drag.current) return;
    drag.current.dy = dy; drag.current.pageY = pageY; update();
  }, [update]);
  const end = useCallback((cancelled = false) => {
    const current = drag.current;
    if (!current || finishing.current) return;
    finishing.current = true;
    Animated.spring(translation, { toValue: cancelled ? 0 : (current.to - current.from) * ROW, speed: 28, bounciness: 0, useNativeDriver: true }).start(({ finished }) => {
      drag.current = null; finishing.current = false;
      if (finished && !cancelled && current.to !== current.from) latest.current.onMove(current.id, current.to - current.from);
      setActive(null); translation.setValue(0);
    });
  }, [translation]);

  useEffect(() => {
    const timer = setInterval(() => {
      const current = drag.current;
      if (!current || finishing.current) return;
      const { top, height } = bounds.current;
      const direction = current.pageY < top + 36 ? -1 : current.pageY > top + height - 36 ? 1 : 0;
      if (!direction) return;
      const next = Math.max(0, Math.min(Math.max(0, latest.current.chapters.length * ROW - height), offset.current + direction * 10));
      if (next === offset.current) return;
      offset.current = next; scroll.current?.scrollTo({ y: next, animated: false }); update();
    }, 30);
    return () => { clearInterval(timer); drag.current = null; translation.stopAnimation(); };
  }, [translation, update]);

  // A remote change must never apply an old drag index to a different list.
  const order = chapters.map(({ id }) => id).join("|");
  useEffect(() => {
    if (drag.current) { drag.current = null; finishing.current = false; translation.stopAnimation(); translation.setValue(0); setActive(null); }
  }, [order, translation]);

  return <View ref={viewport} style={s.viewport}>
    <ScrollView ref={scroll} nestedScrollEnabled scrollEnabled={!active} showsVerticalScrollIndicator={false} scrollEventThrottle={16} onScroll={event => { offset.current = event.nativeEvent.contentOffset.y; update(); }}>
      {chapters.map((chapter, index) => <ReorderRow key={chapter.id} chapter={chapter} index={index} count={chapters.length} pinned={pinned.includes(chapter.id)} active={active} translation={translation} begin={begin} move={move} end={end} onMove={onMove} />)}
    </ScrollView>
  </View>;
}

function ReorderRow({ chapter, index, count, pinned, active, translation, begin, move, end, onMove }: {
  chapter: Chapter; index: number; count: number; pinned: boolean; active: Drag | null; translation: Animated.Value;
  begin: (id: string, index: number, pageY: number) => void; move: (dy: number, pageY: number) => void; end: (cancelled?: boolean) => void;
  onMove: (id: string, offset: number) => void;
}) {
  const latest = useRef({ chapter, index, begin, move, end });
  latest.current = { chapter, index, begin, move, end };
  const responder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: event => { const p = latest.current; p.begin(p.chapter.id, p.index, event.nativeEvent.pageY); },
    onPanResponderMove: (_event, gesture) => latest.current.move(gesture.dy, gesture.moveY),
    onPanResponderRelease: () => latest.current.end(),
    onPanResponderTerminate: () => latest.current.end(true),
    onPanResponderTerminationRequest: () => false,
    onShouldBlockNativeResponder: () => true,
  })).current;
  const shift = useRef(new Animated.Value(0)).current;
  const dragging = active?.id === chapter.id;
  const target = active && !dragging ? (active.from < index && index <= active.to ? -ROW : active.to <= index && index < active.from ? ROW : 0) : 0;
  useEffect(() => {
    if (!active) { shift.stopAnimation(); shift.setValue(0); return; }
    const animation = Animated.spring(shift, { toValue: target, speed: 24, bounciness: 0, useNativeDriver: true });
    animation.start(); return () => animation.stop();
  }, [target, !!active, shift]);
  return <Animated.View style={[s.row, dragging && s.active, { zIndex: dragging ? 2 : 0, transform: [{ translateY: dragging ? translation : shift }] }]}>
    <View style={s.text}><View style={s.title}><Text style={s.name} numberOfLines={1}>{chapter.name}</Text>{pinned && <FavouriteStar size={13} color={colors.accent} />}</View><Text style={s.meta}>{chapter.completed}/{chapter.total} lectures</Text></View>
    <View {...responder.panHandlers} accessible accessibilityRole="adjustable" accessibilityLabel={`Reorder ${chapter.name}`} accessibilityValue={{ min: 1, max: count, now: index + 1 }} accessibilityActions={[{ name: "increment", label: "Move down" }, { name: "decrement", label: "Move up" }]} onAccessibilityAction={event => { if (active) return; const delta = event.nativeEvent.actionName === "increment" ? 1 : -1; if (index + delta >= 0 && index + delta < count) onMove(chapter.id, delta); }} style={s.handle}>
      <MaterialCommunityIcons name="drag-vertical" size={23} color={dragging ? colors.accent : colors.muted} />
    </View>
  </Animated.View>;
}

const s = createThemedStyles({
  viewport: { maxHeight: 360, overflow: "hidden" },
  row: { height: ROW, flexDirection: "row", alignItems: "center", gap: 10, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,.06)", backgroundColor: "#121212", paddingHorizontal: 4 },
  active: { backgroundColor: "#242424", borderRadius: 10, borderWidth: 1, borderColor: colors.accent + "66", elevation: 5 },
  text: { flex: 1, minWidth: 0 }, title: { flexDirection: "row", alignItems: "center", gap: 6 },
  name: { color: colors.text, fontSize: 13, fontWeight: "700", flex: 1, minWidth: 0 },
  meta: { color: colors.muted, fontSize: 11, marginTop: 3 },
  handle: { width: 44, height: 48, alignItems: "center", justifyContent: "center" },
});
