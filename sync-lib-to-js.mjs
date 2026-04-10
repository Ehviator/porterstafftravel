/**
 * Mirror canonical My Trips libs from Vite src/lib into legacy js/ for Babel-in-browser.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { viteLibToLegacyJsx } from './lib-legacy-transform.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'vite-scaffold', 'src', 'lib');
const DEST = path.join(ROOT, 'js');

const FILES = [
  { file: 'gantt-timeline.jsx', global: 'GanttTimeline' },
  { file: 'mytrips-route-map.jsx', global: 'MyTripsRouteMap' },
];

fs.mkdirSync(DEST, { recursive: true });

for (const entry of FILES) {
  const f = entry.file;
  const from = path.join(SRC, f);
  const to = path.join(DEST, f);
  if (!fs.existsSync(from)) {
    console.error('Missing source:', from);
    process.exit(1);
  }
  const raw = fs.readFileSync(from, 'utf8');
  const legacy = viteLibToLegacyJsx(raw, entry.global);
  fs.writeFileSync(to, legacy, 'utf8');
  console.log('sync:lib-to-js', f, '→', path.relative(ROOT, to));
}
console.log('sync:lib-to-js done');
