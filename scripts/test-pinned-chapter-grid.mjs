import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const component = fileURLToPath(new URL('../mobile-tasks/src/components/PinnedChapterGrid.tsx', import.meta.url)).replaceAll('\\', '/');
const names = ['Percentage', 'Algebra', 'Polity', 'Economics', 'Number System basics', 'HCF & LCM', 'A very long chapter title that must remain readable without truncation'];
const entry = `import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{PinnedChapterGrid}from'${component}';import{FavouriteStar}from'${component.replace('PinnedChapterGrid.tsx','FavouriteStar.tsx')}';const chapters=${JSON.stringify(names)}.map((name,i)=>({id:String(i),name}));function Fixture(){const[filled,setFilled]=useState(false);return <div style={{padding:16}}><PinnedChapterGrid chapters={chapters} onOpen={id=>window.openedChapter=id}/><button aria-label="Toggle favourite" onClick={()=>setFilled(!filled)}><FavouriteStar color="#ffe000" filled={filled}/></button></div>}createRoot(document.getElementById('root')).render(<Fixture/>);`;
const built = await build({configFile:false,logLevel:'silent',resolve:{alias:{'react-native-svg':fileURLToPath(new URL('../mobile-tasks/node_modules/react-native-svg/lib/module/elements.web.js',import.meta.url)),'react-native':fileURLToPath(new URL('../mobile-tasks/node_modules/react-native-web/dist/index.js',import.meta.url))},dedupe:['react','react-dom']},define:{'process.env.NODE_ENV':'"development"',__DEV__:'true'},plugins:[{name:'pinned-fixture',enforce:'pre',resolveId(id){if(id.endsWith('pinned-fixture'))return '\0pinned.tsx';if(id==='@expo/vector-icons')return '\0icons.tsx';if(id==='../theme')return '\0theme.tsx';},load(id){if(id==='\0pinned.tsx')return entry;if(id==='\0icons.tsx')return `import React from'react';export const MaterialCommunityIcons=()=> <span style={{width:16,flexShrink:0}}>★</span>;`;if(id==='\0theme.tsx')return `import{StyleSheet}from'react-native';export const colors={text:'#fafafa',accent:'#ffe000'};export const createThemedStyles=StyleSheet.create;`;}}],build:{write:false,minify:false,lib:{entry:'pinned-fixture',formats:['iife'],name:'PinnedFixture'}}});
const output=(Array.isArray(built)?built[0]:built).output;
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'file:///C:/Users/chetan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const browser=await chromium.launch({headless:true,executablePath:process.env.EDGE_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
try {
  for(const width of [320,390,430]) {
    const page=await browser.newPage({viewport:{width,height:800}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.setContent('<style>body{margin:0;background:#121212}</style><div id="root"></div>');
    await page.evaluate(()=>{window.global=window;});
    await page.addScriptTag({content:output.find(x=>x.type==='chunk').code});
    await page.waitForFunction(()=>{const n=document.querySelector('[role="button"]');return n && getComputedStyle(n.parentElement).opacity==='1';});
    const buttons=page.getByRole('button');
    assert.equal(await buttons.count(),names.length+1);
    const boxes=await Promise.all(names.map(name=>page.getByRole('button',{name,exact:true}).boundingBox()));
    const unit=(width-32+8)/3;
    for(const box of boxes) {
      assert.ok(Math.abs((box.x-16)/unit-Math.round((box.x-16)/unit))<.02,'every row uses the same column starts');
      assert.ok(box.x+box.width<=width-15,'items stay inside the grid');
    }
    if(width>=390) {
      assert.equal(boxes[0].y,boxes[2].y,'three short chapters fit on the first row');
      assert.equal(boxes[3].y,boxes[4].y,'longer chapter shares the second row');
      assert.ok(boxes[5].y>boxes[4].y,'two-column chapter moves the next item to the next row');
    }
    const long=page.getByRole('button',{name:names.at(-1),exact:true});
    assert.ok(await long.evaluate(n=>n.textContent.includes('without truncation')));
    assert.ok(boxes.at(-1).height>34,'very long labels wrap');
    await page.getByRole('button',{name:'Algebra',exact:true}).click();
    assert.equal(await page.evaluate(()=>window.openedChapter),'1','chapter navigation preserves the selected ID');
    const toggle=page.getByRole('button',{name:'Toggle favourite'});
    const star=toggle.locator('svg');
    assert.equal(await star.getAttribute('fill'),'none');
    await toggle.click();
    await page.waitForTimeout(85);
    assert.equal(await star.getAttribute('fill'),'#ffe000');
    const moving=await star.evaluate(n=>getComputedStyle(n.parentElement).transform);
    assert.notEqual(moving,'matrix(1, 0, 0, 1, 0, 0)','pinning animates the star');
    await page.waitForTimeout(900);
    await toggle.click();
    await page.waitForTimeout(85);
    assert.equal(await star.getAttribute('fill'),'none');
    assert.notEqual(await star.evaluate(n=>getComputedStyle(n.parentElement).transform),'matrix(1, 0, 0, 1, 0, 0)','unpinning animates the star');
    await page.waitForTimeout(900);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    assert.deepEqual(errors,[]);
    await page.screenshot({path:`${process.env.TEMP}/ssc-pinned-grid-${width}.png`});
    await page.close();
  }
  console.log('PASS: native pinned grid at 320/390/430px, aligned columns, 3/2 item rows, wrapping and chapter navigation.');
} finally { await browser.close(); }
