import assert from 'node:assert/strict';
import { createServer } from 'vite';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server = await createServer({ configFile:false, root:process.cwd(), tsconfig:'./tsconfig.json',
  optimizeDeps:{include:['react','react-dom/client','react/jsx-runtime','lucide-react']}, server:{port:0},
  plugins:[{name:'focus-fixture',enforce:'pre',resolveId(id){
    if(id==='@/lib/auth-context')return '\0auth';
    if(id==='@/lib/firebase-sync')return '\0db';
    if(id.endsWith('/shared/study-lock'))return '\0control';
    if(id==='@/routes/quick-recall')return '\0recall';
    if(id==='/fixture.js')return '\0entry';
  },load(id){
    if(id==='\0auth')return 'export const useAuthUser=()=>({uid:"test"});';
    if(id==='\0db')return 'export const getFirebaseFirestore=()=>({});';
    if(id==='\0control')return `export function watchStudyControl(db,uid,cb){const session={id:'test',startedAt:Date.now(),endsAt:Date.now()+60000,domains:[]};cb({session});const end=()=>cb({session:{...session,endsAt:Date.now()-1}});window.addEventListener('end-focus',end);return()=>window.removeEventListener('end-focus',end)}export const recordStudyFocus=async()=>{};`;
    if(id==='\0recall')return 'import React from "react";export const QuickRecall=()=>React.createElement("main",null,"Recall questions");';
    if(id==='\0entry')return 'import React from "react";import{createRoot}from"react-dom/client";import{FocusSessionGate}from"/src/components/FocusSessionGate.tsx";createRoot(document.getElementById("root")).render(React.createElement(FocusSessionGate,null,React.createElement("button",{id:"underlying"},"App content")));';
  },configureServer(server){server.middlewares.use((req,res,next)=>{if(req.url!=='/fixture')return next();res.setHeader('Content-Type','text/html');res.end('<div id="root"></div><script type="module" src="/fixture.js"></script>')});}}]});
let browser;
try {
  await server.listen();
  browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
  const page=await browser.newPage();
  await page.route('**/avatars/manifest.json',r=>r.fulfill({json:['test.png']}));
  await page.goto(`http://localhost:${server.httpServer.address().port}/fixture`);
  const dialog=page.getByRole('dialog');await dialog.waitFor();
  assert.equal(await dialog.evaluate(el=>el.matches(':modal')),true);
  assert.equal(await page.locator('#underlying').evaluate(el=>!!el.closest('[inert]')),true);
  await page.keyboard.press('Escape');assert.equal(await dialog.isVisible(),true);
  await page.getByRole('button',{name:'Quick Recall',exact:true}).click();
  await page.getByText('Recall questions').waitFor();
  assert.equal(await dialog.locator('button').count(),0);
  assert.equal(await dialog.locator('.focus-session-timer').count(),0);
  await page.goBack();await page.getByRole('button',{name:'Quick Recall',exact:true}).waitFor();
  await page.evaluate(()=>window.dispatchEvent(new Event('end-focus')));
  await dialog.waitFor({state:'detached'});
  assert.equal(await page.locator('#underlying').evaluate(el=>!!el.closest('[inert]')),false);
  console.log('PASS: full-screen modal, app blocked, Escape blocked, recall without timer/header, browser Back, automatic unlock.');
} finally { await browser?.close();server.httpServer?.closeAllConnections();await server.close(); }
