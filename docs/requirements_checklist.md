# Requirements checklist

- [x] Runnable local app, responsive layout, drag interaction, time controls, filters, selection, agent prompts, source labels.
- [x] Explicit payload/debris/rocket/unknown dimensions and snapshot coverage labels.
- [x] Shared deterministic query semantics for displayed counts and agent responses.
- [x] Offline startup with bundled real snapshot, 12-record fallback fixture, and local Earth texture.
- [x] Safety language for collisions, stale data, unknown values, and subset coverage.
- [x] Reproducible tests and validation command.
- [x] Real dated OMM/SATCAT grouped snapshot and satellite.js SGP4 propagation are bundled and validated for unique records.
- [x] Real Portkey usage smoke run recorded in `evidence/portkey-run-2026-10-24.json`; course rate-sheet cost estimate is labeled, not a billing statement.
- [x] Server-side key handling, one-level parent `.env` loading, request-size cap, model timeout/output cap, and escaped chat output.
- Independent user-study results and public hosting are not claimed by this local prototype.
