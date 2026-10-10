import { StyleSheet, Text, View } from "react-native";

import { colors } from "../theme";

type Props = { title: string };

export function ComingSoonScreen({ title }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.eyebrow}>SSC BUDDY</Text>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{title} module</Text>
        <Text style={styles.copy}>This section will be built in the next chunk.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: colors.background },
  eyebrow: { color: "#818cf8", fontSize: 10, fontWeight: "700", letterSpacing: 2 },
  title: { color: colors.text, fontSize: 26, fontWeight: "700", marginTop: 4 },
  card: {
    marginTop: 28,
    borderRadius: 20,
    padding: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: "700" },
  copy: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 7 },
});
