# JS streamline (dual-source workflow)

While **`indexTEST.html`** and **`vite-scaffold/src/porter-app.jsx`** remain two copies of the main app, shared My Trips widgets should stay in sync automatically.

## Canonical sources

| Area | Edit here first |
|------|-----------------|
| Gantt timeline | `vite-scaffold/src/lib/gantt-timeline.jsx` |
| Route map | `vite-scaffold/src/lib/mytrips-route-map.jsx` |

## Commands

```bash
npm run sync:lib-to-js   # copy canonical libs → js/
npm run check:lib-sync   # fail CI if js/ drifts
```

CI runs `check:lib-sync` before `npm run build:client`.

## Future

Extract `getJSON` / `setJSON` and Travel Log `fetch` helpers into `vite-scaffold/src/utils/` and import from `porter-app.jsx` to shrink the monolith; legacy HTML would continue using inline copies until it loads the bundled app only.
