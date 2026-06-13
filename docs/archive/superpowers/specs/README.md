# Specs Archive

Last updated: 2026-06-08, America/Los_Angeles.

This directory contains historical design specs. They are archived design
artifacts, not current operational source-of-truth docs by default.

Read these files when you need design background, but verify current behavior
against the code, tests, `docs/PROJECT_CONTEXT.md`, and active runbooks before
making changes.
Also read `docs/CURRENT_SOURCE_AND_ARCHIVE_BOUNDARY.md` before re-importing
any archived spec fact into active source, docs, tests, or runtime templates.

## Specs

| Spec | Topic | Status |
| --- | --- | --- |
| `2026-05-21-aws-singapore-proxy-node-design.md` | AWS Singapore proxy node design. | Historical design artifact. |
| `2026-05-21-local-clash-subscription-design.md` | Local Clash subscription design. | Historical design artifact. |
| `2026-05-21-module-package-design.md` | Module/package design. | Historical design artifact. |
| `2026-05-21-proxy-gateway-minimal-upgrade-design.md` | Proxy gateway minimal upgrade design. | Historical design artifact. |
| `2026-05-21-subscription-admin-core-design.md` | Subscription admin core design. | Historical design artifact. |
| `2026-05-21-subscription-admin-design.md` | Subscription admin design. | Historical design artifact. |
| `2026-05-22-admin-console-real-api-design.md` | Admin Console real API design. | Historical design artifact. |
| `2026-05-22-environment-foundation-design.md` | Environment foundation design. | Historical design artifact. |
| `2026-05-22-subscription-architecture-refactor-design.md` | Subscription architecture refactor design. | Historical design artifact. |
| `2026-05-22-subscription-hardening-design.md` | Subscription hardening design. | Historical design artifact. |
| `2026-05-23-admin-connection-health-design.md` | Admin connection health design. | Historical design artifact. |
| `2026-05-23-admin-dangerous-action-confirmations-design.md` | Admin dangerous action confirmations design. | Historical design artifact. |
| `2026-05-23-http-bridge-boundary-tests.md` | HTTP bridge boundary tests and robustness contract. | Historical spec; implemented by later code/test PRs. |
| `2026-05-23-network-doctor-token-lookup-policy.md` | Network doctor token lookup policy. | Historical policy spec; user-facing docs now record the policy. |
| `2026-05-23-windows-proxy-port-policy.md` | Windows proxy port policy. | Historical policy spec; user-facing docs now record the policy. |

## Use Rule

If a spec conflicts with current code, tests, `docs/PROJECT_CONTEXT.md`, or an
active runbook, treat the current artifact as authoritative and update docs
through a new PR instead of silently following the archived spec.
