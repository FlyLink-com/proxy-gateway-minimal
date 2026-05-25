# prod-edge-a Timeout / Packet-Loss Preflight

Date: 2026-05-25, Asia/Shanghai

Branch: `ops/prod-edge-a-timeout-packetloss-preflight`

Approval:

```text
Approved read-only prod-edge-a timeout and packet-loss preflight.
```

## Scope

This was a read-only production incident preflight for reported intermittent
timeouts / perceived packet loss.

This preflight checked:

- local Windows operator vantage;
- Aliyun SWAS manual validation host vantage;
- prod-edge-a host-local health;
- prod-edge-b `18388` TCP comparison.

This preflight did not perform:

- DNS mutation;
- AWS mutation;
- Nginx mutation or reload;
- HTTPS redirect change;
- service restart;
- artifact rotation or revocation;
- token mutation;
- tenant migration;
- traffic cutover;
- prod-edge-b cleanup or mutation;
- legacy-blue mutation;
- raw token, opaque artifact URL, raw artifact path, SQLite content, cloud
  credential, private key, or customer-data recording.

## Current Production Facts

```text
prod-edge-a -> 13.215.156.159
sub.globalcirclecat.com -> 13.215.156.159
ss-sg.globalcirclecat.com -> 13.215.156.159
HTTPS -> enabled on sub.globalcirclecat.com
/sub/a/* opaque artifact canary -> active
active tenant old primary/temp legacy links -> drained
/sub/clash.yaml route -> still present
```

## Local Windows Vantage

DNS:

```text
sub.globalcirclecat.com -> 13.215.156.159 TTL 600
ss-sg.globalcirclecat.com -> 13.215.156.159 TTL 494
```

HTTP / HTTPS gateway:

```text
https://sub.globalcirclecat.com/api/health -> 200
  connect=0.103995s ttfb=0.524073s total=0.524129s

http://sub.globalcirclecat.com/api/health -> 200
  connect=0.116211s ttfb=0.217772s total=0.217835s

https://sub.globalcirclecat.com/sub/clash.yaml without token -> 401
  connect=0.102846s ttfb=0.313491s total=0.313560s

https://sub.globalcirclecat.com/api/admin/subscriptions -> 404
  connect=0.123306s ttfb=0.341166s total=0.341223s

https://sub.globalcirclecat.com/ -> 404
  connect=0.100692s ttfb=0.302092s total=0.302158s
```

Opaque artifact canary URL, without recording the URL:

```text
10/10 requests returned 200
connect range -> 0.099659s to 0.117688s
total range -> 0.298394s to 0.948013s
```

Shadowsocks TCP:

```text
ss-sg.globalcirclecat.com:18388 -> 20/20 TCP success
13.215.156.159:18388 -> reachable
13.215.156.159:443 -> reachable
13.215.156.159:80 -> reachable
```

ICMP / route:

```text
ping 13.215.156.159 -n 5 -w 1000 -> 5 sent / 0 received / 100% loss
```

`tracert -d -w 1000 13.215.156.159` reached the local network, China Mobile
internal hops, and a cross-border hop (`223.120.22.126`) before later hops
stopped returning ICMP. This does not prove application-layer loss because TCP
checks to `80`, `443`, and `18388` succeeded.

## Local Operator Device Follow-Up

The operator later clarified that the frequent timeout / fluctuation was
observed on the local device. A second read-only local-device pass checked
proxy posture, Wi-Fi state, LAN gateway stability, and TCP `18388` connect
latency.

Local proxy posture:

```text
HTTP_PROXY -> http://127.0.0.1:7897
HTTPS proxy environment -> http://127.0.0.1:7897
NO_PROXY -> localhost,127.0.0.1,::1
WinHTTP proxy -> direct access
WinINet ProxyEnable -> 0
WinINet stored ProxyServer -> 127.0.0.1:18180
WinINet stored AutoConfigURL -> http://127.0.0.1:33331/commands/pac
```

Local proxy listeners:

```text
127.0.0.1:7897 -> verge-mihomo
127.0.0.1:33331 -> clash-verge
127.0.0.1:18180 -> node
PAC fetch -> 200, total=0.001022s
```

Wi-Fi / LAN:

```text
Interface -> WLAN
SSID -> CMCC-NHE9
Band -> 5 GHz
Radio -> 802.11ax
Signal -> 93%
RSSI -> -41
Gateway -> 192.168.10.1
Gateway ping -> 50 sent / 50 received / 0% loss
Gateway latency -> min 1ms / max 26ms / avg 2ms
WLAN received packet errors -> 0
WLAN outbound discarded packets -> 0
WLAN outbound packet errors -> 5 cumulative
```

Direct HTTPS health loop:

```text
https://sub.globalcirclecat.com/api/health --noproxy "*" -> 30/30 returned 200
typical total -> about 0.29s to 0.33s
observed spikes -> about 1.31s and 1.44s
```

Default curl path with local proxy environment:

```text
https://sub.globalcirclecat.com/api/health -> 30/30 returned 200
local proxy connect -> near 0s
typical total -> about 0.43s to 0.56s
observed spikes -> about 1.45s and 1.47s
```

Direct TCP `18388` loop:

```text
ss-sg.globalcirclecat.com:18388 -> 50/50 TCP success
typical connect latency -> about 93ms to 105ms
observed spikes -> about 1100ms and 1114ms
```

External HTTP comparison:

```text
https://www.baidu.com --noproxy "*" -> 10/10 returned 200
typical total -> about 0.13s to 0.15s after first request

https://www.baidu.com with default proxy environment -> 10/10 returned 200
typical total -> about 0.48s to 0.61s
observed spike -> about 0.99s
```

Follow-up interpretation:

```text
The local Wi-Fi to LAN gateway looked stable during this sample.
The local proxy processes were listening and the PAC endpoint was fast.
No TCP failure was captured to the production Shadowsocks port.
Short latency spikes were captured on both direct and local-proxy paths.
```

This points more toward intermittent upstream / international path latency, or
real-client Shadowsocks session behavior not reproduced by TCP connect checks,
than toward a local Wi-Fi drop or prod-edge-a host outage.

## Local Dual-Node Follow-Up

After the operator reported that both configured nodes were fluctuating, a
third local-device read-only pass sampled `prod-edge-a` and `prod-edge-b`
together.

Dual-node TCP `18388` connect loop:

```text
prod-edge-a 13.215.156.159:18388 -> 60/60 TCP success
prod-edge-b 18.136.102.226:18388 -> 60/60 TCP success

prod-edge-a typical connect latency -> about 90ms to 105ms
prod-edge-b typical connect latency -> about 90ms to 100ms

prod-edge-a observed spikes -> about 1094ms to 1105ms
prod-edge-b observed spike -> about 1096ms
```

No TCP failure was captured on either node. The spikes were short and did not
justify treating either node as down.

Local proxy end-to-end comparison:

```text
https://www.baidu.com with default proxy environment -> 30/30 returned 200
typical total -> about 0.48s to 0.61s
observed spikes -> about 1.50s to 1.52s

https://www.baidu.com --noproxy "*" -> 20/20 returned 200
typical total -> about 0.12s to 0.15s
observed failures -> none
```

Follow-up interpretation:

```text
Both production nodes were reachable from the local device.
Both nodes showed occasional TCP connect-latency spikes.
The local proxy path showed larger end-to-end latency spikes than direct
domestic HTTP.
Direct domestic HTTP remained stable during the same local session.
```

This strengthens the hypothesis that the operator-visible fluctuation is in
the local proxy / upstream ISP / international path / real Shadowsocks session
layer, not a single-node host outage. It also means promoting or demoting one
production node is not supported by this evidence alone.

## Local Clash / Mihomo Client Evidence

The next pass inspected local Clash Verge / Mihomo process state and recent
sidecar logs without printing raw subscription URLs, artifact paths, or tokens.

Local process / listener state:

```text
clash-verge -> running
verge-mihomo -> running
verge-mihomo listeners -> :53 and :7897
clash-verge PAC listener -> 127.0.0.1:33331
```

Recent sidecar log summary:

```text
recent sidecar files inspected -> 5
ss-sg.globalcirclecat.com occurrences -> 274
prod-edge-a IP occurrences -> 274
prod-edge-b IP occurrences -> 0
connect error: i/o timeout occurrences -> 274
TLS handshake-failed log occurrences -> 0
```

Sanitized representative error shape:

```text
[TCP] dial GLOBAL [local-redacted] --> [target-domain]:443
error: ss-sg.globalcirclecat.com:18388 connect error:
dial tcp [prod-edge-a-redacted]:18388: i/o timeout
```

Real proxy request sample through `127.0.0.1:7897`:

```text
https://www.google.com/generate_204 through local proxy
  5/10 returned 204
  5/10 failed after about 5s with local curl TLS receive failure

https://www.gstatic.com/generate_204 through local proxy
  4/10 returned 204
  6/10 failed after about 5s with local curl TLS receive failure

https://cp.cloudflare.com/generate_204 through local proxy
  8/10 returned 204
  2/10 failed after about 5s with local curl TLS receive failure
```

Direct comparison without the local proxy:

```text
https://www.google.com/generate_204 direct -> timed out after 5s
https://www.gstatic.com/generate_204 direct -> 204, total about 1.44s
https://cp.cloudflare.com/generate_204 direct -> 204, total about 1.45s
```

Client-layer interpretation:

```text
Mihomo logs confirm real proxy sessions are seeing i/o timeout to
ss-sg.globalcirclecat.com:18388.
The sampled recent client logs map those timeouts to the current production
Shadowsocks DNS / prod-edge-a path, not to prod-edge-b.
The dual-node TCP connect probes still showed both nodes reachable, so the
observed failure is more specific than simple TCP reachability.
```

This is now stronger evidence of real local-client proxy-session failure than
the earlier TCP-connect-only samples. It still does not prove prod-edge-a host
failure, because host-local checks, Aliyun checks, and direct TCP connect checks
were healthy. The next useful test is a controlled canary where Clash/Mihomo
actually selects `prod-edge-b` for the same probe traffic, then compares client
logs and request success rates.

## Local prod-edge-b-Only Canary Probe

To avoid mutating the operator's active Clash Verge profile, a temporary local
Mihomo diagnostic instance was started with a single `prod-edge-b` proxy and a
separate local proxy port:

```text
temporary local proxy -> 127.0.0.1:7898
selected node -> prod-edge-b only
production mutation -> none
active Clash Verge profile mutation -> none
temporary config directory -> deleted after the probe
```

The temporary config was derived from the active local profile and therefore
contained sensitive proxy material while the process was running. The raw config
and logs were not committed or pasted into this record.

prod-edge-b-only real proxy request sample:

```text
https://www.google.com/generate_204 through prod-edge-b-only proxy
  10/10 returned 204
  typical total -> about 0.29s to 0.40s

https://www.gstatic.com/generate_204 through prod-edge-b-only proxy
  10/10 returned 204
  typical total -> about 0.29s to 0.45s
  observed spike -> about 0.62s

https://cp.cloudflare.com/generate_204 through prod-edge-b-only proxy
  10/10 returned 204
  typical total -> about 0.34s to 0.67s
  observed spikes -> about 1.35s and 1.48s
```

Temporary Mihomo diagnostic log summary:

```text
i/o timeout -> 0
handshake errors -> 0
generic error / failed matches -> 0
```

Cleanup verification:

```text
temporary proxy 127.0.0.1:7898 -> no listener after cleanup
temporary controller 127.0.0.1:19098 -> no listener after cleanup
active Clash Verge processes -> still original clash-verge / verge-mihomo
temporary diagnostic directory -> removed
```

Canary interpretation:

```text
The active profile was selecting GLOBAL -> prod-edge-a.
Recent active-profile Mihomo logs showed i/o timeout on the ss-sg/prod-edge-a path.
The isolated prod-edge-b-only probe completed 30/30 real proxy requests without timeout.
```

This supports `prod-edge-b` as a useful mitigation candidate for the operator
device path, but it is still local-client evidence. Promoting `prod-edge-b` for
broader production traffic would require a separate Risk A production routing
or tenant-assignment approval.

## Aliyun SWAS Vantage

DNS:

```text
sub.globalcirclecat.com -> 13.215.156.159
ss-sg.globalcirclecat.com -> 13.215.156.159
```

HTTPS gateway:

```text
https://sub.globalcirclecat.com/api/health -> 30/30 returned 200
connect range -> 0.170071s to 0.381468s
total range -> 0.515195s to 0.758817s
```

Shadowsocks TCP:

```text
ss-sg.globalcirclecat.com:18388 -> 30/30 TCP success
```

ICMP:

```text
ping 13.215.156.159 -c 20 -W 1 -> 20 sent / 0 received / 100% loss
```

This second vantage also shows ICMP loss while HTTPS and TCP `18388` are
stable, which makes ICMP unsuitable as the main production-health signal here.

## prod-edge-a Host Vantage

AWS status:

```text
instance -> running
system status -> ok
instance status -> ok
```

Services:

```text
proxy-gateway-console.service -> active
proxy-gateway-ss.service -> active
nginx -> active
NRestarts -> 0 / 0 / 0
ExecMainStatus -> 0 / 0 / 0
```

Local app health:

```text
http://127.0.0.1:3456/api/health -> 10/10 returned 200
total range -> 0.000973s to 0.001152s
```

SQLite:

```text
/opt/proxy-gateway-minimal/.proxy-gateway/subscriptions.sqlite
pragma integrity_check -> ok
```

Listeners:

```text
0.0.0.0:80 -> listening
0.0.0.0:443 -> listening
0.0.0.0:18388 tcp -> listening
0.0.0.0:18388 udp -> listening
127.0.0.1:3456 -> listening
127.0.0.1:18180 -> listening
```

Resource summary:

```text
load average -> 0.08, 0.02, 0.01
memory available -> 1.4 GiB of 1.8 GiB
root disk -> 25% used
primary NIC RX/TX errors -> 0 / 0
primary NIC RX/TX drops -> 0 / 0
```

Network counters:

```text
IpInDiscards -> 0
IpOutDiscards -> 0
UdpInErrors -> 0
TcpRetransSegs -> 43163 cumulative since boot
```

`TcpRetransSegs` is cumulative and was not sampled as a rate in this preflight.
It is not enough by itself to prove a current incident while external TCP
success checks are passing.

Nginx / logging:

```text
nginx -t -> ok
active config literal $request_uri hits -> 0
proxy gateway access log token= count -> 0
/sub/a/* log entries observed -> redacted as /sub/a/[redacted]
nginx timeout / upstream failure grep counts -> 0
```

Raw access-log and journal lines were not copied into this record.

## prod-edge-b Comparison

The current Subscription V2 secondary / iteration node was checked only for TCP
reachability comparison.

Local Windows:

```text
18.136.102.226:18388 -> 20/20 TCP success
```

Aliyun SWAS:

```text
18.136.102.226:18388 -> 30/30 TCP success
ping 18.136.102.226 -c 20 -W 1 -> 20 sent / 0 received / 100% loss
```

Like prod-edge-a, prod-edge-b drops or does not answer ICMP from the checked
vantages while TCP `18388` succeeds.

## Interpretation

Evidence collected in this preflight does not show a prod-edge-a host failure,
Nginx gateway failure, HTTPS subscription gateway failure, or TCP `18388`
reachability failure.

Observed pattern:

```text
HTTP/HTTPS gateway -> healthy
opaque artifact refresh -> healthy
prod-edge-a local app -> healthy
prod-edge-a systemd/Nginx/SQLite/resources -> healthy
prod-edge-a TCP 18388 -> healthy from local and Aliyun vantages
prod-edge-b TCP 18388 -> healthy from local and Aliyun vantages
local Clash/Mihomo real proxy sessions -> i/o timeout observed to ss-sg/prod-edge-a path
local prod-edge-b-only real proxy canary -> 30/30 succeeded, no timeout observed
ICMP to prod-edge-a/prod-edge-b -> 100% loss from checked vantages
```

Conclusion:

```text
Current evidence points away from prod-edge-a host/Nginx/app failure.
ICMP loss appears non-actionable for this environment because TCP checks pass.
If users still see proxy timeout, the next investigation should focus on
client-side Clash/Mihomo behavior, Shadowsocks session-level behavior, ISP path
quality during real proxy traffic, or protocol/data-plane observability.
```

This record is inconclusive about UDP behavior and real Shadowsocks payload
quality. It only proves TCP reachability and HTTP/HTTPS gateway behavior during
the sampled window. The local-device follow-ups also captured intermittent
latency spikes across both production nodes and the local proxy path without
TCP-connect failures. Clash/Mihomo logs then confirmed real proxy-session
`i/o timeout` errors against the current `ss-sg` / prod-edge-a path. This
supports a client-path/data-plane incident, but still does not justify a
production restart, DNS change, or broad node promotion by itself. The
prod-edge-b-only local canary is materially better evidence for a targeted
operator-side mitigation or a narrow tenant/node assignment canary, but that
would still need separate approval.

## Recommended Next Actions

Do not restart services or change DNS based on this preflight alone.

Recommended follow-ups:

```text
1. Collect client-side Clash/Mihomo error timestamps and target node selected.
2. Add a controlled Shadowsocks end-to-end probe from the operator network.
3. Consider a prod-edge-b canary comparison only if real client traffic still fails.
4. Design data-plane observability / traffic accounting separately.
5. Keep mixed-protocol / obfuscation research separate from route-layer work.
6. If local-device fluctuation continues, compare Clash/Mihomo logs with direct
   domestic HTTP and default-proxy HTTP timestamps before changing production.
7. For the next diagnostic step, force or canary the same client probes through
   `prod-edge-b` and compare Mihomo logs before deciding whether to change
   production routing.
8. If mitigation is needed for the operator device, prefer a narrow
   prod-edge-b selection/canary over DNS-wide production changes.
```

Still not approved:

```text
DNS cutover
Nginx reload
service restart
artifact rotation
tenant migration
prod-edge-b promotion
traffic cutover
protocol stack change
```
