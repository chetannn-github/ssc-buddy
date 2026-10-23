import { Modal, Pressable, Text, View } from "react-native";
import { Image } from "expo-image";

export function ConsistencyCard({visible,streak,onClose}:{visible:boolean;streak:number;onClose:()=>void}) {
  return <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
    <Pressable onPress={onClose} style={{flex:1,backgroundColor:'#000b',justifyContent:'center',alignItems:'center',padding:24}}>
      <Pressable accessibilityViewIsModal onPress={()=>{}} style={{width:'100%',maxWidth:340,borderRadius:24,backgroundColor:'#181818',padding:24,alignItems:'center',gap:14}}>
        <Image source={require("../../assets/consistency-firework.webp")} autoplay contentFit="contain" transition={0} style={{width:112,height:112}} accessibilityLabel="Consistency firework"/>
        <Text style={{color:'#aaa',fontSize:12,fontWeight:'600'}}>Consistency</Text>
        <Text style={{color:'#fafafa',fontSize:30,fontWeight:'700'}}>{streak}-day streak</Text>
        <Text style={{color:'#aaa',fontSize:13}}>Keep showing up.</Text>
      </Pressable>
    </Pressable>
  </Modal>;
}
