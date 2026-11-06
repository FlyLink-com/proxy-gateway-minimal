---
document_metadata:
  doc_type: evidence
  lifecycle: active
  authority_scope: cloudflare_d1_g2_closeout_status
  superseded_by: null
  last_verified_at: 2026-11-06
  production_authority: false
---

# G2 Local D1 Compatibility — Status and Evidence Index

- Status: **HOLD FOR CLOSEOUT / core compatibility evidence assembled / overall gate not closed**
- Verification date: 2026-11-06 (PST)
- Scope: local Wrangler / Miniflare D1 and synthetic fixtures only.
- Current source baseline: repository `master` at the time of this index; see the linked G2 report for its exact baseline and evidence provenance.
- Production authority: none.

## Decision boundary

This index records local compatibility evidence. It does not declare overall G2 acceptance, authorize G3–G8 progression, create remote Cloudflare resources, connect to BWH, access production data, apply a persistent migration, deploy, change DNS, or cut over traffic.

The existing Node/Express + SQLite control plane remains the current authoritative writer. No dual writes are permitted. Production cutover remains a separate Risk A decision.

## Evidence received

| Evidence | Recorded result | Evidence identity |
| --- | --- | --- |
| G2 Rev2 consolidated report | Complete report with sections §1–§7 and appendices A/B; completeness checks reported by the author | SHA-256 `4dcd60413f719f51d51066a6aceb1278ac940bb31f44fca3cacde0d5917ee4f8`; 17,602 bytes |
| Stage 6 transaction reconciliation | 15 scenarios; 57 actions; 56 terminal states equal; 1 expected divergence | `tx-results.json` SHA-256 `9d5b7c9e0d6ba0dd81b2861913a2d6f6943a142a687461c2ac004c4cca325b93` |
| Stage 7 pagination differential | 39 checks; dual-engine results reported identical across data-layer and application-layer classifications | Receipt SHA-256 `c0c40dbd0a1a4cc52d8ad1065c13b64151c5048f0fb71625e84dac465992b411`; results JSON SHA-256 `c26541f857f5b85352893c67c74a10fd7255dc3d4aac62fb753d3f2dea33f435` |
| Scheme C trigger retest | 91/91 trigger definitions passed in the reported local D1 differential retest; 88 unchanged and 3 expected transitions from unsupported to pass | Receipt SHA-256 `ce7f516ccec5a305efc7dd62a8063e49112b5e275a0163744230686b4d909b32` |
| Scheme C source migration | Separate migration source merged; no persistent database apply | PR [#832](https://github.com/FlyLink-com/proxy-gateway-minimal/pull/832) |

## Explicit accounting rules

- Stage 6 uses **57 / 56 / 1**. `RP5-replay-close` is included in the 57 actions and in the 56 equal terminal states.
- The single divergence, `DEF-NAIVE / CLAIM-B-NAIVE`, is explicitly marked `expectDivergence=true`; it is not a test failure.
- The strict foreign-key accounting remains **68 PASS / 58 attribution-limited**. The 75/51 view is supplementary and does not replace the strict formal reading.
- Stage 7's 39 checks comprise 26 data-layer checks and 13 application-layer checks. Application-layer cursor decoding evidence is not relabeled as database-engine evidence.

## Remaining closeout and acceptance boundary

The evidence above is not, by itself, a formal overall G2 acceptance decision. The consolidated report and the underlying archived receipts remain the evidence package to inspect. Any missing or unverified source artifact must remain identified as such; this index does not infer or recreate absent hashes.

Yi retains the formal G2 stage decision. Until that decision is recorded, status remains **HOLD FOR CLOSEOUT**.

## Archive

- G2 evidence folder: [G2 本地仿真（2026-11-05）](https://drive.google.com/drive/folders/1bfpH7zZEkBXzf731dvWEPf0mqncvmS9q)
- G2 Stage 2 Scheme C full receipt: [Drive receipt](https://drive.google.com/file/d/1XOTz0cxc7vOWYw3pw34lMZWcZAaWNRe8/view)
- Closeout issue: [#830](https://github.com/FlyLink-com/proxy-gateway-minimal/issues/830)
- Architecture and migration gates: [Cloudflare D1 evaluation](CLOUDFLARE_D1_DATABASE_EVALUATION.md)

## Change control

This document is an evidence index only. It does not modify schemas, runtime configuration, production data, secrets, Cloudflare resources, BWH, DNS, or deployment state.
