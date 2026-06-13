# Edge-Agent Source Absorption

Date: 2026-06-11, America/Los_Angeles.

Risk: B repository-only source correction. Production activation remains Risk A.

This record contains no raw environment values, raw runtime config, raw logs,
SQLite rows, account credentials, subscription URLs, tokens, passwords, private
keys, runtime credential material, or customer data.

## Reason

The future-order live-smoke path proved the control plane can create
Singapore desired-state notifications, but Singapore did not produce fresh
applied receipts for the newly delivered order. The high-signal gap was that
the repository had the Japan internal agent routes and protocol services, but
did not contain a production data-plane agent source file or a source-tracked
edge-agent service template that pulls desired-state, applies runtime adapters,
and posts redacted receipts.

This is a repository-source correction only. It does not assert that Singapore
production is fixed until a separately approved Risk A gate deploys and
validates the corrected agent on the data-plane host.

## Changes

- Added `agent/production-edge-agent.mjs`.
  - Pulls desired-state from the private internal data-plane agent route.
  - Validates node/channel scope and redacted desired-state payloads.
  - Applies configured runtime adapters for Xray VLESS Reality, Hysteria2, and
    Mihomo TUIC.
  - Posts only redacted apply receipts.
  - Rejects non-loopback/non-private control-plane base URLs by default.
- Added `scripts/edge-agent-once.sh`.
  - Fails closed when required agent environment or token material is missing.
  - Starts the production edge-agent without echoing protected values.
- Added `ops/edge-node/systemd/gccgw-edge-agent.service`.
  - Runs as `proxy-gateway`.
  - Defaults to `EDGE_AGENT_DRY_RUN=true`.
  - Uses protected env material and explicit approved runtime write paths.
- Added package export and npm script:
  - `./agent/production-edge-agent`
  - `npm run agent:production:once`
- Updated `ops/edge-node/README.md` to include the edge-agent service template
  and its separate activation gate.

## Validation

Targeted validation:

```text
node --check agent/production-edge-agent.mjs
node --test server/tests/production-edge-agent.test.mjs server/tests/data-plane-agent-service.test.mjs server/tests/data-plane-agent-routes.test.mjs server/tests/data-plane-agent-protocol.test.mjs
```

Result:

```text
25 passed
```

Full repository server validation:

```text
npm test
```

Result:

```text
743 passed
```

Project-state validation:

```text
npm run project-state:check
```

Result:

```text
passed
```

Whitespace validation:

```text
git diff --check
```

Result:

```text
passed with Windows LF/CRLF warnings only
```

## Production Status

No production, DNS, Nginx, provider firewall, systemd, runtime service, account,
password, payment, live-order, subscription URL/token, SQLite, or protected
runtime material change was performed by this record.

The next production step requires a fresh exact Risk A approval packet for the
corrected agent package. That packet must still include read-only inventory,
protected backups, artifact verification, SGP edge-agent install/update,
dry-run, controlled apply, config-test, approved service restarts only,
redacted receipts, render proof, and rollback.
