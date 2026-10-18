import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Animated,
  PanResponder,
  StyleSheet,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  clampPlayer,
  cornerPosition,
  nearestPlayerCorner,
  playerBounds,
  type PlayerCorner,
} from "../domain/floating-player";

export function FloatingMusicPlayer({
  corner,
  onCornerChange,
  bottomNavVisible,
  children,
  style,
}: {
  corner: PlayerCorner;
  onCornerChange: (corner: PlayerCorner) => void;
  bottomNavVisible: boolean;
  children: ReactNode;
  style: StyleProp<ViewStyle>;
}) {
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [viewport, setViewport] = useState({ width: window.width, height: window.height });
  const [playerHeight, setPlayerHeight] = useState(54);
  const width = Math.max(1, Math.min(160, viewport.width - 22));
  // The parent SafeAreaView already excludes top/left/right system insets.
  const bounds = useMemo(
    () =>
      playerBounds(
        viewport.width,
        viewport.height,
        width,
        playerHeight,
        // Tabs occupy 84px with 9px top padding. Bounds add 12px themselves,
        // so 69px leaves a 6px gap above the visible tab bar without double insets.
        bottomNavVisible ? 69 : insets.bottom,
      ),
    [viewport, width, playerHeight, insets.bottom, bottomNavVisible],
  );
  const position = useRef(new Animated.ValueXY(cornerPosition(corner, bounds))).current;
  const dragStart = useRef(cornerPosition(corner, bounds));
  const current = useRef(dragStart.current);
  const snapTarget = useRef(dragStart.current);
  const dragReady = useRef(false);
  const pendingDrag = useRef({ x: 0, y: 0 });
  const dragging = useRef(false);
  const latest = useRef({ bounds, onCornerChange });
  latest.current = { bounds, onCornerChange };

  useEffect(() => {
    if (dragging.current) return;
    const target = cornerPosition(corner, bounds);
    // Releasing updates the selected corner too; do not restart its running spring.
    if (target.x === snapTarget.current.x && target.y === snapTarget.current.y) return;
    snapTarget.current = target;
    current.current = target;
    Animated.spring(position, {
      toValue: target,
      damping: 22,
      stiffness: 180,
      mass: 0.85,
      overshootClamping: true,
      isInteraction: false,
      useNativeDriver: true,
    }).start();
  }, [corner, bounds, position]);

  useEffect(() => () => position.stopAnimation(), [position]);

  const pan = useMemo(() => {
    const finish = () => {
      dragging.current = false;
      const next = nearestPlayerCorner(current.current, latest.current.bounds);
      const target = cornerPosition(next, latest.current.bounds);
      snapTarget.current = target;
      current.current = target;
      latest.current.onCornerChange(next);
      Animated.spring(position, {
        toValue: target,
        damping: 22,
        stiffness: 180,
        mass: 0.85,
        overshootClamping: true,
        isInteraction: false,
        useNativeDriver: true,
      }).start();
    };
    return PanResponder.create({
      // Capture only a drag, leaving ordinary taps to playback/expand/close buttons.
      onMoveShouldSetPanResponderCapture: (_, gesture) => Math.hypot(gesture.dx, gesture.dy) > 6,
      onPanResponderGrant: () => {
        dragging.current = true;
        dragReady.current = false;
        pendingDrag.current = { x: 0, y: 0 };
        position.stopAnimation((point) => {
          if (!dragging.current) return;
          dragStart.current = point;
          dragReady.current = true;
          const next = clampPlayer(
            { x: point.x + pendingDrag.current.x, y: point.y + pendingDrag.current.y },
            latest.current.bounds,
          );
          current.current = next;
          position.setValue(next);
        });
      },
      onPanResponderMove: (_, gesture) => {
        pendingDrag.current = { x: gesture.dx, y: gesture.dy };
        if (!dragReady.current) return;
        const next = clampPlayer(
          { x: dragStart.current.x + gesture.dx, y: dragStart.current.y + gesture.dy },
          latest.current.bounds,
        );
        current.current = next;
        position.setValue(next);
      },
      onPanResponderRelease: finish,
      onPanResponderTerminate: finish,
      onPanResponderTerminationRequest: () => false,
    });
  }, [position]);

  return (
    <View
      pointerEvents="box-none"
      style={StyleSheet.absoluteFill}
      onLayout={({ nativeEvent }) => {
        const { width, height } = nativeEvent.layout;
        setViewport((previous) =>
          previous.width === width && previous.height === height ? previous : { width, height },
        );
      }}
    >
      <Animated.View
        {...pan.panHandlers}
        onLayout={({ nativeEvent }) => setPlayerHeight(nativeEvent.layout.height)}
        style={[
          style,
          {
            position: "absolute",
            left: 0,
            top: 0,
            width,
            zIndex: 20,
            transform: position.getTranslateTransform(),
          },
        ]}
      >
        {children}
      </Animated.View>
    </View>
  );
}
