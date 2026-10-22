import { FlexWidget, SvgWidget, TextWidget } from "react-native-android-widget";
import { normalizeAppAccent } from "../domain/app-accent";
import { FOCUS_WIDGET_URI, focusTimerWidgetModel } from "../domain/focus-timer-widget";

export function renderFocusTimerWidget(model: ReturnType<typeof focusTimerWidgetModel>) {
  const accent = normalizeAppAccent(model.accent);
  const icon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><g fill="none" stroke="#eeeeee" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6M12 2v3"/></g></svg>';
  return <FlexWidget clickAction="OPEN_URI" clickActionData={{ uri: FOCUS_WIDGET_URI }} accessibilityLabel={`Today's focus ${model.label}. Open Focus Lock setup`} style={{ width: "match_parent", height: "match_parent", flexDirection: "column", backgroundColor: "#141414", borderRadius: 22, padding: 12, justifyContent: "space-between" }}>
    <FlexWidget style={{ flexDirection: "row", alignItems: "center", width: "match_parent" }}><SvgWidget svg={icon} style={{ width: 18, height: 18 }} /><TextWidget text="Focus Lock" maxLines={1} style={{ color: "#ededed", fontSize: 12, fontWeight: "bold", marginLeft: 7 }} /></FlexWidget>
    <FlexWidget style={{ flexDirection: "column", paddingVertical: 4 }}><TextWidget text={model.label} maxLines={1} truncate="END" style={{ color: "#f9fcf5", fontSize: 28, fontWeight: "bold" }} /><TextWidget text="Today's focus" style={{ color: "#969696", fontSize: 11, marginTop: 2 }} /></FlexWidget>
    <FlexWidget style={{ flexDirection: "row", alignItems: "center", width: "match_parent", justifyContent: "space-between" }}><FlexWidget style={{ flexDirection: "row", alignItems: "center" }}><FlexWidget style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: accent, marginRight: 6 }} /><TextWidget text={model.hint} maxLines={1} style={{ color: "#bcbcbc", fontSize: 10 }} /></FlexWidget><TextWidget text="↗" style={{ color: "#eeeeee", fontSize: 16 }} /></FlexWidget>
  </FlexWidget>;
}
