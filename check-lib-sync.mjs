/**
 * Fail CI if js/*.jsx drift from vite-scaffold/src/lib (canonical), after legacy transform.
 */
import fs from 'fs';
import crypto from 'crypto';
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

function hash(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

function expectedLegacyHash(canonicalPath, globalName) {
  const raw = fs.readFileSync(canonicalPath, 'utf8');
  const legacy = viteLibToLegacyJsx(raw, globalName);
  return crypto.createHash('sha256').update(legacy).digest('hex');
}

let ok = true;
for (const { file: f, global: globalName } of FILES) {
  const a = path.join(SRC, f);
  const b = path.join(DEST, f);
  if (!fs.existsSync(a)) {
    console.error('check-lib-sync: missing', a);
    ok = false;
    continue;
  }
  if (!fs.existsSync(b)) {
    console.error('check-lib-sync: missing', b, '— run npm run sync:lib-to-js');
    ok = false;
    continue;
  }
  const want = expectedLegacyHash(a, globalName);
  const got = hash(b);
  if (want !== got) {
    console.error('check-lib-sync: drift for', f, '— run npm run sync:lib-to-js');
    ok = false;
  }
}

if (ok) console.log('check-lib-sync: OK');
process.exit(ok ? 0 : 1);
