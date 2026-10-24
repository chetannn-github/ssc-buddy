import { build } from 'vite';
import { fileURLToPath } from 'node:url';
const built = await build({ configFile: false, logLevel: 'silent', resolve: { dedupe: ['react', 'react-dom'] }, define: { 'process.env.NODE_ENV': '"development"' }, build: { write: false, minify: false, lib: { entry: fileURLToPath(new URL('./fixtures/startup-readiness.tsx', import.meta.url)), formats: ['iife'], name: 'StartupReadiness' } } });
const output = (Array.isArray(built) ? built[0] : built).output;
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'file:///C:/Users/chetan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const browser = await chromium.launch({ headless: true, executablePath: process.env.EDGE_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
try {
  const page = await browser.newPage();
  await page.setContent('<body></body>');
  await page.addScriptTag({ content: output.find(item => item.type === 'chunk').code });
  console.log('PASS:', await page.evaluate(() => window.StartupReadiness.run()));
} finally { await browser.close(); }
