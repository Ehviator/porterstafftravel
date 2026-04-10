/**
 * Copy static assets from repo root into vite-scaffold/public for Vite dev/build.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PUB = path.join(ROOT, 'vite-scaffold', 'public');

function cp(srcRel, destRel = srcRel) {
  const from = path.join(ROOT, srcRel);
  const to = path.join(PUB, destRel);
  if (!fs.existsSync(from)) {
    console.warn('skip missing:', srcRel);
    return;
  }
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  console.log('copied', srcRel, '→', destRel);
}

fs.mkdirSync(path.join(PUB, 'js'), { recursive: true });

const images = [
  'Mitch1.jpg',
  'Mitch2.jpg',
  'Mitch3.jpg',
  'Mitch4.jpg',
  'Mitch5.jpg',
  'Mitch6.jpg',
  'Mitch7.jpg',
  'Mitch8.jpg',
  'Mitch9.jpg',
  'PXL_20241110_221052339.jpg',
  'Porter Airlines_id2odtXerw_1.png',
  'icon-192.png',
  'icon-512.png',
];

for (const f of images) cp(f);

cp('js/mytrips-timezones.js', 'js/mytrips-timezones.js');
cp('translations-fr.js', 'translations-fr.js');
cp('manifest.json', 'manifest.json');
cp('sw.js', 'sw.js');

console.log('sync-vite-public done');
