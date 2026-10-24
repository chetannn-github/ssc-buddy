import { splitSelection } from "./study-selection.ts";

export const FOCUS_SCHEDULE_FREEZE_MS = 60 * 60_000;
export const MAX_FOCUS_SCHEDULES = 8;
export type FocusSchedule = {
  id: string; name: string; weekdays: number[]; startMinute: number; endMinute: number;
  timeZone: string; appLimit: number; domains: string[]; enabled: boolean; createdAt: number;
};
export type FocusOccurrence = { schedule: FocusSchedule; startedAt: number; endsAt: number; id: string };
export const SCHEDULE_PRESETS = [
  { name: "Sleep", startMinute: 22 * 60, endMinute: 6 * 60 },
  { name: "Morning detox", startMinute: 6 * 60, endMinute: 7 * 60 },
  { name: "Custom", startMinute: 9 * 60, endMinute: 10 * 60 },
];
export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const scheduleTime = (minute: number) => {
  const hour = Math.floor(minute / 60);
  return `${hour % 12 || 12}:${String(minute % 60).padStart(2,"0")} ${hour >= 12 ? "PM" : "AM"}`;
};
export function normalizeFocusSchedule(value: FocusSchedule): FocusSchedule {
  const duration = (value.endMinute - value.startMinute + 1440) % 1440;
  if (typeof value.id!=="string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(value.id) || typeof value.name!=="string" || !value.name.trim() || value.name.trim().length > 40) throw Error("Choose a schedule name.");
  if (![value.startMinute,value.endMinute].every(minute => Number.isInteger(minute) && minute >= 0 && minute < 1440) || duration < 1 || duration > 720) throw Error("Choose a schedule lasting 1 minute to 12 hours.");
  if (!Array.isArray(value.weekdays) || !value.weekdays.length || value.weekdays.some(day => !Number.isInteger(day) || day < 0 || day > 6)) throw Error("Choose at least one weekday.");
  if (!Number.isInteger(value.appLimit) || value.appLimit < 0 || value.appLimit > 2 || !Number.isSafeInteger(value.createdAt)) throw Error("Choose 0, 1 or 2 extra allowed apps.");
  try { new Intl.DateTimeFormat("en",{timeZone:value.timeZone}).format(0); } catch { throw Error("Choose a valid time zone."); }
  return { ...value, name:value.name.trim(), weekdays:[...new Set(value.weekdays)].sort(), domains:splitSelection(value.domains).domains, enabled:value.enabled !== false };
}
const formatters = new Map<string, Intl.DateTimeFormat>();
function localParts(time: number, zone: string) {
  let formatter = formatters.get(zone);
  if (!formatter) { formatter = new Intl.DateTimeFormat("en-GB",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"}); formatters.set(zone,formatter); }
  const parts = Object.fromEntries(formatter.formatToParts(time).map(part => [part.type,part.value]));
  return {year:Number(parts["year"]),month:Number(parts["month"]),day:Number(parts["day"]),hour:Number(parts["hour"]),minute:Number(parts["minute"]),second:Number(parts["second"])};
}
function wallTime(time: number, zone: string) {
  const p=localParts(time,zone);return Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second);
}
/** Match Android Calendar: later repeated wall time; spring gaps move forward. */
function zonedTime(date: Date, minute: number, zone: string) {
  const wall=Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate(),Math.floor(minute/60),minute%60);
  const offsets=new Set([-36,-12,0,12,36].map(hours=>{const probe=wall+hours*3600000;return wallTime(probe,zone)-probe;}));
  const candidates=[...offsets].map(offset=>wall-offset);
  const exact=candidates.filter(time=>wallTime(time,zone)===wall);
  if(exact.length)return Math.max(...exact);
  return candidates.filter(time=>wallTime(time,zone)>wall).sort((a,b)=>wallTime(a,zone)-wallTime(b,zone))[0]!;
}
export function focusOccurrences(schedule: FocusSchedule, now=Date.now()): FocusOccurrence[] {
  if(!schedule.enabled)return [];
  const p=localParts(now,schedule.timeZone),base=Date.UTC(p.year,p.month-1,p.day);
  const result: FocusOccurrence[]=[];
  for(let offset=-1;offset<=8;offset++){
    const day=new Date(base+offset*86400000);
    if(!schedule.weekdays.includes(day.getUTCDay()))continue;
    const startedAt=zonedTime(day,schedule.startMinute,schedule.timeZone);
    const endDay=new Date(day.getTime()+(schedule.endMinute<=schedule.startMinute?86400000:0));
    const endsAt=zonedTime(endDay,schedule.endMinute,schedule.timeZone);
    if(startedAt<schedule.createdAt || endsAt<=startedAt || endsAt-startedAt>720*60000)continue;
    result.push({schedule,startedAt,endsAt,id:`schedule-${schedule.id}-${startedAt}`});
  }
  return result.sort((a,b)=>a.startedAt-b.startedAt);
}
export function nextFocusOccurrence(schedule: FocusSchedule, now=Date.now()) {
  return focusOccurrences(schedule,now).find(occurrence=>occurrence.endsAt>now)??null;
}
export function focusScheduleFrozen(schedule: FocusSchedule, now=Date.now()) {
  const occurrence=nextFocusOccurrence(schedule,now);
  return !!occurrence && now>=occurrence.startedAt-FOCUS_SCHEDULE_FREEZE_MS && now<occurrence.endsAt;
}
export function dueFocusOccurrence(schedules: FocusSchedule[], now=Date.now()) {
  return schedules.flatMap(schedule=>focusOccurrences(schedule,now)).find(occurrence=>occurrence.startedAt<=now&&now<occurrence.endsAt)??null;
}
export function scheduledFocusSession(occurrence: FocusOccurrence, previousEnd=0) {
  return {id:occurrence.id,startedAt:Math.max(occurrence.startedAt,previousEnd),endsAt:occurrence.endsAt,domains:occurrence.schedule.domains,
    timeZone:occurrence.schedule.timeZone,appLimit:occurrence.schedule.appLimit,breakLimit:0,breaksTaken:0,scheduleId:occurrence.schedule.id};
}
export function assertScheduleChange(existing: FocusSchedule[], next: FocusSchedule|null, id: string, now=Date.now()) {
  const previous=existing.find(item=>item.id===id);
  if(previous&&focusScheduleFrozen(previous,now))throw Error("This schedule is locked from 1 hour before it starts until it ends.");
  if(!next)return;
  if(!previous&&existing.length>=MAX_FOCUS_SCHEDULES)throw Error(`Keep up to ${MAX_FOCUS_SCHEDULES} schedules.`);
  const windows=focusOccurrences(next,now);
  for(const other of existing.filter(item=>item.id!==id))for(const a of windows)for(const b of focusOccurrences(other,now)){
    if(a.startedAt<b.endsAt&&b.startedAt<a.endsAt)throw Error("This overlaps another focus schedule.");
  }
}
