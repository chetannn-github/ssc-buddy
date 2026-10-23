import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, Animated, Easing, type StyleProp, type ViewStyle } from "react-native";

export function ClockFaceMotion({mode,children,style}:{mode:string;children:ReactNode;style?:StyleProp<ViewStyle>}) {
  const progress=useRef(new Animated.Value(1)).current;
  const [reducedMotion,setReducedMotion]=useState(false);
  useEffect(()=>{
    let active=true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value=>{if(active)setReducedMotion(value);}).catch(()=>{});
    const listener=AccessibilityInfo.addEventListener("reduceMotionChanged",setReducedMotion);
    return()=>{active=false;listener.remove();};
  },[]);
  useLayoutEffect(()=>{
    progress.setValue(reducedMotion?1:0);
    if(reducedMotion)return;
    const animation=Animated.timing(progress,{toValue:1,duration:220,easing:Easing.out(Easing.cubic),useNativeDriver:true});
    animation.start();return()=>animation.stop();
  },[mode,reducedMotion,progress]);
  return <Animated.View style={[style,{opacity:progress.interpolate({inputRange:[0,1],outputRange:[.2,1]}),transform:[{scale:progress.interpolate({inputRange:[0,1],outputRange:[.94,1]})}]}]}>{children}</Animated.View>;
}
