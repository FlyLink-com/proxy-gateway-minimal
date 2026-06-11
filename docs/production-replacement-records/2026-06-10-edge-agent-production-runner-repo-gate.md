# Edge Agent Production Runner Repo Gate

Date: 2026-06-10

Risk: B for repository code and tests. Production activation remains Risk A.

## Scope

This gate closes the repository-only blocker identified by
`2026-06-10-edge-agent-activation-preflight-blocked.md`: the node-side
edge-agent now has a reviewed production runner contract that can be wired to a
private control-plane transport, protected credential material, and explicit
runtime adapters.

No production, Vultr, Aliyun, AWS, DNS, Nginx, firewall, systemd, runtime
configuration, account, password, payment, live order, subscription URL, token,
SQLite row, or protected material was changed by this repo gate.

## Repository Changes

- Added `agent/production-edge-agent.mjs`.
- Added focused tests in `server/tests/production-edge-agent-runner.test.mjs`.
- Exposed the runner through the package export and `agent:production` script.
- Documented the dry-run versus production runner boundary in `agent/README.md`.

## Contract

The production runner:

- refuses public control-plane base URLs and accepts only private loopback or
  RFC1918-style agent endpoints;
- requires an explicit node token and node/channel identity;
- keeps apply mode disabled unless `EDGE_AGENT_APPLY_ENABLED=true`;
- requires protected credential material lookup before apply mode can run;
- requires an injected runtime adapter for every declared channel;
- posts redacted receipts only, without returning raw credential material.

The runner is still only a local repository contract until a separate Risk A
production gate installs it on the SGP data-plane host, wires a private
SGP-to-Japan transport, validates runtime config-tests, starts the agent, and
records redacted receipts.

## Validation

Executed locally:

```powershell
node --test server\tests\production-edge-agent-runner.test.mjs
node --test server\tests\edge-agent-dry-run.test.mjs server\tests\production-edge-agent-runner.test.mjs
```

Results:

- `production-edge-agent-runner.test.mjs`: 5/5 passed.
- combined edge-agent tests: 12/12 passed.

Final project validation is tracked in the turn closeout.

## Remaining Blocker

Production activation is still blocked until the next exact-approved Risk A
gate provides:

- private SGP-to-Japan agent transport;
- protected production env values and material paths;
- SGP systemd runner wiring;
- config-test before runtime restart;
- dry-run, controlled apply, and redacted receipt validation;
- rollback for Japan control-plane state and SGP runtime state.
