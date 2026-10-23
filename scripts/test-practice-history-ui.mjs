import { build } from 'vite';
import { readFile, readdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

const root = process.cwd().replaceAll('\\', '/');
const record = (id, subject, count, score, wrong = 0) => ({ id, subject, chapter: subject === 'Quick Recall' ? '' : 'IDIOMS', exercise: subject === 'Quick Recall' ? '' : 'All exercises', date: '2026-10-23', createdAt: '2026-10-23T05:29:00Z', answers: Array(count).fill('A'), answerKey: Array(count - wrong).fill('A').concat(Array(wrong).fill('B')), correct: count - wrong, wrong, score, marking: { positive: 1, negative: .25 }, startNumber: 1, durationMinutes: 25 });
const records = [record('a', 'ENGLISH', 400, 396.25, 3), record('b', 'Quick Recall', 2, 2), record('c', 'ENGLISH', 40, 40), record('d', 'ENGLISH', 10000, 9999), record('e', 'Quick Recall', 26, 24.75, 1)];
const mocks = {
  '@tanstack/react-router': `import React from 'react';export const createFileRoute=()=>()=>({});export const useNavigate=()=>args=>{globalThis.__navigation=args};export const Link=({children,to,...p})=><a href={to} {...p}>{children}</a>;`,
  '@/components/layout/AppShell': `import React from 'react';export const AppShell=({children})=><main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</main>;`,
  '@/lib/navigation': `export const consumeLightPageLoader=()=>false;`,
  '@/lib/exam': `export const attemptKey=r=>r.id;export const deleteRecord=id=>{globalThis.__deleted=id};export const loadHistory=()=>globalThis.__records;export const onPracticePersist=()=>()=>{};export const computeScore=(c,w,m)=>c*m.positive-w*m.negative;`,
};
const entry = `import React from 'react';import{createRoot}from'react-dom/client';import{HistoryPage}from'${root}/src/routes/history.index.tsx';import{ResultScreen}from'${root}/src/components/exam/ResultScreen.tsx';globalThis.__records=${JSON.stringify(records)};createRoot(document.body).render(location.hash==='#result'?<main className="exam-dark mx-auto max-w-5xl p-5 text-zinc-100"><ResultScreen record={globalThis.__records[0]} hideAnswers/></main>:<HistoryPage/>);`;
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
  },
}], build: { write: false, minify: false, lib: { entry: 'preview-history', formats: ['iife'], name: 'Preview' } } });
const output = (Array.isArray(built) ? built[0] : built).output;
// Use the production CSS so responsive layout checks include real Tailwind styles.
const assets = await readdir('.output/public/assets');
const css = (await Promise.all(assets.filter(x => x.endsWith('.css')).map(x => readFile('.output/public/assets/' + x, 'utf8')))).join('\n');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'file:///C:/Users/chetan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const browser = await chromium.launch({ headless: true, executablePath: process.env.EDGE_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
try {
  for (const [width, mode] of [[1280, 'history'], [390, 'history'], [1280, 'result'], [390, 'result']]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('https://preview.test/**', r => r.fulfill({ body: '<!doctype html><body style="background:#121212;margin:0"></body>', contentType: 'text/html' }));
    await page.goto('https://preview.test/' + (mode === 'result' ? '#result' : ''));
    await page.addStyleTag({ content: css });
    await page.addScriptTag({ content: output.find(x => x.type === 'chunk').code });
    await page.waitForTimeout(350);
    assert.deepEqual(errors, []);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'horizontal overflow');
    if (mode === 'history') {
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
    } else {
      assert.equal(await page.getByText('396.25', { exact: true }).count(), 1);
      assert.equal(await page.getByText('Total score', { exact: true }).count(), 1);
    }
    if (process.env.TEMP) await page.screenshot({ path: process.env.TEMP + '/ssc-' + mode + '-' + width + '.png', fullPage: true });
    await page.close();
  }
  console.log('PASS: history and result at 1280px/390px, no overflow, readable score; Delete opens confirmation and Cancel preserves the record.');
} finally { await browser.close(); }
