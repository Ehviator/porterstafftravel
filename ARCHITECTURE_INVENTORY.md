# Porter Staff Website — architecture inventory

This document maps entrypoints, routing, duplicated files, and drift risk.

**Production default:** **`npm run build:client`** then **`npm start`** — **`server.js`** serves **`vite-scaffold/dist/`** when **`dist/index.html`** exists and **`USE_VITE_DIST`** is not **`0`**. Ship that path internally.

**Canonical source:** edit the main app in **`vite-scaffold/src/porter-app.jsx`**. Edit My Trips libs in **`vite-scaffold/src/lib/`**, then run **`npm run sync:lib-to-js`** (or CI) to mirror into **`js/`**. **`indexTEST.html`** is **legacy / dev fallback** (CDN + in-browser Babel). Use **`npm run extract:porter-app`** only when you intentionally change the monolith and need to refresh Vite from it.

## Entrypoints

| Mode | File | Notes |
|------|------|--------|
| **Production (recommended)** | `server.js` + **`vite-scaffold/dist/`** | After `npm run build:client`; strict CSP when `CSP_STRICT` ≠ `0` |
| Vite dev | `vite-scaffold/` + `npm run dev:client` | Proxies `/api` → Express on :3000 |
| Legacy fallback | `indexTEST.html` | When **`dist/`** is missing or **`USE_VITE_DIST=0`**; not the primary deploy target |

## Client routing (no react-router)

`App` holds `currentPage` (string). Major values include:

- `database` — home / dashboard
- `calculator` — ZED calculator
- `farecompare` — fare comparison
- `standby` — standby tool
- `mytrips` / `mytrips_timeline` — My Trips list / trip timeline
- `travellog` — travel log
- `zedagreements`, `videos`, `jumpseat`, `team`, `faq`, `changelog` — content/tools

Navigation: `navigateTo(page)` updates state and hash (see hash sync in app).

## Shared utilities (duplicated in both monoliths)

These patterns appear in both `indexTEST.html` and `vite-scaffold/src/porter-app.jsx`:

- `getJSON` / `setJSON` / `getLS` / `setLS` / `getJSONValidated` — localStorage
- `copyTextToClipboard`
- `I18nContext` + `TRANSLATIONS` / `window.__TRANSLATIONS_FR`
- Travel Log sync: `fetch('/api/travel-log?...')` and `PUT /api/travel-log`

**Drift risk:** any change to helpers or API contract must be applied in both places until extraction is complete.

## Duplicated modules (must stay in sync)

| Canonical (edit first) | Legacy / Babel |
|------------------------|----------------|
| `vite-scaffold/src/lib/gantt-timeline.jsx` | `js/gantt-timeline.jsx` |
| `vite-scaffold/src/lib/mytrips-route-map.jsx` | `js/mytrips-route-map.jsx` |

Cross-widget events: `window` `mytrips:segselect` (timeline ↔ map).

## Backend (`server.js`)

- `GET/PUT /api/travel-log` — JSON file `travel-log-data.json` (must not be publicly served as static).
- `GET /api/fx/usd-cad` — USD/CAD indicative rate (cached server-side; Frankfurter/ECB-based); used by the bundled app.
- `GET/PUT /api/admin/site-data` — optional shared admin backup in `admin-site-data.json`; requires `ADMIN_API_TOKEN` (16+ chars). Auth: **`Authorization: Bearer`** matching that token, or **`POST /api/admin/login`** with body `{ password }` matching **`ADMIN_PASSWORD`** (sets HttpOnly cookie). See `.env.example`.
- Static: **prefer** Vite **`dist/`**; repo root + **`indexTEST.html`** when legacy mode is active.

## PWA

- Service worker: root `sw.js` → copied to `vite-scaffold/public/sw.js` via `npm run sync:vite-public`.
- `precache-manifest.json` generated into `vite-scaffold/dist/` after build.

## Scripts (npm)

| Script | Purpose |
|--------|---------|
| `sync:vite-public` | Copy assets + `sw.js` into Vite public |
| `sync:lib-to-js` | Mirror `vite-scaffold/src/lib/*.jsx` → `js/` |
| `check:lib-sync` | Fail if `js/*.jsx` differs from **legacy-transformed** `vite-scaffold/src/lib` (same rules as `sync:lib-to-js`) |
| `extract:porter-app` | `indexTEST.html` → `porter-app.jsx` (legacy → Vite; overwrites) |
| `build:client` | Sync public, Vite build, precache manifest |

## Recommended next refactors (not all done here)

- Extract `porter-app.jsx` into `src/pages/*`, `src/utils/storage.js`, `src/services/travelLog.js`.
- Optional: replace the monolith with a **thin `indexTEST.html`** that only loads the same Vite-built assets (one bundle, no Babel-in-browser) if you must keep a single HTML entry for a special host.
