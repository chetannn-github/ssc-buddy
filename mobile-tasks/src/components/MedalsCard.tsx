import { Image, Modal, Pressable, Text, View } from "react-native";

const medals = [
  { key: "gold", label: "Gold", image: require("../../assets/gold-medal.png") },
  { key: "silver", label: "Silver", image: require("../../assets/silver-medal.png") },
  { key: "bronze", label: "Bronze", image: require("../../assets/bronze-medal.png") },
] as const;

export function MedalsCard({ visible, counts, onClose }: {
  visible: boolean;
  counts: { gold: number; silver: number; bronze: number };
  onClose: () => void;
}) {
  return <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
    <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: "#000b", justifyContent: "center", alignItems: "center", padding: 24 }}>
      <Pressable accessibilityViewIsModal onPress={() => {}} style={{ width: "100%", maxWidth: 360, borderRadius: 24, backgroundColor: "#181818", padding: 24, gap: 20 }}>
        <Text accessibilityRole="header" style={{ color: "#fafafa", fontSize: 22, fontWeight: "700", textAlign: "center" }}>Weekly medals</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {medals.map(medal => <View key={medal.key} accessibilityLabel={`${medal.label}: ${counts[medal.key]}`} style={{ flex: 1, alignItems: "center", gap: 8, paddingVertical: 16 }}>
            <Image source={medal.image} style={{ width: 48, height: 56, resizeMode: "contain" }} />
            <Text style={{ color: "#fafafa", fontSize: 24, fontWeight: "700" }}>{counts[medal.key]}</Text>
            <Text style={{ color: "#e4e4e7", fontSize: 12 }}>{medal.label}</Text>
          </View>)}
        </View>
        <Text style={{ color: "#a1a1aa", fontSize: 12, textAlign: "center" }}>Earned from completed leaderboard weeks.</Text>
      </Pressable>
    </Pressable>
  </Modal>;
}
