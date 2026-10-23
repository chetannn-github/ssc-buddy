import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { build } from 'vite';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = await fs.mkdtemp(path.join(os.tmpdir(), 'ssc-focus-hook-regression-'));
await build({ configFile: false, resolve: { dedupe: ['react', 'react-dom'] }, define: { 'process.env.NODE_ENV': '"development"' },
  plugins: [{ name: 'profile-provider-native-boundary', enforce: 'pre',
    resolveId(id, importer) {
      if (id === 'firebase/firestore') return '\0leaderboard-firestore';
      if (!importer?.replaceAll('\\', '/').endsWith('/components/ProfileFocusProvider.tsx')) return;
      if (id === './StudyLock') return '\0profile-controller';
      if (id === '../lib/firebase') return '\0profile-database';
    },
    load(id) {
      if (id === '\0leaderboard-firestore') return ['collection', 'doc', 'getDoc', 'getDocs', 'onSnapshot'].map(name => `export const ${name} = (...args) => globalThis.__leaderboardXpSDK.${name}(...args);`).join('\n');
      if (id === '\0profile-controller') return 'export const controller = new Proxy({}, { get: (_, key) => (...args) => globalThis.__profileFocusTest.reader[key](...args) });';
      if (id === '\0profile-database') return 'export const getFirebaseFirestore = () => globalThis.__profileFocusTest.db;';
    },
  }],
  build: { outDir: output, minify: false, lib: { entry: path.resolve('scripts/fixtures/focus-hook-regression.tsx'), formats: ['iife'], name: 'FocusHookRegression', fileName: () => 'regression.js' } } });
const browser = await chromium.launch({ executablePath: process.env.EDGE_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
try {
  const page = await browser.newPage();
  await page.setContent('<!doctype html><html><body></body></html>');
  await page.addScriptTag({ content: await fs.readFile(path.join(output, 'regression.js'), 'utf8') });
  const result = await page.evaluate(() => window.FocusHookRegression.runFocusHookRegression());
  assert.equal(result.passed, true);
  console.log('PASS: React profile focus regression in Edge:', result.scenarios.join(', '));
  const leaderboard = await page.evaluate(() => window.FocusHookRegression.runLeaderboardXpRegression());
  assert.equal(leaderboard.passed, true);
  console.log('PASS: React leaderboard XP regression in Edge:', leaderboard.scenarios.join(', '));
} finally { await browser.close(); }
