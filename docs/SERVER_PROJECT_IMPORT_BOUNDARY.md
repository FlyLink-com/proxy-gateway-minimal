# Server Project Import Boundary

Last updated: 2026-06-01, Asia/Shanghai.

```yaml
document_metadata:
  doc_type: canonical
  lifecycle: active
  authority_scope: server_project_import_boundary
  superseded_by: null
  last_verified_at: 2026-06-01
  production_authority: false
```


> Status:
> - Type: Active import boundary
> - Risk: C as documentation; A when reading from or copying from a live server
> - Execution authority: Does not authorize SSH, Cloud Assistant, rsync, scp,
>   production file copy, Nginx reload, systemd restart, deploy, rollback,
>   SQLite copy, secret copy, DNS change, or tenant/artifact mutation
> - Source of truth for: What may be imported from a server runtime into the
>   repository and what must remain outside Git

## Purpose

Before deeper function-level refactoring, the repository must first know what
the server is actually running. The import goal is not to copy production state
into Git. The goal is to create a clean, redacted, versionable view of the
server project shape so the local codebase can be compared against production
without leaking runtime material.

The target model is:

```text
live server runtime
  -> read-only inventory
  -> redacted import package
  -> Git-tracked templates/manifests/docs
  -> later code refactor against verified facts
```

## Importable

These may be imported when redacted and indexed:

- service unit templates;
- Nginx public-boundary templates;
- release layout and `RELEASE.json` shape;
- package metadata and lockfile identity;
- source file checksums or Git commit identity;
- redacted process/listener summaries;
- safe startup commands and environment variable names without values;
- redacted validation commands and expected public/private boundary behavior;
- safe server directory topology.

## Forbidden

Never import these into Git:

- `.env` values;
- SQLite databases or backups;
- raw subscription URLs;
- artifact secrets;
- tenant tokens;
- console tokens;
- private keys;
- provider credentials, AK/SK, or cloud inventory secrets;
- handoff files;
- customer data;
- raw access logs or unredacted Nginx/systemd logs;
- shell history;
- host-specific live runtime directories.

If a file mixes safe shape and unsafe values, import only a redacted template or
summary. Do not copy the original file into the repository.

## Server Import Package

A server import package should contain only safe, reviewable files:

```text
server-import/
  RELEASE.json
  file-manifest.json
  service-units/
    proxy-gateway-console.service
    proxy-gateway-ss.service
  nginx/
    proxy-gateway-public.conf
  env/
    env.keys.txt
    env.redacted.example
  validation/
    public-boundary-summary.json
    local-service-summary.json
```

The package must be created outside the repository first, reviewed for secrets,
and only then copied into tracked docs or templates.

## RELEASE.json Shape

Use this shape for release identity:

```json
{
  "schemaVersion": "2026-06-01.1",
  "app": "proxy-gateway-minimal",
  "sourceCommit": "<git-sha>",
  "sourceBranch": "master",
  "buildLabel": "<commit-or-release-label>",
  "createdAt": "<iso-timestamp>",
  "runtimeRole": "aliyun-subscription-boundary",
  "serverPath": "/opt/proxy-gateway-minimal/current",
  "releasePath": "/opt/proxy-gateway-minimal/releases/<label>",
  "nodeVersion": "<node-version>",
  "packageLockHash": "<sha256>",
  "configTemplateHash": "<sha256>",
  "notes": "No secrets, SQLite, tokens, subscription URLs, or customer data."
}
```

`RELEASE.json` is metadata only. It does not grant deployment authority.

## Read-Only Inventory Checklist

Before importing anything from a live server, record:

- server role and hostname label;
- current process names and working directories;
- current app directory layout;
- Node.js version and package-lock hash;
- service unit paths and hashes;
- Nginx config paths and hashes;
- release/current symlink posture, if present;
- public boundary behavior summary;
- explicit statement that `.env`, SQLite, logs, handoff files, tokens, and
  customer data were not copied.

## Approval Boundary

Reading or copying from a live server is Risk A. Use an exact approval phrase
before any SSH, Cloud Assistant, rsync, scp, or server filesystem read beyond
already documented public facts.

Minimum approval phrase:

```text
Approve read-only server project import inventory. Allow inspecting the live server project directory, service unit files, Nginx config files, release metadata, process working directories, and safe file hashes for redacted import planning only. No .env value copy, no SQLite copy, no logs copy, no handoff copy, no token or subscription URL output, no customer data, no file mutation, no service restart, no Nginx reload, no DNS change, no firewall change, no deploy, and rollback is not required because no mutation is allowed.
```

Any later copy of a redacted import package is a separate gate unless the
approval explicitly includes the exact destination and reviewed file scope.

## Stop Conditions

Stop immediately if inventory reveals:

- the target directory contains untracked secret material mixed with source;
- the server path is not the expected project;
- a command would print `.env`, SQLite rows, raw logs, tokens, subscription
  URLs, or customer data;
- the operation requires changing permissions, restarting services, reloading
  Nginx, or installing tools on the server.

At that point, record only the safe blocker and request a narrower approval.
