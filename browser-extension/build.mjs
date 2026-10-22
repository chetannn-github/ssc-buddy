import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, loadEnv } from 'vite';
const root = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(root, 'dist', 'ssc-buddy-study-lock');
await fs.mkdir(path.join(out, 'images'), { recursive: true });
for (const name of ['manifest.json', 'page.js', 'popup.html', 'blocked.html', 'ui.css', 'README.md']) await fs.copyFile(path.join(root, name), path.join(out, name));
const env = { ...loadEnv('production', path.join(root, '..'), 'VITE_'), ...loadEnv('production', path.join(root, '..', 'desktop-widget'), 'VITE_'), ...process.env };
const config = Object.fromEntries([['apiKey','API_KEY'],['authDomain','AUTH_DOMAIN'],['projectId','PROJECT_ID'],['appId','APP_ID']].map(([key,suffix]) => [key, env[`VITE_FIREBASE_${suffix}`]]));
if (Object.values(config).some(value => !value)) throw Error('Missing SSC Buddy Firebase configuration.');
await build({ configFile: false, root, define: { __FIREBASE_CONFIG__: JSON.stringify(config) }, build: { outDir: out, emptyOutDir: false, target: 'chrome120', lib: { entry: path.join(root, 'worker.js'), formats: ['es'], fileName: () => 'worker.js' }, rollupOptions: { output: { inlineDynamicImports: true } } } });
await build({ configFile: false, root, resolve: { dedupe: ['react', 'react-dom'] }, define: { 'process.env.NODE_ENV': JSON.stringify('production') }, build: { minify: true, outDir: out, emptyOutDir: false, target: 'chrome120', lib: { entry: path.join(root, 'duration-ui.jsx'), formats: ['es'], fileName: () => 'duration-ui.js' }, rollupOptions: { output: { inlineDynamicImports: true } } } });
const avatars = path.join(root, '..', 'public', 'avatars');
const names = JSON.parse(await fs.readFile(path.join(avatars, 'manifest.json'), 'utf8'));
const images = [];
for (const [index, name] of names.entries()) {
  const target = `${index}${path.extname(name).toLowerCase()}`;
  await fs.copyFile(path.join(avatars, name), path.join(out, 'images', target)); images.push(target);
}
await fs.writeFile(path.join(out, 'images', 'manifest.json'), JSON.stringify(images));
await fs.copyFile(path.join(root, '..', 'desktop-widget', 'src-tauri', 'icons', '128x128.png'), path.join(out, 'icon.png'));
console.log(`Extension ready: ${out} (${images.length} motivational images)`);
