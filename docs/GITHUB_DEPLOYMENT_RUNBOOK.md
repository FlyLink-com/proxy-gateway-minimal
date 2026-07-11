# GitHub Deployment Runbook

Last updated: 2026-07-11, America/Los_Angeles.

This runbook defines the repository-owned GitHub deployment foundation for
`proxy-gateway-minimal`. It is not a production approval. Production host,
Nginx, systemd, firewall, data-plane runtime, DNS, schema, or protected material
changes still require a separate Risk A gate.

## Current Baseline

- `.github/workflows/ci.yml` validates pushes and pull requests to `master`.
- `release-artifact.yml` packages the current commit as a source artifact and
  records its SHA256.
- `deploy-cloudflare-site.yml` builds and verifies the public static site. It
  only deploys when the protected `cloudflare-production` environment allows
  it and either manual confirmation is provided or
  `CLOUDFLARE_SITE_AUTO_DEPLOY=true` is set as a repository or environment
  variable.
- `production-deploy-dry-run.yml` creates a production deploy packet and runs
  validation without contacting or mutating production hosts.

## Deployment Lanes

### Cloudflare Static Site

Scope:

- Builds `admin/dist-site` through `npm run cloudflare:site:build`.
- Verifies the public-site boundary with `npm run cloudflare:site:verify`.
- Runs the pinned Wrangler dry-run before any publish.

Required GitHub environment:

- `cloudflare-production`

Required secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Optional variable:

- `CLOUDFLARE_SITE_AUTO_DEPLOY=true`

If the auto-deploy variable is absent or not exactly `true`, pushes to `master`
only validate the static site. Manual deploys still require `workflow_dispatch`
with `mode=deploy` and confirmation text `deploy cloudflare site`.

### Production Runtime Preparation

`production-deploy-dry-run.yml` is intentionally a dry-run-only gate. It:

- validates root and Admin test/build commands;
- packages the current commit into a source artifact;
- records the target, release label, expected current release, and SHA256;
- uploads a short-lived deploy packet for operator review.

It does not:

- SSH to Vultr Japan or Singapore;
- switch production release symlinks;
- restart services;
- mutate Nginx, DNS, firewall, systemd, runtime configs, or SQLite;
- read or print protected runtime material.

## Future Production Promotion Gate

Real Japan or Singapore deployment should be added only after the dry-run packet
has been reviewed. The production workflow must remain manual and protected by a
GitHub Environment such as `vultr-japan-production` or
`vultr-sgp-production`.

Minimum future steps:

1. Read-only inventory of the target host and current release.
2. Stop if `expected_current_release` does not match live current.
3. Upload the reviewed artifact and verify remote SHA256.
4. Back up current symlink, protected env, proxy config, control DB,
   subscription DB, and systemd metadata as applicable.
5. Run `npm ci`.
6. Switch current release.
7. Restart only the approved service.
8. Validate health, public boundaries, internal route rejection, no-session API
   rejection, and data-plane listener/readiness checks.
9. Roll back automatically if validation fails.

### Condition-Driven Promotion Health Window

`npm run promotion:health-gate -- ...` provides a read-only acceptance window
for the Japan control-plane service. It does not switch a release, restart a
service, or perform rollback. Those mutations remain in the separately
approved Risk A Change Record.

The script is standalone and may be streamed through Node stdin by that exact
Risk A execution without installing a file on the host. This transport does
not authorize reuse of a previously rolled-back release. After this capability
is merged, a production attempt must reference a new reviewed artifact built
from the resulting `master` commit.

The gate replaces a one-shot public health request with these conditions:

1. `proxy-gateway-candidate.service` is active/running and its process working
   directory resolves to the expected immutable release.
2. `NRestarts` remains equal to the pre-switch baseline; any change rejects the
   promotion attempt immediately.
3. Loopback `/api/health` returns 200 for three consecutive probes.
4. Only after loopback readiness, the public
   `https://portal.gccwebos.com/api/health` route returns 200 for two
   consecutive probes.
5. The default deadline is 60 seconds with a two-second interval. Reaching the
   deadline returns a non-zero exit code for the approved outer rollback path.
   Every systemd and HTTP probe timeout is capped to the remaining deadline
   budget, and a probe completing after the deadline cannot validate the
   promotion.

Example invocation inside an already approved production attempt:

```bash
npm run promotion:health-gate -- \
  --expected-release "$EXPECTED_RELEASE" \
  --restart-baseline "$PRE_SWITCH_NRESTARTS" \
  --local-health-url "$PROTECTED_LOOPBACK_HEALTH_URL" \
  --public-health-url https://portal.gccwebos.com/api/health
```

The JSON result contains only release identity, elapsed time, probe counts,
HTTP status codes, readiness booleans, and restart-count delta. It never emits
the supplied URLs, response bodies, command stderr, environment values, or
raw service logs. A successful gate is acceptance evidence only; it does not
itself declare or perform production promotion.

## Secret Boundary

GitHub may store only minimal deployment credentials:

- deploy SSH key for a restricted deploy user;
- target host/user/port identifiers;
- Cloudflare API token and account id for the static site.

GitHub must not store:

- production SQLite files;
- subscription URLs or tokens;
- account passwords or portal credentials;
- runtime private keys;
- per-order edge credentials;
- raw protected env files or material-store contents.

## Validation Before Enabling Real Deploy

Before adding host mutation to any workflow:

```bash
git diff --check origin/master...HEAD
npm test
npm run admin:test
npm run admin:build
npm run cloudflare:site:validate
npm run project-state:check
```

The production workflow must additionally prove dry-run deploy packets are
reviewable and do not print secrets.
