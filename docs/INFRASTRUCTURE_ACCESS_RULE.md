# Infrastructure Access Rule v1

Last updated: 2026-07-11, America/Los_Angeles.

> Status:
> - Type: Active infrastructure-access governance rule
> - Risk: C for this documentation baseline; every real provider access remains Risk A
> - Production authority: None
> - Credential authority: None

This rule applies to interactive or Agent-assisted access to Vultr, AWS,
Cloudflare, Vercel, DNS providers, and other infrastructure control planes. It
defines how an already approved provider credential may be used. It does not
create, rotate, revoke, broaden, or authorize a credential or provider change.

## Required Model

```text
local and network precheck
  -> exact Risk A gate
  -> explicit operator approval
  -> ephemeral process injection
  -> allowlisted commands
  -> redacted validation
  -> local cleanup and readback
```

Provider access must not depend on a credential stored by default on the Agent
workstation.

```yaml
provider_access:
  persistent_local_storage: forbidden
  exact_gate_required: true
  explicit_command_allowlist: required
  raw_secret_output: forbidden
  cleanup_readback: required
```

## Credential Boundary

- Do not store an interactive provider API key in a Windows CurrentUser or
  LocalMachine environment variable, shell profile, repository `.env`, CLI
  config file, plaintext runbook, log, or reusable Agent configuration.
- Determine local prerequisites that do not require provider authentication,
  including direct network identity and CLI availability, before injecting the
  credential whenever possible.
- Inject the credential into one bounded command process only after the exact
  Gate is approved. Child commands inherit it only for that Gate.
- A one-time operator handoff file is allowed only when the Gate names it as a
  transient input, restricts its local exposure, and requires deletion before
  the first provider API call. Its value must never be printed or copied.
- Clear the process environment in a `finally` path and verify that the named
  process, user/machine environment, CLI config, and approved handoff-file
  locations contain no local copy after execution.
- Unknown provider privilege is treated as full access for risk decisions.
- Deleting a local copy does not revoke or expire the provider-side key. The
  execution receipt must record provider credential state as `revoked`,
  `expired`, or `unverified_assume_valid`; it must not claim `destroyed` from
  local cleanup alone.

Existing workload or CI credentials are not silently changed by this rule.
They require their own environment, scope, rotation, and deployment review and
must not reuse an interactive operator credential.

## Exact Gate Requirements

Every provider Gate records:

```yaml
risk: A
provider:
target:
credential:
  logical_id:
  privilege: verified_scope | unverified_assume_full_access
  local_source: process_only | approved_one_time_handoff
commands:
  allowed: []
scope:
validation:
stop_conditions:
cleanup:
forbidden:
```

The allowlist contains complete command families and exact targets. A read-only
intent does not permit broad account inventory, unrelated metadata reads,
browser fallback, or a different CLI command.

## Output And Failure Rules

- Emit only the booleans, aggregate counts, status labels, and safe identities
  required by the Gate.
- Do not output API keys, raw environment values, unrelated provider resource
  inventories, firewall CIDRs, private keys, configs, logs, database rows,
  subscription material, or customer data.
- Stop when a prerequisite is indeterminate, a target is not uniquely matched,
  authentication fails, the allowlist is insufficient, or a command would
  require mutation.
- Cleanup still runs after every stop. A stopped Gate is not retried under the
  old approval; changed credentials, network assumptions, targets, or commands
  require a fresh exact Gate.
- Process restrictions are governance controls, not provider-side least
  privilege. Record `provider_mutation: none` only from the commands actually
  executed; do not claim mutation was technically impossible when privilege is
  unknown.

## Execution Receipt

The final receipt records at least:

```yaml
gate:
result: completed | executed_partial_stopped | failed
credential_local_before:
credential_local_after:
provider_credential_status:
commands_executed: []
provider_mutation:
production_mutation:
conclusion:
next_gate:
```

Issue #437 Gate `4946866628` is frozen as
`executed_partial_stopped` and must not be retried. It removed the persistent
local Vultr credential copy, made no Vultr API call, and did not establish
Japan instance, firewall, SSH, or runtime state. Its provider-side key status
remains `unverified_assume_valid`.
