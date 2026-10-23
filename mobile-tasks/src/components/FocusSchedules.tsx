import { useEffect, useState, type ReactNode } from "react";
import { useLayoutEffect, useRef } from "react";
import { AccessibilityInfo, Animated, Easing, ActivityIndicator, Alert, AppState, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { focusScheduleFrozen, SCHEDULE_PRESETS, scheduleTime, WEEKDAY_LABELS, type FocusSchedule } from "../../../shared/focus-schedules";
import { studyTimeZone } from "../../../shared/study-focus";
import { deviceFocusStatus, openDeviceFocusSettings, openScheduleAlarmSettings, supportsDeviceSchedules } from "../lib/native-focus-lock";
import * as Crypto from "expo-crypto";
import { DestructiveDialog } from "./DestructiveDialog";
import { AnimatedTimeChips } from "./AnimatedTimeChips";
import { focusSchedulePreviews, isFocusSchedulePreview, focusScheduleIconIndex } from "../../../shared/focus-schedule-preview";

export function FocusSchedules({items,now,renderClock,saveSchedule,onBack,onSaved}:{items:FocusSchedule[];now:number;renderClock:(minutes:number,onSave:(value:number)=>void,onCancel:()=>void,title:string)=>ReactNode;saveSchedule:(draft:FocusSchedule|null,id:string)=>Promise<void>;onBack?:()=>void;onSaved?:()=>void}) {
  const fresh=()=>({...SCHEDULE_PRESETS[0]!,id:Crypto.randomUUID(),weekdays:[0,1,2,3,4,5,6],domains:[],appLimit:0,timeZone:studyTimeZone(),enabled:true,createdAt:Date.now()});
  const [draft,setDraft]=useState<FocusSchedule|null>(()=>({...items[0]??fresh()})),[picking,setPicking]=useState<"startMinute"|"endMinute"|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const [previews,setPreviews]=useState(focusSchedulePreviews);
  const [deleting,setDeleting]=useState(false);
  const [alarmAccess,setAlarmAccess]=useState<boolean|null>(null);
  const [reducedMotion,setReducedMotion]=useState(false);
  const formMotion=useRef(new Animated.Value(1)).current;
  useLayoutEffect(()=>{
    formMotion.setValue(reducedMotion?1:0);
    if(reducedMotion)return;
    const animation=Animated.timing(formMotion,{toValue:1,duration:220,easing:Easing.out(Easing.cubic),useNativeDriver:true});
    animation.start();return()=>animation.stop();
  },[draft?.id,reducedMotion,formMotion]);
  useEffect(()=>{
    let active=true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value=>{if(active)setReducedMotion(value);}).catch(()=>{});
    const listener=AccessibilityInfo.addEventListener("reduceMotionChanged",setReducedMotion);
    return()=>{active=false;listener.remove();};
  },[]);
  useEffect(()=>{
    if(Platform.OS!=="android"||!supportsDeviceSchedules)return;
    let active=true;
    const refresh=()=>{void deviceFocusStatus().then(status=>{if(active)setAlarmAccess("scheduleAlarmAccess" in status&&status.scheduleAlarmAccess===true);}).catch(()=>{});};
    refresh();const listener=AppState.addEventListener("change",state=>{if(state==="active")refresh();});
    return()=>{active=false;listener.remove();};
  },[items.length]);
  const existing=[...items,...previews].find(item=>item.id===draft?.id),frozen=!!existing&&focusScheduleFrozen(existing,now);
  const save=async(value:FocusSchedule|null,id:string)=>{
    setBusy(true);setError("");try{
      if(isFocusSchedulePreview(id)){setPreviews(previous=>previous.flatMap(item=>item.id===id?(value?[{...value,enabled:false}]:[]):[item]));setDraft(null);if(value)onSaved?.();return;}
      if(value&&Platform.OS==="android"){
        if(!supportsDeviceSchedules)throw Error("Install the updated app to use schedules.");
        const status=await deviceFocusStatus();
        if(!status.enabled){Alert.alert("Enable app blocking","Enable Focus Lock before scheduling.",[{text:"Cancel",style:"cancel"},{text:"Enable",onPress:()=>void openDeviceFocusSettings()}]);return;}
        if(!("scheduleAlarmAccess" in status)||status.scheduleAlarmAccess!==true){Alert.alert("Scheduled starts","Allow alarms & reminders to start on time.",[{text:"Cancel",style:"cancel"},{text:"Allow",onPress:()=>void openScheduleAlarmSettings()}]);return;}
      }
      await saveSchedule(value,id);setDraft(null);if(value)onSaved?.();
    }catch(e){setError(e instanceof Error?e.message:"Could not save schedule.");}finally{setBusy(false);}
  };
  if(draft&&picking)return <View style={s.root}>{renderClock(draft[picking],value=>{setDraft({...draft,[picking]:value});setPicking(null);},()=>setPicking(null),picking==="startMinute"?"Start time":"End time")}</View>;
  return <View style={[s.root,{borderTopWidth:0,paddingTop:0,marginTop:0}]}>
    <View style={[s.row,{gap:7}]}>
      {onBack&&<Pressable accessibilityRole="button" accessibilityLabel="Back to Focus Lock" hitSlop={8} onPress={onBack}><MaterialCommunityIcons name="arrow-left" size={21} color="#eee"/></Pressable>}
      <Text style={[s.title,{fontSize:15,flex:1}]}>Add schedule</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Add focus schedule" disabled={busy} hitSlop={8} onPress={()=>{setError("");setDraft(fresh());}}><MaterialCommunityIcons name="plus" size={23} color="#eee"/></Pressable>
    </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled style={{marginTop:8}} contentContainerStyle={{gap:6,paddingVertical:3}}>
        {[...items,...previews].map(item=>{const selected=draft?.id===item.id,icons=["weather-night","weather-sunset-up","book-open-variant","coffee-outline","leaf"] as const;return <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Edit ${item.name}`} accessibilityState={{selected}} disabled={busy} onPress={()=>{setError("");setDraft({...item});}} style={[s.chip,{paddingVertical:9,flexDirection:"row",alignItems:"center",gap:5},selected&&s.selected]}>
          <MaterialCommunityIcons name={icons[focusScheduleIconIndex(item.id)]!} size={14} color={selected?"#111":"#bbb"}/><Text numberOfLines={1} style={[s.chipText,selected&&s.ink]}>{item.name}</Text>
        </Pressable>;})}
      </ScrollView>
    {Platform.OS==="android"&&items.length>0&&alarmAccess===false&&<Pressable style={s.item} onPress={()=>void openScheduleAlarmSettings().catch(()=>setError("Could not open alarm settings."))}><MaterialCommunityIcons name="alarm-check" size={20} color="#eee"/><Text style={[s.title,{flex:1}]}>Allow scheduled starts</Text><Text style={s.small}>Enable</Text></Pressable>}
    {draft&&<Animated.View style={[s.form,{opacity:formMotion,transform:[{translateY:formMotion.interpolate({inputRange:[0,1],outputRange:[8,0]})}]}]}>
      <TextInput accessibilityLabel="Schedule name" maxLength={40} editable={!busy&&!frozen} style={s.input} value={draft.name} onChangeText={name=>setDraft({...draft,name})} placeholder="Schedule name" placeholderTextColor="#888" />
      <View style={s.row}>{(["startMinute","endMinute"] as const).map(field=><Pressable key={field} disabled={busy||frozen} accessibilityRole="button" accessibilityLabel={field==="startMinute"?"Schedule start":"Schedule end"} style={s.time} onPress={()=>setPicking(field)}><Text style={s.small}>{field==="startMinute"?"Start":"End"}</Text><Text style={s.title}>{scheduleTime(draft[field])}</Text></Pressable>)}</View>
      <View style={s.wrap}>{WEEKDAY_LABELS.map((day,index)=><WeekdayChip key={day} label={day} selected={draft.weekdays.includes(index)} disabled={busy||frozen} reducedMotion={reducedMotion} onPress={()=>setDraft({...draft,weekdays:draft.weekdays.includes(index)?draft.weekdays.filter(value=>value!==index):[...draft.weekdays,index]})}/>)}</View>
      <View style={s.row}><Text style={s.title}>Allowed apps</Text><AnimatedTimeChips options={[0,1,2]} labels={["0","1","2"]} value={draft.appLimit} onChange={value=>setDraft({...draft,appLimit:value})} disabled={busy||frozen} color="#f9fcf5" ink="#111" height={34} gap={4} style={{width:132}} /></View>
      <View style={s.row}><Pressable disabled={busy} style={s.chip} onPress={()=>setDraft(null)}><Text style={s.chipText}>Cancel</Text></Pressable>{existing&&<Pressable disabled={busy||frozen} style={s.chip} onPress={()=>setDeleting(true)}><Text style={{color:"#ff647e",fontSize:12}}>Delete</Text></Pressable>}<Pressable disabled={busy||frozen} style={[s.chip,s.selected,{flex:1,alignItems:"center",opacity:frozen?.4:1}]} onPress={()=>void save(draft,draft.id)}>{busy?<ActivityIndicator color="#111"/>:<Text style={[s.chipText,s.ink]}>Save schedule</Text>}</Pressable></View>
    </Animated.View>}
    {!!error&&<Text accessibilityRole="alert" style={{color:"#ff8a95",fontSize:11,marginTop:8}}>{error}</Text>}
    <DestructiveDialog visible={deleting&&!!draft&&!frozen} title="Delete this schedule?" confirmLabel="Yes, delete" busy={busy} onCancel={()=>setDeleting(false)} onConfirm={async()=>{if(draft&&!frozen)await save(null,draft.id);setDeleting(false);}} />
  </View>;
}
function WeekdayChip({label,selected,disabled,reducedMotion,onPress}:{label:string;selected:boolean;disabled:boolean;reducedMotion:boolean;onPress:()=>void}) {
  const progress=useRef(new Animated.Value(selected?1:0)).current;
  useEffect(()=>{
    if(reducedMotion){progress.setValue(selected?1:0);return;}
    const animation=Animated.timing(progress,{toValue:selected?1:0,duration:190,easing:Easing.inOut(Easing.cubic),useNativeDriver:true});
    animation.start();return()=>animation.stop();
  },[selected,reducedMotion,progress]);
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{selected,disabled}} disabled={disabled} onPress={onPress}>
    <Animated.View style={[s.chip,{width:36,height:34,paddingHorizontal:0,paddingVertical:0,alignItems:"center",justifyContent:"center",opacity:disabled?.4:1,transform:[{scale:progress.interpolate({inputRange:[0,1],outputRange:[1,1.04]})}]}]}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill,{borderRadius:18,backgroundColor:"#f9fcf5",opacity:progress}]}/>
      <View style={{width:26,height:16}}><Animated.Text numberOfLines={1} allowFontScaling={false} style={[s.chipText,{lineHeight:16,includeFontPadding:false,textAlign:"center",opacity:progress.interpolate({inputRange:[0,1],outputRange:[1,0]})}]}>{label}</Animated.Text><Animated.Text numberOfLines={1} allowFontScaling={false} style={[s.chipText,s.ink,{position:"absolute",top:0,left:0,right:0,lineHeight:16,includeFontPadding:false,textAlign:"center",opacity:progress}]}>{label}</Animated.Text></View>
    </Animated.View>
  </Pressable>;
}
const s=StyleSheet.create({root:{marginTop:16,borderTopWidth:1,borderTopColor:"#ffffff16",paddingTop:14},row:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:8},heading:{color:"#eee",fontSize:14,fontWeight:"700"},item:{flexDirection:"row",alignItems:"center",gap:10,padding:12,marginTop:8,backgroundColor:"#1c1c1c",borderRadius:14},title:{color:"#eee",fontSize:13,fontWeight:"600"},small:{color:"#999",fontSize:10},form:{gap:10,marginTop:12},wrap:{flexDirection:"row",gap:5,flexWrap:"wrap"},chip:{backgroundColor:"#262626",paddingHorizontal:10,paddingVertical:9,borderRadius:18},chipText:{color:"#eee",fontSize:11,fontWeight:"600"},selected:{backgroundColor:"#f9fcf5"},ink:{color:"#111"},input:{backgroundColor:"#252525",color:"#eee",padding:12,borderRadius:12,fontSize:13},time:{flex:1,backgroundColor:"#252525",padding:12,borderRadius:12,gap:5}});
