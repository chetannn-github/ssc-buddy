import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, StyleSheet } from "react-native";
import Svg, { Circle, Line } from "react-native-svg";
import { nearestClockAngle } from "../../../shared/clock-motion";

export function ClockHand({angle,color,dragging=false,radius=82,markerRadius=17}:{angle:number;color:string;dragging?:boolean;radius?:number;markerRadius?:number}) {
  const rotation=useRef(new Animated.Value(Number.isFinite(angle)?angle:0)).current,generation=useRef(0);
  const [reduced,setReduced]=useState(false);
  useEffect(()=>{
    let active=true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value=>{if(active)setReduced(value);}).catch(()=>{});
    const listener=AccessibilityInfo.addEventListener('reduceMotionChanged',setReduced);
    return()=>{active=false;listener.remove();};
  },[]);
  useEffect(()=>{
    const request=++generation.current;
    if(dragging||reduced){
      rotation.stopAnimation();
      if(Number.isFinite(angle))rotation.setValue(angle);
      return()=>{generation.current++;rotation.stopAnimation();};
    }
    rotation.stopAnimation(current=>{
      if(generation.current!==request)return;
      const next=nearestClockAngle(current,angle);
      Animated.timing(rotation,{toValue:next,duration:220,easing:Easing.out(Easing.cubic),useNativeDriver:true}).start();
    });
    return()=>{generation.current++;rotation.stopAnimation();};
  },[angle,dragging,reduced,rotation]);
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill,{transform:[{rotate:rotation.interpolate({inputRange:[0,360],outputRange:['0deg','360deg']})}]}]}>
    <Svg width={220} height={220}><Line x1={110} y1={110} x2={110} y2={110-radius} stroke={color} strokeWidth={2}/><Circle cx={110} cy={110} r={4} fill={color}/><Circle cx={110} cy={110-radius} r={markerRadius} fill={color}/></Svg>
  </Animated.View>;
}
