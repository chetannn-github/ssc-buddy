import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import ts from 'typescript';

// Exercise the actual native screen and popup through react-native-web layout.
const source = await readFile(new URL('../mobile-tasks/src/screens/PracticeScreen.tsx', import.meta.url), 'utf8');
const history = source.slice(source.indexOf('function History({'), source.indexOf('function HistoryDetail({'));
const tree = ts.createSourceFile('practice.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let styles;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(tree) === 's' && ts.isCallExpression(node.initializer)) styles = node.initializer.arguments[0].getText(tree);
  ts.forEachChild(node, visit);
}
visit(tree);
assert.ok(styles);
const entry = `
import React, {useState,useRef,useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {View,Text,Pressable,ScrollView,ScrollView as NativeScrollView,Animated,Easing,StyleSheet,StyleSheet as NativeStyleSheet} from 'react-native';
const colors=new Proxy({}, {get:(_,key)=>key==='text'?'#fafafa':key==='accent'?'#ff88aa':'#333333'});
const examAccentSurface='#162c45';const s=StyleSheet.create(${styles});
const DropdownChevron=()=> <Text>⌄</Text>;
const MaterialCommunityIcons={default:()=>null};
const useAndroidBack=()=>{};
const quickRecallHistoryKey=()=>null,isQuickRecallRecord=()=>false;
const friendlyRecordDate=()=> 'Today';
const ProfileNumber=({value})=><Text>{value}</Text>;
const Info=()=>null;
${history.replaceAll('<MaterialCommunityIcons ', '<MaterialCommunityIcons.default ')}
createRoot(document.getElementById('root')).render(<View style={{flex:1,paddingTop:60}}><History records={[]} subjects={[]} onBack={()=>{}} onDelete={()=>{}} onUpdate={()=>{}} onReattempt={()=>{}}/></View>);
`;
const id = '\0history-fixture.tsx';
const built = await build({ configFile:false, logLevel:'silent', resolve:{alias:{'react-native':fileURLToPath(new URL('../mobile-tasks/node_modules/react-native-web/dist/index.js',import.meta.url))},dedupe:['react','react-dom']},define:{'process.env.NODE_ENV':'"development"',__DEV__:'true'},plugins:[{name:'history-fixture',resolveId(value){if(value.endsWith('history-fixture'))return id;},load(value){if(value===id)return entry;}}],build:{write:false,minify:false,lib:{entry:'history-fixture',formats:['iife'],name:'HistoryFixture'}}});
const output=(Array.isArray(built)?built[0]:built).output;
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'file:///C:/Users/chetan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const browser=await chromium.launch({headless:true,executablePath:process.env.EDGE_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
try {
  for(const width of [320,430]) {
    const page=await browser.newPage({viewport:{width,height:800}});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.setContent('<style>html,body,#root{height:100%;margin:0}body{background:#121212}#root{display:flex;flex-direction:column}</style><div id="root"></div>');
    await page.evaluate(()=>{window.global=window;});
    await page.addScriptTag({content:output.find(item=>item.type==='chunk').code});
    await page.waitForTimeout(200);
    assert.deepEqual(errors,[]);
    for(const label of ['All subjects','All chapters']) {
      const trigger=page.getByRole('button',{name:label,exact:false});
      await trigger.waitFor({timeout:3000});
      const input=await trigger.boundingBox();
      await trigger.click();
      await page.waitForTimeout(100);
      assert.deepEqual(errors,[]);
      const option=page.getByRole('button',{name:label,exact:false}).last();
      await page.getByRole('button',{name:'Close history filter'}).waitFor({timeout:3000});
      await page.waitForTimeout(260);
      const popup=await option.evaluate(node=>node.parentElement.parentElement.parentElement.getBoundingClientRect().toJSON());
      assert.ok(Math.abs(popup.x-input.x)<1,`left alignment: ${label}, ${width}`);
      assert.ok(Math.abs(popup.y-(input.y+input.height+5))<1,`below input: ${label}, ${width}: ${popup.y} vs ${input.y+input.height+5}`);
      assert.ok(Math.abs(popup.width-input.width)<1,`width: ${label}, ${width}`);
      await option.click();
      await page.getByRole('button',{name:'Close history filter'}).waitFor({state:'detached',timeout:3000});
      await trigger.click();
      await page.getByRole('button',{name:'Close history filter'}).waitFor();
      await page.getByRole('button',{name:'Close history filter'}).click({position:{x:2,y:2}});
      await page.getByRole('button',{name:'Close history filter'}).waitFor({state:'detached',timeout:3000});
    }
    assert.deepEqual(errors,[]);
    await page.close();
  }
  console.log('PASS: both history filters align 5px below their inputs at 320px and 430px, with a 60px top inset; option selection closes the popup.');
} finally { await browser.close(); }





