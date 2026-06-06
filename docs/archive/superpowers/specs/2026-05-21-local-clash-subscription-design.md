# Local Clash Subscription Design

## Goal

Expose a loopback-only Clash/Mihomo subscription generated from the existing proxy server config so Clash Verge can import this project as a local profile and use its own TUN/VPN features.

## Scope

This phase only generates and serves subscription content. It does not edit Clash Verge `profiles.yaml`, toggle Clash TUN, write virtual network routes, or change the current system proxy ownership.

## Architecture

- `server/services/clash-subscription.mjs` converts `config/proxy-servers.json` plus runtime secrets into Clash YAML.
- `server/routes/subscription.mjs` serves authenticated subscription endpoints.
- `server/app.mjs` wires the route after auth middleware so subscriptions are protected by the existing console token.
- Tests verify YAML shape, password substitution, auth behavior, and status output.

## Endpoints

- `GET /sub/clash.yaml`
  - Requires console token via `Authorization: Bearer <token>` or `?token=...`.
  - Returns `application/x-yaml; charset=utf-8`.
  - Includes `proxies`, `proxy-groups`, and `rules`.
- `GET /api/subscription/status`
  - Requires console token.
  - Returns the subscription URL template and number of available servers without exposing passwords.

## YAML Shape

The generated profile uses Clash-compatible Shadowsocks nodes:

```yaml
mixed-port: 7897
allow-lan: false
mode: global
proxies:
  - name: miyao
    type: ss
    server: 47.251.178.125
    port: 18388
    cipher: aes-256-gcm
    password: ...
proxy-groups:
  - name: GLOBAL
    type: select
    proxies:
      - miyao
      - DIRECT
rules:
  - MATCH,GLOBAL
```

## Security

The subscription includes Shadowsocks credentials, so it remains authenticated and loopback-only. Status endpoints return metadata only and never expose passwords.

## Verification

- Unit tests for generated YAML.
- Route tests for auth and content type.
- Full `npm test`.
- Manual local fetch using the persisted console token.
