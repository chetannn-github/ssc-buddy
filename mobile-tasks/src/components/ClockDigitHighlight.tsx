import { View } from "react-native";
import { AnimatedTimeChips } from "./AnimatedTimeChips";

export function ClockDigitHighlight({part,color,gap=30,height=66}:{part:"hour"|"minute";color:string;gap?:number;height?:number}) {
  return <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{position:"absolute",left:0,right:0,top:0,height}}>
    <AnimatedTimeChips options={[0,1]} labels={["",""]} value={part==="hour"?0:1} onChange={()=>{}} color={color} ink="#111" background="#333" height={height} radius={12} gap={gap}/>
  </View>;
}
