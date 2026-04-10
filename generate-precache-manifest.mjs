/**
 * After `vite build`, reads vite-scaffold/dist/index.html and writes
 * dist/precache-manifest.json listing /assets/* URLs for the service worker.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, '..', 'vite-scaffold', 'dist');
const htmlPath = path.join(DIST, 'index.html');

if (!fs.existsSync(htmlPath)) {
  console.warn('generate-precache-manifest: vite-scaffold/dist/index.html missing, skip');
  process.exit(0);
}

const html = fs.readFileSync(htmlPath, 'utf8');
const assets = new Set();
for (const m of html.matchAll(/\b(?:src|href)="(\/assets\/[^"]+)"/g)) {
  assets.add(m[1]);
}

const out = { assets: [...assets].sort() };
fs.writeFileSync(path.join(DIST, 'precache-manifest.json'), JSON.stringify(out));
console.log('precache-manifest:', out.assets.length, 'entries');
