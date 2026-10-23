import { onStudyBreak } from "../shared/study-breaks.ts";
import { STUDY_HEARTBEAT_MS } from '../shared/study-presence.ts';
import { validSession, rulesFor, allowed, normalizeWebsite, RULE_IDS } from './policy.js';
function blockedTarget(value) { try { const hash = new URL(value).hash; const raw = hash.startsWith('#site=') ? hash.slice(6) : hash.startsWith('#youtube=') ? hash.slice(9) : ''; const url = new URL(/^https?:\/\//.test(raw) ? raw : decodeURIComponent(raw)); return ['http:', 'https:'].includes(url.protocol) ? url.href : null; } catch { return null; } }
import { MAX_STUDY_WEBSITES, isSocialHost, websiteDomain } from '../shared/study-selection.ts';
function userError(error) {
  const code = error?.code;
  if (['auth/invalid-credential','auth/wrong-password','auth/user-not-found','auth/invalid-email','auth/missing-password'].includes(code)) return 'Check your email and password.';
  if (code === 'auth/too-many-requests') return 'Too many attempts. Try again later.';
  if (code === 'auth/network-request-failed') return 'Check your internet connection.';
  if (code?.startsWith('auth/')) return 'Could not sign in. Please try again.';
  const message = error?.message ?? '';
  return /firebase|googleapis|identitytoolkit|securetoken/i.test(message) || !message ? 'Could not connect. Please try again.' : message;
}
export function startWorker(cloud) {
  let lastSync = 0, error = '', chain = Promise.resolve(), syncing;
  let stopControl, watchingUid, latestPacket;
  let watchUpdates = Promise.resolve();
  const serialize = work => { const next = chain.then(work); chain = next.catch(() => {}); return next; };
  const get = async () => await chrome.storage.local.get(['study', 'deviceId']);
  async function apply(session, revision, uid) {
    const { study } = await get();
    if (study?.session && (!session || session.id !== study.session.id)) {
      const { pendingFocus = [] } = await chrome.storage.local.get('pendingFocus');
      const next = pendingFocus.filter(entry => entry.uid !== study.uid || entry.session.id !== study.session.id);
      next.push({ uid: study.uid, session: study.session });
      await chrome.storage.local.set({ pendingFocus: next });
    }
    const oldGrants = await chrome.declarativeNetRequest.getSessionRules();
    await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: oldGrants.filter(rule => rule.id >= 100000).map(rule => rule.id) });
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: RULE_IDS, addRules: rulesFor(session, chrome.runtime.getURL('blocked.html')) });
    await chrome.storage.local.set({ study: { session, revision, uid } });
    await chrome.alarms.clear('study-end');
    if (session && (!session.paused || session.breakUntil)) await chrome.alarms.create('study-end', { when: session.breakUntil ?? session.endsAt });
    if (session && !onStudyBreak(session)) await blockOpenTabs(session);
    await chrome.action.setBadgeText({ text: onStudyBreak(session) ? 'BREAK' : session ? 'ON' : '' });
    await chrome.action.setBadgeBackgroundColor({ color: '#577c3e' });
  }
  async function blockOpenTabs(session) {
    for (const tab of await chrome.tabs.query({})) {
      if (tab.id && /^https?:\/\//.test(tab.url ?? '') && !allowed(tab.url, session.domains)) await chrome.tabs.update(tab.id, { url: chrome.runtime.getURL('blocked.html') + '#site=' + encodeURIComponent(tab.url) }).catch(() => {});
    }
  }
  async function expire() {
    const { study } = await get(); const session = validSession(study?.session ?? null);
    if (study?.session && JSON.stringify(session) !== JSON.stringify(study.session)) await apply(session, study.revision, study.uid);
    return session;
  }
  async function receive(packet, uid) {
    if (packet.version !== 1 || typeof packet.revision !== 'string' || packet.revision.length > 128) throw Error('Could not load your focus session');
    const session = validSession(packet.session);
    const { study: saved } = await get();
    const locked = validSession(saved?.session ?? null);
    if (locked && saved.uid === uid) {
      const oldItems = locked.domains;
      const nextItems = session ? session.domains : [];
      const sameSites = session && oldItems.length === session.domains.length && oldItems.every(item => session.domains.includes(item));
      const paused = !locked.paused && session?.paused && session.id === locked.id && session.startedAt === locked.startedAt && session.endsAt === locked.endsAt && sameSites;
      // A browser may reconnect after both pause and resume already happened on the phone.
      const resumed = session && !session.paused && sameSites && session.lockId === (locked.lockId ?? locked.id) && session.startedAt >= locked.startedAt && session.endsAt - session.startedAt <= (locked.paused ? locked.remainingMs : locked.endsAt - locked.startedAt);
      if (!paused && !resumed && (!session || session.id !== locked.id || session.startedAt !== locked.startedAt || session.endsAt !== locked.endsAt || Boolean(session.paused) !== Boolean(locked.paused) || Number(session.remainingMs ?? 0) !== Number(locked.remainingMs ?? 0) || oldItems.some(item => !nextItems.includes(item)))) throw Error('Your session stays locked until its timer ends.');
    }
    const domains = (session?.domains ?? packet.allowedDomains ?? []).slice(0, MAX_STUDY_WEBSITES);
    await chrome.storage.local.set({ websiteDraft: { uid, domains } });
    const { study } = await get();
    if (study?.uid !== uid || study?.revision !== packet.revision || JSON.stringify(study?.session ?? null) !== JSON.stringify(session)) {
      await apply(session, packet.revision, uid);

    }
    return session;
  }
  async function sync(packetOverride) {
    if (syncing) return syncing;
    syncing = (async () => {
      await cloud.ready;
      const user = cloud.user(); if (!user) return;
      const packet = packetOverride ?? await cloud.read();
      if (cloud.user()?.uid !== user.uid) return;
      const session = await serialize(() => receive(packet, user.uid));
      let { deviceId } = await get();
      if (!deviceId) { deviceId = crypto.randomUUID(); await chrome.storage.local.set({ deviceId }); }
      const state = JSON.stringify([user.uid, session?.id ?? null, !!session?.paused, session?.breakUntil ?? null]);
      const { studyHeartbeat } = await chrome.storage.local.get('studyHeartbeat');
      // Survives MV3 worker restarts. Idle browsers write only on state changes.
      if (studyHeartbeat?.state !== state || (session && Date.now() - studyHeartbeat.at >= STUDY_HEARTBEAT_MS)) {
        await cloud.acknowledge(deviceId, session?.id ?? null);
        await chrome.storage.local.set({ studyHeartbeat: { state, at: Date.now() } });
      }
      lastSync = Date.now(); error = '';
      // Enforcement/acknowledgement always complete first. Stats retries never
      // hold a browser locked beyond its deadline, including while offline.
      if (cloud.recordFocus) {
        try {
          if (packet.session) await cloud.recordFocus(packet.session);
          const { pendingFocus = [] } = await chrome.storage.local.get('pendingFocus');
          for (const entry of pendingFocus.filter(entry => entry.uid === user.uid)) {
            if (cloud.user()?.uid !== user.uid) break;
            await cloud.recordFocus(entry.session);
            await serialize(async () => {
              const { pendingFocus: latest = [] } = await chrome.storage.local.get('pendingFocus');
              await chrome.storage.local.set({ pendingFocus: latest.filter(item => item.uid !== entry.uid || item.session.id !== entry.session.id) });
            });
          }
        } catch { /* Cached sessions and pending credits retry on the next sync. */ }
      }
    })().catch(e => { error = userError(e); }).finally(() => { syncing = undefined; });
    return syncing;
  }
  async function currentWebsite() {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const raw = tab?.url;
    const target = raw?.startsWith(chrome.runtime.getURL('blocked.html')) ? blockedTarget(raw) : raw;
    try {
      const url = new URL(target); const domain = websiteDomain(target);
      return { tabId: tab.id, url: target, domain, canAdd: !isSocialHost(domain), label: 'Add current website' };
    } catch { return null; }
  }
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(''))) return;
    void (async () => {
      const session = await serialize(expire); await cloud.ready;
      if (message.type === 'login' || message.type === 'logout') {
        if (!sender.url.startsWith(chrome.runtime.getURL('popup.html'))) throw Error('Open the extension popup to manage your account.');
        if (session) throw Error('Account changes are locked until your focus timer ends.');
        if (message.type === 'login') { await cloud.login(String(message.email ?? '').trim(), String(message.password ?? '')); await sync(); }
        if (message.type === 'logout') { await cloud.logout(); lastSync = 0; await serialize(() => apply(null, 'signed-out', null)); }
      } else if (message.type === 'website') {
        if (!sender.url.startsWith(chrome.runtime.getURL('popup.html'))) throw Error('Open the extension popup to edit websites.');
        if (!cloud.user()) throw Error('Sign in first.');
        await cloud.editWebsite(normalizeWebsite(message.domain), !!message.remove);
        if (syncing) await syncing;
        await sync();
      } else if (message.type === 'current-add') {
        if (!sender.url.startsWith(chrome.runtime.getURL('popup.html'))) throw Error('Open the extension popup to add this website.');
        const current = await currentWebsite();
        if (!current?.canAdd) throw Error('This page cannot be added.');
        await cloud.editWebsite(current.domain, false);
        if (syncing) await syncing;
        await sync();
      } else if (message.type === 'start') {
        if (!sender.url.startsWith(chrome.runtime.getURL('popup.html'))) throw Error('Open the extension popup to start a session.');
        await cloud.start(message.minutes);
        if (syncing) await syncing;
        await sync();
      } else if (message.type === 'site-add') {
        if (!sender.url.startsWith(chrome.runtime.getURL('blocked.html'))) throw Error('Open the blocked page to add this website.');
        const target = blockedTarget(sender.url); if (!target) throw Error('Website unavailable.');
        const domain = websiteDomain(target);
        if (isSocialHost(domain)) throw Error('This website cannot be added here.');
        await cloud.editWebsite(domain, false);
        if (syncing) await syncing;
        await sync();
        if (sender.tab?.id) { const tab = await chrome.tabs.get(sender.tab.id); if (tab.url === sender.url) await chrome.tabs.update(sender.tab.id, { url: target }); }
      } else if (message.type === 'sync') await sync();
      else if (message.type !== 'status') throw Error('Unknown request');
      const current = await serialize(expire);
      const { websiteDraft } = await chrome.storage.local.get('websiteDraft');
      const user = cloud.user();
      const ownDraft = !!user?.uid && websiteDraft?.uid === user.uid ? websiteDraft : null;
      const domains = (current ? current.domains : ownDraft?.domains ?? []).slice(0, MAX_STUDY_WEBSITES);
      const target = blockedTarget(sender.url), host = target ? new URL(target).hostname : '';
      const currentSite = sender.url.startsWith(chrome.runtime.getURL('popup.html')) ? await currentWebsite() : null;
      if (currentSite) { currentSite.canAdd = !!cloud.user() && currentSite.canAdd && domains.length < MAX_STUDY_WEBSITES && !domains.includes(currentSite.domain); delete currentSite.url; delete currentSite.tabId; }
      return { session: current, domains, currentSite, blockedSite: host ? { domain: host, canAdd: !!current && domains.length < MAX_STUDY_WEBSITES && !isSocialHost(host) } : null, user, connected: Date.now() - lastSync < 65000, error };
    })().then(result => reply({ ok: true, ...result }), e => reply({ ok: false, error: userError(e) }));
    return true;
  });
  function watchAccount() {
    const uid = cloud.user()?.uid;
    if (uid === watchingUid && stopControl) return;
    stopControl?.(); stopControl = undefined; latestPacket = undefined; watchingUid = uid;
    if (!uid) return;
    if (!cloud.watchControl) { void sync(); return; }
    stopControl = cloud.watchControl(packet => {
      if (cloud.user()?.uid !== uid) return;
      latestPacket = packet;
      // Preserve every transition: dropping an intermediate pause could credit
      // its break as focus when the following resume arrives during a slow save.
      watchUpdates = watchUpdates.catch(() => {}).then(async () => {
        if (syncing) await syncing;
        if (cloud.user()?.uid === uid) await sync(packet);
      });
    }, e => {
      error = userError(e);
      stopControl?.(); stopControl = undefined;
    });
  }
  chrome.alarms.onAlarm.addListener(() => {
    return serialize(expire).then(async () => {
      watchAccount();
      await watchUpdates;
      if (latestPacket) await sync(latestPacket);
      else if (!cloud.watchControl) await sync();
    }).catch(e => { error = userError(e); });
  });
  void serialize(async () => {
    await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
    const { study } = await get();
    await apply(validSession(study?.session ?? null), study?.revision ?? 'empty', study?.uid ?? null);
    await chrome.alarms.create('study-watch', { periodInMinutes: 1 });
  }).then(() => { cloud.subscribe(watchAccount); watchAccount(); }).catch(e => { error = String(e); });
}
