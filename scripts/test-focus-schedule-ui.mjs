import { build } from 'vite';
import { fileURLToPath } from 'node:url';
const { chromium }=await import(process.env.PLAYWRIGHT_MODULE||'file:///C:/Users/chetan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const built=await build({configFile:false,logLevel:'silent',resolve:{dedupe:['react','react-dom']},define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'mock-sdk',enforce:'pre',resolveId(id){if(id==='firebase/firestore')return '\0schedule-sdk';},load(id){if(id==='\0schedule-sdk')return 'export const doc=(_, ...path)=>path.join("/");export const collection=doc;export const onSnapshot=(...args)=>globalThis.__scheduleSdk.listen(...args);export const runTransaction=(...args)=>globalThis.__scheduleSdk.transact(...args);export const serverTimestamp=()=>null;';}}],build:{write:false,minify:false,lib:{entry:fileURLToPath(new URL('./fixtures/focus-schedule-ui.tsx',import.meta.url)),formats:['iife'],name:'ScheduleUi'}}});
const output=Array.isArray(built)?built[0]:built;
const browser=await chromium.launch({headless:true,executablePath:process.env.EDGE_EXECUTABLE||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
try{
  const page=await browser.newPage();
  await page.route('https://schedule.test/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><body></body>'}));
  await page.goto('https://schedule.test/');
  for(const item of output.output.filter(item=>item.type==='asset'&&item.fileName.endsWith('.css')))await page.addStyleTag({content:String(item.source)});
  await page.addScriptTag({content:output.output.find(item=>item.type==='chunk').code});
  console.log('PASS:',await page.evaluate(()=>window.ScheduleUi.run()));
}finally{await browser.close();}
