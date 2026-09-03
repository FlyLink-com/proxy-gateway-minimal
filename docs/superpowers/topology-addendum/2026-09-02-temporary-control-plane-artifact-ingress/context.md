# Temporary Control-Plane Artifact Ingress: Evidence Context

> Status:
> - Type: Risk A topology addendum; selected direction only
> - Risk: A
> - Process: read-only inventory -> topology decision record -> separate execution Gate -> separately approved implementation -> disposable validation -> separate production promotion decision
> - Expected PR count: this one docs-only Draft PR; at least one separately approved implementation PR; no production execution is approved by this record
> - Validation: evidence-hash recomputation, JSON parse, Mermaid/link review, and git diff --check origin/master...HEAD
> - Production/AWS impact: none in this change
> - Production authority: false
> - Execution authority: none
> - Source revision: 34efe687c8886f1b77d53a720a1ecf2fd339b432
> - Evidence collection SHA-256: e3a434907107fab09b6535271dfa2fef9b9adae961ea43e803f5a513dbd084eb

This addendum records a possible **temporary**, bounded route for moving an
already built control-plane source/dependency pair from a protected GitHub
manual workflow to the Japan control-plane host. It is deliberately not an
implementation approval. It creates no GitHub Environment, secret, SSH key,
production user, directory, workflow, artifact, service change, release, or
deployment.

The existing full-Sigstore owner topology hold remains authoritative. This
addendum does not place the required shared Foundation/Artifact owner on
protected master, does not make the offline closure green, and does not replace
full_sigstore_owner_topology_unapproved. A temporary ingress could be a future
delivery edge only after that independent owner/resumption chain is green; it
is not a route around it.

## Evidence Inventory

| ID | Reader-facing evidence | Repository-relative source | What it establishes |
| --- | --- | --- | --- |
| T01 | Canonical production-deploy design | docs/superpowers/specs/2026-08-08-github-control-plane-production-deploy-design.md | A separately approved Risk A topology addendum is required before an extra predecessor or new production delivery authority can be created. |
| T02 | Production-deploy implementation program | docs/superpowers/plans/2026-08-08-github-control-plane-production-deploy-implementation-program.md | The unified owner, full-owner postverification, offline closure, and a new explicit Risk A resume approval are conjunctive prerequisites; current execution stops fail-closed. |
| T03 | Production dry-run workflow | .github/workflows/production-deploy-dry-run.yml | The reviewed workflow can produce a deployment review packet, but contains no host execution path. |
| T04 | Release-artifact workflow | .github/workflows/release-artifact.yml | Packaging creates artifact evidence, not production delivery authority. |
| T05 | Japan runtime-config repair workflow | .github/workflows/japan-runtime-config-additive-repair.yml | The existing production SSH channel is a narrow fixed-purpose repair mechanism and must not be widened or reused for generic artifact transfer. |
| T06 | Redacted production inventory | Operator read-only inventory on the logical Japan control-plane target, 2026-09-03 | A read-only Git deploy key can retrieve repository bytes, while the host has no dedicated low-privilege artifact-ingress principal or approved Actions-artifact receiver. The legacy incoming area is root-owned. This is operational evidence, not a credential record. |

T01-T05 were read from the isolated worktree at the recorded source revision.
The collection digest is the SHA-256 of the sorted path:sha256 lines for
T01-T05. T06 is intentionally redacted and is not folded into that digest; it
must be freshly repeated before any execution Gate can return a positive result.

## Boundary Chosen Here

If a later Gate is approved, the receiving side is a new dedicated
github-artifact-ingest identity with a forced command and no interactive shell.
GitHub stores only the corresponding **private** key as a protected Environment
secret; the public key is installed only on the production host. The identity
accepts a bounded, authenticated stream for four logical objects: the source
archive, dependency artifact, manifest, and checksum. It validates their exact
source revision and digests before atomically publishing a non-executable
receipt to a root-owned staging boundary.

No participant may reinterpret this as general SSH, scp, rsync, SFTP,
repository write, package installation, release creation, service restart, or
pointer switch. The precise deferred execution conditions are in
[the execution Gate](gates/temporary-artifact-ingress-execution-gate.md).
