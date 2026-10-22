// UI-only checks with local account/session fixtures. No production requests.
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = `
let control={session:null,allowedDomains:['parmar.com']};let connected=false;
window.addEventListener('focus-connect',()=>{connected=true;emit()});
const emit=()=>window.dispatchEvent(new Event('study-fixture'));
export function watchStudyControl(db,uid,cb){if(window.__GATE_PREVIEW__&&!control.session)control={...control,session:{id:'gate-session',startedAt:Date.now(),endsAt:Date.now()+900000,domains:['parmar.com']}};const refresh=()=>cb(control,false);refresh();window.addEventListener('study-fixture',refresh);return()=>window.removeEventListener('study-fixture',refresh)}
export function watchStudyDevices(db,uid,cb){const refresh=()=>cb(connected?[{id:'browser',sessionId:control.session?.id,lastSeenAt:Date.now(),error:''}]:[]);refresh();window.addEventListener('study-fixture',refresh);return()=>window.removeEventListener('study-fixture',refresh)}
export function watchStudyFocusDay(db,uid,date,cb){cb({totalMilliseconds:4500000,sessionCredits:{}});return()=>{}}
export async function recordStudyFocus(){}
export async function startStudySession(db,uid,minutes,domains){control={...control,session:{id:'test-session',startedAt:Date.now(),endsAt:Date.now()+minutes*60000,domains}};emit()}
export async function saveStudyWebsites(db,uid,domains){control={...control,allowedDomains:domains};emit()}
export async function pauseStudySession(){const session=control.session;control={...control,session:{...session,paused:true,remainingMs:session.endsAt-Date.now()}};emit()}
export async function resumeStudySession(){const session=control.session;control={...control,session:{id:'resumed-session',startedAt:Date.now(),endsAt:Date.now()+session.remainingMs,domains:session.domains}};emit()}
export function normalizeStudyDomain(value){return new URL('https://'+value).hostname}
`;
const server = await createServer({configFile:false,root,resolve:{dedupe:['react','react-dom']},optimizeDeps:{noDiscovery:true,include:['react','react-dom','react-dom/client','react/jsx-runtime','react/jsx-dev-runtime','lucide-react']},server:{port:0,watch:{ignored:['**/src-tauri/**']},fs:{allow:[path.resolve(root,'..')]}},plugins:[{
  name:'isolated-study-widget-fixture', enforce:'pre',
  resolveId(id){if(id==='@/lib/auth-context')return '\0gate-auth';if(id==='@/routes/test')return '\0gate-practice';if(id==='/gate-preview.js')return '\0gate-preview';if((id.endsWith('/lib/firebase') || id === '@/lib/firebase-sync'))return '\0study-firebase';if((id.endsWith('/shared/study-lock') || id === './study-lock'))return '\0study-controller';if(id==='/study-preview.js')return '\0study-preview';if(id==='/profile-preview.js')return '\0profile-preview';},
  load(id){
    if(id==='\0gate-auth')return `const user={uid:'preview-user'};export const useAuthUser=()=>user;`;
    if(id==='\0gate-practice')return `import React from 'react';export function PracticeSession(){return React.createElement('button',{onClick:()=>history.back()},'Back to focus')}`;
    if(id==='\0gate-preview')return `import React from 'react';import{createRoot}from'react-dom/client';import{FocusSessionGate}from'/@fs/${path.resolve(root,'../src/components/FocusSessionGate.tsx').replaceAll('\\','/')}';window.__GATE_PREVIEW__=true;document.body.style.fontFamily='system-ui';createRoot(document.getElementById('root')).render(React.createElement(FocusSessionGate,null,React.createElement('p',null,'Underlying page')));`;
    if(id==='\0study-firebase')return `export const getFirebaseFirestore=()=>({});export function observeAuth(cb){cb({uid:'preview-user'});return()=>{}};export function watchProfileAccent(user,cb){cb('#ff666e');return()=>{}}`;
    if(id==='\0study-controller')return fixture;
    if(id==='\0profile-preview')return `import React from 'react';import{createRoot}from'react-dom/client';import{ProfileStudyLock}from'/@fs/${path.resolve(root,'../src/components/profile/ProfileStudyLock.tsx').replaceAll('\\','/')}';document.body.style.background='#121212';createRoot(document.getElementById('root')).render(React.createElement(ProfileStudyLock,{uid:'preview-user'}));`;
    if(id==='\0study-preview')return `import React from 'react';import{createRoot}from'react-dom/client';import{PinnedStudyWindow}from'/src/components/PinnedStudyWindow.tsx';import'/src/styles.css';import'/@fs/${path.resolve(root,'../src/components/layout/accent-top-glow.css').replaceAll('\\','/')}';window.__SSC_HABIT_WIDGET__={uid:'preview-user',habitId:'study-lock',style:'study'};createRoot(document.getElementById('root')).render(React.createElement(PinnedStudyWindow,{pin:window.__SSC_HABIT_WIDGET__}));`;
  },
  configureServer(server){server.middlewares.use((req,res,next)=>{if(!['/study-preview','/profile-preview','/gate-preview'].includes(req.url))return next();res.setHeader('Content-Type','text/html');res.end('<div id="root"></div><script type="module" src="'+req.url+'.js"></script>');});}
}]});
let browser;
try {
  await server.listen(); console.log("Fixture server ready");
  browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
  const page=await browser.newPage({viewport:{width:360,height:190}}), errors=[];
  page.setDefaultTimeout(15000);
  page.on("console",msg=>{if(msg.type()==="error")console.error("Browser:",msg.text())});
  page.on("requestfailed",req=>console.error("Request:",req.url(),req.failure()?.errorText));
  page.on("pageerror",error=>{errors.push(error.message);console.error(error.message)});
  await page.route('https://**',route=>route.abort());
  await page.goto(`http://localhost:${server.httpServer.address().port}/study-preview`);
  console.log("Preview loaded");
  await page.locator('.study-desktop-content').waitFor().catch(async e=>{console.error(await page.locator("body").innerHTML());throw e;});
  assert.equal(await page.locator('.study-desktop-time').textContent(),'Ready to focus');
  assert.equal(await page.locator('.study-desktop-card').evaluate(el=>getComputedStyle(el).getPropertyValue('--accent').trim()),'#ff666e');
  assert.equal(await page.locator('.study-desktop-sites').count(),0);
  assert.equal(await page.getByRole('button',{name:'Focus Lock settings',exact:true}).count(),0);
  assert.equal(await page.locator('.study-desktop-card').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(0, 0, 0)');
  assert.equal(await page.locator('.study-desktop-daily b').textContent(),'1h 15m');
  for(const width of [360,280,260]){
    await page.setViewportSize({width,height:width===360?190:150});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    assert.ok(await page.locator('.study-desktop-content').evaluate(el=>el.getBoundingClientRect().bottom<=innerHeight));
  }
  await page.setViewportSize({width:360,height:190});
  await page.screenshot({path:path.join(root,'dist/study-widget-ready.png')});
  await page.locator('.study-desktop-content').click();
  await page.setViewportSize({width:360,height:520});
  await page.getByRole('button',{name:'Focus time',exact:false}).last().click();
  await page.getByRole('button',{name:'40 minutes',exact:true}).click();
  await page.getByRole('button',{name:'Save',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Start Focus Lock',exact:true}).isEnabled(),true);
  await page.getByRole('button',{name:'Start Focus Lock',exact:true}).click();
  await page.locator('.browser-study-live-time').waitFor();
  await page.getByRole('button',{name:'Close Focus Lock',exact:true}).click();
  await page.setViewportSize({width:360,height:190});
  await page.locator('.study-desktop-content').waitFor();
  assert.match(await page.locator('.study-desktop-time').textContent(),/^(40:00|39:5\d)$/);
  await page.waitForTimeout(1200);
  const beforeConnect=await page.locator('.study-desktop-time').textContent();
  await page.evaluate(()=>window.dispatchEvent(new Event('focus-connect')));
  const seconds=value=>value.split(':').reduce((total,part)=>total*60+Number(part),0);
  assert.ok(seconds(await page.locator('.study-desktop-time').textContent())<=seconds(beforeConnect),'connecting browser does not restart timer');
  await page.locator('.study-desktop-time').click();
  assert.equal(await page.locator('.browser-study-overlay').count(),0,'clicking the active timer does not open a separate dialog');
  await page.getByRole('button',{name:'Pause Focus Lock',exact:true}).click();
  await page.getByRole('button',{name:'Resume Focus Lock',exact:true}).waitFor();
  await page.screenshot({path:path.join(root,'dist/study-widget-running.png')});
  await page.locator('.study-desktop-heading').click({button:'right'});
  await page.getByRole('menuitem',{name:'Remove widget'}).waitFor();
  await page.keyboard.press('Escape');assert.equal(await page.getByRole('menuitem').count(),0);
  await page.setViewportSize({width:390,height:750});
  await page.route('**/avatars/manifest.json', route=>route.fulfill({contentType:'application/json',body:JSON.stringify(['1.jpg'])}));
  await page.route('**/avatars/1.jpg', route=>route.fulfill({path:path.resolve(root,'../public/avatars/1.jpg')}));
  await page.goto(`http://localhost:${server.httpServer.address().port}/profile-preview`);
  await page.getByRole('button',{name:'Focus Lock',exact:true}).click();
  assert.equal(await page.locator('.study-profile-trigger small').textContent(),'Today · 1h 15m');
  assert.equal(await page.getByRole('button',{name:'Add Focus Lock desktop widget'}).count(),0);
  assert.equal(await page.getByRole('button',{name:'Close Focus Lock',exact:true}).count(),0);
  assert.equal(await page.locator('.study-focus-today').count(),0);
  await page.locator('.study-duration-trigger').click();
  await page.getByRole('button',{name:'15 minutes',exact:true}).click();
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await page.getByRole('button',{name:'Start Focus Lock',exact:true}).click();
  await page.locator('.browser-study-live-time').waitFor();
  assert.match(await page.locator('.browser-study-live-time').textContent(),/^(15:00|14:5\d)$/);
  assert.equal(await page.getByRole('button',{name:/Remove parmar/}).count(),0);
  const image=page.getByRole('img',{name:'Focus motivation'});await image.waitFor();await image.evaluate(el=>el.decode());
  await page.setViewportSize({width:1280,height:900});
  const picture=await image.boundingBox(),details=await page.locator('.focus-lock-dialog-content').boundingBox();
  assert.ok(picture.x+picture.width<=details.x,'desktop image is on the left of timer');
  assert.equal(await image.evaluate(el=>getComputedStyle(el).objectFit),'contain');
  assert.equal(await page.locator('.focus-lock-site').count(),0);
  assert.equal(await page.locator('.browser-study-connection').count(),0);
  assert.equal(await page.locator('.focus-lock-site').count(),0);
  await page.screenshot({path:path.join(root,'dist/profile-focus-lock-wide.png')});
  await page.setViewportSize({width:390,height:750});
  assert.equal(await page.locator('.focus-lock-visual').evaluate(el=>el.scrollWidth>el.clientWidth),false);
  await page.screenshot({path:path.join(root,'dist/profile-study-lock.png')});
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.study-profile-trigger small').textContent(),'Today · 1h 15m');
  await page.setViewportSize({width:1280,height:900});
  await page.goto(`http://localhost:${server.httpServer.address().port}/gate-preview`);
  await page.getByRole('dialog',{name:'Focus session active'}).waitFor();
  const gateImage=page.getByRole('img',{name:'Motivational image'});await gateImage.evaluate(el=>el.decode());
  const left=await gateImage.boundingBox(),right=await page.locator('.focus-session-details').boundingBox();
  assert.ok(left.x+left.width<=right.x,'actual full-screen locked page has image on the left');
  assert.equal(await page.locator('.focus-session-gate a').count(),0);
  assert.equal(await page.locator('.browser-study-connection').count(),0);
  await page.screenshot({path:path.join(root,'dist/focus-locked-webpage.png')});
  await page.setViewportSize({width:390,height:750});
  assert.equal(await page.locator('.focus-session-gate').evaluate(el=>el.scrollWidth>el.clientWidth),false);
  assert.deepEqual(errors,[]);
  console.log('PASS: compact 360x190 and 320x180 layouts; account accent; saved daily focus; setup clock; countdown; web profile and remove menu. Local fixtures only.');
} finally {await browser?.close();server.httpServer?.closeAllConnections();await server.close();}
