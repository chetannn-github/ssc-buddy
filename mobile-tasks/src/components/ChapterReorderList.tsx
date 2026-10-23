import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Animated, Easing, PanResponder, ScrollView, View, type StyleProp, type ViewStyle } from "react-native";
import { ChapterGrip } from "./ChapterGrip";
import { colors, createThemedStyles } from "../theme";

type Chapter = { id: string; name: string; completed: number; total: number };
type Drag = { id: string; from: number; to: number; slot: number; settling?: boolean; cancelled?: boolean; dy: number; startScroll: number; pageY: number };
export const CHAPTER_REORDER_ROW_HEIGHT = 56;
const ROW = CHAPTER_REORDER_ROW_HEIGHT;

export function ChapterReorderList({ chapters, renderChapter, rowStyle, onMove }: {
  chapters: Chapter[]; renderChapter: (chapter: Chapter) => ReactNode; rowStyle?: StyleProp<ViewStyle>; onMove: (id: string, offset: number) => void;
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
  const scrollPosition = useRef(new Animated.Value(0)).current;
  const floatingPosition = useMemo(() => Animated.subtract(translation, scrollPosition), [translation, scrollPosition]);
  const placeholder = useRef(new Animated.Value(0)).current;
  const finishing = useRef(false);

  const update = useCallback(() => {
    const current = drag.current;
    if (!current || finishing.current) return;
    const dy = Math.max(-current.from * ROW, Math.min((latest.current.chapters.length - current.from) * ROW, current.dy + offset.current - current.startScroll));
    translation.setValue(dy);
    const slot = Math.max(0, Math.min(latest.current.chapters.length, current.from + Math.round(dy / ROW)));
    // The original placeholder remains in the list until release. The extra
    // insertion slot is removed when translating to the saved chapter index.
    const to = Math.max(0, Math.min(latest.current.chapters.length - 1, slot - (slot > current.from ? 1 : 0)));
    if (slot !== current.slot) { current.slot = slot; current.to = to; setActive({ ...current }); }
  }, [translation]);

  const begin = useCallback((id: string, index: number, pageY: number) => {
    if (finishing.current || drag.current) return;
    translation.setValue(0);
    placeholder.setValue(1);
    drag.current = { id, from: index, to: index, slot: index, dy: 0, startScroll: offset.current, pageY };
    setActive({ ...drag.current });
    viewport.current?.measureInWindow((_x, top, _width, height) => { bounds.current = { top, height }; });
  }, [translation, placeholder]);
  const move = useCallback((dy: number, pageY: number) => {
    if (!drag.current) return;
    drag.current.dy = dy; drag.current.pageY = pageY; update();
  }, [update]);
  const end = useCallback((cancelled = false) => {
    const current = drag.current;
    if (!current || finishing.current) return;
    finishing.current = true;
    current.settling = true;
    current.cancelled = cancelled;
    if (cancelled) current.to = current.from;
    setActive({ ...current });
  }, []);

  // Start only after the released card and in-flow placeholder have mounted.
  // Detaching the old floating views can stop a running JS animated value.
  useEffect(() => {
    const current = drag.current;
    if (!active?.settling || !current) return;
    const collapse = Animated.timing(placeholder, { toValue: 0, duration: 320, easing: Easing.inOut(Easing.cubic), useNativeDriver: false });
    const animation = current.cancelled ? Animated.parallel([
      Animated.spring(translation, { toValue: 0, speed: 28, bounciness: 0, useNativeDriver: true }), collapse,
    ]) : collapse;
    animation.start(({ finished }) => {
      if (drag.current !== current) return;
      drag.current = null; finishing.current = false;
      if (finished && !current.cancelled && current.to !== current.from) latest.current.onMove(current.id, current.to - current.from);
      setActive(null); translation.setValue(0);
    });
    return () => animation.stop();
  }, [active?.settling, translation, placeholder]);

  useEffect(() => {
    const timer = setInterval(() => {
      const current = drag.current;
      if (!current || finishing.current) return;
      const { top, height } = bounds.current;
      const direction = current.pageY < top + 36 ? -1 : current.pageY > top + height - 36 ? 1 : 0;
      if (!direction) return;
      const extra = current.slot !== current.from ? ROW : 0;
      const next = Math.max(0, Math.min(Math.max(0, latest.current.chapters.length * ROW + extra - height), offset.current + direction * 10));
      if (next === offset.current) return;
      offset.current = next; scrollPosition.setValue(next); scroll.current?.scrollTo({ y: next, animated: false }); update();
    }, 30);
    return () => { clearInterval(timer); drag.current = null; translation.stopAnimation(); placeholder.stopAnimation(); };
  }, [translation, placeholder, scrollPosition, update]);

  // A remote change must never apply an old drag index to a different list.
  const order = chapters.map(({ id }) => id).join("|");
  useEffect(() => {
    if (drag.current) { drag.current = null; finishing.current = false; translation.stopAnimation(); translation.setValue(0); placeholder.stopAnimation(); placeholder.setValue(0); setActive(null); }
  }, [order, translation, placeholder]);

  // Release puts the real card into the insertion gap immediately. The old
  // slot is now an actual in-flow spacer, so shrinking it moves the list and
  // the placed card together instead of jumping after a floating animation.
  const released: { chapter: Chapter; ghost: boolean }[] = [];
  const releasing = active?.settling && !active.cancelled;
  if (releasing) {
    const moving = chapters[active.from];
    for (let index = 0; index <= chapters.length; index++) {
      if (index === active.slot) released.push({ chapter: moving, ghost: false });
      if (index === chapters.length) break;
      if (index === active.from) {
        if (active.slot !== active.from) released.push({ chapter: moving, ghost: true });
      } else released.push({ chapter: chapters[index], ghost: false });
    }
  }

  const movingChapter = active ? chapters.find(chapter => chapter.id === active.id) : undefined;
  return <View ref={viewport} testID="chapter-drag-viewport" style={s.viewport}>
    <ScrollView ref={scroll} testID="chapter-drag-scroll" removeClippedSubviews={false} nestedScrollEnabled scrollEnabled={!active} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 2 }} scrollEventThrottle={16} onScroll={event => { offset.current = event.nativeEvent.contentOffset.y; scrollPosition.setValue(offset.current); update(); }}>
      {releasing ? released.map(({ chapter, ghost }) => ghost
        ? <ChapterPlaceholder key={`origin-${chapter.id}`} chapter={chapter} rowStyle={rowStyle} renderChapter={renderChapter} placeholder={placeholder} />
        : <View key={chapter.id} testID={`chapter-placed-${chapter.id}`} style={[rowStyle, s.row]}>
            {renderChapter(chapter)}<View accessible accessibilityRole="adjustable" accessibilityLabel={`Reorder ${chapter.name}`} accessibilityState={{ disabled: true }} style={s.handle}><ChapterGrip color={colors.muted} /></View>
          </View>)
        : chapters.map((chapter, index) => <ReorderRow key={chapter.id} chapter={chapter} index={index} count={chapters.length} renderChapter={renderChapter} rowStyle={rowStyle} active={active} translation={translation} placeholder={placeholder} begin={begin} move={move} end={end} onMove={onMove} />)}
      {!releasing && <Animated.View pointerEvents="none" style={{ height: active && active.slot !== active.from ? placeholder.interpolate({ inputRange: [0, 1], outputRange: [0, ROW] }) : 0 }} />}
    </ScrollView>
    {active && movingChapter && (!active.settling || active.cancelled) && <Animated.View testID={`chapter-floating-${active.id}`} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[rowStyle, s.face, s.row, s.floating, { top: active.from * ROW + 2, transform: [{ translateY: floatingPosition }] }]}>
      {renderChapter(movingChapter)}<View style={s.handle}><ChapterGrip color={colors.muted} /></View>
    </Animated.View>}
  </View>;
}

function ChapterPlaceholder({ chapter, rowStyle, renderChapter, placeholder }: {
  chapter: Chapter; rowStyle?: StyleProp<ViewStyle>; renderChapter: (chapter: Chapter) => ReactNode; placeholder: Animated.Value;
}) {
  return <Animated.View testID={`chapter-origin-${chapter.id}`} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[rowStyle, s.row, s.placeholder, { height: placeholder.interpolate({ inputRange: [0, 1], outputRange: [0, ROW] }), opacity: placeholder.interpolate({ inputRange: [0, 1], outputRange: [0, 0.45] }), borderWidth: placeholder, transform: [{ scale: 0.98 }] }]}>
    {renderChapter(chapter)}<View style={s.handle}><ChapterGrip color={colors.muted} /></View>
  </Animated.View>;
}

function ReorderRow({ chapter, index, count, renderChapter, rowStyle, active, translation, placeholder, begin, move, end, onMove }: {
  chapter: Chapter; index: number; count: number; renderChapter: (chapter: Chapter) => ReactNode; rowStyle?: StyleProp<ViewStyle>; active: Drag | null; translation: Animated.Value; placeholder: Animated.Value;
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
  const dragging = active?.id === chapter.id;
  const shift = useRef(new Animated.Value(0)).current;
  const target = !active ? 0 : active.settling
    ? (!dragging ? (active.from < index && index <= active.to ? -ROW : active.to <= index && index < active.from ? ROW : 0) : 0)
    : (active.slot !== active.from && index >= active.slot ? ROW : 0);
  useEffect(() => {
    if (!active) { shift.stopAnimation(); shift.setValue(0); return; }
    const animation = Animated.spring(shift, { toValue: target, speed: 24, bounciness: 0, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [target, !!active, shift]);
  return <View collapsable={false} style={[s.slot, { zIndex: dragging ? 2 : 0 }]}>
    {dragging && <Animated.View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[s.face, { transform: [{ translateY: shift }] }]}>
      <ChapterPlaceholder chapter={chapter} rowStyle={rowStyle} renderChapter={renderChapter} placeholder={placeholder} />
    </Animated.View>}
    <Animated.View style={[rowStyle, s.face, s.row, dragging && s.dragHitLayer, { transform: [{ translateY: dragging ? translation : shift }] }]}>
    {renderChapter(chapter)}
    <View {...responder.panHandlers} accessible accessibilityRole="adjustable" accessibilityLabel={`Reorder ${chapter.name}`} accessibilityValue={{ min: 1, max: count, now: index + 1 }} accessibilityActions={[{ name: "increment", label: "Move down" }, { name: "decrement", label: "Move up" }]} onAccessibilityAction={event => { if (active) return; const delta = event.nativeEvent.actionName === "increment" ? 1 : -1; if (index + delta >= 0 && index + delta < count) onMove(chapter.id, delta); }} style={s.handle}>
      <ChapterGrip color={colors.muted} />
    </View>
  </Animated.View></View>;
}

const s = createThemedStyles({
  viewport: { maxHeight: 360, overflow: "hidden" },
  slot: { height: ROW, position: "relative", overflow: "visible" },
  face: { position: "absolute", top: 0, left: 0, right: 0 },
  row: { height: ROW },
  floating: { backgroundColor: "#121212", opacity: 0.96, zIndex: 30, elevation: 12 },
  dragHitLayer: { opacity: 0 },
  placeholder: { minHeight: 0, overflow: "hidden", borderRadius: 8, borderStyle: "dashed", borderColor: colors.accent + "80", backgroundColor: colors.accent + "1a" },
  handle: { width: 28, height: 40, alignItems: "center", justifyContent: "center" },
});
