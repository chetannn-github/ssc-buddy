import { build } from 'vite';
import { readFile, readdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

const root = process.cwd().replaceAll('\\', '/');
const record = (id, subject, count, score, wrong = 0) => ({ id, subject, chapter: subject === 'Quick Recall' ? '' : 'IDIOMS', exercise: subject === 'Quick Recall' ? '' : 'All exercises', date: '2026-10-23', createdAt: '2026-10-23T05:29:00Z', answers: Array(count).fill('A'), answerKey: Array(count - wrong).fill('A').concat(Array(wrong).fill('B')), correct: count - wrong, wrong, score, marking: { positive: 1, negative: .25 }, startNumber: 1, durationMinutes: 25 });
const records = [record('a', 'ENGLISH', 400, 396.25, 3), record('b', 'Quick Recall', 2, 2), record('c', 'ENGLISH', 40, 40), record('d', 'ENGLISH', 10000, 9999), record('e', 'Quick Recall', 26, 24.75, 1)];
records[0].questions=Array.from({length:400},(_,index)=>({id:`q${index}`,number:index+1,question:'Question with a long reference: '+ 'reference'.repeat(20),options:['answer'.repeat(30),'Second option','Third option','Fourth option'],correctAnswer:'A',explanation:'Example explanation'}));
const subjects=[{id:'english',name:'ENGLISH',chapters:[{id:'idioms',name:'IDIOMS',exercises:[{id:'ex',name:'All exercises',questions:records[0].questions}]}]}];
const mocks = {
  '@tanstack/react-router': `import React from 'react';export const createFileRoute=()=>()=>({useParams:()=>({id:'a'}),useSearch:()=>({subject:'ENGLISH',chapter:'IDIOMS',exercise:'All exercises'})});export const useNavigate=()=>args=>{globalThis.__navigation=args};export const Link=({children,to,search,...p})=><a href={to} {...p}>{children}</a>;`,
  '@/components/layout/AppShell': `import React from 'react';export const AppShell=({children})=><div style={{paddingTop:80}}><main data-testid="shell-main" className="mx-auto w-full min-w-0 max-w-5xl px-4 py-6 sm:px-6">{children}</main></div>;`,
  '@/lib/navigation': `export const consumeLightPageLoader=()=>false;`,
  '@/lib/exam': `export const attemptKey=r=>r.id;export const deleteRecord=id=>{globalThis.__deleted=id};export const loadHistory=()=>globalThis.__records;export const getRecord=id=>globalThis.__records.find(r=>r.id===id);export const getAttemptGroup=id=>[getRecord(id)];export const loadSubjects=()=>globalThis.__subjects;export const saveRecord=()=>{};export const reevaluateRecord=r=>r;export const onPracticePersist=()=>()=>{};export const computeScore=(c,w,m)=>c*m.positive-w*m.negative;export const loadFavoriteQuestionIds=()=>[];export const questionFavoriteId=(_,__,___,q)=>q.id;export const toggleFavoriteQuestion=()=>[];export const deleteBankQuestion=(_,__,id)=>{globalThis.__deletedQuestion=id;return globalThis.__subjects};`,
};
const entry = `import React from 'react';import{createRoot}from'react-dom/client';import{HistoryPage}from'${root}/src/routes/history.index.tsx';import{ResultDetail}from'${root}/src/routes/history.$id.tsx';import{QuestionViewer}from'${root}/src/routes/question-view.tsx';import{AppShell}from'@/components/layout/AppShell';import{SolutionScreen}from'${root}/src/components/exam/SolutionScreen.tsx';import{HabitEditor}from'${root}/src/components/tasks/HabitEditor.tsx';globalThis.__records=${JSON.stringify(records)};globalThis.__subjects=${JSON.stringify(subjects)};createRoot(document.body).render(location.hash==='#habit'?<HabitEditor habit={null} initialColor="pink" busy={false} error="" onClose={()=>{globalThis.__habitClosed=true}} onSave={async()=>{globalThis.__habitSaved=true}}/>:location.hash==='#result'?<ResultDetail/>:location.hash==='#viewer'?<QuestionViewer/>:location.hash==='#solution'?<AppShell><SolutionScreen record={globalThis.__records[0]} onExit={()=>{}}/></AppShell>:<HistoryPage/>);`;
const built = await build({ configFile: false, logLevel: 'silent', resolve: { alias: { '@': root + '/src' }, dedupe: ['react', 'react-dom'] }, define: { 'process.env.NODE_ENV': '"development"' }, plugins: [{
  name: 'history-preview', enforce: 'pre',
  resolveId(id) {
    if (id.endsWith('preview-history')) return '\0preview-history.tsx';
    const key=Object.keys(mocks).find(key=>id===key || (key.startsWith('@/') && id.replaceAll('\\','/').replace(/\.(tsx?|jsx?)$/,'')===root+'/src/'+key.slice(2)));
    if (key) return '\0mock-' + key + '.tsx';
  },
  async load(id) {
    if (id === '\0preview-history.tsx') return entry;
    if (id.startsWith('\0mock-')) return mocks[id.slice(6, -4)];
    if (id.replaceAll('\\', '/').endsWith('/src/routes/history.index.tsx')) return await readFile(id, 'utf8') + '\nexport {HistoryPage};';
    if (id.replaceAll('\\', '/').endsWith('/src/routes/history.$id.tsx')) return await readFile(id, 'utf8') + '\nexport {ResultDetail};';
    if (id.replaceAll('\\', '/').endsWith('/src/routes/question-view.tsx')) return await readFile(id, 'utf8') + '\nexport {QuestionViewer};';
  },
}], build: { write: false, minify: false, lib: { entry: 'preview-history', formats: ['iife'], name: 'Preview' } } });
const output = (Array.isArray(built) ? built[0] : built).output;
// Use the production CSS so responsive layout checks include real Tailwind styles.
const assets = await readdir('.output/public/assets');
const css = (await Promise.all(assets.filter(x => x.endsWith('.css')).map(x => readFile('.output/public/assets/' + x, 'utf8')))).join('\n');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'file:///C:/Users/chetan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const browser = await chromium.launch({ headless: true, executablePath: process.env.EDGE_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
try {
  for (const width of [390,1024,1920]) for(const mode of ['history','result','viewer','solution','habit']) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('https://preview.test/**', r => r.fulfill({ body: '<!doctype html><body style="background:#121212;margin:0"></body>', contentType: 'text/html' }));
    await page.goto('https://preview.test/#'+mode);
    await page.addStyleTag({ content: css });
    await page.addScriptTag({ content: output.find(x => x.type === 'chunk').code });
    await page.waitForTimeout(350);
    assert.deepEqual(errors, []);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `horizontal overflow: ${mode} at ${width}`);
    if(mode==='habit'){
      await page.getByRole('checkbox',{name:'Set Reminder'}).check();
      await page.getByRole('button',{name:'Reminder time',exact:true}).click();
      const clock=page.locator('.study-duration-clock');
      await clock.waitFor({state:'visible'});
      const usable=await clock.evaluate(node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,hit:node.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};});
      assert.ok(usable.hit && usable.x>=0 && usable.y>=0 && usable.x+usable.width<=width,'habit clock must be visible and above the editor');
      await page.getByRole('button',{name:'PM',exact:true}).click();
      await page.locator('.study-duration-actions').getByRole('button',{name:'Save',exact:true}).click();
      assert.match(await page.getByRole('button',{name:'Reminder time',exact:true}).textContent(),/PM/);
      assert.equal(await page.evaluate(()=>globalThis.__habitSaved),undefined,'clock save must not submit habit');
      assert.equal(await page.evaluate(()=>globalThis.__habitClosed),undefined);
      await page.getByRole('button',{name:'Count',exact:true}).click();
      const counts=await page.locator('.habit-editor input[type="number"]').evaluateAll(nodes=>nodes.map(n=>getComputedStyle(n).appearance));
      assert.ok(counts.length>=2 && counts.every(value=>value==='textfield'),'native count spinners must be hidden');
    } else if (mode === 'history') {
      assert.equal(await page.getByRole('button',{name:/Delete|Reattempt|Practice again/}).count(),0,'actions belong inside the session');
      assert.equal(await page.getByText('All chapters',{exact:true}).count(),0);
      const range=page.getByRole('combobox',{name:'Time range',exact:true});
      assert.equal(await range.textContent(),'Today','history defaults to today');
      const triggers=page.getByRole('combobox');
      const rangeBox=await range.boundingBox(),subjectBox=await triggers.nth(1).boundingBox();
      assert.ok(Math.abs(rangeBox.y-subjectBox.y)<1 && rangeBox.x<subjectBox.x,'time range and subject sit side by side');
      const today=new Date();const localDay=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      const todayKey=localDay(today);
      await range.click();await page.getByRole('option',{name:'Today',exact:true}).click();
      const expected=records.filter(r=>r.date===todayKey).length;
      assert.equal(await page.locator('article').count(),expected,'time range filters the actual history list');
      await range.click();await page.getByRole('option',{name:'All time',exact:true}).click();
      assert.equal(await page.locator('article').count(),records.length,'all time restores every session');
      await page.locator('article').last().evaluate(node=>node.parentElement.style.paddingBottom='1800px');
      await page.evaluate(()=>scrollTo(0,600));
      await page.waitForTimeout(80);
      const stuck=await page.getByLabel('History filters',{exact:true}).boundingBox();
      assert.ok(Math.abs(stuck.y-88)<1,'history dropdowns remain pinned below the navigation');
      await range.click();await page.getByRole('option',{name:'All time',exact:true}).click();
      assert.equal(await page.locator('article').count(),records.length,'dropdown remains usable after scrolling');
      await page.getByRole('link').filter({hasText:'ENGLISH'}).first().click();
      assert.equal((await page.evaluate(()=>globalThis.__navigation)).to,'/history/$id');
    } else if(mode==='result') {
      await page.getByRole('button', { name: 'Delete attempt', exact: true }).first().click();
      await page.getByRole('alertdialog').waitFor();
      assert.equal(await page.evaluate(() => globalThis.__deleted), undefined);
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      await page.getByRole('alertdialog').waitFor({ state: 'detached' });
      await page.getByRole('button', { name: 'Delete attempt', exact: true }).first().focus();
      await page.keyboard.press('Enter');
      await page.getByRole('alertdialog').waitFor();
      assert.equal(await page.evaluate(() => globalThis.__navigation), undefined, 'Delete keyboard action must not open the session');
      await page.getByRole('button', { name: 'Yes, delete', exact: true }).click();
      assert.equal(await page.evaluate(() => globalThis.__deleted), 'a');
      await page.getByRole('alertdialog').waitFor({ state: 'detached' });
      assert.equal(await page.getByText('396.25', { exact: true }).count(), 1);
      assert.equal(await page.getByText('Total score', { exact: true }).count(), 1);
    } else {
      const panel=await page.locator('section').first().boundingBox();
      const palette=await page.locator('aside').boundingBox();
      const shell=await page.getByTestId('shell-main').boundingBox();
      for(const box of [panel,palette])assert.ok(box.x>=shell.x && box.x+box.width<=shell.x+shell.width,'viewer stays inside page width');
      if(width>=1024)assert.ok(Math.abs(panel.y-palette.y)<1,`viewer and palette align at top: ${mode} at ${width}`);
      if(mode==='viewer'){
        await page.getByRole('button',{name:'Delete',exact:true}).click();
        await page.getByRole('alertdialog').waitFor();
        assert.equal(await page.evaluate(()=>globalThis.__deletedQuestion),undefined);
        await page.getByRole('button',{name:'Cancel',exact:true}).click();
        await page.getByRole('alertdialog').waitFor({state:'detached'});
        await page.getByRole('button',{name:'Delete',exact:true}).click();
        await page.getByRole('button',{name:'Yes, delete',exact:true}).click();
        assert.equal(await page.evaluate(()=>globalThis.__deletedQuestion),'q0');
        await page.getByRole('alertdialog').waitFor({state:'detached'});
      }
    }
    if (process.env.TEMP) await page.screenshot({ path: process.env.TEMP + '/ssc-' + mode + '-' + width + '.png', fullPage: true });
    await page.close();
  }
  console.log('PASS: history/result/viewer/solutions/habit at 390/1024/1920px; viewer bounds, detail actions, deletion confirmation, nested habit clock and count spinner styling.');
} finally { await browser.close(); }
