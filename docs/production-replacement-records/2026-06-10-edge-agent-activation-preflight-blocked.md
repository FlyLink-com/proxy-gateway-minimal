# Edge Agent Production Activation Preflight Blocked

Date: 2026-06-10, America/Los_Angeles.

Risk: A

## Scope

Operator approved continuing from Gate 0 into the next production activation
step. Before enabling internal routes or starting the SGP edge-agent loop, a
read-only preflight checked the installed SGP systemd unit, wrapper scripts, and
agent connectivity assumptions.

No production route was enabled, no service was restarted, and no runtime config
was mutated in this preflight.

## Finding

Production activation is not ready to start.

Two blockers were found before any restart or route enablement:

1. The SGP edge-agent base URL points at the public subscription domain.
   The public `/api/internal/data-plane-agent/*` path remains blocked by the
   Nginx/public boundary. This is the correct public security posture, but it
   means the SGP agent currently has no private path to Japan's agent route.
2. The installed SGP `gccgw-edge-agent.service` runs
   `/opt/proxy-gateway-minimal-edge-agent/bin/edge-agent-loop.sh`, which calls
   the CLI dry-run foundation without injecting production runtime adapters or
   protected credential material. Starting it as-is would not apply Xray, Hy2,
   or TUIC runtime state; it would produce failed receipts such as
   `adapter_missing`.

## Validation Performed

Validated without printing secrets or raw env values:

- SGP `gccgw-edge-agent.service` exists and is inactive.
- SGP loop script calls `edge-agent-once.sh` repeatedly.
- SGP once script calls `node agent/edge-agent.mjs`.
- The CLI default path does not enable apply mode and does not auto-discover
  production runtime adapters/material.
- SGP agent base URL is configured as the public subscription domain.
- Public internal agent route remains unavailable.

## Decision

Stop before mutation.

Do not start `gccgw-edge-agent.service` and do not enable Japan internal agent
routes until the next repo/runtime gate provides both:

- a private SGP-to-Japan agent transport, such as an approved SSH local tunnel
  or equivalent private-only channel; and
- a reviewed production SGP runner that creates the edge agent with
  `allowApply: true`, injects SGP Xray/Hy2/TUIC runtime adapters, and resolves
  protected credential material without logging values.

## Required Next Gate

Recommended next gate:

1. Repo-only: add and test a production edge-agent runner/wrapper contract for
   SGP that supports dry-run and apply using injected runtime adapters and a
   protected material store.
2. Repo-only: add and test private transport configuration, keeping public
   `/api/internal/*` blocked.
3. Production preflight: install the reviewed runner and private transport
   inactive.
4. Production activation: enable Japan routes, start private transport, run
   dry-run, then controlled apply, then post redacted receipts.

This record does not authorize any of those steps.
