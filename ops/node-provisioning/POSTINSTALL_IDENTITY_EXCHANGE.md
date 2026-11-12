# Post-Install Identity Exchange — Design (D1)

```yaml
document_metadata:
  doc_type: canonical
  lifecycle: active
  authority_scope: jp01_postinstall_identity_exchange_d1_contract
  superseded_by: null
  last_verified_at: 2026-11-05
  production_authority: false
```

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

Fingerprint format (pinned by the existing registration contract, not by
this design): the string `sha256:` followed by the lowercase hex SHA-256 of
the raw public-key bytes (for the agent token: of the token bytes) —
`ANCHOR_FINGERPRINT_PATTERN = /^sha256:[0-9a-f]{64}$/` in
`node-registration-ingestion.mjs`. All D1 schemas use exactly this format
for anchor and digest fields; both sides compute it identically and the
gate compares for equality against the registration record.

## 4. Exchange sequence (P2)

1. Node generates its WireGuard key pair and agent token locally.
2. Node computes `wireguardPublicKeyFingerprint` and `agentAuthFingerprint`
   and emits them in its node runtime plan (P3, Node Renderer) together
   with the profile digest and generation. The plan also carries the
   node's WireGuard **public key itself** (base64): a fingerprint alone
   cannot configure a WireGuard peer, so the key is part of the exchange
   contract, in both plans, in both directions.
3. BWH side reads its own peer public key, computes
   `bwhPeerPublicKeyFingerprint`, and emits the BWH integration plan (P3,
   BWH Renderer) carrying both public keys, both fingerprints, and the
   /32 AllowedIPs of the approved address plan.
4. The dual-side gate (P4) cross-checks: node plan
   `wireguard.ownPublicKeyFingerprint` == BWH plan
   `wireguard.nodePeerPublicKeyFingerprint`; node plan
   `wireguard.peerPublicKeyFingerprint` == BWH plan
   `wireguard.bwhPeerPublicKeyFingerprint`; node plan
   `agent.authFingerprint` == BWH plan `agent.agentAuthFingerprint`.
   It also **recomputes** each fingerprint from the decoded public-key
   bytes and rejects the pair if a fingerprint does not match its key —
   comparing fingerprint strings alone would let a plan pair a valid
   fingerprint with the wrong key.
5. The gate takes a third input: the authoritative E1-A candidate
   registration binding (the eleven fields of `registrationBindingOf`,
   taken from the actual registration candidate). Both plans are compared
   against the binding field by field — two plans drifting together to
   the same wrong value still fail — and the fingerprints recomputed from
   the exchanged public keys, and the agent fingerprint, must equal the
   binding's anchors exactly. The binding the gate validates is the same
   candidate P7 submits to the registration executor; its digest
   (`registrationBindingDigest`) is recorded in the gate report.
6. Only after the gate passes may P5 apply the WireGuard peer entries and
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

## 9. Open contradiction to resolve before D3: SSH bootstrap

The pipeline (PR #825, stage C1) requires that after installation SSH
stays disabled until C2/C3 access is deliberately provisioned. This
design's P1, however, assumes a one-time SSH bootstrap session with a
fixed host fingerprint. Both cannot hold as written. Before D3 starts,
one resolution must be chosen and the losing text amended:

- Option A: the C1 install injects a one-time bootstrap public key via
  cloud-init and enables sshd only inside a time-boxed bootstrap window;
  the install receipt records the SSH host fingerprint as the trust
  anchor; P1 consumes the window, and revocation restores the
  SSH-disabled steady state.
- Option B: no SSH bootstrap at all; the first exchange runs entirely
  over the provider console / cloud-init user-data channel, and P1 is
  rewritten accordingly.

Status: UNDECIDED. The first-boot packet builder currently has no SSH
host fingerprint output field, which either option must address. This
item sits alongside the GitHub egress decision in §7: both are D3
preconditions, neither is resolved by D1.

## 10. Digest computation rule (frozen by D1)

Every digest in the D1 contracts (`digest` on both plans,
`profileDigest`, the gate report's `bwhPlanDigest` / `nodePlanDigest` /
`registrationBindingDigest`) is computed one way:

- Input: the object the digest describes, with its own top-level
  `digest` field removed (for the gate report: the digest of each plan
  as the plan itself carries it; for the binding: the eleven-field
  binding object exactly as `registrationBindingOf` returns it).
- Canonical form: JSON with object keys sorted recursively at every
  depth, arrays kept in order, no insignificant whitespace, UTF-8.
- Value: `sha256:` followed by the lowercase hex SHA-256 of the
  canonical form's UTF-8 bytes.

A verifier recomputes the digest from the received object and rejects
on any mismatch; changing any field after digesting invalidates the
digest. D2's two renderers must implement this rule identically — it is
part of the frozen interface, not an implementation choice.

## 11. D2 preconditions carried forward

Recorded at the D1 final review; these bind D2's acceptance, they do
not reopen D1:

- **BWH WireGuard key continuity.** The E1-A binding anchors the node's
  keys, not BWH's. D2's BWH Renderer must therefore obtain BWH's current
  production WireGuard public key **read-only** and must never generate
  or replace a BWH key; the D2 gate must verify the plan's BWH peer key
  equals that existing identity, with a counterexample test in which
  both plans drift to a new BWH key together and must fail.
- The SSH bootstrap resolution (§9) and the GitHub egress decision
  (§7) remain pre-D3 items.
