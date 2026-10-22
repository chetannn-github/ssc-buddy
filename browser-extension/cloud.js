import { initializeApp } from 'firebase/app';
import { initializeAuth, indexedDBLocalPersistence, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth/web-extension';
import { decodeDocument, encode } from './firestore-codec.js';
import { editWebsites, startControl } from './policy.js';
export function createCloud() {
  const config = __FIREBASE_CONFIG__;
  if (!config.apiKey || !config.projectId || !config.appId) throw Error('The extension is not configured. Please install the latest version.');
  const app = initializeApp(config);
  const auth = initializeAuth(app, { persistence: indexedDBLocalPersistence });
  const ready = new Promise(resolve => { const stop = onAuthStateChanged(auth, () => { stop(); resolve(); }); });
  const root = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(config.projectId)}/databases/(default)/documents`;
  async function request(relative, options = {}) {
    await ready; const user = auth.currentUser; if (!user) throw Error('Sign in to your SSC Buddy account.');
    const token = await user.getIdToken();
    const response = await fetch(`${root}/users/${encodeURIComponent(user.uid)}/${relative}`, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers }, signal: AbortSignal.timeout(8000), cache: 'no-store' });
    if (response.status === 404 && !options.method) return null;
    const result = await response.json();
    if (!response.ok) { const error = new Error(response.status === 403 ? 'Sign in with your SSC Buddy account.' : 'Could not connect. Please try again.'); error.status = response.status; throw error; }
    return result;
  }
  async function editSelection(domain, remove) {
      for (let attempt = 0; attempt < 4; attempt++) {
        const document = await request('studyLock/current');
        const control = document ? decodeDocument(document) : { version: 1, revision: 'empty', session: null };
        const next = editWebsites(control, domain, remove);
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
    user: () => auth.currentUser ? { uid: auth.currentUser.uid, email: auth.currentUser.email } : null,
    subscribe: callback => onAuthStateChanged(auth, callback),
    login: (email, password) => signInWithEmailAndPassword(auth, email, password),
    logout: () => signOut(auth),
    async read() { const document = await request('studyLock/current'); return document ? decodeDocument(document) : { version: 1, revision: 'empty', session: null }; },
    editWebsite: editSelection,
    async start(minutes) {
      for (let attempt = 0; attempt < 4; attempt++) {
        const document = await request('studyLock/current');
        const control = document ? decodeDocument(document) : { version: 1, revision: 'empty', session: null };
        const next = startControl(control, minutes);
        const condition = document ? `currentDocument.updateTime=${encodeURIComponent(document.updateTime)}` : 'currentDocument.exists=false';
        try { await request(`studyLock/current?${condition}`, { method: 'PATCH', body: JSON.stringify({ fields: encode(next).mapValue.fields }) }); return; }
        catch (error) { if (![409, 412].includes(error.status)) throw error; }
      }
      throw Error('Your session changed on another device. Try again.');
    },
    async acknowledge(deviceId, sessionId, error = '') {
      const value = { label: /Edg\//.test(navigator.userAgent) ? 'Edge' : 'Chrome', extensionId: chrome.runtime.id, sessionId, error, version: 1 };
      const fields = encode(value).mapValue.fields; fields.lastSeenAt = { timestampValue: new Date().toISOString() };
      await request(`studyLockDevices/${encodeURIComponent(deviceId)}`, { method: 'PATCH', body: JSON.stringify({ fields }) });
    }
  };
}
