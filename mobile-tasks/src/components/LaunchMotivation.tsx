import { Image, Modal, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";

export function LaunchMotivation({ source, onClose }: { source: number; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  const asset = Image.resolveAssetSource(source);
  const ratio = asset.width / asset.height || 1;
  const imageWidth = Math.min(360, width - 48, (height * .68) * ratio);
  return <Modal transparent visible animationType="fade" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
    <View style={styles.backdrop}>
      <Pressable accessibilityRole="button" accessibilityLabel="Dismiss motivational image" style={StyleSheet.absoluteFill} onPress={onClose} />
      <View accessibilityViewIsModal style={[styles.dialog, { width: imageWidth, height: imageWidth / ratio }]}>
        <Image source={source} resizeMode="contain" style={styles.image} accessibilityLabel="Motivational image" />
      </View>
    </View>
  </Modal>;
}
const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,.72)", alignItems: "center", justifyContent: "center" },
  dialog: { borderRadius: 20, overflow: "hidden", backgroundColor: "#0e0e0e" },
  image: { width: "100%", height: "100%" },
});
