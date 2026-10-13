# Waka Sun

Personal sunrise and sunset planner: Bun + Hono + SQLite server, React + Vite + MapLibre browser app. See README for features, commands and the Nest setup.

## Layout

- `src/`: server. `index.ts` composes routes, security headers and static serving; `auth.ts` owner account and sessions; `places.ts` saved places; `geocode.ts` Nominatim proxy (identifying User-Agent, one request per second, cached); `db.ts` + `migrations/*.sql`.
- `web/src/`: browser. `main.tsx` app state, URL sync, mobile sheet and map tools; `map.tsx` MapLibre map and layers; `overlay.ts` ray and sky-dial geometry; `panel.tsx` planner sections; `chart.tsx` skyline charts; `places.tsx` places and sign-in; `search.tsx`; `sun.ts` time zones, sun times, seasons and geodesy; `horizon.ts` + `horizon.worker.ts` + `terrain.ts` the terrain skyline; `i18n.ts` all interface copy; `style.css` the visual system.
- `tests/`: `bun run test`, always on a temporary `DATA_DIR`.

## Rules

- Keep the Waka look shared with `_localvideo`: tokens on `:root`, Instrument Sans, green accent, light theme, compact cards. Base form rules use `:where()` so component rules win.
- English only, by choice: every visible string lives in `i18n.ts`. Times show in the spot's time zone, rounded to the minute.
- Sun maths lives in `sun.ts` and stays pure; dates are `YYYY-MM-DD` strings in the spot's zone. Altitudes from SunCalc are apparent (refraction-corrected).
- The skyline is computed once per spot in the worker; anything that changes per date or time works from that result on the main thread.
- One code path: no alternative map renderers or fallback calculators.
- Never call Nominatim from the browser or allow autocomplete searches; keep the server proxy's rate limit and cache.
- Production CSP lists every tile host; adding a map source means adding it there.
- Saved places are owner-only; every write needs the `X-WakaSun` header and a known origin.
- Tests must never use the real `data/`. Run `bun run build` and `bun run test` after changes; check desktop and phone widths in the browser.
- The running Nest project serves `web/dist`, so building changes the live interface. Do not publish a tunnel route or commit without being asked.
