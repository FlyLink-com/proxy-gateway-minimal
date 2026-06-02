# Production Input Package Template

Last updated: 2026-06-02, Asia/Shanghai.

This directory defines the non-secret input package required before a real
production deployment or a production-like staging deployment can be approved.
It is a template only.

## Boundary

Allowed here:

- provider-neutral topology shape;
- node slot metadata for `prod-edge-a`, `prod-edge-b`, and `prod-edge-c`;
- public boundary route expectations;
- plan identifiers and durations;
- required environment variable names;
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
| `package-manifest.json` | Defines package kind, component files, import phases, registration policy, and hard stops. |
| `topology.json` | Defines the deployment environments and control-plane/data-plane roles. |
| `nodes.json` | Defines the desired node slots and pool behavior without runtime secrets. |
| `public-boundary.json` | Defines public route behavior that must be preserved by Nginx/app deployment. |
| `plans.json` | Defines simple month/year subscription packages. |
| `env.required.json` | Defines environment variables that must exist outside Git. |
| `runbook.md` | Defines the approval and validation sequence for turning this package into a deployment. |

## Import Format

The complete import contract is defined in:

```text
docs/PRODUCTION_INPUT_PACKAGE_FORMAT.md
```

Use `package-manifest.json` as the first file for future inspect/import
tooling. It is a redacted manifest only; it does not contain customer facts,
secrets, SQLite data, generated subscription YAML, runtime logs, or handoff
material.

## Intended Flow

```text
fill non-secret production input package
-> gccgw package inspect deployments/production-template --json
-> gccgw release status
-> gccgw install preflight on the target host
-> Risk A approval
-> bootstrap / runtime env injection / validation
-> subscription canary
-> retain, rollback, or broader rollout decision
```

This package does not authorize deployment by itself.
