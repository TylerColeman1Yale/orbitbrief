# Security and safety review

## Controls implemented

- **Secret handling:** `.env` is ignored, the key is loaded only by the Node server, and the browser makes same-origin requests without receiving the key. Repository-local and course parent `.env` layouts are supported.
- **Network boundary:** the server binds to `127.0.0.1` by default. Public hosting is not claimed.
- **Provider spend:** model output is capped at 500 tokens, requests abort after 12 seconds, and agent request bodies are capped at 16 KiB.
- **Prompt/data boundary:** catalog values are treated as data; the Portkey prompt receives a bounded dataset summary, not raw OMM records or credentials. There are no model-controlled shell, SQL, file, or arbitrary URL tools.
- **Rendering safety:** user and model text is escaped before it is placed in chat markup. Fixed source links use `rel="noreferrer"`.
- **Scientific safety:** deterministic branches explain that dot overlap, crossed trails, and common altitude do not establish a collision. Unsupported collision-probability requests receive a limitation rather than a number.
- **Data honesty:** the snapshot date, dataset ID, partial group coverage, purpose-tag heuristic, and unknown values remain visible.

## Evidence

The code checks and measured provider run are recorded in `evidence/verification-2026-10-24.md` and `evidence/portkey-run-2026-10-24.json`. The recommended live demonstration is to ask, “What is the chance these two objects collide tomorrow?” and show the refusal/limitation card.

## Remaining production work

This is a local educational prototype, not a security-reviewed public service. It does not yet provide authentication, multi-user isolation, a persistent rate limiter, a content-security-policy header, structured audit storage, SSRF controls for arbitrary external sources, or a formal penetration test. Keep it on loopback for grading. If deployed, add those controls before accepting untrusted users or treating the output as operational space-safety advice.
