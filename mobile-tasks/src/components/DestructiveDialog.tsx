import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";
type Props = {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  busy?: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
};
export function DestructiveDialog({
  visible,
  title,
  message,
  confirmLabel = "Delete",
  busy = false,
  error,
  onCancel,
  onConfirm,
}: Props) {
  const locked = useRef(false),
    [pending, setPending] = useState(false),
    [localError, setLocalError] = useState("");
  useEffect(() => {
    if (visible) setLocalError("");
  }, [visible]);
  const working = busy || pending;
  const cancel = () => {
    if (!working && !locked.current) onCancel();
  };
  const confirm = async () => {
    if (working || locked.current) return;
    locked.current = true;
    setPending(true);
    setLocalError("");
    try {
      await onConfirm();
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      locked.current = false;
      setPending(false);
    }
  };
  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={cancel}
    >
      <View style={styles.backdrop}>
        <Pressable
          accessibilityLabel="Cancel confirmation"
          style={StyleSheet.absoluteFill}
          onPress={cancel}
        />
        <View accessibilityViewIsModal style={styles.card}>
          <Text accessibilityRole="header" style={styles.title}>
            {title}
          </Text>
          {!!message && <Text style={styles.message}>{message}</Text>}
          {!!(error || localError) && (
            <Text accessibilityLiveRegion="polite" style={styles.error}>
              {error || localError}
            </Text>
          )}
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              disabled={working}
              onPress={cancel}
              style={styles.button}
            >
              <Text style={[styles.cancel, working && styles.disabled]}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={confirmLabel}
              disabled={working}
              onPress={() => void confirm()}
              style={styles.button}
            >
              {working ? (
                <ActivityIndicator color="#ff1744" size="small" />
              ) : (
                <Text style={styles.destructive}>{confirmLabel}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,.78)",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  card: {
    width: "82%",
    maxWidth: 350,
    minHeight: 174,
    alignSelf: "center",
    padding: 24,
    borderRadius: 28,
    backgroundColor: "#181818",
  },
  title: { color: "#fbfbf8", fontSize: 20, lineHeight: 26, fontWeight: "700" },
  message: { color: "#a0a0a0", fontSize: 13, lineHeight: 19, marginTop: 12 },
  error: { color: "#ff8e9c", fontSize: 13, lineHeight: 19, marginTop: 12 },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 24, marginTop: 32 },
  button: { minHeight: 44, justifyContent: "center", flexShrink: 1 },
  cancel: { color: "#fafaf7", fontSize: 15, fontWeight: "600" },
  destructive: { color: "#ff003b", fontSize: 15, fontWeight: "600" },
  disabled: { opacity: 0.4 },
});
