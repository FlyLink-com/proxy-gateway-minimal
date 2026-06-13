# Node Image Provisioning Runbook

Last updated: 2026-06-13, Asia/Shanghai.

This runbook defines how to use machine images, snapshots, or AMIs to prepare
new production data-plane nodes for `proxy-gateway-minimal`. It is an
operations plan only. It does not authorize host creation, provider mutation,
DNS changes, firewall changes, runtime config mutation, credential issuance, or
traffic activation.

## Risk Boundary

Risk: A.

Image-based production node work requires:

1. read-only inventory of the current source, release, and target provider;
2. a reviewed image build plan;
3. explicit operator approval for provider mutation;
4. protected material injection outside Git and outside image artifacts;
5. config-test and service validation before runtime start;
6. receipt-gated subscription rendering before customer traffic is exposed;
7. rollback or destroy plan for the new node.

Do not treat a provider snapshot, AMI, or disk clone as deploy approval.

## Design Decision

Use a **no-secret base image** plus **first-boot registration**.

The image may contain software, service units, directories, and non-secret
templates. It must not contain production control-plane state, user data,
customer orders, subscription URLs, account credentials, private keys, runtime
tokens, or per-order credential material.

The control plane remains the source of truth for accounts, orders,
subscription artifacts, desired-state, material handoff, render gating, and
usage ledger state. A new data-plane node becomes eligible only after it applies
its assigned desired-state and returns a matching applied receipt.

## Image Contents

Allowed in the image:

- Ubuntu base packages and hardening defaults.
- Node.js and npm runtime dependencies.
- The approved `proxy-gateway-minimal` release skeleton.
- `gccgw-edge-agent.service` and edge-agent source.
- Xray runtime binary and service template.
- Hysteria2 runtime binary and service template.
- Mihomo/TUIC runtime binary and service template.
- Nginx package and non-secret site templates.
- Protected directory structure with safe ownership defaults.
- Config-test, health-check, and receipt-check helper scripts.
- Non-secret manifest with build release, package hash, OS image, and tool
  versions.

Forbidden in the image:

- Production `.env` values or copied release-local env files.
- Control DB, subscription DB, SQLite rows, customer data, or account lists.
- Subscription URLs, tokens, passwords, private keys, or runtime credentials.
- TLS private keys, Reality private keys, Hy2/TUIC passwords, or per-order
  credential material.
- Provider API keys, SSH private keys, Cloudflare credentials, or operator
  personal credentials.
- Logs containing raw config, raw env, raw subscription output, or request
  bodies.

## Build Flow

1. Select a clean builder instance or temporary VM.
2. Install packages and runtimes from pinned sources.
3. Install the approved release skeleton under the standard runtime root.
4. Install systemd units disabled or inactive unless the builder requires local
   smoke checks.
5. Create protected directories with no runtime material.
6. Run local no-secret validation:
   - release manifest check;
   - binary version checks;
   - service unit syntax checks;
   - template parse checks;
   - no-secret scan of image staging paths.
7. Stop services and clear transient logs.
8. Create the provider image, snapshot, or AMI.
9. Record the image ID, source release, build host, validation evidence, and
   destroy/retire plan in an execution record.

## First-Boot Flow

After creating a new node from the image:

1. Confirm provider inventory, IPs, region, firewall attachment, and OS.
2. Register the data-plane node with a reviewed `nodeRef`.
3. Materialize protected runtime values from operator-protected material only.
4. Set channel refs for the node, for example:
   - VLESS Reality over TCP;
   - Hysteria2 over UDP;
   - TUIC over UDP.
5. Start or restart only the edge-agent service after environment validation.
6. Let the edge agent pull node-scoped desired-state.
7. Apply desired-state to local runtime configs.
8. Run config-test for each runtime before service restart.
9. Restart only the approved data-plane services that passed config-test.
10. Post redacted applied receipts to the control plane.
11. Verify the control plane renders this node's channels only after matching
    receipts exist.

## Receipt Gate

New nodes must not appear in customer subscriptions merely because their
provider instance is reachable.

Subscription rendering must require:

- channel exists in the approved control-plane config;
- physical node ref matches the registered data-plane agent node;
- current desired-state generation exists for the order/channel;
- data-plane agent returned a matching applied receipt;
- receipt is fresh enough for the configured policy;
- no disable, revoke, expiry, or quota gate blocks the credential.

If any condition fails, the renderer must withhold the channel and keep the
existing eligible channels available.

## Provider Notes

Vultr:

- Prefer provider snapshots for repeatable small data-plane nodes.
- Do not snapshot a node after protected material has been injected unless the
  snapshot is treated as sensitive and never reused as a base image.
- Use provider firewall rules as a separate Risk A gate.

AWS:

- Prefer AMI build from a clean staging/DR instance.
- Keep staging `.env` and production `.env` separate.
- AMI readiness is not production promotion.

Aliyun or other providers:

- Use the same no-secret image rule.
- Provider-specific bootstrap or cloud-init scripts must stay non-secret.
- Protected material must be injected after first boot through the approved
  operator path.

## Validation Checklist

Image build validation:

- image manifest exists and records release plus package hash;
- no protected runtime material is present in image paths;
- service units are installed but not exposing public Admin;
- runtime binaries report expected versions;
- local config templates parse without production values;
- build logs do not contain secrets or raw runtime configs.

New node validation:

- public health endpoint responds as expected for its role;
- public Admin remains blocked;
- internal agent route is not public;
- edge agent is active and authenticated through private path only;
- Xray, Hysteria2, and TUIC listeners match the approved channel plan;
- loopback-only stats surfaces are not public;
- config-test passes before service restarts;
- fresh applied receipts exist before the node is rendered;
- no live order is created unless the approval explicitly allows a controlled
  smoke order.

## Repo-Only Readiness Summary

Before requesting any provider or production mutation, operators can convert
safe, non-secret gate facts into a redacted readiness summary:

```powershell
node bin/gccgw.mjs node image-readiness-summary .\node-image-readiness.safe.json
```

The input file must contain only supported boolean gate fields and safe notes.
It must not contain hostnames, IP addresses, URLs, subscription links, tokens,
passwords, private keys, provider credentials, SQLite data, customer data, raw
runtime config, or raw logs. Unsupported or sensitive-looking fields are
rejected without echoing their values.

The summary can answer:

- whether the no-secret image build preconditions are complete;
- whether first-boot registration and private control-plane path prerequisites
  are ready;
- whether Xray, Hysteria2, TUIC, loopback stats, and public Admin boundaries
  have planned validation;
- whether receipt-gated rendering is still enforced;
- whether activation and live-order smoke require separate approvals.

The command is a repo-only gate preview. It does not create images, query
providers, provision hosts, inject protected material, start services, mutate
DNS, touch SQLite, render subscription YAML, or create live orders.

## Rollback

Before activation:

- destroy the new instance or detach it from the node pool;
- remove pending channel refs from the control-plane candidate config;
- archive failed image/build evidence without secrets.

After activation:

- disable the node channels in the control plane;
- wait for subscriptions to render without that node;
- preserve receipt and validation evidence;
- stop or destroy the node after rollback validation.

Never roll back by reusing a stale image that contains protected runtime
material.

## Approval Packet Template

Use this shape for a future exact approval:

```text
Approve image-based data-plane node provisioning:
release=<release>;
image_source=<builder instance or image id>;
target_provider=<provider>;
target_region=<region>;
node_ref=<node ref>;
channels=<channel refs and ports>;
scope=read-only inventory, no-secret image validation, create node from image,
protected first-boot material injection, edge-agent dry-run/apply,
config-test, approved service restarts, receipt-gated render proof;
validation=health ok, Admin blocked, internal agent public reject, listeners
active, stats loopback-only, fresh receipts, subscription render proof;
rollback=destroy new node or disable node channels and restore previous
control-plane config;
forbidden=copying production env/DB/keys into image, DNS mutation unless
separately approved, subscription URL/token/password/private-key output,
SQLite row dump, raw env/log/config output, public Admin exposure.
```
