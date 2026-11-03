# FlyLink Node Provisioning

Last updated: 2026-11-03 UTC.

```yaml
document_metadata:
  doc_type: operational
  lifecycle: active
  authority_scope: flylink_node_provisioning
  superseded_by: null
  last_verified_at: 2026-11-03
  production_authority: false
```

## Risk and scope

- Current source change: Risk B, repository-only dry-run framework.
- Expected PR count: one focused source PR.
- Production/AWS/Vultr impact: none.
- This module has only a pure Vultr dry-run plan adapter; it has no API-capable
  provider client, no apply command, no GitHub Environment, and no provider
  secret reference.

## Ownership

`ops/node-provisioning/` is the provider-neutral entry point for future node
provisioning automation. The current `providers/vultr/adapter.mjs` is a pure plan renderer only: it
validates the approved provider/profile shape and describes the rescue-dd BIOS
installation plan without importing a CLI, reading credentials, or making an
API call. It is not a live provider adapter. Any API-capable adapter belongs
in a separate Risk A implementation after its exact Gate is approved. The
first profile is `profiles/jp-01.json`; it contains safe references, measured
C0 artifact identities, and explicit C1 decision inputs. It does not mirror
M0/E4-A or other current status-ledger state.

The existing contracts remain the source of truth for image readiness and
first-boot packet validation:

- `docs/NODE_IMAGE_PROVISIONING_RUNBOOK.md`
- `scripts/node-image-first-boot-packet.mjs`
- `server/services/node-image-first-boot-packet.mjs`

This module composes the existing first-boot helper; it does not replace its
schema or create a second registration implementation. The repository-wide
readiness summary is intentionally not embedded in the profile because its
open-PR/project-state inputs must remain fresh and belong to the canonical
status ledger, not a duplicated static profile.

## Current workflow

`.github/workflows/node-provisioning-dry-run.yml` is manual and master-only.
It has `contents: read` permission and uses GitHub-hosted runners. It validates
the safe JP-01 profile, calls the existing first-boot packet helper, and emits
a short-lived plan artifact. The workflow does not contact Vultr or
BWH and does not read any secret.

The plan is always non-executable and currently reports `C1_PLAN_BLOCKED`
because the candidate image is still held on the operator workstation, the
exact C1 instance/cost/firewall/access/rollback/validation decisions remain
open, and M0 evidence is deliberately not fetched or copied into this profile.
M0 and E4-A-4 must be checked against their canonical status/contract sources
at the relevant Gate. C2/C3 are not authorized by this workflow.

## C0 facts captured in the profile

The profile records the approved C0 artifact SHA-256, raw image SHA-256, BOM
SHA-256, file-inventory SHA-256, As-Run sample SHA-256, source commit, 40,603 installed
files, 185-byte longest path, and 1,910-byte As-Run sample. It explicitly marks
the image as unavailable to the GitHub runner: the image itself is not copied
into Git or uploaded by this workflow. The profile records content-level
reproducibility only, not bit-for-bit disk-image reproducibility. The C0 report
does not explicitly evidence template-parse success, sanitized-log status, or
that the WireGuard package pin is bound into a release manifest; this module
does not promote those points into claims or readiness assertions. The file-inventory
reference is an opaque C0 evidence reference, not a signed E4-A Release Identity.

The C0 report states that SSH is disabled and cloud-init remains enabled as a
proposed C1 first-boot supply channel. That exception is not accepted by this
module; `cloudInitPolicy` stays `pending-c1-review` until the C1 Gate decides
its permitted inputs, one-time behavior, and shutdown/disable policy. Vultr
BIOS boot support and the initial access path also remain unverified.

## Workflow safety contract

The dry-run input boundary is closed-schema at every copied layer. Profile,
First Boot Packet, Vultr Provider Plan, target, safety, and planned-operation
objects reject unknown fields and require the complete First Boot state
groups. Readiness and apply-approval flags must agree with the blocker list and
the reviewed JP-01 profile. Reference and summary validation rejects IPv4 and
IPv6 literals plus credential-shaped or otherwise sensitive text; blocker and
unresolved-message lists are constrained to reviewed values. The C1 plan also
remains blocked when the C0 artifact SHA-256 record, no-secret scan, or
first-boot image assertions are missing. These checks validate planning
evidence only and do not authorize a provider operation.

The dry-run workflow is limited to:

1. checkout the reviewed `master` commit without persisting checkout credentials;
2. run the existing first-boot packet helper plus focused tests;
3. render a plan with `executable: false`;
4. upload only the redacted JSON plan for seven days.

The workflow must not gain any of these capabilities in this source change:

- `VULTR_API_KEY`, SSH key, Agent token, WireGuard private key, or other secret;
- `environment:` binding, `id-token: write`, or write permission;
- Vultr CLI/API, SSH/SCP/rsync, rescue boot, `dd`, cloud-init injection,
  WireGuard key generation, Agent registration, service activation, or traffic;
- automatic push, pull-request, schedule, or repository-dispatch trigger.

A future provider execution workflow is a separate Risk A design and approval.
If a provider credential is later approved for Actions, its scope, Environment,
reviewers, branch restrictions, rotation, lifetime, and cleanup/readback must
be reviewed independently. This README does not create that Environment or
store a credential.

## Stage responsibilities

- C0: candidate image build and evidence.
- C1: one candidate instance install and real Vultr BIOS/first-boot validation;
  requires exact provider, region, size, budget, access, cloud-init, and rollback
  decisions plus a separate approval.
- C2: WireGuard peer/key/tunnel work.
- C3: Agent private-path integration.
- C4: E1-A V2 registration under its own contract and source approval.
- C5: Receipt, Identity, and metering proof.
- C6: client Canary.

No stage is authorized by this dry-run workflow or by a successful plan artifact.
