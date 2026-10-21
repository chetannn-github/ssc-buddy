import { UppercaseTextInput as TextInput } from "./UppercaseTextInput";
import { colors } from "../theme";
import { createThemedStyles } from "../theme";
import { IS_EXPO_GO } from "../lib/native-notifications";
import { StatusBar } from "expo-status-bar";
import { HabitTimePicker } from "./HabitTimePicker";
import { HabitIconSheet } from "./HabitIconSheet";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import {
  HABIT_COLORS,
  HABIT_COLOR_COLUMNS,
  HABIT_ICONS,
  HABIT_FREQUENCIES,
  habitDetails,
  habitFormDetails,
  canSaveHabit,
  normalizeHabitSettings,
  validateHabitSettings,
  type Habit,
  type HabitColor,
  type HabitSettings,
  type HabitSaveDetails,
} from "../domain/habits";
import { requestHabitReminders, testHabitReminder } from "../hooks/use-habit-reminders";
export function HabitEditor({
  habit,
  initialColor,
  busy: parentBusy,
  error,
  onClose,
  onSave,
}: {
  habit: Habit | null;
  initialColor: HabitColor;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSave: (details: HabitSaveDetails) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);
  const busy = parentBusy || saving;
  const [name, setName] = useState(habit?.name ?? ""),
    [color, setColor] = useState<HabitColor>(habit?.color ?? initialColor),
    [target, setTarget] = useState(habit?.targetDays ? String(habit.targetDays) : "");
  const [settings, setSettings] = useState(() => normalizeHabitSettings(habit?.settings));
  const [goal, setGoal] = useState(String(settings.dailyGoal)),
    [stepAmount, setStepAmount] = useState(String(settings.step));
  const [step, setStep] = useState(3),
    [localError, setLocalError] = useState("");
  const [themeOpen, setThemeOpen] = useState(false);
  const [colorsOpen, setColorsOpen] = useState(false);
  const [testingReminder, setTestingReminder] = useState(false);
  const [adding, setAdding] = useState(false),
    [itemName, setItemName] = useState("");
  const tint = HABIT_COLORS[color];
  const patch = (value: Partial<HabitSettings>) => setSettings((old) => ({ ...old, ...value }));
  const chooseDays = (key: "weekdays" | "monthdays", day: number) =>
    patch({
      [key]: settings[key].includes(day)
        ? settings[key].filter((value) => value !== day)
        : [...settings[key], day],
    });
  const canSave = canSaveHabit(name, color, target, settings, goal, stepAmount);
  const save = async () => {
    if (busy || saveLock.current) return;
    saveLock.current = true;
    setSaving(true);
    setLocalError("");
    try {
      const details = habitFormDetails(name, color, target, settings, goal, stepAmount);
      const next = details.settings;
      if (
        next.reminder ||
        (next.tracking === "checklist" && next.checklist.some((item) => item.reminder))
      )
        await requestHabitReminders();
      await onSave({ ...details, settings: next });
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Could not save habit.");
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  };
  const next = () => {
    if (!name.trim()) {
      setLocalError("Enter a habit title.");
      return;
    }
    if (
      step === 2 &&
      ((settings.frequency === "weekdays" && !settings.weekdays.length) ||
        (settings.frequency === "monthdays" && !settings.monthdays.length))
    ) {
      setLocalError("Select at least one day.");
      return;
    }
    setLocalError("");
    setStep((value) => value + 1);
  };
  const radio = (key: HabitSettings["frequency"]) => (
    <Pressable
      key={key}
      disabled={busy || (settings.type === "quit" && key !== "daily")}
      onPress={() => patch({ frequency: key })}
      style={[s.radio, settings.type === "quit" && key !== "daily" && { opacity: 0.25 }]}
    >
      <MaterialCommunityIcons
        name={settings.frequency === key ? "radiobox-marked" : "radiobox-blank"}
        size={25}
        color={settings.frequency === key ? tint : "#f4f4f5"}
      />
      <Text
        style={[
          s.text,
          settings.type === "quit" && key !== "daily" && { textDecorationLine: "line-through" },
        ]}
      >
        {HABIT_FREQUENCIES[key]}
      </Text>
    </Pressable>
  );
  const frequency = (
    <View style={[s.section, { gap: 4, paddingVertical: 10 }]}>
      <Text style={s.label}>Frequency</Text>
      {(Object.keys(HABIT_FREQUENCIES) as HabitSettings["frequency"][]).map(radio)}
      {settings.frequency === "weekdays" && (
        <View style={s.wrap}>
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, index) => (
            <Pressable
              key={day}
              disabled={busy}
              onPress={() => chooseDays("weekdays", index)}
              style={[
                s.day,
                settings.weekdays.includes(index) && {
                  backgroundColor: tint + "45",
                  borderColor: tint,
                },
              ]}
            >
              <Text style={s.text}>{day}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {settings.frequency === "monthdays" && (
        <View style={s.wrap}>
          {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => (
            <Pressable
              key={day}
              disabled={busy}
              onPress={() => chooseDays("monthdays", day)}
              style={[
                s.day,
                settings.monthdays.includes(day) && {
                  backgroundColor: tint + "45",
                  borderColor: tint,
                },
              ]}
            >
              <Text style={s.text}>{day}</Text>
            </Pressable>
          ))}
          <Text style={s.hint}>Dates absent from a month are rest days.</Text>
        </View>
      )}
      {settings.frequency === "period" && (
        <View style={s.wrap}>
          <TextInput
            accessibilityLabel="Days per period"
            value={String(settings.perPeriod)}
            keyboardType="number-pad"
            onChangeText={(value) =>
              patch({
                perPeriod: Math.max(
                  1,
                  Math.min(settings.period === "week" ? 7 : 31, Number(value) || 1),
                ),
              })
            }
            style={[s.input, { width: 64 }]}
          />
          {(["week", "month"] as const).map((period) => (
            <Pressable
              key={period}
              disabled={busy}
              style={[s.segment, settings.period === period && { backgroundColor: tint + "45" }]}
              onPress={() =>
                patch({
                  period,
                  perPeriod: Math.min(settings.perPeriod, period === "week" ? 7 : 31),
                })
              }
            >
              <Text style={s.text}>{period === "week" ? "Per week" : "Per month"}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
  const palette = (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ backgroundColor: "#101010", borderRadius: 17 }}
      contentContainerStyle={{ padding: 12, gap: 12 }}
    >
      {HABIT_COLOR_COLUMNS.map((column, index) => (
        <View key={index} style={{ gap: 12 }}>
          {column.map((option) => (
            <Pressable
              key={option}
              disabled={busy}
              accessibilityLabel={option}
              accessibilityState={{ selected: color === option }}
              onPress={() => setColor(option)}
              style={{
                width: 30,
                height: 30,
                borderRadius: 15,
                backgroundColor: HABIT_COLORS[option],
                borderWidth: color === option ? 2 : 0,
                borderColor: "white",
              }}
            />
          ))}
        </View>
      ))}
    </ScrollView>
  );
  const theme = (
    <>
      <View style={s.preview}>
        <View style={[s.icon, { backgroundColor: tint + "18" }]}>
          <MaterialCommunityIcons name={settings.icon as any} size={27} color={tint} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.text}>{name || "Your habit"}</Text>
          <Text style={s.hint}>{target ? target + " day challenge" : "Build your routine"}</Text>
        </View>
        <View style={[s.icon, { backgroundColor: tint }]}>
          <MaterialCommunityIcons name="check" size={28} color="#000" />
        </View>
      </View>
      <Text style={s.label}>Select Habit Color</Text>
      <View style={[s.section, s.wrap]}>
        {(Object.keys(HABIT_COLORS) as HabitColor[]).map((option) => (
          <Pressable
            key={option}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={option}
            accessibilityState={{ selected: color === option }}
            onPress={() => setColor(option)}
            style={{
              width: 38,
              height: 38,
              borderRadius: 19,
              backgroundColor: HABIT_COLORS[option],
              borderWidth: color === option ? 3 : 0,
              borderColor: "white",
            }}
          />
        ))}
      </View>
      <Text style={s.label}>Select Habit Icon</Text>
      <View style={[s.section, s.wrap]}>
        {HABIT_ICONS.map((icon) => (
          <Pressable
            key={icon}
            accessibilityLabel={icon}
            disabled={busy}
            onPress={() => patch({ icon })}
            style={[s.iconChoice, settings.icon === icon && { backgroundColor: tint + "25" }]}
          >
            <MaterialCommunityIcons
              name={icon as any}
              size={25}
              color={settings.icon === icon ? tint : "#f4f4f5"}
            />
          </Pressable>
        ))}
      </View>
    </>
  );
  return (
    <Modal
      visible
      animationType="slide"
      onRequestClose={() => {
        if (!busy) onClose();
      }}
    >
      <StatusBar hidden />
      <SafeAreaView style={s.page} edges={["left", "right", "bottom"]}>
        <KeyboardAvoidingView
          style={s.page}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View style={s.header}>
            <Pressable accessibilityLabel="Back" disabled={busy} onPress={onClose}>
              <MaterialCommunityIcons name="arrow-left" size={28} color="white" />
            </Pressable>
            <Text style={s.title}>{habit ? "Edit Habit" : "Add Habit"}</Text>
            {step === 3 && (
              <Pressable
                disabled={busy || !canSave}
                accessibilityLabel={busy ? "Saving habit" : "Save habit"}
                accessibilityState={{ disabled: busy || !canSave, busy }}
                onPress={() => void save()}
                style={[s.save, !canSave && { opacity: 0.35 }]}
              >
                {busy ? (
                  <>
                    <ActivityIndicator size="small" color={tint} />
                    <Text style={s.text}>Saving…</Text>
                  </>
                ) : (
                  <>
                    <Text style={s.text}>Save</Text>
                    <MaterialCommunityIcons name="check" size={26} color="white" />
                  </>
                )}
              </Pressable>
            )}
          </View>
          {!habit && step < 3 && (
            <View style={s.progress}>
              <View
                style={{
                  height: "100%",
                  backgroundColor: colors.accent,
                  width: ((step + 1) * 25 + "%") as `${number}%`,
                  borderRadius: 12,
                }}
              />
            </View>
          )}
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[s.content, step < 3 && { flexGrow: 1 }]}
          >
            {step === 0 ? (
              <>
                <Text style={s.question}>What Habit Do You Want To Track?</Text>
                <View style={{ flex: 1, justifyContent: "center", paddingBottom: 40 }}>
                  <Text style={s.label}>Habit Title</Text>
                  <TextInput
                    autoFocus
                    value={name}
                    onChangeText={setName}
                    maxLength={80}
                    style={[s.input, { borderColor: colors.accent, marginTop: 14, padding: 18 }]}
                    placeholder="Wake Up Early"
                    placeholderTextColor="#71717a"
                  />
                </View>
              </>
            ) : step === 1 ? (
              <>
                <Text style={s.question}>Customize Tracker Theme</Text>
                {theme}
              </>
            ) : step === 2 ? (
              <>
                <Text style={s.question}>How often do you want to do this habit?</Text>
                <View style={{ flex: 1, justifyContent: "center" }}>{frequency}</View>
              </>
            ) : (
              <>
                <TextInput
                  editable={!busy}
                  value={name}
                  onChangeText={setName}
                  maxLength={80}
                  placeholder="Enter Habit Title"
                  placeholderTextColor="#818181"
                  style={s.input}
                />
                <View style={{ flexDirection: "row", gap: 40, paddingVertical: 2 }}>
                  <Pressable
                    disabled={busy}
                    accessibilityLabel="Choose habit color"
                    onPress={() => setColorsOpen((value) => !value)}
                    style={{ flexDirection: "row", gap: 12, alignItems: "center" }}
                  >
                    <View style={[s.icon, { backgroundColor: "#101010", borderRadius: 12 }]}>
                      <View
                        style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: tint }}
                      />
                    </View>
                    <Text style={s.text}>Color</Text>
                  </Pressable>
                  <Pressable
                    disabled={busy}
                    accessibilityLabel="Choose habit icon"
                    onPress={() => setThemeOpen(true)}
                    style={{ flexDirection: "row", gap: 12, alignItems: "center" }}
                  >
                    <View style={[s.icon, { backgroundColor: "#101010", borderRadius: 12 }]}>
                      <MaterialCommunityIcons name={settings.icon as any} size={22} color="white" />
                    </View>
                    <Text style={s.text}>Icon</Text>
                  </Pressable>
                </View>
                {colorsOpen && palette}
                <View style={s.section}>
                  <Text style={s.label}>Type</Text>
                  <View style={s.segments}>
                    {(["build", "quit"] as const).map((type) => (
                      <Pressable
                        key={type}
                        disabled={busy}
                        style={[
                          s.segment,
                          { flex: 1 },
                          settings.type === type && { backgroundColor: tint + "40" },
                        ]}
                        onPress={() => {
                          patch({ type, ...(type === "quit" ? { frequency: "daily" } : {}) });
                          setGoal(type === "quit" ? "0" : "1");
                        }}
                      >
                        <Text style={s.text}>
                          {type === "build" ? "Build A Habit" : "Quit A Habit"}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <Text style={s.hint}>
                    {settings.type === "quit"
                      ? "Completed by default – only mark the days you slipped. Streak is counted as slip-free days."
                      : "Do it regularly. Tap to mark it done."}
                  </Text>
                </View>
                {frequency}
                <View style={s.section}>
                  <Text style={s.label}>Tracking</Text>
                  <View style={s.segments}>
                    {(["tick", "count", "checklist"] as const).map((tracking) => (
                      <Pressable
                        key={tracking}
                        disabled={busy}
                        onPress={() => patch({ tracking })}
                        style={[
                          s.segment,
                          { flex: 1 },
                          settings.tracking === tracking && { backgroundColor: tint + "40" },
                        ]}
                      >
                        <Text style={[s.text, { fontSize: 13 }]}>
                          {tracking[0]!.toUpperCase() + tracking.slice(1)}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <Text style={s.hint}>
                    {settings.tracking === "tick"
                      ? settings.type === "quit"
                        ? "Tap to mark a slip."
                        : "Tap once to mark the day done."
                      : settings.tracking === "count"
                        ? settings.type === "quit"
                          ? "Log each time — the day stays clean up to your limit."
                          : "Set a daily goal and how much each tap adds."
                        : "Complete every checklist item to finish the day."}
                  </Text>
                  {settings.tracking === "count" && (
                    <>
                      <Text style={s.smallLabel}>
                        {settings.type === "quit" ? "DAILY LIMIT" : "DAILY GOAL (optional)"}
                      </Text>
                      <View style={s.segments}>
                        <TextInput
                          editable={!busy}
                          keyboardType="decimal-pad"
                          value={goal}
                          onChangeText={setGoal}
                          style={[s.input, { flex: 1 }]}
                        />
                        <Pressable
                          onPress={() =>
                            setGoal(
                              String(Math.max(settings.type === "quit" ? 0 : 1, Number(goal) - 1)),
                            )
                          }
                          style={s.counter}
                        >
                          <Text style={s.text}>−</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => setGoal(String((Number(goal) || 0) + 1))}
                          style={s.counter}
                        >
                          <Text style={s.text}>＋</Text>
                        </Pressable>
                      </View>
                      <Text style={s.hint}>
                        {settings.type === "quit"
                          ? "Going over this amount counts as a slip."
                          : "Reaching this amount completes the day."}
                      </Text>
                      <Text style={s.smallLabel}>UNIT (optional)</Text>
                      <TextInput
                        editable={!busy}
                        value={settings.unit}
                        onChangeText={(unit) => patch({ unit })}
                        placeholder="km, pages, minutes..."
                        placeholderTextColor="#818181"
                        style={s.input}
                      />
                      <Text style={s.smallLabel}>EACH TAP ADDS</Text>
                      <View style={s.segments}>
                        <TextInput
                          editable={!busy}
                          keyboardType="decimal-pad"
                          value={stepAmount}
                          onChangeText={setStepAmount}
                          style={[s.input, { flex: 1 }]}
                        />
                        <Pressable
                          accessibilityLabel="Decrease tap amount"
                          style={s.counter}
                          onPress={() =>
                            setStepAmount(String(Math.max(0.001, (Number(stepAmount) || 1) - 1)))
                          }
                        >
                          <Text style={s.text}>−</Text>
                        </Pressable>
                        <Pressable
                          accessibilityLabel="Increase tap amount"
                          style={s.counter}
                          onPress={() => setStepAmount(String((Number(stepAmount) || 0) + 1))}
                        >
                          <Text style={s.text}>＋</Text>
                        </Pressable>
                      </View>
                      <Text style={s.hint}>Long press opens the count editor</Text>
                    </>
                  )}
                  {settings.tracking === "checklist" && (
                    <>
                      {settings.checklist.map((item) => (
                        <View key={item.id} style={[s.segments, { alignItems: "center" }]}>
                          <Text style={[s.text, { flex: 1 }]}>
                            {item.title}
                            {item.reminder ? " · " + item.reminder : ""}
                          </Text>
                          <Pressable
                            disabled={busy}
                            onPress={() =>
                              patch({
                                checklist: settings.checklist.filter(
                                  (value) => value.id !== item.id,
                                ),
                              })
                            }
                          >
                            <MaterialCommunityIcons name="close" size={20} color="#a1a1aa" />
                          </Pressable>
                        </View>
                      ))}
                      <Pressable
                        disabled={busy}
                        onPress={() => {
                          setItemName("");
                          setAdding(true);
                        }}
                      >
                        <Text style={{ color: tint, paddingVertical: 12 }}>＋ Add Checklist</Text>
                      </Pressable>
                    </>
                  )}
                  <View style={[s.switchRow, { marginTop: 6 }]}>
                    <Text style={s.text}>Set Reminder</Text>
                    <Switch
                      disabled={busy}
                      value={!!settings.reminder}
                      onValueChange={(value) => patch({ reminder: value ? "09:00" : null })}
                      trackColor={{ false: "#383838", true: tint + "70" }}
                      thumbColor={settings.reminder ? tint : "#fafafa"}
                    />
                  </View>
                  {settings.reminder && (
                    <HabitTimePicker
                      value={settings.reminder}
                      tint={tint}
                      onChange={(reminder) => patch({ reminder })}
                      disabled={busy}
                    />
                  )}
                  {settings.reminder && !IS_EXPO_GO && <View style={{ flexDirection: "row", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
                    <Pressable disabled={testingReminder || busy} onPress={async () => {
                      setTestingReminder(true); setLocalError("");
                      try { await testHabitReminder(name.trim()); }
                      catch (error) { setLocalError(error instanceof Error ? error.message : "Could not send test reminder."); }
                      finally { setTestingReminder(false); }
                    }}><Text style={{ color: tint, paddingVertical: 8 }}>{testingReminder ? "Scheduling…" : "Test reminder (5 sec)"}</Text></Pressable>
                    <Pressable onPress={() => { void Linking.openSettings(); }}><Text style={[s.hint, { paddingVertical: 8 }]}>Notification settings</Text></Pressable>
                  </View>}
                  {settings.reminder && IS_EXPO_GO && (
                    <Text style={s.hint}>
                      Reminder saved with your habit. Notifications run in the installed Android
                      app.
                    </Text>
                  )}
                  <Text style={[s.label, { marginTop: 6 }]}>Challenge target (optional)</Text>
                  <TextInput
                    editable={!busy}
                    value={target}
                    onChangeText={setTarget}
                    keyboardType="number-pad"
                    placeholder="70 days"
                    placeholderTextColor="#818181"
                    style={s.input}
                  />
                  <Text style={s.hint}>Each completed day counts toward your target.</Text>
                </View>

                {habit && (
                  <Text style={s.hint}>
                    Schedule and goal edits apply to future tracking; existing history is kept.
                  </Text>
                )}
              </>
            )}
            {!!(localError || error) && (
              <Text accessibilityRole="alert" style={{ color: "#fda4af", marginVertical: 10 }}>
                {localError || error}
              </Text>
            )}
          </ScrollView>
          {!habit && step < 3 && (
            <View style={s.bottom}>
              {step > 0 && (
                <Pressable
                  disabled={busy}
                  onPress={() => setStep(step - 1)}
                  style={{ padding: 14 }}
                >
                  <Text style={s.text}>Back</Text>
                </Pressable>
              )}
              <Pressable disabled={busy} onPress={next} style={s.next}>
                <Text style={{ color: "#000", fontWeight: "800", fontSize: 17 }}>Next</Text>
              </Pressable>
            </View>
          )}
          {themeOpen && (
            <HabitIconSheet
              value={settings.icon}
              tint={tint}
              onSelect={(icon) => patch({ icon })}
              onClose={() => setThemeOpen(false)}
            />
          )}

          <Modal
            transparent
            visible={adding}
            animationType="fade"
            onRequestClose={() => setAdding(false)}
          >
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : "height"}
              style={s.overlay}
            >
              <View style={s.checkDialog}>
                <Text style={[s.title, { textAlign: "center", marginBottom: 6, flex: 0 }]}>
                  Add Checklist
                </Text>
                <TextInput
                  autoFocus
                  value={itemName}
                  onChangeText={setItemName}
                  maxLength={80}
                  placeholder="Enter Checklist Title"
                  placeholderTextColor="#818181"
                  style={s.input}
                />
                <View style={s.bottom}>
                  <Pressable onPress={() => setAdding(false)}>
                    <Text style={s.text}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      if (!itemName.trim()) return;
                      patch({
                        checklist: [
                          ...settings.checklist,
                          {
                            id: Date.now() + "-" + Math.random().toString(36).slice(2, 7),
                            title: itemName.trim(),
                            reminder: null,
                          },
                        ],
                      });
                      setAdding(false);
                    }}
                    style={[s.segment, { backgroundColor: tint }]}
                  >
                    <Text style={{ color: "#000", fontWeight: "700" }}>Add</Text>
                  </Pressable>
                </View>
              </View>
            </KeyboardAvoidingView>
          </Modal>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
const s = createThemedStyles({
  page: { flex: 1, backgroundColor: "#000", paddingTop: 0 },
  header: {
    flexDirection: "row",
    gap: 18,
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: { color: "white", fontSize: 21, flex: 1 },
  save: { flexDirection: "row", gap: 8, alignItems: "center" },
  content: { padding: 10, gap: 12, paddingBottom: 28 },
  progress: { height: 10, marginHorizontal: 28, backgroundColor: "#202020", borderRadius: 12 },
  question: {
    color: "white",
    fontSize: 27,
    fontWeight: "800",
    textAlign: "center",
    marginVertical: 26,
  },
  input: {
    backgroundColor: "#0e0e0e",
    color: "white",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#222",
    fontSize: 14,
  },
  section: { padding: 12, gap: 10, borderRadius: 20, backgroundColor: "#0e0e0e" },
  label: { fontSize: 14, color: "#fafafa", fontWeight: "600" },
  smallLabel: { fontSize: 12, color: "#888", marginTop: 10 },
  text: { color: "#f4f4f5", fontSize: 14 },
  hint: { color: "#858585", fontSize: 12, lineHeight: 16, textAlign: "center" },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  preview: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: "#111",
    borderRadius: 20,
    padding: 16,
  },
  icon: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  iconChoice: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  radio: { flexDirection: "row", alignItems: "center", gap: 9, paddingVertical: 3 },
  day: {
    padding: 10,
    minWidth: 36,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#303030",
    borderRadius: 9,
  },
  segments: { flexDirection: "row", gap: 9 },
  segment: {
    backgroundColor: "#1b1b1b",
    padding: 10,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  counter: {
    backgroundColor: "#191919",
    width: 42,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 12,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  bottom: {
    padding: 22,
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 20,
  },
  next: { backgroundColor: colors.accent, flex: 1, alignItems: "center", borderRadius: 40, padding: 18 },
  overlay: {
    flex: 1,
    backgroundColor: "#000a",
    alignItems: "center",
    justifyContent: "center",
    padding: 22,
  },
  checkDialog: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#101010",
    borderRadius: 30,
    padding: 24,
    gap: 20,
  },
});
