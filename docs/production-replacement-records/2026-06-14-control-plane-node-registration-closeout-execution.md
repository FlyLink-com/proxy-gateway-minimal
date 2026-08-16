# Control Plane Node Registration Closeout Execution Snapshot


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: control_plane_node_registration_closeout_execution
  superseded_by: null
  last_verified_at: 2026-06-14
  production_authority: false
```


Date: 2026-06-14, Asia/Shanghai.

Risk: A for the original production gate; this document is a C-tier closeout
snapshot recorded after the approved gate. It does not authorize additional
production mutation.

## Scope Recorded

Target lane:

- Vultr Japan control plane.
- Vultr Singapore data plane read-only/runtime health evidence.
- Public portal/subscription boundary evidence.

Recorded current Japan release:

- `control-plane-node-registration-closeout-20260614-001`

No DNS, Nginx, provider firewall, public Admin, payment, account/password,
subscription URL/token/password/private-key, raw config, raw env, raw log, or
SQLite row output is recorded here.

## Read-Only Verification Snapshot

Local source and GitHub:

- Local branch: `master`.
- Local `HEAD` matched `origin/master` at `2517673`.
- Open PR count was 0.
- Recent GitHub `CI` and `Release Artifact` workflows on `master` completed
  successfully.

Public boundaries:

- User Portal root returned `200`.
- Subscription health endpoint returned `200`.
- No-session portal current-request endpoint rejected with `401`.
- Public Admin route remained blocked with `404`.
- Public internal data-plane agent route remained blocked with `404`.

Japan control plane:

- `proxy-gateway-candidate.service` was active.
- Local control-plane health returned `200`.
- Internal control port `3456` was loopback-only.

Singapore data plane:

- `gccgw-edge-agent.service` was active.
- `xray-vless-reality.service` was active.
- `hysteria2.service` was active.
- `mihomo-tuic.service` was active.
- TCP `8443`, UDP `10443`, and UDP `443` were listening.
- Hysteria2 stats surface was loopback-only.

Local status checks:

- `npm run project-state:check` passed.
- `git diff --check` passed.

## Current Meaning

This snapshot means the repo/source baseline, Japan control-plane runtime,
public boundaries, and SGP runtime service anchors are aligned enough for the
next planning step.

It does not mean future nodes can be activated without a gate, does not create
or validate a new live customer order, and does not enable quota auto-disable,
payment, public Admin, or broad live runtime mutation.

## Follow-Up Gates

Future work still needs separate approval and evidence for:

- Any new data-plane node registration or first-boot packet ingestion.
- Any live order smoke beyond an explicitly approved controlled test.
- Any DNS, Nginx, provider firewall, or runtime service mutation.
- Live usage collector activation, user-facing usage display, or quota
  enforcement.
- Legacy query-token retirement.
