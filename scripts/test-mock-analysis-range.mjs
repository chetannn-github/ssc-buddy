import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {build} from 'vite';

const root=process.cwd().replaceAll('\\','/');
const entry=`import React from'react';import{createRoot}from'react-dom/client';import{ProgressScreen}from'${root}/mobile-tasks/src/screens/ProgressScreen.tsx';createRoot(document.getElementById('root')).render(<ProgressScreen user={{uid:'preview'}} onBack={()=>{}}/>);`;
const mocks={
  '../theme':`import{StyleSheet}from'react-native';export const colors=new Proxy({text:'#fafafa',muted:'#999999',accent:'#ffe000',surface:'#181818',border:'#333333'},{get:(obj,key)=>obj[key]||'#777777'});export const createThemedStyles=StyleSheet.create;`,
  '../lib/firebase':`const record=(id,ago,type,score)=>{const date=new Date();date.setDate(date.getDate()-ago);return{id,subjectId:'math',date:date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0'),createdAt:date.toISOString(),type,score,total:100,accuracy:score};};export const watchTrackerTests=(_,cb)=>{cb([record('a',0,'Sectional',20),record('b',0,'Sectional',40),record('c',8,'Sectional',90),record('d',8,'Pre',80),record('e',0,'Mains',60)]);return()=>{};};export const watchTrackerSections=(_,cb)=>{cb({subjects:[{id:'math',name:'Maths'}]});return()=>{};};export const deleteTrackerTest=()=>{};export const appendTrackerTest=()=>{};`,
  '../navigation/bottomNavigationVisibility':`export const reportVerticalScroll=()=>{};`,
  '../components/DropdownChevron':`export const DropdownChevron=()=>null;`,
  '../components/DestructiveDialog':`export const DestructiveDialog=()=>null;`,
  './MockTestLogDialog':`export const MockTestLogDialog=()=>null;`,
  '@expo/vector-icons':`export const MaterialCommunityIcons=()=>null;`,
};
const built=await build({configFile:false,logLevel:'silent',resolve:{alias:{'react-native-svg':fileURLToPath(new URL('../mobile-tasks/node_modules/react-native-svg/lib/module/elements.web.js',import.meta.url)),'react-native':fileURLToPath(new URL('../mobile-tasks/node_modules/react-native-web/dist/index.js',import.meta.url))},dedupe:['react','react-dom']},define:{'process.env.NODE_ENV':'"development"',__DEV__:'true'},plugins:[{name:'analysis-range-fixture',enforce:'pre',resolveId(id){if(id.endsWith('analysis-range-fixture'))return '\0analysis.tsx';if(id in mocks)return '\0mock-'+id+'.tsx';},load(id){if(id==='\0analysis.tsx')return entry;if(id.startsWith('\0mock-'))return mocks[id.slice(6,-4)];}}],build:{write:false,minify:false,lib:{entry:'analysis-range-fixture',formats:['iife'],name:'AnalysisFixture'}}});
const output=(Array.isArray(built)?built[0]:built).output;
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'file:///C:/Users/chetan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const browser=await chromium.launch({headless:true,executablePath:process.env.EDGE_EXECUTABLE||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
try{
  for(const width of [320,430]){
    const page=await browser.newPage({viewport:{width,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.setContent('<style>body{margin:0;background:#121212}#root{display:flex;flex-direction:column;height:100vh}</style><div id="root"></div>');await page.evaluate(()=>{window.global=window;});await page.addScriptTag({content:output.find(x=>x.type==='chunk').code});
    const range=page.getByRole('button',{name:'All time',exact:true});await range.waitFor();
    const category=page.getByRole('button',{name:'Sectional',exact:true});
    const a=await range.boundingBox(),b=await category.boundingBox();assert.ok(a.x<b.x&&Math.abs(a.y-b.y)<1,'time range is the first column');
    assert.equal(await page.getByText('All subjects',{exact:true}).count(),0);
    assert.equal(await page.getByText('Tests',{exact:true}).locator('..').textContent(),'Tests3');
    await range.click();await page.getByRole('button',{name:'Today',exact:true}).click();
    assert.equal(await page.getByText('Tests',{exact:true}).locator('..').textContent(),'Tests2');
    await category.click();await page.getByRole('button',{name:'Pre',exact:true}).click();
    await page.getByText('No tests in this range',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Today',exact:true}).click();await page.getByRole('button',{name:'All time',exact:true}).click();
    assert.equal(await page.getByText('Tests',{exact:true}).locator('..').textContent(),'Tests1','time range also applies to Pre');
    await page.getByRole('button',{name:'Pre',exact:true}).click();await page.getByRole('button',{name:'Mains',exact:true}).click();
    await page.getByRole('button',{name:'All time',exact:true}).click();await page.getByRole('button',{name:'Today',exact:true}).click();
    assert.equal(await page.getByText('Tests',{exact:true}).locator('..').textContent(),'Tests1','time range also applies to Mains');
    assert.equal(await page.getByRole('button',{name:'Back to Mock Test',exact:true}).count(),0);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);await page.close();
  }
  console.log('PASS: mock analysis time range in first column, subject filter removed, counts filtered for Sectional/Pre/Mains at 320/430px.');
}finally{await browser.close();}
