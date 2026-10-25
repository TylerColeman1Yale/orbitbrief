# Repository verification checklist

## Complete in the local repository

- [x] Run `npm test`, `npm run validate`, and `npm run build`.
- [x] Include README, `.env.example`, app, real snapshot, fallback fixture, tests, docs, report, slides, and evidence.
- [x] Record a real Portkey usage run without storing the key.
- [x] Document snapshot provenance, limitations, tokenomics, and security controls.
- [x] Keep the provider key server-side and ignore `.env`.
- [x] Add one-level-parent `.env` loading for the course fresh-clone layout.
- [x] Escape dynamic chat/object/model text and cap agent request/model budgets.

## Scope notes

- The application is a local educational prototype and does not claim a hosted deployment or operational space-safety capability.
- Independent user-study results are not claimed; the product's impact hypothesis and limitations are documented separately.
- The bundled evidence records describe only checks and provider usage that are actually represented in this repository.
- Secrets remain local: never commit `.env` or expose a provider key in source, screenshots, or documentation.
