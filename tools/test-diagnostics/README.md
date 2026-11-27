# Test diagnostics (offline)

This is a read-only index and evidence viewer, not a runner or a health probe.
It does not request credentials, fetch CI, connect to hosts, call Worker/Agent,
or access SQLite/D1. It never changes CI, release gates, or runtime state.
Treat the result as a summary of the supplied evidence, not a live certification.

## Pick the lane

| Lane | What to inspect | Existing entry point or evidence |
| --- | --- | --- |
| `server` | Server, SQLite, policies; run relevant Server tests first | Root `npm test`, not the full Worker suite |
| `worker` | Worker protocol and synthetic D1 | `npm --prefix workers/control-plane test` |
| `agent` | Agent wire contract; no real node apply | `node --test server/tests/agent-g4-contract.test.mjs` |
| `migration` | Migration, freeze, reconcile and parity; keep synthetic evidence separate from live evidence | Exact synthetic command and baseline from the PR/runbook |
| `integration` | Coordinator, Worker and Agent together; don't count the same run in each lane | Worker wire-acceptance suite or pinned synthetic rehearsal receipt |

See [validation baseline](../../docs/VALIDATION_BASELINE.md) for merge requirements.

## Usage

```text
node tools/test-diagnostics/diagnose.mjs --list
node tools/test-diagnostics/diagnose.mjs --bundle path/to/bundle.json
node tools/test-diagnostics/diagnose.mjs --bundle path/to/bundle.json --json
```

Capture a check in its own log (stdout and stderr), with the original exit code
and the full checkout SHA. Use TAP, not an interactive reporter. Example on
PowerShell for one Agent check, from the repository root:

```powershell
node --test --test-reporter=tap server/tests/agent-g4-contract.test.mjs *> agent.log
$code = $LASTEXITCODE
$sha = (git rev-parse HEAD).Trim()
$node = (node --version).Trim()
@{
  schemaVersion = 1; module = 'agent'; environment = 'local'; sha = $sha
  tests = @(@{ environment = 'local'; sha = $sha; node = $node; exitCode = $code; log = 'agent.log' })
} | ConvertTo-Json -Depth 5 | Set-Content -Encoding utf8 bundle.json
node tools/test-diagnostics/diagnose.mjs --bundle bundle.json
```

For root `npm test`, capture the single unformatted, redirected log; the
existing command emits two Node TAP sections on a successful run. A focused
test on the server may supply `expectedTapSections: 1`; migration and
integration logs must supply the expected count explicitly. Include the actual
exit code or omit it if it was lost. Missing summaries, missing exit codes,
invalid counters and mismatched evidence do not pass. A complete run whose
required TAP section has no passing tests is not a pass. Nonzero exit or a
visible test failure remains failed even when the log was cut off. The report
points to the original log entry by bundle index and line, never by printing
raw test names, stack traces, paths or output. CLI exit 0 means the **report
was read**, not that a test gate passed. Exit 2 is an input/usage error.

Optional arrays in the same bundle:

- `ci`: supply `environment: "ci"`, full `sha`, `lane` (`main`, `worker`,
  `codeql`, `governance`), `result` (such as `success`, `failure`, `skipped`,
  `in_progress`, or `not_run`), and the native GitHub Actions `runUrl`.
  Check the evidence's actual head, not the target branch or a merge preview.
- `services`: supply the observed `environment`, full deployed source
  `sha`, `service` and UTC `observedAt`, with the following allowlisted
  values under `observed`. Put a receipt into this bundle only after
  verifying its origin. Use a separate bundle for a different environment
  or commit; unknown, mismatched, future-dated or over-24-hour-old service
  evidence is not treated as current. `recorded` is not `healthy`.

| Service | Fields |
| --- | --- |
| `bwh` | `process`: running/stopped; `health`: ok/unhealthy; `writer`: BWH_ACTIVE/FROZEN/D1_ACTIVE/RECOVERY |
| `worker` | `health`: ok/unhealthy; `d1Binding`: matches_expected/mismatch (never the raw database ID) |
| `agent` | `process`: running/stopped; `mode`: disabled/dry_run/apply |
| `d1` | `writer`: BWH_ACTIVE/FROZEN/D1_ACTIVE/RECOVERY |

Logs must be regular `.log`/`.tap` files inside the bundle directory, at most
64 MiB each. The CLI does not archive logs, validate the source of copied
receipts, infer missing results, or automatically reopen CI. Keep the raw
local log separate from the shareable report and share only sanitized evidence.
