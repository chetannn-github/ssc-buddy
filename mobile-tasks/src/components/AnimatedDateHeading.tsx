import { NumberFlow } from "number-flow-react-native";
import { Text, View } from "react-native";

export function AnimatedDateHeading({ date, today }: { date: string; today: string }) {
  const day = new Date(date + "T12:00:00");
  return (
    <View style={{ flex: 1, flexDirection: "row", alignItems: "center", flexWrap: "wrap" }}>
      <Text style={{ color: "white", fontSize: 20, fontWeight: "800" }}>
        {date === today ? "Today" : day.toLocaleDateString(undefined, { weekday: "short" })}
        <Text style={{ color: "#777" }}>, </Text>
      </Text>
      <NumberFlow value={day.getDate()} suffix={" " + day.toLocaleDateString(undefined, { month: "short" })}
        style={{ color: "#777", fontSize: 20, fontWeight: "800" }} />
    </View>
  );
}
