import {build} from 'vite';
import {readFile,readdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const root=process.cwd().replaceAll('\\','/');
const shell=await readFile('src/components/layout/AppShell.tsx','utf8');
const headerClass=shell.match(/<header className="(web-app-header[^"]+)"/)?.[1];
const profile=await readFile('src/routes/profile.tsx','utf8');
const profileClass=profile.match(/<section aria-label="Profile header" className="([^"]+)"/)?.[1];
const profilePageClass=profile.match(/<div className="(profile-dark -mx-4[^\"]+)"/)?.[1];
assert.ok(headerClass && profileClass && profilePageClass);
const tasks=Array.from({length:80},(_,i)=>({id:String(i),name:`Task ${i+1}`,subject:'ENGLISH',type:'Lecture',date:'2026-10-23',completed:false,createdAt:'2026-10-23T00:00:00Z',minutesSpent:null}));
const mocks={
  '@/components/layout/AppShell':`import React from 'react';export const AppShell=({children})=><div className="flex min-h-screen w-full flex-col bg-[#121212] text-zinc-100"><div className="accent-top-glow web-accent-top-glow"/><header className=${JSON.stringify(headerClass)}><div style={{height:64,padding:16}}>Navigation</div></header><main className="app-page-enter mx-auto w-full min-w-0 max-w-5xl flex-1 px-4 py-6 sm:px-6">{children}</main></div>;`,
  '@/lib/auth-context':`export const useAuthUser=()=>undefined;`,
  '@/lib/habits':`export const useHabitToday=()=>"2026-10-23";export const useHabits=()=>({habits:[]});`,
  '@/lib/profile':`export const loadPracticeProfile=()=>({habitsEnabled:true});`,
  '@/lib/daily-tasks':`export const loadDailyTasks=()=>${JSON.stringify(tasks)};export const saveDailyTasks=()=>{};export const todayKey=d=>d?d.toISOString().slice(0,10):'2026-10-23';`,
  '@/lib/task-sync':`export const syncTaskChanges=async()=>{};`,
  '@/lib/leaderboard':`export const currentWeekKey=()=>'';export const publishLeaderboardEntry=async()=>{};export const weeklyTaskPoints=()=>new Map();`,
  '@/lib/firebase-sync':`export const getFirebaseFirestore=()=>({});`,
  'HabitsPanel':`import React from 'react';export const HabitsPanel=()=> <div>${'<p style={{height:100}}>Habit</p>'.repeat(30)}</div>;`,
  'TaskDialogs':`export const CompleteTaskDialog=()=>null,TaskFormDialog=()=>null;`,
  'FocusRewardRow':`export const FocusRewardRow=()=>null;`,
};
const entry=`import React from'react';import{createRoot}from'react-dom/client';import{TasksWorkspace}from'${root}/src/components/tasks/TasksWorkspace.tsx';import{AppShell}from'@/components/layout/AppShell';createRoot(document.body).render(location.hash==='#profile'?<AppShell><div className=${JSON.stringify(profilePageClass)}><div className="mx-auto max-w-4xl space-y-7"><section aria-label="Profile header" className=${JSON.stringify(profileClass)}><div style={{height:140}}>Profile identity</div></section><div style={{height:4000}}>Profile stats</div></div></div></AppShell>:<TasksWorkspace initialSection={location.hash==='#habits'?'habits':'tasks'}/>);`;
const built=await build({configFile:false,logLevel:'silent',resolve:{alias:{'@':root+'/src'},dedupe:['react','react-dom']},define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'sticky-fixture',enforce:'pre',resolveId(id){if(id.endsWith('sticky-preview'))return '\0sticky-preview.tsx';const normalized=id.replaceAll('\\','/').replace(/\.tsx?$/,'');const key=Object.keys(mocks).find(key=>id===key||(key.startsWith('@/')?normalized===root+'/src/'+key.slice(2):normalized.endsWith('/'+key)));if(key)return '\0mock-'+key+'.tsx';},load(id){if(id==='\0sticky-preview.tsx')return entry;if(id.startsWith('\0mock-'))return mocks[id.slice(6,-4)];}}],build:{write:false,minify:false,lib:{entry:'sticky-preview',formats:['iife'],name:'StickyPreview'}}});
const output=(Array.isArray(built)?built[0]:built).output;
const files=await readdir('.output/public/assets');const css=(await Promise.all(files.filter(x=>x.endsWith('.css')).map(x=>readFile('.output/public/assets/'+x,'utf8')))).join('\n');
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'file:///C:/Users/chetan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const browser=await chromium.launch({headless:true,executablePath:process.env.EDGE_EXECUTABLE||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
try{
  for(const width of [390,1280])for(const mode of ['tasks','habits','profile']){
    const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('https://sticky.test/**',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><body style="margin:0;background:#121212"></body>'}));
    await page.goto('https://sticky.test/#'+mode);await page.addStyleTag({content:css});await page.addScriptTag({content:output.find(x=>x.type==='chunk').code});await page.waitForTimeout(450);
    await page.waitForFunction(()=>getComputedStyle(document.querySelector('main')).transform==='none');
    assert.deepEqual(errors,[]);
    const controls=mode==='profile'?page.getByLabel('Profile header'):page.getByLabel('Task and habit controls');
    const before=await controls.boundingBox();
    for(const scroll of [8,24,700]){
      await page.evaluate(y=>scrollTo(0,y),scroll);await page.waitForTimeout(50);
      assert.ok(Math.abs((await controls.boundingBox()).y-before.y)<1,`${mode} header must not move even on the first ${scroll}px of scrolling`);
    }
    const header=await page.locator('.web-app-header').boundingBox(),after=await controls.boundingBox();
    assert.equal(header.y,0,`${mode} navigation must remain visible`);
    assert.ok(after.y>=header.height,`${mode} controls must stay below navigation`);
    assert.equal(after.height,before.height);
    const glow=await page.locator('.web-accent-top-glow').evaluate(n=>({z:Number(getComputedStyle(n).zIndex),position:getComputedStyle(n).position,pointer:getComputedStyle(n).pointerEvents,opacity:Number(getComputedStyle(n).opacity)}));
    assert.ok(glow.z>40&&glow.z<50&&glow.position==='fixed'&&glow.pointer==='none'&&glow.opacity<=.3,'accent glow must remain subtle above header and below dialogs');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    if(mode!=='profile'){await page.getByRole('button',{name:mode==='tasks'?'Habits':'Tasks',exact:true}).click();await page.waitForTimeout(50);assert.ok(Math.abs((await page.getByLabel('Task and habit controls').boundingBox()).y-before.y)<1,'switching sections must preserve the exact header position');}
    await page.close();
  }
  console.log('PASS: navigation and task/habit/profile controls remain visible during scrolling at 390/1280px; subtle accent stays above header without intercepting clicks.');
}finally{await browser.close();}
