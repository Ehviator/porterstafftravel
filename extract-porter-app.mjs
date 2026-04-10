/**
 * One-time / on-demand: extract the inline Babel bundle from indexTEST.html → vite-scaffold/src/porter-app.jsx
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const HTML = path.join(ROOT, 'indexTEST.html');
const OUT = path.join(ROOT, 'vite-scaffold', 'src', 'porter-app.jsx');

const s = fs.readFileSync(HTML, 'utf8');
const m = s.match(/<script type="text\/babel">\s*\n/);
if (!m || m.index === undefined) throw new Error('Could not find inline babel script');
const afterOpen = m.index + m[0].length;
const rootIdx = s.indexOf('const root = ReactDOM.createRoot', afterOpen);
if (rootIdx < 0) throw new Error('Could not find createRoot block');
let body = s.slice(afterOpen, rootIdx).trimEnd();
// Remove destructuring from global React (we import hooks from 'react')
body = body.replace(
  /^\s*const\s*\{\s*useState\s*,\s*useMemo\s*,\s*useEffect\s*,\s*useRef\s*\}\s*=\s*React\s*;\s*\n/m,
  '',
);
const preamble = `import React, { useState, useMemo, useEffect, useRef } from 'react';

`;
const postamble = `

export { App, ErrorBoundary };
`;
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, preamble + body + postamble, 'utf8');
console.log('Wrote', OUT, `(${(preamble + body + postamble).length} chars)`);
