import { useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, Alert, AppState, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { focusScheduleFrozen, nextFocusOccurrence, SCHEDULE_PRESETS, scheduleTime, WEEKDAY_LABELS, type FocusSchedule } from "../../../shared/focus-schedules";
import { studyTimeZone } from "../../../shared/study-focus";
import { deviceFocusStatus, openDeviceFocusSettings, openScheduleAlarmSettings, supportsDeviceSchedules } from "../lib/native-focus-lock";
import * as Crypto from "expo-crypto";
import { DestructiveDialog } from "./DestructiveDialog";

export function FocusSchedules({items,now,renderClock,saveSchedule}:{items:FocusSchedule[];now:number;renderClock:(minutes:number,onSave:(value:number)=>void,onCancel:()=>void,title:string)=>ReactNode;saveSchedule:(draft:FocusSchedule|null,id:string)=>Promise<void>}) {
  const [draft,setDraft]=useState<FocusSchedule|null>(null),[picking,setPicking]=useState<"startMinute"|"endMinute"|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const [deleting,setDeleting]=useState(false);
  const [alarmAccess,setAlarmAccess]=useState<boolean|null>(null);
  useEffect(()=>{
    if(Platform.OS!=="android"||!supportsDeviceSchedules)return;
    let active=true;
    const refresh=()=>{void deviceFocusStatus().then(status=>{if(active)setAlarmAccess("scheduleAlarmAccess" in status&&status.scheduleAlarmAccess===true);}).catch(()=>{});};
    refresh();const listener=AppState.addEventListener("change",state=>{if(state==="active")refresh();});
    return()=>{active=false;listener.remove();};
  },[items.length]);
  const fresh=()=>({...SCHEDULE_PRESETS[0]!,id:Crypto.randomUUID(),weekdays:[0,1,2,3,4,5,6],domains:[],appLimit:0,timeZone:studyTimeZone(),enabled:true,createdAt:Date.now()});
  const existing=items.find(item=>item.id===draft?.id),frozen=!!existing&&focusScheduleFrozen(existing,now);
  const save=async(value:FocusSchedule|null,id:string)=>{
    setBusy(true);setError("");try{
      if(value&&Platform.OS==="android"){
        if(!supportsDeviceSchedules)throw Error("Install the updated app to use schedules.");
        const status=await deviceFocusStatus();
        if(!status.enabled){Alert.alert("Enable app blocking","Enable Focus Lock before scheduling.",[{text:"Cancel",style:"cancel"},{text:"Enable",onPress:()=>void openDeviceFocusSettings()}]);return;}
        if(!("scheduleAlarmAccess" in status)||status.scheduleAlarmAccess!==true){Alert.alert("Scheduled starts","Allow alarms & reminders to start on time.",[{text:"Cancel",style:"cancel"},{text:"Allow",onPress:()=>void openScheduleAlarmSettings()}]);return;}
      }
      await saveSchedule(value,id);setDraft(null);
    }catch(e){setError(e instanceof Error?e.message:"Could not save schedule.");}finally{setBusy(false);}
  };
  if(draft&&picking)return <View style={s.root}>{renderClock(draft[picking],value=>{setDraft({...draft,[picking]:value});setPicking(null);},()=>setPicking(null),picking==="startMinute"?"Start time":"End time")}</View>;
  return <View style={s.root}>
    <View style={s.row}><Text style={s.heading}>Schedules</Text><Pressable accessibilityRole="button" accessibilityLabel="Add focus schedule" disabled={busy} hitSlop={8} onPress={()=>{setError("");setDraft(fresh());}}><MaterialCommunityIcons name="plus" size={22} color="#eee" /></Pressable></View>
    {Platform.OS==="android"&&items.length>0&&alarmAccess===false&&<Pressable style={s.item} onPress={()=>void openScheduleAlarmSettings().catch(()=>setError("Could not open alarm settings."))}><MaterialCommunityIcons name="alarm-check" size={20} color="#eee"/><Text style={[s.title,{flex:1}]}>Allow scheduled starts</Text><Text style={s.small}>Enable</Text></Pressable>}
    {items.map(item=>{const locked=focusScheduleFrozen(item,now),next=nextFocusOccurrence(item,now);return <Pressable key={item.id} disabled={locked||busy} onPress={()=>{setError("");setDraft({...item});}} style={s.item}>
      <MaterialCommunityIcons name={item.name==="Sleep"?"weather-night":"calendar-clock"} size={22} color="#aaa" />
      <View style={{flex:1,gap:3}}><Text style={s.title}>{item.name}</Text><Text style={s.small}>{scheduleTime(item.startMinute)}–{scheduleTime(item.endMinute)}{item.endMinute<=item.startMinute?" · next day":""}</Text><Text style={s.small}>{item.weekdays.map(day=>WEEKDAY_LABELS[day]).join(" · ")}</Text>{locked&&<Text style={s.small}>Locked until {next?new Date(next.endsAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}):"session ends"}</Text>}</View>
      <MaterialCommunityIcons name={locked?"lock-outline":"pencil-outline"} size={18} color="#999" />
    </Pressable>;})}
    {draft&&<View style={s.form}>
      <View style={s.wrap}>{SCHEDULE_PRESETS.map(preset=><Pressable key={preset.name} disabled={busy||frozen} style={s.chip} onPress={()=>setDraft({...draft,...preset})}><Text style={s.chipText}>{preset.name}</Text></Pressable>)}</View>
      <TextInput accessibilityLabel="Schedule name" maxLength={40} editable={!busy&&!frozen} style={s.input} value={draft.name} onChangeText={name=>setDraft({...draft,name})} placeholder="Schedule name" placeholderTextColor="#888" />
      <View style={s.row}>{(["startMinute","endMinute"] as const).map(field=><Pressable key={field} disabled={busy||frozen} accessibilityRole="button" accessibilityLabel={field==="startMinute"?"Schedule start":"Schedule end"} style={s.time} onPress={()=>setPicking(field)}><Text style={s.small}>{field==="startMinute"?"Start":"End"}</Text><Text style={s.title}>{scheduleTime(draft[field])}</Text></Pressable>)}</View>
      <View style={s.wrap}>{WEEKDAY_LABELS.map((day,index)=><Pressable key={day} disabled={busy||frozen} accessibilityRole="button" accessibilityState={{selected:draft.weekdays.includes(index)}} style={[s.chip,draft.weekdays.includes(index)&&s.selected]} onPress={()=>setDraft({...draft,weekdays:draft.weekdays.includes(index)?draft.weekdays.filter(value=>value!==index):[...draft.weekdays,index]})}><Text style={[s.chipText,draft.weekdays.includes(index)&&s.ink]}>{day}</Text></Pressable>)}</View>
      <View style={s.row}><Text style={s.small}>Extra allowed apps</Text><View style={s.wrap}>{[0,1,2].map(value=><Pressable key={value} disabled={busy||frozen} style={[s.chip,draft.appLimit===value&&s.selected]} onPress={()=>setDraft({...draft,appLimit:value})}><Text style={[s.chipText,draft.appLimit===value&&s.ink]}>{value}</Text></Pressable>)}</View></View>
      <Text style={s.small}>{draft.timeZone} · No breaks</Text><Text style={s.small}>Edits lock 1 hour before start</Text>
      <View style={s.row}><Pressable disabled={busy} style={s.chip} onPress={()=>setDraft(null)}><Text style={s.chipText}>Cancel</Text></Pressable>{existing&&<Pressable disabled={busy||frozen} style={s.chip} onPress={()=>setDeleting(true)}><Text style={{color:"#ff647e",fontSize:12}}>Delete</Text></Pressable>}<Pressable disabled={busy||frozen} style={[s.chip,s.selected,{flex:1,alignItems:"center",opacity:frozen?.4:1}]} onPress={()=>void save(draft,draft.id)}>{busy?<ActivityIndicator color="#111"/>:<Text style={[s.chipText,s.ink]}>Save schedule</Text>}</Pressable></View>
    </View>}
    {!!error&&<Text accessibilityRole="alert" style={{color:"#ff8a95",fontSize:11,marginTop:8}}>{error}</Text>}
    <DestructiveDialog visible={deleting&&!!draft&&!frozen} title="Delete this schedule?" confirmLabel="Yes, delete" busy={busy} onCancel={()=>setDeleting(false)} onConfirm={async()=>{if(draft&&!frozen)await save(null,draft.id);setDeleting(false);}} />
  </View>;
}
const s=StyleSheet.create({root:{marginTop:16,borderTopWidth:1,borderTopColor:"#ffffff16",paddingTop:14},row:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:8},heading:{color:"#eee",fontSize:14,fontWeight:"700"},item:{flexDirection:"row",alignItems:"center",gap:10,padding:12,marginTop:8,backgroundColor:"#1c1c1c",borderRadius:14},title:{color:"#eee",fontSize:13,fontWeight:"600"},small:{color:"#999",fontSize:10},form:{gap:10,marginTop:12},wrap:{flexDirection:"row",gap:5,flexWrap:"wrap"},chip:{backgroundColor:"#262626",paddingHorizontal:10,paddingVertical:9,borderRadius:18},chipText:{color:"#eee",fontSize:11,fontWeight:"600"},selected:{backgroundColor:"#f9fcf5"},ink:{color:"#111"},input:{backgroundColor:"#252525",color:"#eee",padding:12,borderRadius:12,fontSize:13},time:{flex:1,backgroundColor:"#252525",padding:12,borderRadius:12,gap:5}});
