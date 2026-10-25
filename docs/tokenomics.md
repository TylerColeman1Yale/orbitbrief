# Tokenomics

## Measured provider run

On 2026-10-24, one real Portkey request used the course model configuration with the bundled dataset summary. The provider returned HTTP 200 and reported:

| Metric | Measured value |
|---|---:|
| Requested model | `gpt-6-luna` |
| Routed model | `gpt-6-luna-global` |
| Input tokens | 255 |
| Cached input tokens | 0 |
| Output tokens | 168 |
| Reasoning tokens | 106, included within output tokens |
| Total tokens | 423 |

The raw non-secret record is `evidence/portkey-run-2026-10-24.json`. This is one provider smoke run, not a claim about the average question. The app's deterministic counts, filtering, SGP4 propagation, and WebGL rendering happen locally and add no LLM token cost.

## Rate-sheet estimate

The MGT 409 Lecture 11 rate sheet recorded in `HW6/data/prices.json` lists `$0.10 / 1M` uncached input tokens, `$0.01 / 1M` cached input tokens, and `$0.50 / 1M` output tokens for `gpt-6-luna`. Using those rates:

```text
255 / 1,000,000 × $0.10 = $0.0000255 input
0   / 1,000,000 × $0.01 = $0.0000000 cached input
168 / 1,000,000 × $0.50 = $0.0000840 output
Estimated model total   = $0.0001095 per run
```

This is a rate-sheet estimate, not an account invoice. It excludes hosting, bandwidth, and any upstream data-service costs.

## Explicit scale scenario

Assuming 10 general-model runs per user per month and the measured run as representative:

| Scale | Runs/month | Estimated model cost/month |
|---:|---:|---:|
| 1 user | 10 | $0.001095 |
| 100 users | 1,000 | $0.1095 |
| 10,000 users | 100,000 | $10.95 |

The scale numbers are linear estimates, not a hosting quote. Common purpose/count/filter requests are answered deterministically and can cost $0 in LLM tokens; the optional general model is bounded to 500 output tokens and a 12-second timeout. A production deployment would also need to budget hosting, data refreshes, rate limits, logs, and support. CelesTrak usage terms and request limits must be checked before high-volume refreshes.

## Cost controls and tradeoffs

- Keep the real catalog local and send only a compact dataset summary to the general model, rather than raw OMM records.
- Route high-confidence counts, purpose filters, object types, collision limitations, and geographic snapshots through deterministic code.
- Keep model output at 500 tokens and abort after 12 seconds.
- Keep provider use optional; the local app remains useful with zero LLM spend.

The tradeoff is that no-key mode has a finite offline answer set and general model responses are not a full tool-calling planner. That limitation is preferable to sending the entire catalog or allowing an unbounded agent loop.
