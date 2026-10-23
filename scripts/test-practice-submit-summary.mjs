import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import ts from 'typescript';

const root=process.cwd().replaceAll('\\','/');
const source=await readFile('mobile-tasks/src/screens/PracticeScreen.tsx','utf8');
const screen=source.slice(source.indexOf('function TestScreen({'),source.indexOf('function History({')).replace('function TestScreen(','function NativeTestScreen(');
const tree=ts.createSourceFile('practice.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let styles;
function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(tree)==='s')styles=n.initializer.arguments[0].getText(tree);ts.forEachChild(n,visit);}visit(tree);
const entry=`import React,{useState,useRef,useEffect}from'react';import{createRoot}from'react-dom/client';import{View,Text,ScrollView,Pressable,StyleSheet}from'react-native';import{TestScreen}from'${root}/src/components/exam/TestScreen.tsx';import{PracticeSubmitSummary}from'${root}/mobile-tasks/src/components/PracticeSubmitSummary.tsx';const colors=new Proxy({text:'#fafafa',muted:'#999',button:'#f9fcf5',buttonInk:'#111',surface:'#222'},{get:(obj,key)=>obj[key]||'#333'});const examAccentSurface="#162c45";const s=StyleSheet.create(${styles});const choices=['A','B','C','D'];const useQuestionSwipe=()=>({});const useAndroidBack=()=>{};const QuestionPalette=()=>null;const MaterialCommunityIcons=()=>null;${screen}
window.submissions=[];function Fixture(){const[answers,setAnswers]=useState(['A',null,null]);const[current,setCurrent]=useState(2);const[seconds,setSeconds]=useState(900);useEffect(()=>{const timer=setInterval(()=>setSeconds(x=>x-1),1000);return()=>clearInterval(timer)},[]);return location.hash==='#native'?<View style={{height:800}}><NativeTestScreen title="English · Idioms" seconds={seconds} elapsed={1500-seconds} current={current} count={3} answers={answers} onPick={choice=>setAnswers(old=>old.map((x,i)=>i===current?x===choice?null:choice:x))} onCurrent={setCurrent} onSubmit={async()=>{window.submissions.push(answers);await new Promise(r=>setTimeout(r,2000))}}/></View>:<TestScreen initialProgress={{states:[{answer:'A',marked:false,visited:true},{answer:null,marked:true,visited:true},{answer:null,marked:false,visited:true}],current:2,remaining:900}} onProgress={value=>window.progress=value} minutes={25} startNumber={1} subject="English" chapter="Idioms" questionCount={3} initialDarkMode={true} onSubmit={(answers,time)=>window.submissions.push({answers,time})}/>;}createRoot(document.getElementById('root')).render(<Fixture/>);`;
const mocks={
  '@/lib/exam':`export const formatClock=s=>Math.floor(s/60)+':'+String(s%60).padStart(2,'0');export const saveTestDarkMode=()=>{};`,
  '../theme':`import{StyleSheet}from'react-native';export const colors={text:'#fafafa',muted:'#999',button:'#f9fcf5',buttonInk:'#111',surface:'#222'};export const createThemedStyles=StyleSheet.create;`,
  '@expo/vector-icons':`import React from'react';export const MaterialCommunityIcons=()=>null;`,
};
const built=await build({configFile:false,logLevel:'silent',resolve:{alias:{'@':root+'/src','react-native':fileURLToPath(new URL('../mobile-tasks/node_modules/react-native-web/dist/index.js',import.meta.url))},dedupe:['react','react-dom']},define:{'process.env.NODE_ENV':'"development"',__DEV__:'true'},plugins:[{name:'submit-fixture',enforce:'pre',resolveId(id){if(id.endsWith('submit-fixture'))return '\0submit.tsx';const key=Object.keys(mocks).find(key=>id===key||key.startsWith('@/')&&id.replaceAll('\\','/').replace(/\.tsx?$/,'')===root+'/src/'+key.slice(2));if(key)return '\0mock-'+key+'.tsx';},load(id){if(id==='\0submit.tsx')return entry;if(id.startsWith('\0mock-'))return mocks[id.slice(6,-4)];}}],build:{write:false,minify:false,lib:{entry:'submit-fixture',formats:['iife'],name:'SubmitFixture'}}});
const output=(Array.isArray(built)?built[0]:built).output;
const files=await readdir('.output/public/assets');const css=(await Promise.all(files.filter(x=>x.endsWith('.css')).map(x=>readFile('.output/public/assets/'+x,'utf8')))).join('\n');
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'file:///C:/Users/chetan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const browser=await chromium.launch({headless:true,executablePath:process.env.EDGE_EXECUTABLE||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
try{
  for(const mode of ['web','native'])for(const width of [390,1280]){
    const page=await browser.newPage({viewport:{width,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('https://summary.test/**',route=>route.fulfill({body:'<body style="margin:0;background:#121212"><div id="root"></div></body>',contentType:'text/html'}));await page.goto('https://summary.test/#'+mode);await page.addStyleTag({content:css});await page.evaluate(()=>{window.global=window;});await page.addScriptTag({content:output.find(x=>x.type==='chunk').code});
    await page.waitForTimeout(150);assert.deepEqual(errors,[]);
    const submit=()=>mode==='web'?page.getByRole('button',{name:'Submit Test',exact:true}):page.getByText('Submit test',{exact:true});
    await submit().click();await page.getByText('Session summary',{exact:true}).waitFor();
    assert.equal((await page.evaluate(()=>window.submissions)).length,0,'summary must precede persistence');
    assert.match(await page.getByText('Questions attempted',{exact:true}).locator('..').textContent(),/1\s*\/\s*3/,'unanswered marked question is not attempted');
    await page.getByRole('button',{name:'Keep solving',exact:true}).click();
    await page.getByText('Question 3',{exact:true}).first().waitFor();
    assert.equal((await page.evaluate(()=>window.submissions)).length,0);
    if(mode==='web')await page.getByRole('button',{name:'C Option C',exact:true}).click();else await page.getByText('Option C',{exact:true}).click();
    await submit().click();
    assert.match(await page.getByText('Questions attempted',{exact:true}).locator('..').textContent(),/2\s*\/\s*3/);
    if(mode==='web'){
      const before=await page.getByText('Time left',{exact:true}).locator('..').textContent();await page.waitForTimeout(1100);
      assert.notEqual(await page.getByText('Time left',{exact:true}).locator('..').textContent(),before,'timer continues during review');
    }
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:process.env.TEMP+'/ssc-submit-summary-'+mode+'-'+width+'.png'});
    const confirm=page.getByRole('button',{name:'Submit session',exact:true});await confirm.click();
    assert.equal((await page.evaluate(()=>window.submissions)).length,1,'confirmation saves exactly once');
    if(mode==='native')assert.equal(await confirm.isDisabled(),true,'async save cannot be submitted twice');
    const saved=(await page.evaluate(()=>window.submissions))[0];assert.deepEqual(mode==='web'?saved.answers:saved,['A',null,'C']);
    assert.deepEqual(errors,[]);await page.close();
  }
  console.log('PASS: web/native pre-submit summary, true attempt counts, back preserves answers, live timer and single confirmed submission at 390/1280px.');
}finally{await browser.close();}
