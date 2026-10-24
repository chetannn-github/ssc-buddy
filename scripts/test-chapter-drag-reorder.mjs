import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const component=fileURLToPath(new URL('../mobile-tasks/src/components/ChapterReorderList.tsx',import.meta.url)).replaceAll('\\','/');
const nativeWeb=fileURLToPath(new URL('../mobile-tasks/node_modules/react-native-web/dist/index.js',import.meta.url));
// RN web falls back to JS animations. Enforce native-driver restrictions in
// this fixture as well, so mixed layout/transform nodes cannot pass unnoticed.
const driverGuard=`
import React from 'react';import * as RN from 'native-web-runtime';export * from 'native-web-runtime';
const nativeRoots=new WeakSet();
function roots(value,result=new Set()){
  if(!value||typeof value!=='object')return result;
  if(typeof value.__getValue==='function'){if(value._parent)roots(value._parent,result);else if(value._a&&value._b){roots(value._a,result);roots(value._b,result);}else result.add(value);}
  else for(const item of Object.values(value))roots(item,result);
  return result;
}
function validate(style){
  window.driverGuardChecks=(window.driverGuardChecks||0)+1;
  const flat=RN.StyleSheet.flatten(style)||{};const values=roots(flat);
  if(![...values].some(value=>nativeRoots.has(value)))return;
  for(const key of ['height','width','borderWidth','paddingBottom','top','left'])if(roots(flat[key]).size)throw new Error('Native animated style cannot drive '+key);
  for(const value of values)nativeRoots.add(value);
}
const nativeValue=new RN.Animated.Value(0),jsValue=new RN.Animated.Value(1);nativeRoots.add(nativeValue);
try{validate({height:jsValue,transform:[{translateY:nativeValue}]});throw new Error('Guard failed to detect mixed native layout');}catch(error){if(!error.message.includes('cannot drive height'))throw error;window.driverGuardReproduced=true;}
function animate(kind,value,config){
  if(!config.useNativeDriver&&nativeRoots.has(value))throw new Error('JS animation attempted on native animated value');
  if(config.useNativeDriver)nativeRoots.add(value);
  return RN.Animated[kind](value,{...config,useNativeDriver:false});
}
const GuardedView=React.forwardRef((props,ref)=>{validate(props.style);return <RN.Animated.View {...props} ref={ref}/>;});
export const Animated={...RN.Animated,View:GuardedView,spring:(value,config)=>animate('spring',value,config),timing:(value,config)=>animate('timing',value,config)};
`;
const screen=await readFile(new URL('../mobile-tasks/src/screens/TrackScreen.tsx',import.meta.url),'utf8');
const tree=ts.createSourceFile('track.tsx',screen,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let rowStyles,swipeSource;
function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(tree)==="handleTabSwipeEnd")swipeSource=n.initializer.getText(tree);if(ts.isVariableDeclaration(n)&&n.name.getText(tree)==='s'){const props=[...n.initializer.arguments[0].arguments[0].properties,...n.initializer.arguments[1].properties];const keys=['chapter','chapterContent','chapterTop','chapterName','bar','chapterProgressFlow','chapterProgressText','chapterRowMain','chapterRowName','chapterRowBar','chapterRowCount','chapterRowPercent','chapterRowMeta'];rowStyles='{'+props.filter(p=>keys.includes(p.name?.getText(tree))).map(p=>p.getText(tree)).join(',')+'}';}ts.forEachChild(n,visit);}visit(tree);
const swipeJs=ts.transpileModule('const swipe='+swipeSource,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
for(const reordering of ['', 'subject']){
  const changes=[];const start={current:200};
  const swipe=new Function('swipeStartX','reorderingSubjectId','TRACK_TABS','tab','setTab',swipeJs+';return swipe;')(start,reordering,['Syllabus','Revision','Mock Test'],'Syllabus',next=>changes.push(next));
  swipe(100);assert.deepEqual(changes,reordering?[]:['Revision']);assert.equal(start.current,null);
}
const chapterContent=screen.slice(screen.indexOf('function ChapterContent('),screen.indexOf('function RevisionCard('));
const progress=screen.slice(screen.indexOf('function ProgressCount('),screen.indexOf('function Collapse('));
const bar=screen.slice(screen.indexOf('function Bar('),screen.indexOf('function SmoothBar('));
assert.equal((screen.match(/<ChapterContent chapter={chapter} \/>/g)||[]).length,2,'normal and reorder rows share the actual chapter UI');
const entry=`import React,{useState,useRef}from'react';import{View,Text,StyleSheet}from'react-native';import{createRoot}from'react-dom/client';import{ChapterReorderList,CHAPTER_REORDER_ROW_HEIGHT as ROW}from'${component}';const colors={text:'#fafafa',muted:'#999',accent:'#ffe000'};const s=StyleSheet.create(${rowStyles});const pct=(done,total)=>total?Math.round(done/total*100):0;const TrackNumber=({value,suffix='',style})=><Text style={style}>{value}{suffix}</Text>;const LiquidProgressBar=({style,progress})=><View testID="chapter-bar" style={[style,{height:6}]}><View style={{height:6,width:progress*100+'%',backgroundColor:'#ffe000'}}/></View>;${bar}${progress}${chapterContent}
const TRACK_TABS=["Syllabus","Revision","Mock Test"];window.savedMoves=[];window.rowHeight=ROW;function Fixture(){const[tab,setTab]=useState("Syllabus");const swipeStartX=useRef(null);const reorderingSubjectId="subject";const handleTabSwipeEnd=${swipeSource};const[chapters,setChapters]=useState(Array.from({length:12},(_,i)=>({id:String(i+1),name:'Chapter '+(i+1),completed:i,total:20})));return <View onTouchStart={event=>{swipeStartX.current=event.nativeEvent.pageX}} onTouchEnd={event=>handleTabSwipeEnd(event.nativeEvent.pageX)}><div style={{padding:16}}><ChapterReorderList chapters={chapters} rowStyle={s.chapter} renderChapter={chapter=><View style={s.chapterContent}><ChapterContent chapter={chapter}/></View>} onMove={(id,offset)=>{window.savedMoves.push({id,offset});setChapters(current=>{const next=[...current];const from=next.findIndex(x=>x.id===id);const[item]=next.splice(from,1);next.splice(from+offset,0,item);return next;});}}/><output>{chapters.map(x=>x.id).join(',')}</output><span data-testid="current-tab">{tab}</span><View testID="normal-chapter" style={s.chapter}><View style={s.chapterContent}><ChapterContent chapter={{id:'ref',name:'Reference chapter',completed:0,total:20}}/></View><View style={{width:28,height:28}}/></View></div></View>}createRoot(document.getElementById('root')).render(<Fixture/>);`;
const built=await build({configFile:false,logLevel:'silent',resolve:{alias:{'react-native-svg':fileURLToPath(new URL('../mobile-tasks/node_modules/react-native-svg/lib/module/elements.web.js',import.meta.url)),'react-native':fileURLToPath(new URL('../mobile-tasks/node_modules/react-native-web/dist/index.js',import.meta.url))},dedupe:['react','react-dom']},define:{'process.env.NODE_ENV':'"development"',__DEV__:'true'},plugins:[{name:'reorder-fixture',enforce:'pre',resolveId(id){if(id==='native-web-runtime')return nativeWeb;if(id.replaceAll('\\','/')===nativeWeb.replaceAll('\\','/'))return '\0native-driver-guard.tsx';if(id.endsWith('reorder-fixture'))return '\0reorder.tsx';if(id==='@expo/vector-icons')return '\0icons.tsx';if(id==='../theme')return '\0theme.tsx';},load(id){if(id==='\0native-driver-guard.tsx')return driverGuard;if(id==='\0reorder.tsx')return entry;if(id==='\0icons.tsx')return `import React from'react';export const MaterialCommunityIcons=()=> <span>⠿</span>;`;if(id==='\0theme.tsx')return `import{StyleSheet}from'react-native';export const colors={text:'#fafafa',muted:'#999',accent:'#ffe000'};export const createThemedStyles=StyleSheet.create;`;}}],build:{write:false,minify:false,lib:{entry:'reorder-fixture',formats:['iife'],name:'ReorderFixture'}}});
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
    const row=handle.locator('..');
    const normal=page.getByTestId('normal-chapter');
    const rowBox=await row.boundingBox(),normalBox=await normal.boundingBox();
    assert.equal(rowBox.height,normalBox.height,'entering reorder keeps the normal card height');
    const dragBar=await row.getByTestId('chapter-bar').boundingBox();
    const normalBar=await normal.getByTestId('chapter-bar').boundingBox();
    assert.equal(dragBar.width,normalBar.width,'progress bar keeps the same width');
    assert.ok(Math.abs((dragBar.y-rowBox.y)-(normalBar.y-normalBox.y))<1,'progress bar stays at the normal vertical position');
    assert.ok(Math.abs((dragBar.x-rowBox.x)-(normalBar.x-normalBox.x))<1,'content keeps the normal left alignment');
    assert.match(await row.textContent(),/0\/20.*0%/,'count and percentage remain beside the chapter title');
    const cdp=await page.context().newCDPSession(page);
    async function touch(type,x,y) {await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'||type==='touchCancel'?[]:[{x,y,id:1}]});}
    const box=await handle.boundingBox();const x=box.x+box.width/2,y=box.y+box.height/2;
    const neighbor=page.getByLabel('Reorder Chapter 4',{exact:true});
    const neighborBefore=await neighbor.boundingBox();
    await touch('touchStart',x,y);
    const origin=page.getByTestId('chapter-origin-1');
    await origin.waitFor();
    const originStart=await origin.boundingBox();
    const floating=page.getByTestId('chapter-floating-1');
    await floating.waitFor();
    const floatingStart=await floating.boundingBox();
    assert.match(await floating.textContent(),/Chapter 1.*0\/20/,'floating card renders the live name, count and progress content');
    assert.equal(await page.getByTestId('chapter-drag-scroll').evaluate(node=>node.contains(document.querySelector('[data-testid="chapter-floating-1"]'))),false,'floating card sits outside the scroll clipping hierarchy');
    for(let step=1;step<=8;step++){
      await touch('touchMove',x-80*step/8,y+168*step/8);
      await page.evaluate(()=>new Promise(requestAnimationFrame));
      assert.ok(await floating.isVisible(),'live card remains visible on every drag frame');
      assert.ok(Math.abs((await floating.boundingBox()).y-floatingStart.y-168*step/8)<2,'live card follows the finger continuously');
    }
    await page.waitForTimeout(350);
    const neighborAfter=await neighbor.boundingBox();
    assert.ok(Math.abs(neighborAfter.y-neighborBefore.y-56)<1,'neighbor shifts down to make an insertion gap while preserving the original');
    assert.ok(Math.abs((await origin.boundingBox()).y-originStart.y)<1,'faded original stays in its starting slot during drag');
    assert.equal(await origin.evaluate(n=>getComputedStyle(n).borderStyle),'dashed');
    assert.equal(Number(await origin.evaluate(n=>getComputedStyle(n).opacity)),.45,"original placeholder remains visible alongside insertion gap");
    assert.equal(await handle.locator('svg circle').count(),6,'handle matches the six-dot web icon');
    await page.screenshot({path:process.env.TEMP+'/ssc-chapter-origin-drag-'+width+'.png'});
    assert.equal((await page.evaluate(()=>window.savedMoves)).length,0,'no writes while dragging');
    await touch('touchEnd',x-80,y+168);
    assert.equal(await floating.count(),0,'release replaces the floating layer with the placed card');
    assert.equal(await origin.count(),1,'release starts a collapse instead of instantly removing the placeholder');
    const placed=page.getByTestId('chapter-placed-1');
    await placed.waitFor();
    const placedStart=await placed.boundingBox();
    await page.waitForFunction(()=>{const node=document.querySelector('[data-testid="chapter-origin-1"]');if(!node)return false;const style=getComputedStyle(node);return parseFloat(style.height)>0&&parseFloat(style.height)<50&&Number(style.opacity)>0&&Number(style.opacity)<.45;});
    const placedDuring=await placed.boundingBox();
    assert.ok(placedDuring.y<placedStart.y,'the placed card moves with the real collapsing source slot');
    assert.equal((await page.evaluate(()=>window.savedMoves)).length,0,'drop saves only after the collapse and row settlement');
    await page.waitForFunction(()=>window.savedMoves.length===1);
    assert.equal(await page.getByTestId('current-tab').textContent(),'Syllabus','horizontal drift during reorder cannot switch tracker tabs');
    assert.equal(await page.getByTestId('chapter-origin-1').count(),0,'origin placeholder is removed on drop');
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
    const scrolledFloating=await page.getByTestId('chapter-floating-2').boundingBox();
    assert.ok(Math.abs(scrolledFloating.y+scrolledFloating.height/2-355)<12,'auto-scroll keeps the live card under the finger');
    assert.equal((await page.evaluate(()=>window.savedMoves)).length,2);
    await touch('touchEnd',x,355);await page.waitForFunction(()=>window.savedMoves.length===3);
    assert.ok((await page.evaluate(()=>window.savedMoves))[2].offset>=6,'edge auto-scroll reaches offscreen chapters');
    assert.equal((await page.locator('output').textContent()).split(',').length,12,'all chapters are preserved');
    assert.deepEqual(errors,[]);
    assert.equal(await page.evaluate(()=>window.driverGuardReproduced),true,'fixture rejects the original native height/transform conflict');
    assert.ok(await page.evaluate(()=>window.driverGuardChecks>10),'native driver guard covers actual animated views');
    await page.close();
  }
  console.log('PASS: native-driver restrictions, touch reorder, placeholder collapse, swipe suppression, cancellation and edge auto-scroll at 320/430px.');
}finally{await browser.close();}
