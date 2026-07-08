# Traffic Usage TUIC Mihomo Channel Scope Enable Execution

- Date: 2026-07-07
- Target: `vul1/gccgw-vultr-candidate`
- Risk: A
- Scope: deploy the Mihomo/TUIC usage channel-scope backend change and enable
  the Japan TUIC collector through the existing loopback Mihomo controller
- Sensitive output: suppressed

## Approval

The operator approved `traffic-usage-tuic-mihomo-channel-scope-enable-20260707`.

Allowed scope:

- Upload and verify reviewed backend overlay `server/state.mjs`.
- Back up current runtime, current/base env files, collector systemd units, and
  control database files.
- Cover only `server/state.mjs`.
- Reuse the existing loopback Mihomo controller, protected secret, and protected
  credential map.
- Set Mihomo usage env in `current/.env`, scoped to
  `channel-vultr-a-tuic`.
- Restart `proxy-gateway-candidate.service`.
- Trigger `gccgw-traffic-usage-collect.service`.
- Verify the TUIC collector is scoped to Japan only and unresolved usage count
  is zero.

Explicit non-goals:

- Do not change `/etc/mihomo/config.yaml`.
- Do not restart `mihomo-tuic.service`.
- Do not change Xray, Hysteria2, DNS, Nginx, firewall, or SQLite schema.
- Do not output subscription links, tokens, passwords, private keys, raw env,
  raw config, credential map, controller payload, or SQLite rows.

## Local Validation

The backend scope fix was validated before deployment:

```text
node --test server/tests/state.test.mjs
40 passed

node --test server/tests/edge-mihomo-external-controller-usage-reader.test.mjs server/tests/edge-mihomo-tuic-usage-collector.test.mjs server/tests/tuic-per-credential-usage-proof-script.test.mjs server/tests/state.test.mjs
52 passed

npm test
928 passed

git diff --check
passed with LF-to-CRLF warnings only
```

The reviewed local `server/state.mjs` hash was:

```text
d04d541ebd7be7d8f405340f105d36283b401153447178e022db4357f9de23b5
```

## Upload Verification

Remote staging directory:

```text
/tmp/gccgw-deploy-traffic-usage-tuic-mihomo-channel-scope-enable-20260707-20260707071059
```

Remote staged hash:

```text
d04d541ebd7be7d8f405340f105d36283b401153447178e022db4357f9de23b5
```

Hash match: yes.

## First Attempt And Rollback

First attempt backup directory:

```text
/opt/proxy-gateway-minimal-candidate/backups/traffic-usage-tuic-mihomo-channel-scope-enable-20260707-20260707141338
```

The first attempt:

- backed up current runtime, env files, collector units, and control DB files;
- covered `server/state.mjs`;
- wrote the approved `EDGE_MIHOMO_USAGE_*` env keys.

Restart failed because the backend process could not read the protected
credential map:

```text
failure=EDGE_MIHOMO_USAGE_CREDENTIAL_MAP_PATH must reference a readable JSON object file
```

Root cause:

```text
proxy service user=proxy-gateway
protected map owner=root
protected map mode=600
```

Rollback was executed immediately:

```text
proxy_gateway_after_rollback=active
mihomo-tuic.service=active
gccgw-traffic-usage-collect.timer=active
rolled_back_state_sha256=ce962ea99491f30445bf14e452bff5a22d6f852be561fa2ee300e91f909a67f9
EDGE_MIHOMO_USAGE_CONTROLLER_URL=absent
EDGE_MIHOMO_USAGE_METRICS_PATH=absent
EDGE_MIHOMO_USAGE_CONTROLLER_SECRET=absent
EDGE_MIHOMO_USAGE_CREDENTIAL_MAP_PATH=absent
EDGE_MIHOMO_USAGE_CHANNEL_REFS=absent
```

## Retry Execution

Retry backup directory:

```text
/opt/proxy-gateway-minimal-candidate/backups/traffic-usage-tuic-mihomo-channel-scope-enable-20260707-retry-20260707141826
```

The retry additionally backed up the protected map and controller secret before
adjusting ownership. File modes remained protected:

```text
protected_owner_adjusted=yes
map_mode=600
secret_mode=600
```

Backend deployment:

```text
pre_state_sha256=ce962ea99491f30445bf14e452bff5a22d6f852be561fa2ee300e91f909a67f9
staged_state_sha256=d04d541ebd7be7d8f405340f105d36283b401153447178e022db4357f9de23b5
post_state_sha256=d04d541ebd7be7d8f405340f105d36283b401153447178e022db4357f9de23b5
```

The approved Mihomo usage env keys are present in `current/.env`:

```text
EDGE_MIHOMO_USAGE_CONTROLLER_URL=present
EDGE_MIHOMO_USAGE_METRICS_PATH=present
EDGE_MIHOMO_USAGE_CONTROLLER_SECRET=present
EDGE_MIHOMO_USAGE_CREDENTIAL_MAP_PATH=present
EDGE_MIHOMO_USAGE_CHANNEL_REFS=present
```

Service restart:

```text
proxy_gateway_restart=ok
mihomo_not_restarted=yes
```

## Validation

Safe runtime import check:

```text
collectorCount=4
hasVultrTuic=true
hasSgpTuic=false
```

Collector trigger:

```text
collector_trigger_exit=0
collector_count=4
collector_observation_count=17
collector_recorded_count=17
collector_unresolved_count=0
collector_next_action=continue_usage_monitoring
collector_has_vultr_tuic=yes
collector_has_sgp_tuic=no
```

Service state:

```text
proxy-gateway-candidate.service=active
mihomo-tuic.service=active
gccgw-traffic-usage-collect.timer=active
```

## Rollback

Rollback requires a separate exact approval unless an immediate safety rollback
is needed during the same approved execution window. Shape:

1. Restore `server/state.mjs` and `current/.env` from the retry backup.
2. Restore protected map and controller secret ownership/content from the retry
   backup if required.
3. Restart `proxy-gateway-candidate.service`.
4. Trigger `gccgw-traffic-usage-collect.service` and verify collector scope and
   `unresolvedCount`.

No Mihomo config rollback is required for this execution because
`/etc/mihomo/config.yaml` was not changed.
