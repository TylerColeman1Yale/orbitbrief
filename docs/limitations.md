# Limitations

The current build uses a dated real CelesTrak grouped snapshot, not full public catalog coverage. It does not claim live status, conjunction screening, collision probability, telemetry, or knowledge of future burns and deployments. Purpose tags are incomplete name-based heuristics, and launch provider/vehicle joins remain partial. The Launches panel is an offline fixture-backed explanation rather than a current Launch Library 2 feed.

SGP4 propagation is used for real OMM records and is tested for data shape and display behavior, but a formal fixed-fixture reference validation with published tolerances is still outstanding before operational use. Large-catalog position refreshes are capped for responsiveness; objects outside a refresh retain their last verified positions until a later refresh. The simulation is therefore suitable for education and visual explanation, not precision orbit determination.

The app is local-only by default and has no authentication, multi-user isolation, production rate limiter, CSP header, or formal penetration test. Chat output is escaped and request/model budgets are bounded, but the prototype should not be exposed publicly without an additional deployment security layer. The sample image informed the visual direction; the bundled local Earth asset is documented in `docs/data_sources.md`.
