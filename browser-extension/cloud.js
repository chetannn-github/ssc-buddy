import { effectiveStudySession } from "../shared/study-breaks.ts";
import { initializeApp } from 'firebase/app';
import { initializeAuth, indexedDBLocalPersistence, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth/web-extension';
import { decodeDocument, encode } from './firestore-codec.js';
import { creditFocusDay, focusSlices } from '../shared/study-focus.ts';
import { editWebsites, startControl } from './policy.js';
import { focusLeaderboardPatch, focusWeek } from '../shared/focus-rewards.ts';
import { getFirestore, doc, onSnapshot } from 'firebase/firestore';
import { dueFocusOccurrence, scheduledFocusSession } from '../shared/focus-schedules.ts';
import { validSession } from './policy.js';
export function createCloud() {
  const config = __FIREBASE_CONFIG__;
  if (!config.apiKey || !config.projectId || !config.appId) throw Error('The extension is not configured. Please install the latest version.');
  const app = initializeApp(config);
  const auth = initializeAuth(app, { persistence: indexedDBLocalPersistence });
  const db = getFirestore(app);
  const ready = new Promise(resolve => { const stop = onAuthStateChanged(auth, () => { stop(); resolve(); }); });
  const root = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(config.projectId)}/databases/(default)/documents`;
  async function request(relative, options = {}, expectedUid, publicUsername, leaderboardWeek) {
    await ready; const user = auth.currentUser; if (!user || (expectedUid && user.uid !== expectedUid)) throw Error('Sign in to your SSC Buddy account.');
    const token = await user.getIdToken();
    const url = leaderboardWeek ? `${root}/leaderboards/${encodeURIComponent(leaderboardWeek)}/entries/${encodeURIComponent(user.uid)}${relative}` : publicUsername ? `${root}/publicProfiles/${encodeURIComponent(publicUsername)}${relative}` : `${root}/users/${encodeURIComponent(user.uid)}/${relative}`;
    const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers }, signal: AbortSignal.timeout(8000), cache: 'no-store' });
    if (response.status === 404 && !options.method) return null;
    const result = await response.json();
    if (!response.ok) { const error = new Error(response.status === 403 ? 'Sign in with your SSC Buddy account.' : 'Could not connect. Please try again.'); error.status = response.status; throw error; }
    return result;
  }
  async function publishFocus(date, timeZone, uid) {
    const profileDocument = await request('profile/current', {}, uid);
    const profile = profileDocument ? decodeDocument(profileDocument) : {};
    const username = String(profile.username ?? '').trim().toLowerCase();
    if (!/^[a-z0-9._]{3,24}$/.test(username)) return;
    const dayDocument = await request('studyFocusDays/' + date, {}, uid);
    const total = Number(dayDocument ? decodeDocument(dayDocument).totalMilliseconds : 0) || 0;
    for (let attempt = 0; attempt < 4; attempt++) {
      const document = await request('', {}, uid, username);
      const value = document ? decodeDocument(document) : null;
      if (value?.uid !== uid) return;
      if (Number(value.focusDays?.[date] ?? -1) >= total && value.focusTimeZone === timeZone) { await publishLeaderboardFocus(uid, profile, date, value.focusDays); return; }
      const focusDays = { ...value.focusDays, [date]: Math.max(Number(value.focusDays?.[date]) || 0, total) };
      const condition = 'currentDocument.updateTime=' + encodeURIComponent(document.updateTime);
      const fields = encode({ focusDays, focusTimeZone: timeZone || 'UTC' }).mapValue.fields;
      try {
        await request('?updateMask.fieldPaths=focusDays&updateMask.fieldPaths=focusTimeZone&' + condition, { method: 'PATCH', body: JSON.stringify({ fields }) }, uid, username);
        await publishLeaderboardFocus(uid, profile, date, focusDays);
        return;
      } catch (error) { if (![409, 412].includes(error.status)) throw error; }
    }
    throw Error('Could not share focus time. Please try again.');
  }
  async function publishLeaderboardFocus(uid, profile, date, days) {
    const week = focusWeek(date);
    for (let attempt = 0; attempt < 4; attempt++) {
      const document = await request('', {}, uid, undefined, week), previous = document ? decodeDocument(document) : {};
      const patch = focusLeaderboardPatch(uid, profile, date, days);
      patch.focusDays = { ...previous.focusDays, ...Object.fromEntries(Object.entries(patch.focusDays).map(([day, value]) => [day, Math.max(previous.focusDays?.[day] ?? 0, value)])) };
      patch.focusXp = Math.max(previous.focusXp ?? 0, patch.focusXp);
      if (document && Object.entries(patch).every(([key, value]) => key === 'focusDays'
        ? Object.entries(value).every(([date, total]) => previous.focusDays?.[date] === total)
        : previous[key] === value)) return;
      const condition = document ? 'currentDocument.updateTime=' + encodeURIComponent(document.updateTime) : 'currentDocument.exists=false';
      const mask = Object.keys(patch).map(key => 'updateMask.fieldPaths=' + encodeURIComponent(key)).join('&');
      try { await request('?' + mask + '&' + condition, { method: 'PATCH', body: JSON.stringify({ fields: encode(patch).mapValue.fields }) }, uid, undefined, week); return; }
      catch (error) { if (![409, 412].includes(error.status)) throw error; }
    }
    throw Error('Could not update focus points. Please try again.');
  }
  async function recordFocus(session, time = Date.now(), expectedUid) {
    session = effectiveStudySession(session, time);
    const uid = auth.currentUser?.uid;
    if (!uid || (expectedUid && expectedUid !== uid)) throw Error("Sign in to your SSC Buddy account.");
    for (const slice of focusSlices(session, time, true)) {
      let saved = false;
      for (let attempt = 0; attempt < 4; attempt++) {
        const relative = 'studyFocusDays/' + slice.date;
        const document = await request(relative, {}, uid), value = document ? decodeDocument(document) : null;
        const next = creditFocusDay(value, session.id, slice.milliseconds);
        if (next.totalMilliseconds === value?.totalMilliseconds) { saved = true; break; }
        const condition = document ? 'currentDocument.updateTime=' + encodeURIComponent(document.updateTime) : 'currentDocument.exists=false';
        const fields = encode({ version: 1, date: slice.date, ...next }).mapValue.fields;
        fields.updatedAt = { timestampValue: new Date().toISOString() };
        try { await request(relative + '?' + condition, { method: 'PATCH', body: JSON.stringify({ fields }) }, uid); saved = true; break; }
        catch (error) { if (![409, 412].includes(error.status)) throw error; }
      }
      if (!saved) throw Error('Could not save focus time. Please try again.');
      await publishFocus(slice.date, session.timeZone || 'UTC', uid);
    }
  }
  async function editSelection(domain, remove) {
      for (let attempt = 0; attempt < 4; attempt++) {
        const document = await request('studyLock/current');
        const control = document ? decodeDocument(document) : { version: 1, revision: 'empty', session: null };
        const next = editWebsites(control, domain, remove);
        if (control.session && control.session.endsAt <= Date.now()) await recordFocus(control.session);
        const condition = document ? `currentDocument.updateTime=${encodeURIComponent(document.updateTime)}` : 'currentDocument.exists=false';
        try {
          const fields = encode(next).mapValue.fields; fields.updatedAt = { timestampValue: new Date().toISOString() };
          await request(`studyLock/current?${condition}`, { method: 'PATCH', body: JSON.stringify({ fields }) });
          return;
        } catch (error) { if (![409, 412].includes(error.status)) throw error; }
      }
      throw Error('Your websites changed on another device. Try again.');
  }
  return {
    ready,
    recordFocus,
    user: () => auth.currentUser ? { uid: auth.currentUser.uid, email: auth.currentUser.email } : null,
    subscribe: callback => onAuthStateChanged(auth, callback),
    watch(uid, next, failed, connection = () => {}) {
      return onSnapshot(doc(db, 'users', uid, 'studyLock', 'current'), { includeMetadataChanges: true }, snapshot => {
        connection(!snapshot.metadata.fromCache);
        // Cached startup data cannot release/replace a locally enforced lock.
        if (!snapshot.metadata.fromCache && auth.currentUser?.uid === uid) next(snapshot.exists() ? snapshot.data() : { version: 1, revision: 'empty', session: null });
      }, failed);
    },
    login: (email, password) => signInWithEmailAndPassword(auth, email, password),
    logout: () => signOut(auth),
    async read() {
      for(let attempt=0;attempt<4;attempt++){
        const document=await request('studyLock/current');
        const control=document?decodeDocument(document):{version:1,revision:'empty',session:null};
        const occurrence=dueFocusOccurrence(control.focusSchedules??[]);
        if(!occurrence||validSession(control.session))return control;
        const session=scheduledFocusSession(occurrence,control.session?effectiveStudySession(control.session).endsAt:0);
        if(session.startedAt>=session.endsAt)return control;
        if(control.session)await recordFocus(control.session);
        const next={...control,session,revision:crypto.randomUUID(),source:'focus-schedule'};
        try{
          await request('studyLock/current?currentDocument.updateTime='+encodeURIComponent(document.updateTime),{method:'PATCH',body:JSON.stringify({fields:encode(next).mapValue.fields})});
          return next;
        }catch(error){if(![409,412].includes(error.status))throw error;}
      }
      throw Error('Your session changed on another device. Try again.');
    },
    editWebsite: editSelection,
    async start(minutes) {
      for (let attempt = 0; attempt < 4; attempt++) {
        const document = await request('studyLock/current');
        const control = document ? decodeDocument(document) : { version: 1, revision: 'empty', session: null };
        const next = startControl(control, minutes);
        if (control.session) await recordFocus(control.session);
        const condition = document ? `currentDocument.updateTime=${encodeURIComponent(document.updateTime)}` : 'currentDocument.exists=false';
        try { await request(`studyLock/current?${condition}`, { method: 'PATCH', body: JSON.stringify({ fields: encode(next).mapValue.fields }) }); return; }
        catch (error) { if (![409, 412].includes(error.status)) throw error; }
      }
      throw Error('Your session changed on another device. Try again.');
    },
    async acknowledge(deviceId, sessionId, error = '', expectedUid) {
      const value = { label: /Edg\//.test(navigator.userAgent) ? 'Edge' : 'Chrome', extensionId: chrome.runtime.id, sessionId, error, version: 1 };
      const fields = encode(value).mapValue.fields; fields.lastSeenAt = { timestampValue: new Date().toISOString() };
      await request(`studyLockDevices/${encodeURIComponent(deviceId)}`, { method: 'PATCH', body: JSON.stringify({ fields }) }, expectedUid);
    }
  };
}
