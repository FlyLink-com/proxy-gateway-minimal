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
- Profile adapter: server/services/edge/jp01-d2-profile-adapter.mjs; it projects the safe first-boot summary into the eleven-field E1 registration-binding shape using registrationBindingOf and the shared E1 predicate intersected with the frozen D1 plan-reference pattern. E1-safe references containing slash are rejected where D1 plan schemas cannot represent them. It does not require firstBootApplyAllowed, synthesize approval, open the registration execution gate, or write a record.
- D2 profile schema: ops/node-provisioning/schemas/jp01-node-profile.schema.json.
- Tests: server/tests/jp01-d2-renderers.test.mjs (synthetic, plus parity check against the existing registration executor projection).

## Implemented source-only behavior

1. Strict JP-01 input validation and a source adapter from the existing first-boot summary and E1 registration-binding projection. E1-bound references must also satisfy the D1 plan-schema intersection; the adapter compares the same eleven binding fields the executor uses, without requiring apply approval or writing a record.
2. Emit two inactive D1-schema-shaped candidate plans: bwh-integration-plan/v1 and node-runtime-plan/v1. The existing BWH public key is passed as an input; no key is generated, replaced or read from BWH by this code.
3. Derive fingerprints from 32-byte public key material and digests using the frozen D1 canonical-JSON SHA-256 rule (sorted object keys, order-preserved arrays, omit own digest field). The profile digest is computed from the original Node Profile input; sorting channel rows for plan presentation never changes the digest input.
4. Emit an exactly 23-check D1 gate-shaped synthetic report, whose overall verdict is always BLOCKED. Checks requiring real trusted host evidence remain not_evaluated.
5. Enforce a second, independently supplied BWH public key observation in the consistency check. If both plans jointly drift to a different BWH key, wireguard_key_cross_match fails.
6. Recompute the canonical profile digest from the original profile input and cross-check profile, both plans, E1 binding and Agent endpoint references. For every channelRef, compare BWH runtimeAdapter/desiredStateRef/materialRef/materialDigest/endpointRef and Node runtimeAdapter/unitName/configDigest/statsListen against that same profile row. Channel sorting uses the same default lexical order as E1 registrationBindingOf.

## Explicitly NOT provided

- No actual read-only BWH inventory, no identity provenance or authenticated evidence freshness. A synthetic caller-provided key does not establish BWH continuity.
- No production Node Profile source or attested E1-A production candidate binding. The new adapter proves source-level parity with the executor's eleven-field projection, but its inputs remain synthetic and are not an actual registered production candidate.
- No Agent handshake, bootstrap, credential exchange, runtime config generation, file writes, service activation, provisioning, apply, or production changes.
- No real config tests, permissions readback, material digest readback, secure material scan, or private-path network proof. These checks cannot be asserted from source.
- No D2 acceptance or D3/D4 start authorization. M0 remains BLOCKED; 256 stale identities remain RETAIN.

## Validation

- Targeted: node --test server/tests/jp01-d2-renderers.test.mjs (E1/D1 reference intersection, E1 default-sort parity, original-array-order digest, per-channel cross-binding, explicit string-type rejection, and exact D1 plan/gate schema checks)
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
