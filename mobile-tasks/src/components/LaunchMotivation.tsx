import { Image, Modal, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { useEffect, useRef } from "react";

export function LaunchMotivation({ source, onClose }: { source: number; onClose: () => void }) {
  const close=useRef(onClose);close.current=onClose;
  useEffect(()=>{const timer=setTimeout(()=>close.current(),5000);return()=>clearTimeout(timer);},[]);
  const { width, height } = useWindowDimensions();
  const asset = Image.resolveAssetSource(source);
  const ratio = asset.width / asset.height || 1;
  const imageWidth = Math.min(360, width - 48, (height * .68) * ratio);
  return <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
    <View style={styles.backdrop}>
      <Pressable accessibilityRole="button" accessibilityLabel="Dismiss motivational image" style={StyleSheet.absoluteFill} onPress={onClose} />
      <Pressable accessibilityViewIsModal accessibilityRole="button" accessibilityLabel="Dismiss motivational image" onPress={onClose} style={[styles.dialog, { width: imageWidth, height: imageWidth / ratio }]}>
        <Image source={source} resizeMode="contain" style={styles.image} accessibilityLabel="Motivational image" />
      </Pressable>
    </View>
  </Modal>;
}
const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center" },
  dialog: { borderRadius: 20, overflow: "hidden", backgroundColor: "#0e0e0e" },
  image: { width: "100%", height: "100%" },
});
