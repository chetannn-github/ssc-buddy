import { studyTimeZone } from "../shared/study-focus.ts";
import { splitSelection, websiteDomain } from '../shared/study-selection.ts';
export const RULE_IDS = [1, 2, 3];
export function validSession(session, time = Date.now()) {
  if (session === null) return null;
  if (!session || typeof session.id !== 'string' || !Number.isSafeInteger(session.startedAt) || !Number.isSafeInteger(session.endsAt) || session.endsAt <= session.startedAt || session.endsAt - session.startedAt > 720 * 60000 || !Array.isArray(session.domains) || session.domains.length > 64) throw Error('Invalid study session');
  if (session.paused !== undefined && session.paused !== true) throw Error('Invalid study session');
  if (session.lockId !== undefined && (typeof session.lockId !== 'string' || !session.lockId.length || session.lockId.length > 128)) throw Error('Invalid study session');
  if (session.paused && (!Number.isSafeInteger(session.remainingMs) || session.remainingMs < 1 || session.remainingMs > 720 * 60000 || !Number.isSafeInteger(session.pausedAt))) throw Error('Invalid paused study session');
  for (const domain of session.domains) {
    if (typeof domain !== 'string' || domain.length > 253 || !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(domain) || /^\d+(\.\d+){3}$/.test(domain)) throw Error('Invalid allowed website');
  }
  // Mobile sessions can start without browser exceptions; keep all websites blocked.
  return session.paused || session.endsAt > time ? { id: session.id, startedAt: session.startedAt, endsAt: session.endsAt, domains: session.domains.slice(0, 3), ...(session.lockId ? { lockId: session.lockId } : {}), ...(session.timeZone ? { timeZone: session.timeZone } : {}), ...(session.paused ? { paused: true, pausedAt: session.pausedAt, remainingMs: session.remainingMs } : {}) } : null;
}
export function normalizeWebsite(value) { return splitSelection([String(value).trim()]).domains[0] ?? (() => { throw Error('Enter a website domain.'); })(); }
export function editWebsites(control, value, remove = false, time = Date.now()) {
  const text = String(value).trim();
  const item = websiteDomain(text);
  const active = control.session && (control.session.paused || control.session.endsAt > time);
  if (active && remove) throw Error('Websites stay locked until the timer ends.');
  const current = active ? control.session.domains : control.allowedDomains ?? [];
  const values = remove ? current.filter(entry => entry !== item) : [...new Set([...current, item])];
  const { domains } = splitSelection(values);
  return { ...control, version: 1, revision: crypto.randomUUID(), session: active ? { ...control.session, domains } : null, allowedDomains: domains, source: 'extension' };
}
export function startControl(control, minutes, time = Date.now()) {
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 720) throw Error('Choose 1 minute to 12 hours.');
  if (control.session && (control.session.paused || control.session.endsAt > time)) throw Error('Your session is already running.');
  const { domains } = splitSelection(control.allowedDomains ?? []);
  if (!domains.length) throw Error('Add a website first.');
  return { ...control, version: 1, revision: crypto.randomUUID(), source: 'extension', session: { id: crypto.randomUUID(), startedAt: time, endsAt: time + minutes * 60000, domains, timeZone: studyTimeZone() } };
}
export function allowed(url, domains) {
  try { const parsed = new URL(url); return ['https:', 'http:'].includes(parsed.protocol) && domains.some(d => parsed.hostname === d || parsed.hostname.endsWith(`.${d}`)); } catch { return false; }
}
export function rulesFor(session, blockedURL = '') {
  if (!session) return [];
  return [
    { id: 1, priority: 1, action: { type: 'redirect', redirect: blockedURL ? { regexSubstitution: `${blockedURL}#site=\\1` } : { extensionPath: '/blocked.html' } }, condition: { regexFilter: '^(https?://.*)$', resourceTypes: ['main_frame'] } },
    ...(session.domains.length ? [{ id: 2, priority: 2, action: { type: 'allow' }, condition: { requestDomains: session.domains, resourceTypes: ['main_frame'] } }] : [])
  ];
}
