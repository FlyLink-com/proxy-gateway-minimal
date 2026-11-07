# JP-01 D2 — Dual-Side Candidate Renderers (Source Gate, Draft)

```yaml
document_metadata:
  doc_type: operational
  lifecycle: active
  authority_scope: jp01_d2_candidate_source_gate
  superseded_by: null
  last_verified_at: 2026-11-07
  production_authority: false
```

Status: Source-only D2 candidate. Not accepted, production-ready or authorized for execution.

## Scope and authority

- Risk B source core inside a separate Risk A production envelope; identity_impact: true for eventual runtime consequences, but no identity changes now.
- Process: one Draft PR from accepted D1-merged Master. Expected PR count: 1.
- Production, Provider, BWH, SSH, Cloudflare, DNS, runtime and customer impact: none.
- Base contract: D1 POSTINSTALL_IDENTITY_EXCHANGE.md, owner-accepted and merged as PR #826.
- Source: server/services/edge/jp01-dual-side-renderers.mjs.
- Tests: server/tests/jp01-d2-renderers.test.mjs (synthetic).

## Implemented source-only behavior

1. Strict JP-01 input validation rejects raw/extra properties, unsafe references, unapproved node targets, invalid WireGuard keys, public stats listeners, and duplicate channels.
2. Emit two inactive D1-schema-shaped candidate plans: bwh-integration-plan/v1 and node-runtime-plan/v1. The existing BWH public key is passed as an input; no key is generated, replaced or read from BWH by this code.
3. Derive fingerprints from 32-byte public key material and digests using the frozen D1 canonical-JSON SHA-256 rule (sorted object keys, order-preserved arrays, omit own digest field).
4. Emit an exactly 23-check D1 gate-shaped synthetic report, whose overall verdict is always BLOCKED. Checks requiring real trusted host evidence remain not_evaluated.
5. Enforce a second, independently supplied BWH public key observation in the consistency check. If both plans jointly drift to a different BWH key, wireguard_key_cross_match fails.

## Explicitly NOT provided

- No actual read-only BWH inventory, no identity provenance or authenticated evidence freshness. A synthetic caller-provided key does not establish BWH continuity.
- No canonical production Node Profile adapter and no proof that the supplied registration binding is the actual E1-A registration candidate.
- No Agent handshake, bootstrap, credential exchange, runtime config generation, file writes, service activation, provisioning, apply, or production changes.
- No real config tests, permissions readback, material digest readback, secure material scan, or private-path network proof. These checks cannot be asserted from source.
- No D2 acceptance or D3/D4 start authorization. M0 remains BLOCKED; 256 stale identities remain RETAIN.

## Validation

- Targeted: node --test server/tests/jp01-d2-renderers.test.mjs
- D1 regression: node --test server/tests/jp01-dual-side-contracts.test.mjs
- Required full server baseline: npm test
- Git diff: git diff --check origin/master...HEAD
- Documentation authority: npm run docs:authority:strict
- A check that has not actually been run remains PENDING. Keep the PR Draft until valid exact-head validation, independent review, and owner decision.

## Next gated work

1. Bind renderers to an actual reviewed Node Profile and authoritative E1-A registration candidate.
2. Provide separately authorized read-only BWH existing-key inventory, with authenticated provenance and snapshot freshness; never generate or replace BWH's existing WireGuard key.
3. Obtain real runtime proof for config tests, file permissions, material digests, secret hygiene, and private routing before any P4 PASS or P5 execution.
4. Before D3, owner must choose controlled fixed-egress GitHub Runner versus restricted BWH relay, and time-limited SSH bootstrap versus no-SSH Provider console/cloud-init.
5. No Source/Merge/Artifact Gate displaces M0's separate production authority. No Apply before a separately approved Production Gate.
