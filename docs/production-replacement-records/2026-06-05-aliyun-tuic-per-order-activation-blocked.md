# Aliyun TUIC Per-Order Activation Blocked - 2026-06-05

## Scope

Risk tier: A.

This record captures the attempted continuation of the approved Aliyun local
TUIC per-order lifecycle gate after the install-only bootstrap and permission
gate were completed.

Approved release under review:

```text
ae68072d727bf7da4698701837832e5d15c0ad71
```

Approved archive SHA256:

```text
0430F2BCA9D8C202787281B4086AA9804FEDE70AF747D00743790CB07B274289
```

Approved channel and service:

- channel: `channel-aliyun-a-tuic`;
- service: `mihomo-tuic.service`;
- activation: explicit restart.

Forbidden changes were observed:

- no DNS mutation;
- no Nginx config mutation or reload;
- no firewall or provider security-group mutation;
- no payment mutation;
- no account or password generation;
- no live order creation;
- no passkey enablement;
- no token, password, subscription URL, raw config, raw log, raw env, or SQLite
  row output;
- no active TUIC config write;
- no `mihomo-tuic.service` start;
- no candidate runtime `current` symlink switch.

## Preflight

Remote preflight before candidate staging:

- `proxy-gateway-candidate.service`: active.
- `mihomo-tuic.service`: loaded, disabled, inactive.
- `mihomo-tuic.service` effective identity:
  `proxy-gateway-candidate:proxy-gateway-candidate`.
- `/etc/mihomo/config.yaml`: absent.
- `/etc/mihomo/config.candidate.yaml`: absent.
- UDP 443: free.
- current candidate runtime release:
  `/opt/proxy-gateway-minimal-candidate/releases/c8c631cbd173`.
- approved release directory: absent before staging.
- Mihomo binary: installed and executable.
- Mihomo version: v1.19.25 linux amd64.

## Candidate Staging

The approved archive was uploaded to `/tmp` and verified against the approved
SHA256 before extraction.

The candidate release was staged under:

```text
/opt/proxy-gateway-minimal-candidate/releases/ae68072d727b
```

The archive does not carry `node_modules`. The staged release reused the
current release dependency directory only after confirming the `package-lock`
SHA256 matched the current release.

Candidate dry-run validation from the staged release:

- node policy check: ok and redacted.
- data-plane lifecycle policy check: ok and redacted.
- edge credential reconciliation plan: mutation false and redacted.
- reconcile action count: 4.

No active runtime symlink switch happened during staging.

## Stop Reason

Activation stopped before writing Mihomo config or starting the service.

Known blockers:

- `proxy-gateway-candidate.service` did not have the edge lifecycle runtime
  environment keys configured.
- `proxy-gateway-candidate.service` did not have the Mihomo runtime adapter
  environment keys configured.
- No protected material file was found at the expected operator-protected
  runtime material paths checked during the gate.
- `/etc/mihomo` contained no runtime material files at the time of the gate.
- No TLS certificate/private-key paths were configured for the Mihomo TUIC
  listener.

Because the approved source was `operator-protected runtime material only`, the
gate did not invent credentials, did not generate listener material, did not
write an incomplete active config, and did not start `mihomo-tuic.service`.

## Safe-Stop Validation

Post-stop validation:

- `proxy-gateway-candidate.service`: active.
- `mihomo-tuic.service`: disabled and inactive.
- `/etc/mihomo/config.yaml`: absent.
- `/etc/mihomo/config.candidate.yaml`: absent.
- UDP 443: free.
- current candidate runtime release remained:
  `/opt/proxy-gateway-minimal-candidate/releases/c8c631cbd173`.
- staged approved release directory exists:
  `/opt/proxy-gateway-minimal-candidate/releases/ae68072d727b`.
- Public boundary after safe stop:
  - `https://sub.globalcirclecat.com/api/health`: HTTP 200.
  - `https://portal.globalcirclecat.com/`: HTTP 200.
  - portal public Admin route: HTTP 404.

No live order or subscription was created during validation.

## Required Next Gate

The next production approval must explicitly include runtime wiring in addition
to config-test and service activation:

- update the candidate service runtime environment with the edge lifecycle
  feature flag and channel reference;
- configure the protected credential material file path;
- configure the Mihomo explicit-restart runtime adapter;
- configure active config, candidate config, backup directory, Mihomo binary,
  service name, listener port, and listener bind address;
- provide or approve creation/import of protected TUIC listener certificate and
  private key material;
- define whether the first active config is seeded from existing protected
  material or whether the service remains inactive until the first real order
  creates material;
- switch the candidate runtime release only after the runtime env wiring has
  been validated;
- start or restart `mihomo-tuic.service` only after Mihomo config-test passes.

The gate must continue to avoid printing raw env values, raw runtime config,
logs, credentials, subscription material, or SQLite rows.

## Rollback

No active runtime rollback was required because no current symlink switch, no
active config write, and no `mihomo-tuic.service` start occurred.

If the staged release directory must be removed later, remove only:

```text
/opt/proxy-gateway-minimal-candidate/releases/ae68072d727b
```

Then revalidate that the current release still points to
`c8c631cbd173`, proxy health is ok, portal static availability is ok, public
Admin remains blocked, `mihomo-tuic.service` remains inactive, and UDP 443
remains free.

## Conclusion

The code candidate is staged and redacted dry-run checks pass, but production
activation is blocked by missing runtime environment wiring and missing
operator-protected TUIC listener/material inputs. The system remained in the
previous active production posture.
