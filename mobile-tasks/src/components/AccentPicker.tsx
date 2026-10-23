import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Pressable, ScrollView, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { APP_ACCENTS, accentInk, type AppAccent } from "../domain/app-accent";

export function AccentPicker({value,disabled,onChange}:{value:AppAccent;disabled:boolean;onChange:(value:AppAccent)=>void}) {
  const index=APP_ACCENTS.findIndex(item=>item.color===value);
  const position=useRef(new Animated.Value(Math.max(0,index)*44)).current;
  const [reduced,setReduced]=useState(false);
  useEffect(()=>{
    let active=true;void AccessibilityInfo.isReduceMotionEnabled().then(value=>{if(active)setReduced(value);}).catch(()=>{});
    const listener=AccessibilityInfo.addEventListener('reduceMotionChanged',setReduced);
    return()=>{active=false;listener.remove();};
  },[]);
  useEffect(()=>{
    if(reduced){position.setValue(Math.max(0,index)*44);return;}
    const animation=Animated.timing(position,{toValue:Math.max(0,index)*44,duration:240,easing:Easing.inOut(Easing.cubic),useNativeDriver:true});
    animation.start();return()=>animation.stop();
  },[index,reduced,position]);
  // Interpolate the ring colour from its moving position, so rapid taps retain
  // one continuous border instead of unmounting a ring on each swatch.
  const borderColor=position.interpolate({inputRange:APP_ACCENTS.map((_,i)=>i*44),outputRange:APP_ACCENTS.map(item=>item.color),extrapolate:'clamp'});
  return <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator={false} style={{marginTop:14}} contentContainerStyle={{paddingHorizontal:2,paddingVertical:3}}>
    <View style={{flexDirection:'row',gap:10}}>
      <Animated.View pointerEvents="none" accessible={false} style={{position:'absolute',top:0,left:0,width:34,height:34,borderRadius:17,borderWidth:2,borderColor,transform:[{translateX:position}]}}/>
      {APP_ACCENTS.map(option=><Pressable key={option.color} accessibilityRole="radio" accessibilityLabel={option.name+' accent'} accessibilityState={{selected:value===option.color,disabled}} disabled={disabled} onPress={()=>onChange(option.color)} style={{width:34,height:34,alignItems:'center',justifyContent:'center',opacity:disabled?.5:1}}>
        <View style={{width:26,height:26,borderRadius:13,backgroundColor:option.color,alignItems:'center',justifyContent:'center'}}>{value===option.color&&<MaterialCommunityIcons name="check-bold" size={16} color={accentInk(option.color)}/>}</View>
      </Pressable>)}
    </View>
  </ScrollView>;
}
