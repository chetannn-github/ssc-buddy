import { accentInk } from "../domain/app-accent";
import { clockValueFromPoint } from "../domain/clock-hand";
import { useRef, useState } from "react";
import { Modal, Pressable, Text, TextInput, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Svg, { Line, Circle } from "react-native-svg";
import { ClockFaceMotion } from "./ClockFaceMotion";
export function HabitTimePicker({
  value,
  tint,
  onChange,
  disabled = false,
}: {
  value: string;
  tint: string;
  onChange: (time: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [hour, setHour] = useState("9"),
    [minute, setMinute] = useState("00"),
    [pm, setPm] = useState(false),
    [part, setPart] = useState<"hour" | "minute">("hour"),
    [keyboard, setKeyboard] = useState(false);
  const gesture = useRef<{ active: boolean; changed: boolean; part: "hour" | "minute" }>({
    active: false,
    changed: false,
    part: "hour",
  });
  const dragHand = (x: number, y: number) => {
    const field = gesture.current.part;
    const next = clockValueFromPoint(x, y, field);
    if (next === null) return;
    gesture.current.changed = true;
    if (field === "hour") setHour(String(next));
    else setMinute(String(next).padStart(2, "0"));
  };
  const h = Number(hour),
    m = Number(minute),
    valid =
      !!hour.trim() &&
      !!minute.trim() &&
      Number.isInteger(h) &&
      h >= 1 &&
      h <= 12 &&
      Number.isInteger(m) &&
      m >= 0 &&
      m <= 59;
  const parsed = value.split(":").map(Number),
    hour24 = parsed[0] ?? 9,
    mm = parsed[1] ?? 0;
  const angle = (part === "hour" ? (h % 12) / 12 : m / 60) * Math.PI * 2 - Math.PI / 2,
    r = 87,
    c = 110;
  const start = () => {
    setHour(String(hour24 % 12 || 12));
    setMinute(String(mm).padStart(2, "0"));
    setPm(hour24 >= 12);
    setPart("hour");
    setKeyboard(false);
    setOpen(true);
  };
  return (
    <>
      <Pressable
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel="Choose reminder time"
        onPress={start}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          padding: 12,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: "#333",
          backgroundColor: "#0e0e0e",
        }}
      >
        <MaterialCommunityIcons name="clock-outline" size={19} color={tint} />
        <Text style={{ color: "white", fontSize: 15 }}>
          {hour24 % 12 || 12}:{String(mm).padStart(2, "0")} {hour24 >= 12 ? "PM" : "AM"}
        </Text>
      </Pressable>
      <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            backgroundColor: "#000b",
            padding: 20,
          }}
          onPress={() => setOpen(false)}
        >
          <Pressable
            onPress={() => undefined}
            style={{
              width: "100%",
              maxWidth: 340,
              padding: 22,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: "#333",
              backgroundColor: "#000",
              gap: 20,
            }}
          >
            <Text style={{ color: "white", fontSize: 17 }}>Select time</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              {(["hour", "minute"] as const).map((field, index) => (
                <View
                  key={field}
                  style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8 }}
                >
                  {index === 1 && <Text style={{ color: "white", fontSize: 36 }}>:</Text>}
                  {keyboard ? (
                    <TextInput
                      accessibilityLabel={field === "hour" ? "Hour" : "Minute"}
                      keyboardType="number-pad"
                      maxLength={2}
                      value={field === "hour" ? hour : minute}
                      onFocus={() => setPart(field)}
                      onChangeText={field === "hour" ? setHour : setMinute}
                      style={{
                        flex: 1,
                        textAlign: "center",
                        fontSize: 38,
                        color: part === field ? "#000" : "white",
                        backgroundColor: part === field ? tint : "#101010",
                        borderRadius: 10,
                        paddingVertical: 8,
                      }}
                    />
                  ) : (
                    <Pressable
                      accessibilityLabel={field === "hour" ? "Select hour" : "Select minute"}
                      onPress={() => setPart(field)}
                      style={{
                        flex: 1,
                        paddingVertical: 8,
                        borderRadius: 10,
                        backgroundColor: part === field ? tint : "#101010",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 38,
                          textAlign: "center",
                          color: part === field ? "black" : "white",
                        }}
                      >
                        {field === "hour" ? hour : minute.padStart(2, "0")}
                      </Text>
                    </Pressable>
                  )}
                </View>
              ))}
              <View
                style={{
                  borderRadius: 10,
                  overflow: "hidden",
                  borderWidth: 1,
                  borderColor: "#aaa",
                }}
              >
                {[false, true].map((isPM) => (
                  <Pressable
                    key={String(isPM)}
                    accessibilityLabel={isPM ? "PM" : "AM"}
                    onPress={() => setPm(isPM)}
                    style={{
                      paddingHorizontal: 9,
                      paddingVertical: 8,
                      backgroundColor: pm === isPM ? tint : "#000",
                    }}
                  >
                    <Text style={{ color: pm === isPM ? accentInk(tint) : "white", fontWeight: "700" }}>{isPM ? "PM" : "AM"}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            {!keyboard && (
              <ClockFaceMotion mode={part} style={{ width: 220, height: 220, alignSelf: "center" }}>
                <Svg pointerEvents="none" width={220} height={220} style={{ position: "absolute" }}>
                  <Line
                    x1={c}
                    y1={c}
                    x2={c + Math.cos(angle) * r}
                    y2={c + Math.sin(angle) * r}
                    stroke={tint}
                    strokeWidth={2}
                  />
                  <Circle cx={c} cy={c} r={4} fill={tint} />
                  <Circle
                    cx={c + Math.cos(angle) * r}
                    cy={c + Math.sin(angle) * r}
                    r={19}
                    fill={tint}
                  />
                </Svg>
                {Array.from({ length: 12 }, (_, index) => {
                  const tick = part === "hour" ? index + 1 : index * 5;
                  const a = (part === "hour" ? tick / 12 : tick / 60) * Math.PI * 2 - Math.PI / 2;
                  const selected = (part === "hour" ? h : m) === tick;
                  return (
                    <Pressable
                      key={tick}
                      accessibilityLabel={`${part} ${tick}`}
                      onPress={() => {
                        if (part === "hour") {
                          setHour(String(tick));
                          setPart("minute");
                        } else setMinute(String(tick).padStart(2, "0"));
                      }}
                      style={{
                        position: "absolute",
                        left: c + Math.cos(a) * r - 19,
                        top: c + Math.sin(a) * r - 19,
                        width: 38,
                        height: 38,
                        borderRadius: 19,
                        backgroundColor: selected ? tint : "transparent",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text style={{ fontSize: 16, color: selected ? "#000" : "white" }}>
                        {part === "minute" ? String(tick).padStart(2, "0") : tick}
                      </Text>
                    </Pressable>
                  );
                })}
                {part === "minute" && m % 5 !== 0 && (
                  <Text
                    pointerEvents="none"
                    style={{
                      position: "absolute",
                      left: c + Math.cos(angle) * r - 19,
                      top: c + Math.sin(angle) * r - 19,
                      width: 38,
                      height: 38,
                      textAlign: "center",
                      textAlignVertical: "center",
                      lineHeight: 38,
                      color: "black",
                      fontSize: 16,
                    }}
                  >
                    {minute.padStart(2, "0")}
                  </Text>
                )}
                <View
                  collapsable={false}
                  accessible={false}
                  style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
                  onStartShouldSetResponder={() => true}
                  onMoveShouldSetResponder={() => true}
                  onResponderTerminationRequest={() => false}
                  onResponderGrant={(event) => {
                    gesture.current = { active: true, changed: false, part };
                    dragHand(event.nativeEvent.locationX, event.nativeEvent.locationY);
                  }}
                  onResponderMove={(event) => {
                    if (gesture.current.active)
                      dragHand(event.nativeEvent.locationX, event.nativeEvent.locationY);
                  }}
                  onResponderRelease={(event) => {
                    if (!gesture.current.active) return;
                    dragHand(event.nativeEvent.locationX, event.nativeEvent.locationY);
                    gesture.current.active = false;
                    if (gesture.current.changed && gesture.current.part === "hour")
                      setPart("minute");
                  }}
                  onResponderTerminate={() => {
                    gesture.current.active = false;
                  }}
                />
              </ClockFaceMotion>
            )}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 24 }}>
              <Pressable
                accessibilityLabel={keyboard ? "Use clock" : "Use keyboard"}
                onPress={() => setKeyboard((k) => !k)}
                style={{ flex: 1, padding: 8 }}
              >
                <MaterialCommunityIcons
                  name={keyboard ? "clock-outline" : "keyboard-outline"}
                  size={24}
                  color="white"
                />
              </Pressable>
              <Pressable onPress={() => setOpen(false)} style={{ padding: 8 }}>
                <Text style={{ color: tint, fontWeight: "700" }}>Cancel</Text>
              </Pressable>
              <Pressable
                disabled={!valid}
                onPress={() => {
                  onChange(
                    `${String((h % 12) + (pm ? 12 : 0)).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
                  );
                  setOpen(false);
                }}
                style={{ padding: 8, opacity: valid ? 1 : 0.3 }}
              >
                <Text style={{ color: tint, fontWeight: "700" }}>OK</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
