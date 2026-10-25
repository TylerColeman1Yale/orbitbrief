# Verification evidence — 2026-10-24

Development environment: Node.js v24.20.0; macOS; local loopback server.

| Check | Result |
|---|---|
| `node --check client/app.js` | pass |
| `node --check server/index.js` | pass |
| `npm test` | 3/3 tests passed |
| `npm run validate` | 19,476 records; 19,476 unique IDs; snapshot `celestrak-groups-2026-10-24` |
| `npm run build` | pass |
| Local Portkey request | HTTP 200; usage recorded in `portkey-run-2026-10-24.json` |

The manual smoke path used for the app was: start the server, open `http://127.0.0.1:4173`, rotate and zoom the globe, search/select an object, apply type/purpose/altitude filters, ask a band question, apply a natural-language navigation filter, advance the simulation, open Launches and Sources, and request collision-probability guidance. A fresh-clone dry run, browser automation, FPS benchmark, and independent user session remain Tyler's final evidence tasks.

Security checks completed in this build:

- `.env` and `node_modules` are ignored; no key is stored in the repository.
- The server keeps the Portkey key server-side and binds to `127.0.0.1`.
- Repository-local, one-level-parent, and current workspace fallback `.env` locations are supported; explicit process environment values win.
- Agent request bodies are capped at 16 KiB and model calls have a 12-second timeout and 500-token output cap.
- User and model text is escaped before being inserted into chat markup; source links are fixed allowlisted links.
- The application refuses unsupported collision-probability claims and does not treat dot overlap as a conjunction.

Security limitations remain: this is a local educational prototype, not a hardened public deployment. It has no persistent authentication, multi-user isolation, production rate limiter, CSP header, or formal penetration test. Do not expose the loopback server publicly without adding those controls.
