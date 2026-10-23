import Svg, { Circle } from "react-native-svg";

// Lucide GripVertical, matching the web tracker's six-dot drag handle (ISC).
export function ChapterGrip({ color }: { color: string }) {
  return <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    {[9, 15].flatMap(cx => [5, 12, 19].map(cy => <Circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={1} />))}
  </Svg>;
}
