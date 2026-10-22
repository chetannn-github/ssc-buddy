// UI-only checks with local account/session fixtures. No production requests.
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = `
let control={session:null,allowedDomains:['parmar.com']};
const emit=()=>window.dispatchEvent(new Event('study-fixture'));
export function watchStudyControl(db,uid,cb){const refresh=()=>cb(control,false);refresh();window.addEventListener('study-fixture',refresh);return()=>window.removeEventListener('study-fixture',refresh)}
export function watchStudyDevices(db,uid,cb){const refresh=()=>cb([{id:'browser',sessionId:control.session?.id,lastSeenAt:Date.now(),error:''}]);refresh();window.addEventListener('study-fixture',refresh);return()=>window.removeEventListener('study-fixture',refresh)}
export async function startStudySession(db,uid,minutes,domains){control={...control,session:{id:'test-session',startedAt:Date.now(),endsAt:Date.now()+minutes*60000,domains}};emit()}
export async function saveStudyWebsites(db,uid,domains){control={...control,allowedDomains:domains};emit()}
export function normalizeStudyDomain(value){return new URL('https://'+value).hostname}
`;
const server = await createServer({configFile:false,root,resolve:{dedupe:['react','react-dom']},optimizeDeps:{noDiscovery:true,include:['react','react-dom','react-dom/client','react/jsx-runtime','react/jsx-dev-runtime','lucide-react']},server:{port:0,watch:{ignored:['**/src-tauri/**']},fs:{allow:[path.resolve(root,'..')]}},plugins:[{
  name:'isolated-study-widget-fixture', enforce:'pre',
  resolveId(id){if((id.endsWith('/lib/firebase') || id === '@/lib/firebase-sync'))return '\0study-firebase';if((id.endsWith('/shared/study-lock') || id === './study-lock'))return '\0study-controller';if(id==='/study-preview.js')return '\0study-preview';if(id==='/profile-preview.js')return '\0profile-preview';},
  load(id){
    if(id==='\0study-firebase')return `export const getFirebaseFirestore=()=>({});export function observeAuth(cb){cb({uid:'preview-user'});return()=>{}};export function watchProfileAccent(user,cb){cb('#ff666e');return()=>{}}`;
    if(id==='\0study-controller')return fixture;
    if(id==='\0profile-preview')return `import React from 'react';import{createRoot}from'react-dom/client';import{ProfileStudyLock}from'/@fs/${path.resolve(root,'../src/components/profile/ProfileStudyLock.tsx').replaceAll('\\','/')}';document.body.style.background='#121212';createRoot(document.getElementById('root')).render(React.createElement(ProfileStudyLock,{uid:'preview-user'}));`;
    if(id==='\0study-preview')return `import React from 'react';import{createRoot}from'react-dom/client';import{PinnedStudyWindow}from'/src/components/PinnedStudyWindow.tsx';import'/src/styles.css';import'/@fs/${path.resolve(root,'../src/components/layout/accent-top-glow.css').replaceAll('\\','/')}';window.__SSC_HABIT_WIDGET__={uid:'preview-user',habitId:'study-lock',style:'study'};createRoot(document.getElementById('root')).render(React.createElement(PinnedStudyWindow,{pin:window.__SSC_HABIT_WIDGET__}));`;
  },
  configureServer(server){server.middlewares.use((req,res,next)=>{if(!['/study-preview','/profile-preview'].includes(req.url))return next();res.setHeader('Content-Type','text/html');res.end('<div id="root"></div><script type="module" src="'+(req.url==='/profile-preview'?'/profile-preview.js':'/study-preview.js')+'"></script>');});}
}]});
let browser;
try {
  await server.listen(); console.log("Fixture server ready");
  browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
  const page=await browser.newPage({viewport:{width:430,height:220}}), errors=[];
  page.setDefaultTimeout(15000);
  page.on("console",msg=>{if(msg.type()==="error")console.error("Browser:",msg.text())});
  page.on("requestfailed",req=>console.error("Request:",req.url(),req.failure()?.errorText));
  page.on("pageerror",error=>{errors.push(error.message);console.error(error.message)});
  await page.route('https://**',route=>route.abort());
  await page.goto(`http://localhost:${server.httpServer.address().port}/study-preview`);
  console.log("Preview loaded");
  await page.getByRole('button',{name:'Set up session'}).waitFor().catch(async e=>{console.error(await page.locator("body").innerHTML());throw e;});
  assert.equal(await page.locator('.study-desktop-time').textContent(),'Ready to focus');
  assert.equal(await page.locator('.study-desktop-card').evaluate(el=>getComputedStyle(el).getPropertyValue('--accent').trim()),'#ff666e');
  assert.equal(await page.locator('.study-desktop-sites').textContent(),'parmar.com');
  for(const width of [430,340]){
    await page.setViewportSize({width,height:width===430?220:200});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    assert.ok(await page.locator('.study-desktop-footer').evaluate(el=>el.getBoundingClientRect().bottom<=innerHeight));
  }
  await page.setViewportSize({width:430,height:220});
  await page.screenshot({path:path.join(root,'dist/study-widget-ready.png')});
  await page.getByRole('button',{name:'Set up session'}).click();
  await page.setViewportSize({width:430,height:520});
  await page.getByRole('button',{name:'Study time',exact:false}).last().click();
  await page.getByRole('button',{name:'40 minutes',exact:true}).click();
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await page.getByRole('button',{name:'Start study lock',exact:true}).click();
  await page.locator('.browser-study-live-time').waitFor();
  await page.getByRole('button',{name:'Close Study Lock',exact:true}).click();
  await page.setViewportSize({width:430,height:220});
  await page.getByRole('button',{name:'View session'}).waitFor();
  assert.match(await page.locator('.study-desktop-time').textContent(),/^(40:00|39:5\d)$/);
  await page.screenshot({path:path.join(root,'dist/study-widget-running.png')});
  await page.locator('.study-desktop-heading').click({button:'right'});
  await page.getByRole('menuitem',{name:'Remove widget'}).waitFor();
  await page.keyboard.press('Escape');assert.equal(await page.getByRole('menuitem').count(),0);
  await page.setViewportSize({width:390,height:750});
  await page.goto(`http://localhost:${server.httpServer.address().port}/profile-preview`);
  await page.getByRole('button',{name:'Study Lock',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Add Study Lock desktop widget'}).count(),0);
  await page.locator('.study-duration-trigger').click();
  await page.getByRole('button',{name:'15 minutes',exact:true}).click();
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await page.getByRole('button',{name:'Start study lock',exact:true}).click();
  await page.locator('.browser-study-live-time').waitFor();
  assert.match(await page.locator('.browser-study-live-time').textContent(),/^(15:00|14:5\d)$/);
  assert.equal(await page.getByRole('button',{name:/Remove parmar/}).count(),0);
  await page.screenshot({path:path.join(root,'dist/profile-study-lock.png')});
  await page.getByRole('button',{name:'Close Study Lock',exact:true}).click();
  assert.match(await page.locator('.study-profile-trigger small').textContent(),/^(15:00|14:5\d)$/);
  assert.deepEqual(errors,[]);
  console.log('PASS: compact 430×220 and 340×200 layouts, account accent, setup clock, session countdown and remove menu. Local fixtures only.');
} finally {await browser?.close();server.httpServer?.closeAllConnections();await server.close();}
