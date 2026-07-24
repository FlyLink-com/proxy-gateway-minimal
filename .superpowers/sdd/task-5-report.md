# Task 5 Report: Persisted Aggregate Observation Contract

## Scope

- Risk: B
- Production/AWS impact: none
- Production, CI, helper-freeze, and runtime configuration changes: none
- Business-code scope:
  - `server/services/platform/japan-tuic-repair-observation.mjs`
  - `scripts/japan-tuic-additive-repair-runner.mjs`
  - `server/tests/japan-tuic-repair-observation.test.mjs`
  - `server/tests/japan-tuic-additive-repair-runner.test.mjs`

## Confirmed defect

`createJapanTuicRepairObservationStore.write({ projection })` persists the
already-built `japan_tuic_repair_observation` aggregate. The host runner read
that file and incorrectly passed the aggregate back to
`buildJapanTuicRepairObservation({ projection })`, which expects a full
collector Admin projection. A real store-produced file therefore failed at the
runner boundary.

## TDD evidence

RED:

```text
node --test server/tests/japan-tuic-repair-observation.test.mjs server/tests/japan-tuic-additive-repair-runner.test.mjs server/tests/japan-tuic-additive-repair-contract.test.mjs
tests 39; pass 37; fail 2
```

The two expected failures were:

- the real `store.write -> same file -> readNaturalObservation` chain returned
  `natural_observation_failed`;
- `validateJapanTuicRepairObservation` did not yet exist.

GREEN:

```text
node --test server/tests/japan-tuic-repair-observation.test.mjs server/tests/japan-tuic-additive-repair-runner.test.mjs server/tests/japan-tuic-additive-repair-contract.test.mjs
tests 39; pass 39; fail 0
```

## Implementation

- Added `validateJapanTuicRepairObservation(input)`.
- The validator accepts exactly seven aggregate fields and rejects wrong types,
  unknown fields, non-canonical timestamps, unsafe counts, non-zero unresolved
  counts, and non-accepted records.
- `buildJapanTuicRepairObservation` now returns the exact validator result.
- `createHostOperations(...).readNaturalObservation()` dynamically imports the
  validator and validates the persisted aggregate directly.
- The existing artifact-root dynamic import path is unchanged; Task 6 owns any
  helper source-path or frozen-artifact remediation.

## Verification

```text
git diff --check
exit 0 (line-ending conversion warnings only)

node --test server/tests/japan-tuic-repair-observation.test.mjs server/tests/japan-tuic-additive-repair-runner.test.mjs server/tests/japan-tuic-additive-repair-contract.test.mjs
tests 39; pass 39; fail 0

npm test
tests 1301; pass 1300; fail 0; skipped 1
```

No secrets, protected paths, customer data, production mutations, provider
operations, or CI operations were introduced or performed.
