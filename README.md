# OrbitBrief

OrbitBrief is Tyler Coleman's MGT 409 final project: an offline-first orbital briefing studio that turns a dated public orbital catalog into an explorable 3D Earth, deterministic filters, modeled satellite motion, and source-backed analyst answers.

## Run it step by step

Requirements: Node.js 20 or newer and a modern browser with WebGL support. No database, Python environment, map key, or paid service is required for the bundled snapshot.

### 1. Open Terminal and enter the project

Open Terminal in the cloned repository folder—the folder containing `README.md`, `package.json`, `client`, `server`, and `data`. Confirm you are in the correct folder with:

```bash
pwd
ls
```

You should see `package.json`, `client`, `server`, and `data`.

### 2. Check Node.js

```bash
node --version
```

The version must be 20 or newer. If Node is missing or older, install the current Node.js LTS release and reopen Terminal.

### 3. Install the project dependencies

Run this once after cloning, or again after deleting and recreating `node_modules`:

```bash
npm install
```

This installs the pinned `satellite.js` dependency used for SGP4 propagation.

### 4. Optional: enable general AI answers

The app works without an API key using deterministic tools and offline answers. For Portkey-backed generalized answers, copy the example configuration:

```bash
cp .env.example .env
```

Open `.env` in a text editor and set `PORTKEY_API_KEY` to your local key. Never paste the key into the browser, source code, README, screenshots, or GitHub. The server loads the key locally and does not send it to the browser.

### 5. Start the local server

```bash
npm start
```

Leave this Terminal window running. A successful start prints:

```text
OrbitBrief running at http://127.0.0.1:4173
```

### 6. Open OrbitBrief in your browser

Open [http://127.0.0.1:4173](http://127.0.0.1:4173). The first page load reads the local catalog and Earth texture; it does not need an external data request. On a normal laptop, allow several seconds for the large snapshot and first WebGL render.

### 7. Test the main workflow

1. Drag the globe to rotate it and scroll to zoom.
2. Choose `Navigation` in the Purpose filter, or ask the Analyst: `Filter to navigation satellites.`
3. Ask a follow-up such as `What does that count mean?` to test conversation context.
4. Try `How can debris be removed?` and then `Is it worth it?` to see a cited, generalized follow-up answer.
5. Press play in the Simulation bar and change the speed selector.
6. Click a satellite marker, inspect its evidence card, and close it with `×`.

### 8. Stop the server

Return to the Terminal window running OrbitBrief and press:

```text
Control-C
```

The browser page will stop responding after the local server is stopped. Start it again with `npm start`.

### If port 4173 is already in use

Use another local port:

```bash
ORBITBRIEF_PORT=4174 npm start
```

Then open [http://127.0.0.1:4174](http://127.0.0.1:4174). If another OrbitBrief process is already running on port 4173, you can use that existing browser tab or stop the old process with `Control-C` in its Terminal window.

## Verification commands

```bash
npm test          # data semantics tests
npm run validate  # snapshot integrity and unique IDs
npm run build     # report/slides presence check
npm run refresh   # optional network refresh from CelesTrak
```

The final verification record is in `evidence/verification-2026-10-24.md`. The latest development run passed syntax checks, 3 data tests, validation of 19,476 unique records, and the build check.

## Configuration and secrets

Copy `.env.example` only when a provider-backed general-answer path is desired. Never commit a real `.env` or print a key.

```text
# final_project/.env, or the course submission parent/.env
PORTKEY_API_KEY=your_value_here
PORTKEY_BASE_URL=https://api.portkey.ai/v1
ORBITBRIEF_PORT=4173
```

The server loads configuration in this order: process environment, `final_project/.env`, the one-level-above-repository `.env` used by course grading, then the current workspace fallback used by Tyler's local layout. Existing process values win and parent files only fill missing values. The browser never receives the Portkey key. The current provider path uses the course `PORTKEY_API_KEY` with `gpt-6-luna`; no-key mode remains usable. `OPENAI_API_KEY` is listed in `.env.example` for course compatibility but is not required by this implementation.

## What to try

1. Drag the globe horizontally or vertically; scroll to zoom and use `Backside: on` to inspect dimmed rear objects.
2. Search an object or select a purpose such as Navigation. Natural-language requests such as “filter to navigation satellites” apply the same left-side filter.
3. Try an altitude range such as 500–800 km and compare the payload/debris/rocket-body count cards.
4. Click a marker to open its evidence card and close it with `×`.
5. Press play, choose a speed, advance the UTC simulation, and observe positions recomputed from stored orbital elements.
6. Ask about object types, weather/science/navigation purpose counts, a named object or NORAD ID, a continent/point at a UTC time, debris removal cost, the Iridium/Cosmos collision, or collision probability. Snapshot-derived numbers cite the dataset; mission-cost answers are explicitly labeled order-of-magnitude estimates. The last request is deliberately answered as a capability limitation.
7. Open Launches and Sources to see the fixture-backed launch note and provenance links.

## Data and propagation

When `data/catalog-real.json` exists, the server selects it automatically. The bundled dated snapshot is `celestrak-groups-2026-10-24`, retrieved 2026-10-24, and contains 19,476 deduplicated records: 16,792 payloads, 2,674 debris objects, and 10 rocket bodies. It combines CelesTrak's documented `active`, `cosmos-2251-debris`, `fengyun-1c-debris`, `iridium-33-debris`, and `last-30-days` groups with SATCAT metadata.

This is real documented-group coverage, not a complete all-object catalog: CelesTrak did not expose a public `GROUP=all` endpoint during refresh. Purpose labels are partly name-based heuristics and are disclosed as such. Missing values remain unknown. Altitude queries use instantaneous modeled geodetic altitude with `[low, high)` boundaries.

Real OMM records are propagated on the server with `satellite.js` 7.1.0 SGP4 and converted to geodetic latitude/longitude/altitude. The simulation is an educational projection from the snapshot; it is not telemetry, future maneuver knowledge, a historical reconstruction, or a precision operational forecast. Position refreshes are capped for browser performance; records not in a refresh retain their last verified position rather than switching to a second orbit model.

To use the original tiny fixture explicitly:

```bash
ORBITBRIEF_DATA_FILE=data/catalog.json npm start
```

`npm run refresh` requires network access and writes a new local snapshot plus provenance. Refresh terms, URLs, texture attribution, and coverage notes are in `docs/data_sources.md` and `data/real-snapshot-provenance.json`.

## Agent boundary and safety

OrbitBrief has one bounded Analyst path. Deterministic server functions perform catalog filtering, counts, purpose breakdowns, object lookup, geographic snapshots, and SGP4 propagation. The browser sends a short recent conversation history, so follow-up questions remain connected to the topic. Portkey is used only for general explanatory questions when configured; it is not allowed to execute arbitrary shell, SQL, file, or URL actions. Scene changes are reversible UI filter patches.

The server is local-only by default, caps agent request bodies at 16 KiB, limits model output to 500 tokens, and aborts a provider call after 12 seconds. Keys stay server-side and `.gitignore` excludes `.env`. User/model text is escaped before chat insertion. The app refuses to invent collision probabilities; overlapping dots, crossing trails, or shared altitude bands are not conjunction assessment.

This is not a production security boundary. It has no authentication, multi-user isolation, persistent rate limiter, CSP header, or formal penetration test. Keep it on loopback for the course demo. See `docs/limitations.md` and `evidence/verification-2026-10-24.md` before any deployment.

## Project files

- `report.html`: self-contained report in the assignment's section order, documenting product behavior and evidence.
- `slides.html`: 8-slide self-contained browser deck with the Earth visual and Analyst conversation example included.
- `docs/demo_script.md`: concise feature demonstration sequence.
- `evidence/portkey-run-2026-10-24.json`: one measured provider usage record with no secret.
