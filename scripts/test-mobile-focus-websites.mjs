import assert from 'node:assert/strict';
import { build } from 'vite';
import { fileURLToPath } from 'node:url';

const root = process.cwd().replaceAll('\\', '/');
const mocks = {
  '../lib/firebase': 'export const getFirebaseFirestore=()=>({});',
  '../theme': `export const colors={};export const useAppAccent=()=> '#ffe000';`,
  '../lib/native-focus-lock': 'export const supportsDeviceFocus=false;export const deviceFocusStatus=async()=>({enabled:true});export const openDeviceFocusSettings=async()=>{};export const syncDeviceFocusState=async()=>{};',
  './DeviceFocusSetup': 'export const DeviceFocusSetup=()=>null;',
  './AnimatedTimeChips': 'export const AnimatedTimeChips=()=>null;',
  './FocusSchedules': 'export const FocusSchedules=()=>null;',
  './ClockFaceMotion': 'export const ClockFaceMotion=()=>null;',
  './ClockDigitHighlight': 'export const ClockDigitHighlight=()=>null;',
  './ClockHand': 'export const ClockHand=()=>null;',
  './SlotTime': `import React from 'react';import{Text}from'react-native';export const SlotTime=({value})=><Text>{value}</Text>;`,
  '@expo/vector-icons': `import React from'react';import{View}from'react-native';export const MaterialCommunityIcons=({size=20})=><View style={{width:size,height:size}}/>;`,
  'expo-crypto': `export const randomUUID=()=> 'test-session';`,
  'firebase/firestore': 'export const collection=()=>{};export const doc=()=>{};export const onSnapshot=()=>{};export const runTransaction=()=>{};export const serverTimestamp=()=>{};',
  '../../../shared/study-controller': `let emit;export const createStudyController=()=>({watchStudyControl:(_db,uid,callback)=>{emit=callback;callback({allowedDomains:['chatgpt.com']});return()=>{};},watchStudyFocusDay:(_db,uid,date,callback)=>{callback({totalMilliseconds:0,sessionCredits:{}});return()=>{};},publishStudyFocusDay:async()=>{},startStudySession:async(_db,uid,minutes,domains,source,appLimit,breakLimit)=>{globalThis.__focusStart={uid,minutes,domains,source,appLimit,breakLimit};const session={id:'focus',startedAt:Date.now(),endsAt:Date.now()+minutes*60000,domains,appLimit,breakLimit,breaksTaken:0};emit({session,allowedDomains:domains});return session;}});`,
};
const entry = `import React from'react';import{createRoot}from'react-dom/client';import{StudyLock}from'${root}/mobile-tasks/src/components/StudyLock.tsx';createRoot(document.getElementById('root')).render(<StudyLock uid="student" taskButton/>);`;
const built = await build({ configFile: false, logLevel: 'silent', resolve: { alias: { 'react-native': fileURLToPath(new URL('../mobile-tasks/node_modules/react-native-web/dist/index.js', import.meta.url)) }, dedupe: ['react', 'react-dom'] }, define: { 'process.env.NODE_ENV': '"development"', __DEV__: 'true' }, plugins: [{ name: 'mobile-focus-websites', enforce: 'pre', resolveId(id) { if (id.endsWith('mobile-focus-entry')) return '\0mobile-focus-entry.tsx'; if (id in mocks) return `\0focus-mock-${id}.tsx`; }, load(id) { if (id === '\0mobile-focus-entry.tsx') return entry; if (id.startsWith('\0focus-mock-')) return mocks[id.slice(12, -4)]; } }], build: { write: false, minify: false, lib: { entry: 'mobile-focus-entry', formats: ['iife'], name: 'MobileFocusWebsites' } } });
const output = (Array.isArray(built) ? built[0] : built).output;
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'file:///C:/Users/chetan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const browser = await chromium.launch({ headless: true, executablePath: process.env.EDGE_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 1100 } });
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.setContent('<style>body{margin:0;background:#121212}#root{padding:20px}</style><div id="root"></div>');
  await page.addScriptTag({ content: output.find(item => item.type === 'chunk').code });
  await page.getByRole('button', { name: 'Start Focus', exact: true }).click();
  const input = page.getByRole('textbox', { name: 'Website domain' });
  await input.waitFor();
  await input.fill('https://parmar.com/test');await page.getByRole('button',{name:'Add website',exact:true}).click();
  await page.getByRole('button',{name:'Remove parmar.com',exact:true}).waitFor();assert.equal(await input.count(),0,'hide add input at shared two-site limit');
  await page.getByRole('button',{name:'Remove chatgpt.com',exact:true}).click();await input.fill('parmar.com');await page.getByRole('button',{name:'Add website',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Remove parmar.com',exact:true}).count(),1,'duplicates do not consume another slot');
  await input.fill('instagram.com');await page.getByRole('button',{name:'Add website',exact:true}).click();await page.getByText('Social media websites cannot be added.',{exact:true}).waitFor();
  await input.fill('invalid');await page.getByRole('button',{name:'Add website',exact:true}).click();await page.getByText('Enter a domain like parmar.com.',{exact:true}).waitFor();
  await input.fill('https://openai.com/learn');await page.getByRole('button',{name:'Start Focus Lock',exact:true}).click();
  await page.waitForFunction(()=>globalThis.__focusStart);
  assert.deepEqual(await page.evaluate(()=>globalThis.__focusStart.domains),['parmar.com','openai.com'],'typed-but-not-added website is included when starting');
  assert.equal(await input.count(),0,'website editing hidden during active session');assert.deepEqual(errors,[]);
  console.log('PASS: mobile Focus setup websites, normalization, shared two-site cap, duplicate handling, social/invalid rejection, removal and start-with-pending-input.');
} finally { await browser.close(); }
