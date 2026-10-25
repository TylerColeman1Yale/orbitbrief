# Verification record

Run from `final_project`:

```text
node --version    -> v24.20.0 (development environment)
npm test          -> 3 tests passed
npm run validate  -> 19,476 records, 19,476 unique IDs, snapshot celestrak-groups-2026-10-24
npm run build     -> pass
```

Manual smoke path: start server, open the local URL, drag and zoom the globe, select a marker, apply DEBRIS and 500–800 km filters, apply a natural-language navigation filter, advance one hour, open Launches and Sources, and send the band prompt. A live Portkey request returned HTTP 200; usage is recorded without credentials in `evidence/portkey-run-2026-10-24.json`.

The verification record is intentionally limited to the automated checks, local smoke path, and provider usage described above. It does not claim operational tracking accuracy, independent user-study results, or a public hosted deployment.
