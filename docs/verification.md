# Verification record

Run from `final_project`:

```text
node --version    -> v24.20.0 (development environment)
npm test          -> 3 tests passed
npm run validate  -> 19,476 records, 19,476 unique IDs, snapshot celestrak-groups-2026-10-24
npm run build     -> pass
```

Manual smoke path: start server, open the local URL, drag and zoom the globe, select a marker, apply DEBRIS and 500–800 km filters, apply a natural-language navigation filter, advance one hour, open Launches and Sources, and submit the band prompt. A live Portkey request returned HTTP 200; usage is recorded without credentials in `evidence/portkey-run-2026-10-24.json`.

Remaining gates are explicitly not claimed as complete: fixed-fixture SGP4 reference validation, worker cancellation, measured FPS, an independent user session, fresh-clone dry run, final demo video, actual GitHub/host links, and print-preview QA.
