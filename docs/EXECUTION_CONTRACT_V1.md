# Execution Contract v1

```yaml
document_metadata:
  doc_type: canonical
  lifecycle: active
  authority_scope: execution_contract
  superseded_by: null
  last_verified_at: 2026-07-15
  production_authority: false
```

> Status:
> - Type: Source-only process execution contract
> - Risk: B
> - Execution authority: None
> - Production/AWS impact: None
> - Production integration: Absent

Execution Contract v1 provides a small, testable boundary for describing a
local process invocation and recording redacted execution evidence. It does not
approve a command, prove that an approval is authentic or unconsumed, classify
command side effects, or authorize production, provider, SSH, systemd, runtime,
firewall, schema, credential, deployment, promotion, rollback, or file mutation.

## Source Boundary

The implementation is isolated in `server/services/execution-contract.mjs` and
has no production caller. The v1 API consists of:

- `createExecutionIntent()` for strict schema normalization and a frozen intent
  digest;
- `resolveExecutable()` for one exact absolute executable identity;
- `createReadbackInterface()` for explicit before/after aggregate readback;
- `executeExecutionContract()` for a bounded, shell-free local process envelope;
- `buildExecutionReceipt()` for a redacted receipt.

The existing `server/services/command.mjs`, runtime adapters, Gate packets,
provider access paths, and production workflows are unchanged and do not import
this module.

## Execution Intent Schema

| Field | Contract |
| --- | --- |
| `schemaVersion` | Must be `1`. |
| `executionId` | Safe stable identifier; not an approval. |
| `commandId` | Safe logical command identifier. |
| `executable` | Absolute path or PATH-resolved executable name. |
| `args` | Argument array passed without a shell. |
| `cwd` | Absolute local working directory. |
| `timeoutMs` | Positive bounded process timeout. |
| `maxOutputBytes` | Positive combined stdout/stderr byte limit. |
| `environment` | Exact child environment; no implicit inheritance. |

Unknown fields fail closed. The generated `intentDigest` binds the normalized
command, arguments, working directory, timeout, output limit, and environment.

## Executable Resolution

Absolute paths resolve to one real file. Bare executable names search PATH and
must resolve to exactly one real file. Multiple distinct matches stop with
`execution_path_shadowed`; missing or unreadable executables also stop before
readback or process execution.

Resolution records the executable basename, a digest of the normalized real
path, and a SHA-256 digest of executable bytes. Raw executable paths remain an
internal resolution detail and are omitted from receipts.

## Environment Boundary

The child receives only the environment stored in the frozen intent. The
executor caller must supply an explicit environment-name allowlist. Secret-like
names such as token, password, credential, private-key, API-key, access-key,
authorization, and cookie variables are rejected even when a caller attempts to
allow them. Environment values never appear in receipts.

## Binding Boundary

Execution requires `proposalId`, `approvalId`, and the exact frozen
`intentDigest`. A mismatched digest produces a blocked `stale_binding` receipt
before executable resolution, readback, or process start.

This is equality checking only. v1 does not retrieve approval text, verify an
operator identity, submit approval, consume approval, retry a Gate, or replace
the repository's durable Gate and receipt rules.

## Process Result Envelope

The process always uses `shell: false`, an exact resolved executable, bounded
time, and bounded combined output. The envelope exposes only:

- `state`, exit code, signal, timeout, and output-limit status;
- duration in milliseconds;
- stdout/stderr byte counts and SHA-256 digests.

Raw stdout, stderr, environment values, arguments, working directories, and
executable paths are not included. Timeout and output overflow stop the child
and return a failed redacted receipt.

## Readback Interface

Before/after readback is dependency-injected and optional. When configured,
both callbacks are required. Their output is limited to bounded aggregate JSON
with safe keys and scalar values. Raw output, paths, URLs, hosts, ports, config,
environment, credentials, tokens, and other protected fields fail closed.

Readback adapters remain domain-specific. v1 does not implement systemd,
provider, runtime, deployment, or production readback.

## Receipt

The receipt records the execution and command identifiers, frozen binding,
redacted executable identity, process envelope, aggregate readback, result,
condition, and canonical timestamps. Non-blocked receipts reject stale
bindings. Invalid timestamps and raw process output fields fail closed.

Every v1 receipt declares:

```yaml
authority:
  production: false
  provider: false
  approvalSubmission: false
redacted: true
```

## Future Risk A Integration

Any caller that connects this contract to SSH, a provider API, systemd,
production files, credentials, deployment, promotion, rollback, runtime
mutation, or a real Gate is a separate Risk A change. That change requires
fresh inventory, exact command and target binding, operator approval, backup,
validation, rollback, approval-consumption handling, and a domain-specific
redacted receipt. Passing the v1 source tests grants none of those authorities.
