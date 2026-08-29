# Security Policy

## Supported source

This repository does not currently publish a versioned security-support matrix.
New security fixes are evaluated against the current `master` source line.

Tags, archived branches, build artifacts, dated deployment records, and retained
rollback releases are not automatically supported or current. Identify the exact
commit, release, or artifact in every report. Production state must be established
by a fresh authorized read; repository documents and build results do not prove
what is currently deployed.

## Report a vulnerability privately

Do not put vulnerability details, exploit steps, credentials, secret configuration,
or customer data in a normal Issue, pull request, discussion, Project item, CI log,
or other broadly visible repository surface.

Use the repository's **Security → Advisories → New draft security advisory** flow.
If that action is unavailable to your GitHub role, contact a repository administrator
through an already-established private organizational channel and ask them to open
a private draft advisory. Share technical details only after a private channel has
been confirmed.

A useful report includes:

- the exact affected commit, release, or artifact identity;
- the security impact and affected boundary;
- a minimal, redacted reproduction using disposable local fixtures where possible;
- any relevant platform or dependency versions; and
- suggested mitigations, if known.

Do not include production credentials, raw customer records, private keys, tokens,
or unredacted protected configuration. The maintainers do not promise a fixed
acknowledgement or remediation SLA; response timing depends on impact, evidence,
and maintainer availability.

## Safe validation and disclosure

A report does not authorize production access, provider or runtime inspection,
traffic interception, destructive testing, deployment, rollback, credential use,
or testing against third-party systems. Any live or production-adjacent validation
must follow the repository's Risk A process with fresh inventory, exact approval,
bounded execution, and post-action readback.

Coordinate disclosure through the private advisory. Acceptance of a report does
not by itself authorize a source merge, artifact publication, deployment, or public
disclosure.
