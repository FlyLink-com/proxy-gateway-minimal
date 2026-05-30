# Archive

This directory stores historical root-level artifacts that are retained for
context but are no longer active project entrypoints.

Files in this directory do not provide execution authority, current validation
counts, production status, deployment approval, or runtime configuration.

| File | Status | Notes |
| --- | --- | --- |
| `qa-report.md` | Historical QA reference | Earlier MVP baseline summary. Use `docs/VALIDATION_BASELINE.md` and live validation output for current checks. |
| `root-start.mjs` | Historical startup script | Superseded by the active package scripts and server entrypoints such as `npm run daemon`, `server/index.mjs`, and `server/start.mjs`. |
