import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const component=fileURLToPath(new URL('../mobile-tasks/src/components/ChapterReorderList.tsx',import.meta.url)).replaceAll('\\','/');
const entry=`import React,{useState}from'react';import{createRoot}from'react-dom/client';import{ChapterReorderList}from'${component}';window.savedMoves=[];function Fixture(){const[chapters,setChapters]=useState(Array.from({length:12},(_,i)=>({id:String(i+1),name:'Chapter '+(i+1),completed:i,total:20})));return <div style={{padding:16}}><ChapterReorderList chapters={chapters} pinned={['1']} onMove={(id,offset)=>{window.savedMoves.push({id,offset});setChapters(current=>{const next=[...current];const from=next.findIndex(x=>x.id===id);const[item]=next.splice(from,1);next.splice(from+offset,0,item);return next;});}}/><output>{chapters.map(x=>x.id).join(',')}</output></div>}createRoot(document.getElementById('root')).render(<Fixture/>);`;
const built=await build({configFile:false,logLevel:'silent',resolve:{alias:{'react-native-svg':fileURLToPath(new URL('../mobile-tasks/node_modules/react-native-svg/lib/module/elements.web.js',import.meta.url)),'react-native':fileURLToPath(new URL('../mobile-tasks/node_modules/react-native-web/dist/index.js',import.meta.url))},dedupe:['react','react-dom']},define:{'process.env.NODE_ENV':'"development"',__DEV__:'true'},plugins:[{name:'reorder-fixture',enforce:'pre',resolveId(id){if(id.endsWith('reorder-fixture'))return '\0reorder.tsx';if(id==='@expo/vector-icons')return '\0icons.tsx';if(id==='../theme')return '\0theme.tsx';},load(id){if(id==='\0reorder.tsx')return entry;if(id==='\0icons.tsx')return `import React from'react';export const MaterialCommunityIcons=()=> <span>⠿</span>;`;if(id==='\0theme.tsx')return `import{StyleSheet}from'react-native';export const colors={text:'#fafafa',muted:'#999',accent:'#ffe000'};export const createThemedStyles=StyleSheet.create;`;}}],build:{write:false,minify:false,lib:{entry:'reorder-fixture',formats:['iife'],name:'ReorderFixture'}}});
const output=(Array.isArray(built)?built[0]:built).output;
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'file:///C:/Users/chetan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const browser=await chromium.launch({headless:true,executablePath:process.env.EDGE_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
try {
  for(const width of [320,430]) {
    const page=await browser.newPage({viewport:{width,height:800},hasTouch:true});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.setContent('<style>body{margin:0;background:#121212}</style><div id="root"></div>');
    await page.evaluate(()=>{window.global=window;});
    await page.addScriptTag({content:output.find(x=>x.type==='chunk').code});
    const handle=page.getByLabel('Reorder Chapter 1',{exact:true});
    await handle.waitFor();await page.waitForTimeout(80);
    const cdp=await page.context().newCDPSession(page);
    async function touch(type,x,y) {await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'||type==='touchCancel'?[]:[{x,y,id:1}]});}
    const box=await handle.boundingBox();const x=box.x+box.width/2,y=box.y+box.height/2;
    await touch('touchStart',x,y);
    for(let step=1;step<=8;step++)await touch('touchMove',x,y+112*step/8);
    assert.equal((await page.evaluate(()=>window.savedMoves)).length,0,'no writes while dragging');
    await touch('touchEnd',x,y+112);
    await page.waitForFunction(()=>window.savedMoves.length===1);
    assert.deepEqual(await page.evaluate(()=>window.savedMoves),[{id:'1',offset:2}]);
    assert.ok((await page.locator('output').textContent()).startsWith('2,3,1,4'),'dropping saves the intended order');
    const reverse=await handle.boundingBox();const reverseY=reverse.y+reverse.height/2;
    await touch('touchStart',x,reverseY);
    for(let step=1;step<=8;step++)await touch('touchMove',x,reverseY-112*step/8);
    await touch('touchEnd',x,reverseY-112);await page.waitForFunction(()=>window.savedMoves.length===2);
    assert.deepEqual((await page.evaluate(()=>window.savedMoves))[1],{id:'1',offset:-2});
    assert.ok((await page.locator('output').textContent()).startsWith('1,2,3,4'),'upward drop restores the order');
    // A cancelled drag and a tap leave the persisted order alone.
    const moved=await handle.boundingBox();const my=moved.y+moved.height/2;
    await touch('touchStart',x,my);await touch('touchMove',x,my+56);await touch('touchCancel',x,my+56);await page.waitForTimeout(700);
    assert.equal((await page.evaluate(()=>window.savedMoves)).length,2,'cancel does not save');
    await handle.tap();await page.waitForTimeout(500);
    assert.equal((await page.evaluate(()=>window.savedMoves)).length,2,'tap does not save');
    // Holding the bottom edge auto-scrolls to chapters beyond the viewport.
    const top=await page.getByLabel('Reorder Chapter 2',{exact:true}).boundingBox();
    await touch('touchStart',x,top.y+top.height/2);
    await touch('touchMove',x,355);await page.waitForTimeout(1100);
    assert.equal((await page.evaluate(()=>window.savedMoves)).length,2);
    await touch('touchEnd',x,355);await page.waitForFunction(()=>window.savedMoves.length===3);
    assert.ok((await page.evaluate(()=>window.savedMoves))[2].offset>=6,'edge auto-scroll reaches offscreen chapters');
    assert.equal((await page.locator('output').textContent()).split(',').length,12,'all chapters are preserved');
    assert.deepEqual(errors,[]);
    await page.close();
  }
  console.log('PASS: touch drag reorder, one save on drop, cancelled/tap gestures and edge auto-scroll at 320/430px.');
}finally{await browser.close();}
