# Temporary Artifact Ingress: Branch-Restricted Environment Amendment

> Status: **ACTIVE GOVERNANCE AMENDMENT; EXECUTION NOT GRANTED**
>
> Risk: **A**. This amendment records a deliberate reduction of the original
> independent-reviewer control. It does not authorize a key, secret, host
> mutation, workflow dispatch, artifact transfer, validation, activation, or
> production promotion.

## Decision

The selected GitHub Environment is `control-plane-artifact-ingress`. It is
restricted to protected branches and is bound only to the manual
`Control Plane Artifact Ingress` workflow's inert `topology-preflight` job.

The organization can host Environments and branch policies, but the attempted
required-reviewer policy was rejected by GitHub with an entitlement error. The
workflow therefore has no Environment reviewer. `gccltdco-cmd` is not recorded
as an Environment reviewer and no claim of independent GitHub approval may be
made for this path.

## Replacement Control Boundary

Because an Environment without reviewers cannot provide independent approval,
its branch restriction is only a source-selection control. Before any private
key generation, secret creation, host public-key installation, or dispatch,
all of the following remain mandatory:

1. A new explicit, single-use operator decision bound to the exact protected
   `master` commit, artifact identities, target, and 24-hour expiry.
2. Fresh redacted readback that the Environment permits protected branches
   only, the job has `permissions: {}`, and the workflow remains free of
   checkout, SSH, artifact transfer, and secret references until the separately
   reviewed transfer implementation exists.
3. The unchanged supply-chain, artifact-scope, host-inventory, receiver,
   lifecycle, disposable-validation, and separate-promotion inputs in the
   parent execution Gate.

No repository secret may substitute for an Environment secret, and no
unreviewed Environment may be described as protected by human approval or as a
no-bypass credential boundary.

## Scope And Non-Goals

This amendment changes only the Environment selection model and binds the
already-inert manual workflow to that named Environment. It leaves the existing
repair identity, release pointer, candidate service, runtime configuration,
databases, Nginx, DNS, firewall, production data, and artifact transfer path
unchanged. The workflow continues to exit before any credential, receiver,
host, artifact, or deployment action.

## Rollback

If a future Environment is created under this amendment, rollback is deletion
of that empty Environment after verifying it contains no deployments or
secrets. Any future key or host cleanup remains a separate approved action and
is not covered by this source-only amendment.
