# traffic-usage-sgp-tuic delta sidecar prep

Date: 2026-07-08 UTC
Risk: A prep only

## Scope

Prepare a local, test-covered implementation path for SGP TUIC usage accounting
after the active-session proof showed that Mihomo `/connections` can expose
`metadata.inboundUser` while active, but cannot be used directly as a
quota-grade source through the five-minute collector.

This record does not authorize production deployment or enable SGP TUIC usage
collection.

## Local Changes

Added:

- `server/services/edge/mihomo-connection-delta-usage-reader.mjs`
- `scripts/mihomo-connection-delta-usage-sidecar.mjs`
- `server/tests/edge-mihomo-connection-delta-usage-reader.test.mjs`
- `server/tests/mihomo-connection-delta-usage-sidecar.test.mjs`

Updated:

- `server/services/edge/mihomo-tuic-usage-collector.mjs`

## Design

The delta reader:

- reads Mihomo `/connections` from a loopback-only controller URL,
- maps runtime users to `edgeCredentialRef` through a protected credential map,
- stores only sanitized connection state in a local state file,
- baselines the first snapshot to avoid overcounting existing active sessions,
- emits only per-credential byte deltas on later polls,
- omits runtime users, controller payloads, passwords, remote addresses, raw
  configs, subscription artifacts, tokens, private keys, and SQLite rows from
  returned summaries.

The sidecar script:

- defaults to check mode,
- requires `--collect` before it polls the controller,
- requires `--record` before it writes usage observations to the control DB,
- writes only a redacted summary to stdout,
- can be run frequently by a later reviewed systemd unit or timer.

The existing TUIC collector now accepts an empty `accountingMode=delta` snapshot
as a successful zero-traffic window instead of treating it as an unsupported
source. Aggregate-only snapshots still fail closed.

## Remaining Production Gate

SGP TUIC remains disabled from active production usage collection.

Before enabling, a separate A-tier gate must define and approve:

- sidecar service/timer frequency,
- protected state file path and owner/mode,
- protected credential map path,
- controller secret source,
- control DB path,
- restart/rollback commands,
- redacted validation commands,
- explicit acceptance of residual short-connection undercount risk if polling is
  timer-based rather than a long-running stream.

Do not enable this path by only adding `channel-sgp-a-tuic` back to the existing
five-minute collector.

## Validation

Targeted validation run locally:

- `node --test server/tests/mihomo-connection-delta-usage-sidecar.test.mjs`
  passed: 1 test
- `node --test server/tests/edge-mihomo-connection-delta-usage-reader.test.mjs server/tests/edge-mihomo-external-controller-usage-reader.test.mjs server/tests/traffic-usage-collect-once.test.mjs server/tests/state.test.mjs`
  passed: 55 tests

No production command was run for this prep record.
