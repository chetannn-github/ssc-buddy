import { build } from 'vite';
import { fileURLToPath } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'file:///C:/Users/chetan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const result = await build({ configFile: false, logLevel: 'silent', resolve: { dedupe: ['react', 'react-dom'] }, define: { 'process.env.NODE_ENV': '"development"' },
  plugins: [{name: 'mock-firestore', enforce: 'pre', resolveId(id) { if (id === 'firebase/firestore') return '\0mock-firestore'; }, load(id) { if (id === '\0mock-firestore') return 'export const collection = (_, ...path) => path.join("/"); export const doc = collection; export const onSnapshot = (...args) => globalThis.__xpSDK.listen(...args);'; }}],
  build: { write: false, minify: false, lib: { entry: fileURLToPath(new URL('./fixtures/leaderboard-current-xp.tsx', import.meta.url)), formats: ['iife'], name: 'LeaderboardCurrentXp' } } });
const output = Array.isArray(result) ? result[0] : result;
const browser = await chromium.launch({ headless: true, executablePath: process.env.EDGE_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
try {
  const page = await browser.newPage();
  await page.setContent('<!doctype html><body></body>');
  await page.addScriptTag({ content: output.output.find(item => item.type === 'chunk').code });
  console.log('PASS: leaderboard current identity:', await page.evaluate(() => window.LeaderboardCurrentXp.run()));
} finally { await browser.close(); }
