# Japan TUIC Bootstrap Probe Gate

> Status: historical source-only Gate record.
> Lifecycle: historical.
> Retirement note (2026-08-11): this record no longer authorizes workflow dispatch or retry.
> The remaining sections preserve the original Gate boundary for audit only;
> they are not current operating instructions and create no credential, secret,
> host authorization, deployment, map mutation, service operation, or
> production result.

## Authority And Exact Source Binding

- Risk: A
- Release unit: `japan-runtime-config`
- Identity impact: `true`
- Scope: one fresh Bootstrap Probe identity and one manual execution of
  `.github/workflows/japan-runtime-config-bootstrap-probe.yml`.
- Source authorization: the exact merge commit of this PR. The manual dispatch
  must nominate this PR through `approval_pr`, run on that same `master` commit,
  have a passed `Validate` check, and be started by `gccltdco-cmd`.
- Environment approval: `gaoyi1020-web` must independently approve the exact
  pending `vultr-japan-production` deployment. The dispatcher must not approve
  its own deployment.

## Required Fresh Bootstrap Inventory

Before a new Probe identity is installed, record only aggregate results:

- `JAPAN_CI_*` temporary Environment secret count is zero;
- the prior marked host authorization count is zero;
- exactly one root-owned, mode-0600 runner binding validates its fixed gate,
  timer and service contracts;
- exactly one installed runner matches the frozen reviewed runner digest;
- the collector timer is active and enabled; and
- the protected Environment has the named reviewer, prevents self-review, and
  restricts deployments to protected branches.

## Permitted Bootstrap Actions

The Bootstrap owner may create one newly generated, single-use SSH identity and
only these five temporary Environment secrets:

- `JAPAN_CI_HOST`
- `JAPAN_CI_PORT`
- `JAPAN_CI_USER`
- `JAPAN_CI_PRIVATE_KEY`
- `JAPAN_CI_KNOWN_HOSTS`

The host authorization must be a marked forced command that invokes only the
reviewed runner with its root-owned binding. It must disable interactive shell,
PTY, forwarding, user rc processing, and privilege escalation. Read back only
aggregate booleans and counts; never record endpoint values, keys, host-key
material, binding paths, raw configuration, or customer data.

## Probe Execution And Acceptance

The probe streams zero artifact bytes. It is accepted only if all of the
following aggregate conditions hold:

```yaml
ssh_exit: 2
production_result: stopped_pre_apply
error: artifact_identity_mismatch
host_credential_cleanup: verified
closeout: github_cleanup_pending
```

The probe must not download an artifact, apply a map, delete stale bindings,
change a service or timer, invoke the collector, deploy an application, or
alter database, network, firewall, or provider state.

## Mandatory Closeout

Regardless of probe outcome:

1. verify the marked host authorization is absent;
2. delete all five temporary Environment secrets and read back their name
   absence; and
3. verify no local private-key file remains.

The probe identity is consumed. A later production execution requires a new
identity, new fresh inventory, a distinct Gate, a new exact source
authorization, and a separate Environment approval. A receipt-validation
failure does not establish map apply, rollback, cleanup, or a production
result.
