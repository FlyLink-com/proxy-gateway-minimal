# Channel Measurement Bundles

This directory stores redacted, repository-safe measurement bundle fixtures.

Use these files to validate the channel measurement tooling against already
collected aggregate evidence. They are not runtime configuration, do not
activate channels, and must not contain secrets, tokens, subscription URLs,
customer data, raw logs, or server credentials.

These fixtures also are not current production-network status. If a result is
needed for a live channel decision, re-run the approved measurement workflow or
read a current execution record. Before importing bundles from old checkouts,
local artifacts, or release packages, read
`docs/CURRENT_SOURCE_AND_ARCHIVE_BOUNDARY.md`.

The `2026-05-26-channel-lab-a-hysteria2-short-canary` bundle captures the
first Hysteria2 operator-device and standalone Mihomo short-canary evidence.
It is intentionally below the extended-measurement gate because each source
contains only 20 HTTP samples.

The `2026-05-26-channel-lab-a-hysteria2-extended-measurement` bundle captures
the approved operator-device extended measurement. It contains three 60-sample
windows for the direct Hysteria2 client path and three 60-sample windows for
the standalone Mihomo path. Its generated bundle report is evidence for
operator review; it is not rollout approval.

The `2026-05-28-channel-lab-b-tuic-extended-measurement` bundle captures the
approved operator-device extended measurement for the standalone Mihomo -> TUIC
path. It contains three 60-sample windows and aggregate-only reports. Its
generated bundle and investigation reports are evidence for operator review;
they are not subscription-output activation approval.

Use `npm run channel:measurement-investigation -- <bundle-report.json>` to
turn a safe bundle report into a repository-local investigation summary. The
investigation report classifies hold patterns such as sustained tail latency or
isolated tail spikes and recommends the next review action without running new
probes, exposing raw local paths, changing node config, or approving runtime
rollout.
