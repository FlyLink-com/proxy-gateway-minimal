# D1 T2 Independent Review Packet v1 — Draft

Status: AWAITING A SEPARATE REVIEWER. This packet is not an independent review and does not self-approve T2.

- Repository: FlyLink-com/proxy-gateway-minimal
- Draft branch: docs/d1-target-schema-g6-rehearsal-plan-20261107
- Review base: 294a24cba7e9c5e31c98e20b6827cca4b66b706b
- Source anchor: master at be261abc60f28bb2733764fa5364ab44b3e76844
- Reviewer: NOT ASSIGNED
- Scope: T2 source security contracts, synthetic vectors, payment action custody design and retention register only.

## 1. Artifacts to review

1. docs/D1_T2_CORE_SECURITY_CONTRACTS_V1.md
2. docs/D1_T2_SOURCE_WRITE_PATH_AUDIT_V1.md
3. docs/D1_T2_PAYMENT_ACTION_CUSTODY_DESIGN_V1.md
4. docs/D1_T2_RETENTION_DECISION_RECORDS_V1.md
5. server/tests/d1-t2-security-vectors.test.mjs
6. docs/D1_TARGET_SCHEMA_AND_G6_OFFLINE_REHEARSAL_PLAN.md

## 2. Required independent checks

- Reconcile all 26 JSON columns against D1_CONTROL_SCHEMA_INVENTORY_V1.json.
- Verify each source writer and caller; challenge any missing INSERT/UPDATE path.
- Confirm account metadata PII findings, including raw loginRef/displayRef/displayName and unkeyed SHA-256 digests.
- Verify the six lease-token issuer formats: five 64-hex random tokens and one prefixed UUIDv4 reservation token.
- Verify the six raw idempotency fields, uniqueness/replay scopes and the separate provider-event HMAC domain.
- Verify the versioned HMAC envelope carries key_id and the LP encoding is byte-exact.
- Review the existing wallet-first setup handoff unkeyed digest exception.
- Review the generation grammar against both production builders and the required_text-only persistence writer.
- Review Durable Objects custody selection, repeatable active resolution, saga ordering, alarm retries and restore reconciliation.
- Verify retention decisions are not silently inferred from active expiry fields.
- Confirm no production data, BWH, real key, remote D1 or deployment was used.

## 3. Test evidence

The isolated Node built-in test run for d1-t2-security-vectors.test.mjs passed 9/9:
- two lease known-answer vectors;
- field-specific five-hex/one-UUID issuer grammar;
- six idempotency HMAC known-answer vectors;
- length-prefix ambiguity;
- separate provider-event key/domain;
- key-ID envelope parsing and unknown-key fail-closed;
- two observed generation forms;
- a separate keyed PII-digest vector.

This is not a full repository test suite and no CI was run on the Draft branch.

## 4. Blocking findings

T2 must remain BLOCKED until:
1. raw account email/displayName values are removed/externalized;
2. PII-derived digest policy and key custody are approved;
3. generic JSON writer boundaries are closed with exact allowlists;
4. the pre-hashed wallet-first setup digest exception is resolved;
5. payment custody owner, TTL, key custody and operations are approved;
6. retention owners and periods are approved;
7. an independent reviewer signs the result.

## 5. Reviewer outcome

Reviewer must record one of:
- APPROVE: all T2 gates are evidenced and no blocking findings remain;
- REQUEST_CHANGES: list exact source path, field, contract and required evidence;
- BLOCKED: required owner decision or evidence is unavailable.

No approval, merge, deployment, production read or migration is authorized by this packet.
