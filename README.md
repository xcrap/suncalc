# Waka Sun

A sunrise and sunset planner in the spirit of suncalc.org, built for the islands: pick any spot on an open map and see where the sun rises and sets on any date, when it really clears the hills, cliffs and islands around you, and save the spots worth coming back to in summer or winter.

- **Map**: OpenFreeMap vector tiles (OpenStreetMap data, no key) with hillshaded relief, or Esri World Imagery as satellite. MapLibre GL draws everything.
- **Sun**: rays toward sunrise, sunset and the sun at the chosen time; dashed rays for the summer and winter solstices; a small sky dial around the pin with the day's sun path. Times come from SunCalc, shown in the spot's own time zone.
- **Real horizon**: a web worker reads open elevation tiles (Mapzen Terrarium on AWS Open Data) up to 160 km out and builds the skyline in every direction, with Earth's curvature and refraction. The planner then shows when direct sun first and last reaches the spot, and draws the sunrise and sunset sides of the skyline with today's and the solstices' sun paths. Trees and buildings are not in the data.
- **Day details**: solar noon, day length and its change, golden and blue hours, dawn and dusk, sun altitude, direction and shadow length at any time, moonrise, moonset and phase.
- **Places**: saved spots keep a name, note and optional date, show on the map, and filter by season. They are private to the owner account and shared between phone and computer.
- English and European Portuguese. Works on phones: full-screen map with a bottom sheet, current location, and it installs to the home screen.

## Commands and ports

```bash
bun install
bun run dev          # API on 3041, Vite on 3042 (proxies /api)
bun run build        # typecheck, then build web/dist
bun run start        # production server on PORT (3992 by default)
bun run test         # API and sun-maths tests on a temporary data folder
bun run owner:setup  # prints the one-time link that creates the owner account
```

## Running under Nest

Nest runs the production server as the project **Waka Sun** (`waka-sun`): directory `/Users/xcrap/www/_suncalc`, port **3992**, command `bun run start`, launch agent `app.nest.app-nest.project.waka-sun`, log `~/Library/Application Support/app.nest/logs/projects/waka-sun.log`. Nest sets `HOST=0.0.0.0`, so phones on the same network reach it at `http://<mac>:3992`.

The server serves `web/dist` from disk, so `bun run build` changes the running interface immediately; restart the project in Nest after server changes.

The project's hostname is `sun.waka.pt`. It is only public once a Nest tunnel route for it exists. Phones need HTTPS for "Use my location", so use the tunnel or localhost for that button.

## Owner account

Saved places need the owner account. Run `bun run owner:setup` once and open the printed link to choose a username and password (10+ characters). Sessions last 180 days per device.

## Data

- `data/sun.sqlite`: the owner, sessions and saved places (ignored by Git). Stop the project before copying it.
- Place search and names go through the server to OpenStreetMap Nominatim, at most one request per second, cached for a week.
- Map, imagery and terrain tiles load directly from their hosts in the browser.
