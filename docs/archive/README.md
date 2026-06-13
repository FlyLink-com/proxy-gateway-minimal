# Archive

Last updated: 2026-06-08, America/Los_Angeles.

This directory stores historical artifacts that are retained for context but
are no longer active project entrypoints. Subdirectories may hold older docs
moved out of active navigation after their useful facts were indexed.

Files in this directory do not provide execution authority, current validation
counts, production status, deployment approval, or runtime configuration.
They are not source material for new implementation unless a current active
document explicitly reactivates a specific fact.

Before copying, restoring, or re-importing anything from this directory, read:

```text
docs/CURRENT_SOURCE_AND_ARCHIVE_BOUNDARY.md
docs/README.md
docs/PROJECT_CONTEXT.md
```

If an archived artifact conflicts with current code, active docs, execution
records, or live verified facts, treat the current artifact as authoritative
and update the active docs instead of silently following the archive.

| File | Status | Notes |
| --- | --- | --- |
| `DOMAIN_HTTPS.md` | Historical paused HTTPS runbook | Old AWS Singapore domain HTTPS plan. Current domain work should use `docs/DOMAIN_ABSTRACTION_PLAN.md` and `docs/DOMAIN_IMPLEMENTATION_RUNBOOK.md`. |
| `SERVER_EDGE_MESH_WIREGUARD_CANARY_RUNBOOK.md` | Historical paused WireGuard runbook | Old two-node prod-edge-a/prod-edge-b mesh canary plan. Current mesh work should start from `docs/SERVER_EDGE_MESH_DESIGN.md`, current target selection, and a rewritten runbook. |
| `qa-report.md` | Historical QA reference | Earlier MVP baseline summary. Use `docs/VALIDATION_BASELINE.md` and live validation output for current checks. |
| `root-start.mjs` | Historical startup script | Superseded by the active package scripts and server entrypoints such as `npm run daemon`, `server/index.mjs`, and `server/start.mjs`. |
| `stage-reports/README.md` | Historical PR stage-report index | Fixed-cadence PR stage reporting is retired. Use this only for old checkpoint archaeology, not current planning or release authority. |
| `superpowers/README.md` | Historical specs/plans index | Earlier design specs and implementation plans. Use active docs and live code/tests for current authority. |
