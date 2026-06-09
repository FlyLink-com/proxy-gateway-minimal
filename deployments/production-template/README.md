# Production Input Package Template

Last updated: 2026-06-08, America/Los_Angeles.

This directory defines the non-secret input package required before a real
production deployment or a production-like staging deployment can be approved.
It is a template only.

Use this template together with `docs/CURRENT_SOURCE_AND_ARCHIVE_BOUNDARY.md`.
Do not copy values, runtime configs, generated release directories, SQLite
files, or old production package material from historical checkouts or local
artifacts into this directory. If older material is needed for comparison,
record only a redacted current-fact summary in an active execution record.

## Boundary

Allowed here:

- provider-neutral topology shape;
- node slot metadata for `prod-edge-a`, `prod-edge-b`, and `prod-edge-c`;
- public boundary route expectations;
- plan identifiers and durations;
- required `.env` variable names;
- operator runbook steps.

Forbidden here:

- `.env` values;
- cloud access keys;
- private keys or PEM files;
- SQLite files or row dumps;
- raw subscription URLs;
- raw artifact secrets;
- customer data;
- real TUIC UUID/password/cert material;
- production-only raw IP inventory that has not been approved for Git.

## Files

| File | Purpose |
| --- | --- |
| `OPERATOR_NOTEPAD.md` | Human-editable checklist for reviewing the package intent before updating the JSON files. It is not imported by `gccgw`. |
| `package-manifest.json` | Defines package kind, component files, import phases, registration policy, and hard stops. |
| `topology.json` | Defines the deployment environments and control-plane/data-plane roles. |
| `nodes.json` | Defines the desired node slots and pool behavior without runtime secrets. |
| `public-boundary.json` | Defines public route behavior that must be preserved by Nginx/app deployment. |
| `plans.json` | Defines simple month/year subscription packages. |
| `env.required.json` | Defines `.env` variable names that must exist outside Git on the target host. |
| `runbook.md` | Defines the approval and validation sequence for turning this package into a deployment. |

## Import Format

The complete import contract is defined in:

```text
docs/PRODUCTION_INPUT_PACKAGE_FORMAT.md
```

Use `package-manifest.json` as the first file for inspect/import dry-run
tooling, then use the reviewed import/configure plans for the gated apply
step. It is a redacted manifest only; it does not contain customer facts,
secrets, SQLite data, generated subscription YAML, runtime logs, or handoff
material.

## Intended Flow

```text
review OPERATOR_NOTEPAD.md
-> fill non-secret production input package JSON files
-> copy .env.example to .env on the target host and fill runtime values there
-> gccgw package inspect deployments/production-template --json
-> gccgw package import deployments/production-template --dry-run --json
-> gccgw release status
-> gccgw install preflight on the target host
-> Risk A approval
-> gccgw package apply with reviewed import/configure plans
-> bootstrap / secret env injection / validation by separate gate
-> subscription canary
-> retain, rollback, or broader rollout decision
```

This package does not authorize deployment by itself.
