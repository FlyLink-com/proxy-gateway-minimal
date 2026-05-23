# Windows Proxy Port Policy

## Goal

Decide whether the Windows operator scripts should stay on fixed default local
ports or begin reading `.env` / explicit command-line port overrides.

This decision is intentionally docs-only. It should prevent future confusion
between the Node runtime `CONSOLE_PORT` setting and the Windows proxy scripts'
current fixed local port assumptions.

## Current State

Node runtime:

- `server/state.mjs` reads `CONSOLE_PORT` from the process environment.
- The default console/API port is `3456`.
- The runtime still uses fixed local SOCKS and HTTP proxy ports:
  - SOCKS5: `1080`
  - HTTP proxy: `18180`

Windows operator scripts:

- `scripts/proxy.ps1` uses fixed local ports:
  - HTTP proxy: `127.0.0.1:18180`
  - SOCKS5 for `ALL_PROXY`: `127.0.0.1:1080`
  - PAC URL: `http://127.0.0.1:3456/proxy.pac`
- `scripts/network-doctor.ps1` uses fixed local ports:
  - Console: `3456`
  - SOCKS5: `1080`
  - HTTP proxy: `18180`
- `network-doctor.ps1` repair calls `/api/proxy/start` at
  `http://127.0.0.1:3456` and checks the same fixed local ports.

Documentation:

- `README.md` documents `CONSOLE_PORT=3456` as a configurable runtime variable.
- `docs/NETWORK_FORWARDING.md` already notes that the PowerShell scripts do not
  currently derive ports from `.env`.

## Decision Options

### Option A: Keep Windows Scripts On Fixed Defaults

Keep `scripts/proxy.ps1` and `scripts/network-doctor.ps1` on the current fixed
local ports for now:

```text
Console:     3456
SOCKS5:      1080
HTTP Proxy:  18180
PAC URL:     http://127.0.0.1:3456/proxy.pac
```

Under this option, changing `.env` `CONSOLE_PORT` affects the Node runtime but
does not automatically reconfigure:

- `scripts/proxy.ps1`
- `scripts/network-doctor.ps1`
- PAC URL setup
- `network-doctor.ps1 repair`
- expected local proxy environment variables

Required implementation after this decision:

- Documentation-only clarification in `README.md` and
  `docs/NETWORK_FORWARDING.md`.
- No PowerShell parser changes.
- No runtime changes.

### Option B: Add `.env` Or CLI Port Overrides

Teach the Windows scripts to use non-default ports by reading `.env` and/or
accepting explicit parameters such as:

```powershell
-ConsolePort 3456
-SocksPort 1080
-HttpPort 18180
```

This would require deciding:

- precedence between explicit arguments, process environment, `.env`, and
  hard-coded defaults;
- how `proxy.ps1 pac` generates the PAC URL;
- how `network-doctor.ps1 repair` finds the console API;
- how token lookup behaves when `.env` is parsed;
- what happens when `.env` is missing, malformed, or contains quoted values;
- how to test PowerShell behavior without mutating the operator's system proxy.

## Recommendation

Use **Option A** for now.

The Windows scripts are local operator tools, not general runtime configuration
consumers. Current production and local workflows use the default local ports,
and changing the scripts to parse `.env` or accept port parameters would add
parsing, precedence, PAC, repair, token lookup, and test complexity without a
current operational need.

The short-term policy should be:

```text
Node runtime CONSOLE_PORT is configurable.
Windows proxy scripts currently assume the default local ports 3456 / 1080 / 18180.
Changing CONSOLE_PORT does not automatically reconfigure proxy.ps1,
network-doctor.ps1, or the PAC URL.
```

## Revisit Conditions For Option B

Revisit Option B only if at least one of these becomes common:

- multiple local `proxy-gateway-minimal` instances must run side by side;
- local operator workflows need non-default ports;
- local multi-port development becomes part of the regular test matrix;
- staging or support workflows require a Windows operator to switch ports often;
- tests can cover `.env` parsing, explicit arguments, precedence, PAC URL
  generation, repair behavior, and error handling.

## Scope

In scope for this decision:

- Define the short-term policy for Windows proxy script ports.
- Compare fixed defaults versus `.env` / parameter support.
- Identify documentation updates required after approval.

Out of scope:

- PowerShell code changes.
- `.env` parsing implementation.
- CLI parameter implementation.
- PAC generation changes.
- AWS, production, Nginx, systemd, backend auth, Admin UI, or deployment
  changes.
- Real secrets, tokens, generated subscription URLs, or customer data.

## Follow-Up If Approved

If this spec is accepted, the implementation plan should remain docs-only:

1. Update `README.md` to clarify that Windows proxy scripts assume default local
   ports.
2. Update `docs/NETWORK_FORWARDING.md` with the same policy.
3. Do not change `scripts/proxy.ps1` or `scripts/network-doctor.ps1`.
4. Validate with `git diff --check`.

## Acceptance Criteria

- The spec clearly distinguishes Node runtime configurability from Windows
  script fixed defaults.
- The recommendation is Option A.
- Option B is documented as deferred with explicit revisit conditions.
- No code, AWS, production, Nginx, systemd, backend auth, Admin UI, or deploy
  changes are included.
- No secrets, tokens, generated subscription URLs, or customer data are added.
