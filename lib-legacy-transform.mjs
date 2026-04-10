/**
 * Convert Vite ESM My Trips libs to legacy Babel-in-browser globals.
 * Used by sync-lib-to-js.mjs and check-lib-sync.mjs.
 */
export function viteLibToLegacyJsx(srcText, globalName) {
  let out = String(srcText);
  out = out.replace(/^import\s+React\s+from\s+['"]react['"];\s*\r?\n\r?\n?/m, `// Synced from vite-scaffold/src/lib (canonical)\nconst React = window.React;\n\n`);
  out = out.replace(/^import\s+React\s+from\s+['"]react['"];\s*\r?\n?/m, `// Synced from vite-scaffold/src/lib (canonical)\nconst React = window.React;\n`);
  out = out.replace(new RegExp(String.raw`^\s*export\s*\{\s*${globalName}\s*\}\s*;\s*\r?\n?`, 'm'), `window.${globalName} = ${globalName};\n`);
  if (out.includes('import ') || out.includes('export ')) {
    throw new Error(`lib-legacy-transform: output still contains import/export for ${globalName}`);
  }
  return out;
}
