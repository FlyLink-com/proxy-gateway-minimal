# Edge-Agent Source Deployment Live-Smoke Rollback


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: edge_agent_source_deployment_live_smoke_rollback
  superseded_by: null
  last_verified_at: 2026-06-11
  production_authority: false
```


Date: 2026-06-11, America/Los_Angeles.

Risk: A production runtime and Singapore data-plane agent activation.

Targets:

- Vultr Japan control plane: `45.76.222.52`
- Vultr Singapore data plane: `45.76.158.201`

This record contains only redacted operational facts. It does not contain raw
environment values, raw runtime config, raw logs, SQLite rows, account
credentials, subscription URLs, tokens, passwords, private keys, runtime
credential material, or customer data.

## Approval

The operator approved source deployment plus one future-order live smoke for:

```text
release=edge-agent-source-absorption-20260611-001-worktree
archive_sha256=CD211BC23CB7759C7F9C73CA69D26BFFFB183E7B03D1BCFA503ED3284B6999F7
current_release=edge-agent-future-order-runtime-20260611-002-worktree
```

Approved scope included read-only inventory, protected backups, verified
artifact upload, Japan current switch, SGP edge-agent source/service update,
one dry-run, one controlled apply, config-test for SGP runtime services,
redacted receipts, and render proof.

Forbidden actions included DNS, Nginx, provider firewall, public Admin,
payment, account/password generation, more than one live order, passkey
enablement, subscription URL/token/password/private-key/credential output,
SQLite row dump, raw environment/log/config output, copying protected runtime
config into Git, and unrelated service restarts.

## Execution

Preflight and backups:

- verified local artifact SHA-256 matched the approved value;
- confirmed direct SSH access to Japan and SGP;
- confirmed Japan public portal/sub boundaries, public Admin blocking,
  no-session portal rejection, internal route rejection, and loopback-only
  `tcp/3456`;
- confirmed SGP edge-agent, Xray, Hysteria2, and TUIC services/listeners were
  present before mutation;
- created protected Japan backup:
  `/var/backups/gccgw-edge/edge-agent-source-activation-20260611T180430Z`;
- created protected SGP backup:
  `/var/backups/gccgw-edge/edge-agent-source-activation-20260611T180433Z`.

Deployment attempt:

- uploaded and verified the approved artifact on Japan and SGP;
- unpacked the release and installed production dependencies on both hosts;
- switched Japan `current` to
  `edge-agent-source-absorption-20260611-001-worktree`;
- restarted only Japan `proxy-gateway-candidate.service`;
- installed the source-tracked SGP edge-agent release and restarted only
  `gccgw-edge-agent.service`;
- validated required SGP agent environment key presence by key name only;
- ran one SGP dry-run successfully;
- enabled one controlled SGP apply attempt.

Runtime validation after apply:

- SGP Xray config-test passed;
- SGP Mihomo/TUIC config-test passed;
- SGP Xray, Hysteria2, and TUIC services were active;
- SGP TCP `8443`, UDP `10443`, UDP `443`, and loopback traffic-stats listeners
  were present.

## Failure

The controlled apply returned redacted success at the process level, but the
Japan control-plane receipt state recorded the latest SGP channel receipts as
failed instead of applied. Because render proof requires matching fresh applied
receipts, Singapore channels were correctly withheld from the subscription
render proof.

Root-cause investigation found the SGP active credential material store could
not resolve the desired `edgeCredentialRef` values for the current desired
states:

- active SGP material file contained zero usable records for the desired refs;
- scanning local protected SGP material files could cover most, but not all, of
  the desired refs;
- a small remainder of desired refs was absent from the available SGP protected
  material files;
- SGP adapters, services, listeners, and public/private network boundaries were
  not the primary blocker.

Root cause: future-order desired-state notifications can reach SGP, but the
protected credential material required to apply those future-order credentials
is not yet synchronized to the data plane. This is a protected material
distribution gap between the Japan control plane and the SGP edge agent, not a
template, firewall, listener, or protocol-port issue.

## Containment And Rollback

Containment:

- SGP agent apply loop was returned to dry-run mode;
- SGP `EDGE_AGENT_APPLY_ENABLED` was disabled;
- SGP data-plane runtime services were left active;
- no DNS, Nginx, provider firewall, public Admin, account/password, payment, or
  subscription output mutation was performed.

Rollback:

- restored Japan `current` to
  `edge-agent-future-order-runtime-20260611-002-worktree`;
- restored Japan protected runtime material from the protected backup;
- restarted only Japan `proxy-gateway-candidate.service`;
- did not restore SGP Xray/Hy2/TUIC runtime configs because the apply failed
  before credential material resolution and no runtime credential write was
  accepted as applied.

Post-rollback validation:

- Japan deployed release:
  `edge-agent-future-order-runtime-20260611-002-worktree`;
- Japan service state: active;
- Japan local health: HTTP `200`;
- Japan internal unauthenticated route: HTTP `401`;
- Japan `tcp/3456`: loopback-only;
- public portal: HTTP `200`;
- public subscription health: HTTP `200`;
- public Admin route: blocked (`404`);
- public internal data-plane route: blocked (`404`);
- no-session portal route: rejected (`401`);
- SGP edge-agent: active, dry-run enabled, apply disabled;
- SGP Xray, Hysteria2, and TUIC services: active;
- SGP TCP `8443`, UDP `10443`, UDP `443`, and loopback stats listeners:
  present.

## Result

The source deployment plus future-order live smoke was not completed. The
system was rolled back to the prior Japan runtime release and left with SGP
agent apply disabled.

The next gate must be a separate Risk A protected material synchronization
design and runtime approval. It must define how Japan publishes per-order
credential material to SGP without exposing values in logs, docs, chat, Git, or
public endpoints, then repeat dry-run, controlled apply, receipt, and render
proof.

Do not repeat the `edge-agent-source-deployment-approval-packet` as-is. It is
insufficient without a protected credential-material sync gate.
