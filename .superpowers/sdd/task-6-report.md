# Task 6 Report: Frozen Artifact Helper and Observation Safety

## Scope

- Risk: B
- Production/AWS impact: none
- Production, provider, CI/workflow, artifact-identity, and documentation changes: none
- Source/test scope: the eight files authorized by `task-6-brief.md`

## TDD evidence

RED:

```text
node --test server/tests/japan-tuic-repair-observation.test.mjs server/tests/japan-tuic-additive-repair-runner.test.mjs server/tests/traffic-usage-collect-once.test.mjs server/tests/state.test.mjs
tests 96; pass 88; fail 8
```

The expected failures covered:

- the frozen ZIP still requiring the newer Japan observation helper;
- the host adapter importing that helper from the extracted artifact root;
- the runner accepting an observation larger than 256 KiB;
- the observation store chmodding an existing parent directory;
- observation configuration without a status path or with the same resolved path;
- collector success continuing after status write failure or a missing projection
  while observation persistence was configured.

GREEN:

```text
node --check scripts/japan-tuic-additive-repair-runner.mjs
node --check server/state.mjs
node --check scripts/traffic-usage-collect-once.mjs
node --test server/tests/japan-tuic-repair-observation.test.mjs server/tests/japan-tuic-additive-repair-runner.test.mjs server/tests/traffic-usage-collect-once.test.mjs server/tests/state.test.mjs
tests 96; pass 96; fail 0
```

## Implementation

- The immutable ZIP entry contract still validates the existing map helper and
  collector projection helpers, but no longer requires the newer Japan
  observation helper.
- The runner resolves the observation validator from its own reviewed source
  installation tree using `dirname(fileURLToPath(import.meta.url))`; extracted
  artifact contents cannot supply that module.
- Japan observation input is rejected above `256 * 1024` bytes.
- The observation store creates missing directories with mode `0700` without
  chmodding existing parents; temporary and final records remain `0600`.
- Runtime construction rejects an observation path without a configured status
  path and rejects equal resolved paths before opening runtime stores.
- After an accepted raw collector report, configured observation persistence
  fails closed with a redacted observation error and exit code `1` when status
  persistence fails or returns no projection.

## Verification

```text
npm test
tests 1307; pass 1306; fail 0; skipped 1
```

No production, provider, network, credential, workflow, artifact publication,
deployment, or runtime mutation was performed.
