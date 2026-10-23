import { onStudyBreak, studyTimerMilliseconds } from "../shared/study-breaks.ts";
import { MAX_STUDY_WEBSITES } from '../shared/study-selection.ts';

const $ = id => document.getElementById(id);
if ($('website-count')) $('website-count').textContent = `0/${MAX_STUDY_WEBSITES}`;
if ($('motivation')) {
  $('motivation').classList.add('image-loading');
  try {
    const images = await (await fetch('images/manifest.json')).json();
    $('motivation').src = 'images/' + encodeURIComponent(images[Math.floor(Math.random() * images.length)]);
    await $('motivation').decode();
  } catch { $('motivation').hidden = true; }
  finally { $('motivation').classList.remove('image-loading'); }
}
let session, busy = false, slots = 0, canAddCurrent = false;
async function action(button, label, work) {
  if (busy) return false;
  busy = true;
  const previous = button?.textContent;
  const controls = [...document.querySelectorAll('button,input')].map(node => [node, node.disabled]);
  controls.forEach(([node]) => { node.disabled = true; });
  document.querySelector('main')?.setAttribute('aria-busy', 'true');
  if (button) { button.textContent = label; button.classList.add('is-loading'); }
  try { return await work(); }
  finally {
    if (button) { button.textContent = previous; button.classList.remove('is-loading'); }
    controls.forEach(([node, disabled]) => { node.disabled = disabled; });
    busy = false; document.querySelector('main')?.removeAttribute('aria-busy');
    if ($('website-add')) $('website-add').disabled = slots >= MAX_STUDY_WEBSITES;
    if ($('website-domain')) $('website-domain').disabled = slots >= MAX_STUDY_WEBSITES;
    if ($('add-current')) $('add-current').disabled = !canAddCurrent || slots >= MAX_STUDY_WEBSITES;
    if ($('start-button')) $('start-button').disabled = slots === 0 || !!session;
  }
}
function tick() {
  const seconds = Math.max(0, Math.ceil((session ? studyTimerMilliseconds(session) : 0) / 1000));
  const value = seconds ? (Math.floor(seconds / 3600) ? Math.floor(seconds / 3600) + ':' : '') + String(Math.floor(seconds / 60) % 60).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0') : '';
  renderSlotTime($('countdown'), value);
}
function renderSlotTime(element, value) {
  if (element.dataset.slotValue === value) return;
  const previous = element.dataset.slotValue;
  element.dataset.slotValue = value;
  element.classList.add('focus-slot-time');
  element.setAttribute('aria-label', value);
  const nodes = Array.from(value, (digit, index) => {
    const old = previous?.[previous.length - value.length + index];
    const cell = document.createElement('span');
    if (!/\d/.test(digit)) { cell.className = 'focus-slot-separator'; cell.textContent = digit; return cell; }
    cell.className = 'focus-slot';
    const roll = document.createElement('span');
    roll.textContent = digit;
    if (old && old !== digit) { roll.className = 'focus-slot-roll'; roll.dataset.previous = old; }
    cell.append(roll);
    return cell;
  });
  element.replaceChildren(...nodes);
}
async function refresh(type = 'status', extra = {}) {
  try {
    const result = await chrome.runtime.sendMessage({ type, ...extra });
    if (!result?.ok) throw Error(result?.error ?? 'Extension unavailable');
    session = result.session;
    slots = (result.domains ?? session?.domains ?? []).length;
    if ($('start-session')) { $('start-session').hidden = !result.user || !!session; $('start-button').disabled = busy || !slots; }
    if ($('approve-site')) { $('approve-site').hidden = !result.blockedSite?.canAdd; $('approve-site').textContent = 'Add ' + (result.blockedSite?.domain ?? 'website'); }
    if (document.body.classList.contains('popup') && $('motivation')) $('motivation').hidden = !result.user;
    $('error').textContent = result.error ?? '';
    $('status').textContent = session ? onStudyBreak(session) ? 'Break · focus resumes automatically.' : session.paused ? 'Focus Lock is paused. Websites stay protected.' : result.connected ? 'Focus Lock is active.' : 'Offline. Your focus timer is still running.' : result.connected ? '' : result.user ? 'Offline' : '';
    $('status').hidden = !$('status').textContent;
    if (document.body.classList.contains('blocked') && !session) { $('title').textContent = 'Your focus session is complete.'; $('status').textContent = 'Websites are unlocked. You can return to your previous page.'; }
    if ($('login')) $('login').hidden = !!result.user || !!session;
    if ($('account')) $('account').textContent = result.user?.email ?? '';
    if ($('login')) $('reconnect').hidden = !result.user;
    if ($('logout')) $('logout').hidden = !result.user || !!session;
    $('sites').replaceChildren();
    for (const domain of session?.domains ?? []) {
      const link = document.createElement('a'); link.href = 'https://' + domain; link.title = domain; link.rel = 'noreferrer';
      const icon = document.createElement('span'); icon.className = 'site-icon'; icon.textContent = domain.replace(/^www\./, '').charAt(0).toUpperCase();
      const label = document.createElement('strong'); label.textContent = domain;
      const arrow = document.createElement('span'); arrow.className = 'site-arrow'; arrow.textContent = '\u2197'; arrow.setAttribute('aria-hidden', 'true');
      link.append(icon, label, arrow); $('sites').append(link);
    }
    if ($('website-editor')) {
      const domains = result.domains ?? session?.domains ?? [];
      $('website-editor').hidden = !result.user;
      $('website-count').textContent = domains.length + '/' + MAX_STUDY_WEBSITES;
      $('website-form').hidden = domains.length >= MAX_STUDY_WEBSITES;
      $('website-add').disabled = busy || domains.length >= MAX_STUDY_WEBSITES;
      $('website-domain').disabled = domains.length >= MAX_STUDY_WEBSITES;
      const site = result.currentSite;
      canAddCurrent = !!site?.canAdd;
      $('add-current').hidden = !site || !result.user || domains.length >= MAX_STUDY_WEBSITES;
      $('add-current').disabled = busy || !site?.canAdd;
      if (!busy) {
        $('add-current').replaceChildren();
        const label = document.createElement('span'); label.textContent = site?.label ?? 'Add current website';
        const domain = document.createElement('small'); domain.textContent = site?.domain ?? '';
        $('add-current').append(label, domain);
      }
      $('draft-sites').replaceChildren();
      if (!session) for (const domain of domains) {
        const chip = document.createElement('span'); chip.textContent = domain; chip.title = domain;
        const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '\u00d7'; remove.setAttribute('aria-label', 'Remove ' + domain);
        remove.addEventListener('click', () => void action(remove, '...', () => refresh('website', { domain, remove: true })));
        chip.append(remove); $('draft-sites').append(chip);
      }
    }
    tick(); return true;
  } catch (e) { $('error').textContent = e.message; return false; }
}
$('start-session')?.addEventListener('submit', async event => { event.preventDefault(); await action($('start-button'), 'Starting...', () => refresh('start', { minutes: Number($('session-time').value) })); });
$('login')?.addEventListener('submit', async event => {
  event.preventDefault();
  await action($('login').querySelector('button'), 'Signing in...', () => refresh('login', { email: $('email').value, password: $('password').value })); $('password').value = '';
});
$('website-form')?.addEventListener('submit', async event => {
  event.preventDefault();
  const saved = await action($('website-add'), 'Adding...', () => refresh('website', { domain: $('website-domain').value }));
  if (saved) $('website-domain').value = '';
});
$('add-current')?.addEventListener('click', () => void action($('add-current'), 'Adding current site...', () => refresh('current-add')));
$('approve-site')?.addEventListener('click', () => void action($('approve-site'), 'Adding...', () => refresh('site-add')));
$('logout')?.addEventListener('click', () => void action($('logout'), 'Signing out...', () => refresh('logout')));
$('reconnect').addEventListener('click', async () => { await action($('reconnect'), 'Refreshing...', () => refresh('sync')); });
window.addEventListener('hashchange', async () => { await refresh(); });
await refresh(); setInterval(() => { if (!busy) void refresh(); }, 2000); setInterval(tick, 1000);
