# Channel Measurement Bundles

This directory stores redacted, repository-safe measurement bundle fixtures.

Use these files to validate the channel measurement tooling against already
collected aggregate evidence. They are not runtime configuration, do not
activate channels, and must not contain secrets, tokens, subscription URLs,
customer data, raw logs, or server credentials.

The `2026-05-26-channel-lab-a-hysteria2-short-canary` bundle captures the
first Hysteria2 operator-device and standalone Mihomo short-canary evidence.
It is intentionally below the extended-measurement gate because each source
contains only 20 HTTP samples.

The `2026-05-26-channel-lab-a-hysteria2-extended-measurement` bundle captures
the approved operator-device extended measurement. It contains three 60-sample
windows for the direct Hysteria2 client path and three 60-sample windows for
the standalone Mihomo path. Its generated bundle report is evidence for
operator review; it is not rollout approval.
