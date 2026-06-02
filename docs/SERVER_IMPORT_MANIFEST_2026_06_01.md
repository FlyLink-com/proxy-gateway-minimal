# Server Import Manifest / Drift Matrix

Date: 2026-06-01, Asia/Shanghai.

Risk:

```text
C / docs-only import planning from existing redacted records
```

Sources:

- `docs/production-replacement-records/2026-06-01-aliyun-server-project-import-readonly-inventory.md`
- `docs/SERVER_PROJECT_IMPORT_BOUNDARY.md`

## Boundary

This document is an import-planning manifest only. It does not authorize SSH,
Cloud Assistant, rsync, scp, production file reads, deployment, restart, Nginx
reload, DNS change, firewall change, rollback, or copying production data.

No `.env` values, SQLite databases, raw logs, handoff files, tokens,
subscription URLs, credentials, private keys, provider secrets, or customer data
are included here.

The live server current release observed in the source inventory is a packaged
release directory:

```text
/opt/proxy-gateway-minimal-candidate/releases/da33de295cb0
```

It is not a Git checkout. The release label resolves to a local Git commit
prefix in the source inventory, but the live release directory itself is not a
working tree.

## Known Matches

These items were already present in the local repository with hashes matching
the live packaged release inventory.

| Path | Live release hash | Local repo hash | Import status | Interpretation |
| --- | --- | --- | --- | --- |
| `package-lock.json` | `b22c4249623e15bdb8219b8cf6c39fdf617a067e29ee05a65a5c58ce224b23ff` | `b22c4249623e15bdb8219b8cf6c39fdf617a067e29ee05a65a5c58ce224b23ff` | Matched | Lockfile identity is already represented locally. |
| `ops/systemd/proxy-gateway-console.service` | `2d01b747ab9b78efbd6d5d7e2dc05720bce0cfbb79254ed5e38f9eb59411adf7` | `2d01b747ab9b78efbd6d5d7e2dc05720bce0cfbb79254ed5e38f9eb59411adf7` | Matched | Console service template can be treated as already imported. |
| `ops/systemd/proxy-gateway-ss.service` | `9a87c0c29810c87ada47dbb578b7e33b3900b39ebd340f7c964a75b3fe85a2c1` | `9a87c0c29810c87ada47dbb578b7e33b3900b39ebd340f7c964a75b3fe85a2c1` | Matched | SS service template can be treated as already imported. |
| `ops/nginx/proxy-gateway-public.conf` | `f7885637a1ea30021d3b56ba004678cc0f28d1ce894bcea326e3bf3c7f48fa9c` | `f7885637a1ea30021d3b56ba004678cc0f28d1ce894bcea326e3bf3c7f48fa9c` | Matched | Public-boundary Nginx template can be treated as already imported. |

## Drift Matrix

These items differ between the live packaged release inventory and the local
repository inventory.

| Path | Live release state | Local repo state | Drift type | Follow-up needed |
| --- | --- | --- | --- | --- |
| `package.json` | Hash `d494d9e8ef918e5bac266d6c0e87bf18943f1c0d255b46f420dbea968035a451` | Hash `f3ba2453eb2a59c4096576a1ee962ef13724572e2c0b0fb83ad1608c5fd844fb` | Content differs | Code-side explanation needed: confirm whether this is expected local evolution after the packaged release or missing release metadata. |
| `.env.example` | Hash `64cb9a4b5e409f66838fc21db149832e715188b545a5e1b7e48d62eed56cb722` | Hash `d83c1360314aa6e1551d75aef287b800183d49eb8d49ba7d878156559f3ae245` | Template differs | Code-side explanation needed before claiming current local template exactly reflects the packaged release. Do not copy live `.env` values. |
| `.env.payment.example` | Missing from live release inventory | Hash `4248b4d9924f5dca87b8274f267b5f2eb89832b9343a4bc86262bccdd00b6edf` | Local-only template | Treat as a local repository template addition unless later release metadata says otherwise. No production value import is authorized. |

## Planning Assessment

Known facts:

- The live release is a packaged release, not a Git checkout.
- The local repository already contains matching `package-lock.json`,
  `ops/systemd/proxy-gateway-console.service`,
  `ops/systemd/proxy-gateway-ss.service`, and
  `ops/nginx/proxy-gateway-public.conf` content by hash.
- `package.json` and `.env.example` drift from the packaged release inventory.
- `.env.payment.example` exists locally but was missing from the packaged
  release inventory.

Reasonable interpretation:

- The matched service and Nginx templates can be treated as already imported
  into the repository.
- `package-lock.json` can be treated as aligned with the observed packaged
  release.
- `package.json` and `.env.example` need a code-side or release-history
  explanation before using them as proof of exact live-release parity.
- `.env.payment.example` is likely a local template addition relative to the
  observed packaged release, but this document does not prove when or why it was
  added.

Risks:

- Treating the packaged release as a Git checkout would overstate traceability.
- Treating template drift as runtime drift would be incorrect without a separate
  approved inventory.
- Copying any production runtime data would violate the import boundary.

## Next Actions

Recommended C/B repo follow-up:

- Explain `package.json` drift from code history or release metadata before
  making release-parity claims.
- Explain `.env.example` drift as either expected template evolution or a
  release-template mismatch.
- Treat `.env.payment.example` as already present in the local repository, but
  not present in the observed packaged release inventory.
- Treat the matching service templates and Nginx public-boundary template as
  already safely represented in Git.

Any future read from, copy from, or mutation on a live server remains A-tier and
requires separate explicit approval under `docs/SERVER_PROJECT_IMPORT_BOUNDARY.md`.
