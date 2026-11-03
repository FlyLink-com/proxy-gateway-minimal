# Post-Install Identity Exchange — Design (D1)

Status: D1 contract design for the Post-Install Dual-Side Integration
programme (design v0.1, 2026-11-03). This document freezes the identity
exchange interface for JP-01 and later child nodes. It defines no workflow
and authorises no production change: `production_authority: false`.

Bindings: E1-A v1.2 is the current registration-binding amendment baseline
(E4-A v0.13). The WireGuard address plan 10.77.0.0/24 (BWH 10.77.0.1/32,
JP-01 10.77.0.2/32, interface `wg-child0`, /32 AllowedIPs) was approved on
2026-11-02; its production application remains gated at pipeline stage C2.

## 1. What already exists (do not reinvent)

- The E1 registration binding (`registrationBindingOf`,
  `server/services/edge/node-registration-ingestion.mjs`) compares eleven
  fields: nodeRef, providerRef, regionRef, roleRef, channelRefs (sorted),
  imageManifestRef, releaseRef, firstBootPacketRef, wireguardPlanRef,
  wireguardPublicKeyFingerprint, agentAuthFingerprint. The last two are the
  identity anchors.
- Bindings are insert-only: an identical replay returns the stored record,
  anything else is a `registration_conflict`. Key or identity rotation goes
  through a separate supersede/retirement flow, never an in-place edit.
- `node-vultr-jp-01` registers only through the registration executor
  (`node-registration-execution.mjs`); the ingestion path refuses it. The
  executor requires `EDGE_NODE_REGISTRATION_EXECUTION_ENABLED` to be
  exactly `"true"` and always requires both identity anchors.
- The data-plane agent protocol
  (`server/services/edge/data-plane-agent-protocol.mjs`) already defines
  desired-state, material-request/response, and apply-receipt messages and
  a forbidden-key set (authorization, cookie, customerdata, env, password,
  privatekey, rawconfig, rawenv, rawlog, secret, sqlite, sqliterow,
  subscriptionurl, token, uuid, after normalisation). The D1 schemas adopt
  that vocabulary and forbid the same keys structurally.
- Anchors are SHA-256 fingerprints: the executor persists "the sha256
  fingerprint of the agent token, never the token itself".

## 2. Principles

1. Each side generates its own private keys on its own host. Private keys
   never cross any channel — not GitHub, not the control link, not artifacts.
2. Only public keys, SHA-256 fingerprints, safe references, generations,
   and digests are exchanged. Anything exchanged is safe to store in GitHub
   artifacts and workflow logs.
3. BWH keeps its existing identities. Onboarding JP-01 must never
   regenerate or replace BWH's existing WireGuard key; JP-01 is added as a
   new peer entry only.
4. First trust is anchored on the P1 SSH bootstrap: the one-time bootstrap
   key, verified against the fixed SSH host fingerprint recorded at
   install, authenticates the node side during the first exchange. The
   bootstrap credential is revoked when the exchange completes.
5. No long-lived shared secret is ever held by GitHub. GitHub carries
   fingerprints and references only.

## 3. Identity inventory

| Identity | Generated | Private part stays | Exchanged |
| --- | --- | --- | --- |
| Machine ID | node, first boot | node | never |
| SSH host keys | node, first boot / provisioning | node | host fingerprint (P0/P1 check) |
| WireGuard key pair (node) | node (P2) | node | public key + fingerprint |
| WireGuard key pair (BWH peer side) | BWH, pre-existing | BWH | public key + fingerprint |
| Agent token | node (P2), see §5 | node | SHA-256 fingerprint only (`agentAuthFingerprint`) |
| Protocol material (Xray/HY2/TUIC) | BWH protected material store | BWH store + node at apply time | materialRef + materialDigest only, until the agent pulls by reference over the private link |

Fingerprint derivation (pinned by this design): the lowercase hex SHA-256
of the raw public-key bytes (for the agent token: of the token bytes). Both
sides compute it identically and the gate compares for equality against the
registration record.

## 4. Exchange sequence (P2)

1. Node generates its WireGuard key pair and agent token locally.
2. Node computes `wireguardPublicKeyFingerprint` and `agentAuthFingerprint`
   and emits them in its node runtime plan (P3, Node Renderer) together
   with the profile digest and generation.
3. BWH side reads its own peer public key, computes
   `bwhPeerPublicKeyFingerprint`, and emits the BWH integration plan (P3,
   BWH Renderer) carrying both fingerprints and the /32 AllowedIPs of the
   approved address plan.
4. The dual-side gate (P4) cross-checks: node plan
   `wireguard.ownPublicKeyFingerprint` == BWH plan
   `wireguard.nodePeerPublicKeyFingerprint`; node plan
   `wireguard.peerPublicKeyFingerprint` == BWH plan
   `wireguard.bwhPeerPublicKeyFingerprint`; node plan
   `agent.authFingerprint` == BWH plan `agent.agentAuthFingerprint`.
5. Only after the gate passes may P5 apply the WireGuard peer entries and
   P7 run the executor registration with the same anchors.

## 5. Agent first trust (no secret ever moves)

The agent authenticates to BWH with a token. The bootstrap problem — how
the first token becomes trusted without a pre-existing secure channel —
is solved without moving the secret:

- The token is generated on the node (P2), so it never transits GitHub,
  SSH, or any artifact. BWH only ever receives its SHA-256 fingerprint,
  through the plan/gate path above.
- The fingerprint's own authenticity during this first exchange rests on
  the P1 bootstrap channel: the node plan is produced by the node-side
  workflow running over the fingerprint-verified bootstrap SSH session,
  and every production-adjacent step still requires its own GitHub
  Environment approval.
- After WireGuard is up (P5), the agent presents the token only over the
  private control link; BWH verifies by comparing the SHA-256 fingerprint
  against the registered anchor. There is no public agent endpoint.
- Rotation: a new token means a new fingerprint, which conflicts with the
  insert-only binding by design. Rotation therefore uses the registration
  supersede/retirement flow; it is never an in-place anchor edit.

## 6. Reserved: the third anchor

E4-A (v0.13, not frozen) adds a third identity anchor,
`agentSigningPublicKeyFingerprint`, to the registration binding. It is not
part of the frozen D1 v1 schemas. When E1-A's amendment path lands it, the
schemas advance to v2 through the same contract process; v1 consumers must
not silently accept the extra field (all D1 schemas are
`additionalProperties: false`).

## 7. Open decision required before D3

GitHub-to-node connectivity: GitHub-hosted runner egress IPs are not
fixed, and SSH must never be opened to `0.0.0.0/0`. The two admissible
options are (a) a controlled runner with fixed egress, or (b) a restricted
management relay via BWH. D1 records the constraint and the options; the
choice is the operator's, and D3 (WireGuard + Agent) cannot start without
it. After bootstrap, the preferred steady state is agent-initiated pull
(desired state / material / receipt over the private link), minimising
inbound connections to the node.

## 8. Failure and rollback (identity scope)

- Bootstrap fails: revoke the temporary SSH authorisation; nothing else
  has been created.
- Exchange or gate fails: discard the unaccepted candidate identity
  material on the node; BWH stores nothing before the gate passes.
- Post-registration identity failure: follow the registration
  supersede/retirement flow; never delete historical identity, user, or
  metering records.
