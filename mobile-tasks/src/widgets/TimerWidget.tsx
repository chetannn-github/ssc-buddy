import { FlexWidget, SvgWidget, TextWidget } from "react-native-android-widget";
import { timerDial, timerReferenceDays, type DateTimer } from "../domain/date-timers";

export function renderTimerWidget(timer?: DateTimer, timers: DateTimer[] = [], color = "#8ef000") {
  const dial = timer ? timerDial(timer, Date.now(), timerReferenceDays(timers)) : null;
  const height = 118 * (dial?.progress ?? 0);
  const ring = 2 * Math.PI * 63;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160"><defs><clipPath id="tank"><circle cx="80" cy="80" r="59"/></clipPath></defs><circle cx="80" cy="80" r="63" fill="none" stroke="#343434" stroke-width="9"/><circle cx="80" cy="80" r="63" fill="none" stroke="${color}" stroke-width="9" stroke-dasharray="${ring * (dial?.progress ?? 0)} ${ring}" transform="rotate(-90 80 80)"/><g clip-path="url(#tank)"><rect x="21" y="${139 - height}" width="118" height="${height}" fill="${color}" fill-opacity=".45"/></g><text x="80" y="77" text-anchor="middle" fill="#ffffff" font-family="sans-serif" font-size="29" font-weight="700">${dial?.label ?? "—"}</text><text x="80" y="95" text-anchor="middle" fill="#ffffff" font-family="sans-serif" font-size="9">${dial?.status ?? "TIMER"}</text></svg>`;
  return <FlexWidget clickAction="OPEN_URI" clickActionData={{ uri: "sscbuddy://timers" }} accessibilityLabel={timer ? `${timer.title}, ${dial?.label} ${dial?.status}` : "Open Timers"} style={{ width: "match_parent", height: "match_parent", backgroundColor: "#171717", borderRadius: 22, alignItems: "center", justifyContent: "center", padding: 8, flexDirection: "column" }}>
    <SvgWidget svg={svg} style={{ width: 124, height: 124 }} />
    <TextWidget text={timer?.title ?? "Open app to select a timer"} maxLines={2} truncate="END" style={{ color: "#fafafa", fontSize: 12, fontWeight: "bold", textAlign: "center" }} />
    {timer && <TextWidget text={new Date(timer.targetAt).toLocaleDateString(undefined, { dateStyle: "medium" })} style={{ color: "#a1a1aa", fontSize: 10, textAlign: "center", marginTop: 3 }} />}
  </FlexWidget>;
}
