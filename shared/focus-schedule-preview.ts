import type { FocusSchedule } from "./focus-schedules";
import { studyTimeZone } from "./study-focus";

// Temporary UI fixtures. They never enter the control document or native alarms.
export const SHOW_FOCUS_SCHEDULE_PREVIEWS = true;
export const isFocusSchedulePreview = (id: string) => id.startsWith("preview-focus-");
export const focusScheduleIconIndex = (id: string) => [...id].reduce((sum,char)=>sum+char.charCodeAt(0),0)%5;
export function focusSchedulePreviews(): FocusSchedule[] {
  if (!SHOW_FOCUS_SCHEDULE_PREVIEWS) return [];
  return [
    { name: "Sleep", startMinute: 1320, endMinute: 360, weekdays: [0,1,2,3,4,5,6], appLimit: 0 },
    { name: "Morning detox", startMinute: 390, endMinute: 450, weekdays: [1,2,3,4,5], appLimit: 0 },
    { name: "Deep study", startMinute: 540, endMinute: 660, weekdays: [1,3,5], appLimit: 1 },
    { name: "Reading", startMinute: 840, endMinute: 900, weekdays: [0,6], appLimit: 2 },
    { name: "Evening revision", startMinute: 1140, endMinute: 1200, weekdays: [1,2,3,4,5], appLimit: 1 },
  ].map((item,index)=>({...item,id:`preview-focus-${index}`,timeZone:studyTimeZone(),domains:[],enabled:false,createdAt:0}));
}
