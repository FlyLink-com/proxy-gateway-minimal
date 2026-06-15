import assert from "node:assert/strict";
import test from "node:test";
import {
  buildChannelQualityMeasurementReport,
  normalizeChannelQualityObservations
} from "../services/channel-quality-measurement.mjs";

test("buildChannelQualityMeasurementReport separates client compatibility from network quality by channelRef", () => {
  const report = buildChannelQualityMeasurementReport(
    {
      observations: [
        {
          channelRef: "channel-vultr-a-vless-reality-tcp",
          nodeRef: "vultr-japan",
          source: "mihomo_urltest",
          clientProfile: "clash-verge-desktop",
          compatibility: "ok",
          measuredAt: "2026-06-15T08:00:00.000Z",
          latencyMs: 224,
          jitterMs: 12,
          packetLossRatio: 0,
          successRate: 1,
          timeoutRate: 0
        },
        {
          channelRef: "channel-sgp-a-hy2",
          nodeRef: "vultr-sgp",
          source: "cloudflare_speedtest",
          clientProfile: "clash-verge-desktop",
          compatibility: "ok",
          measuredAt: "2026-06-15T08:05:00.000Z",
          latencyMs: 262,
          jitterMs: 29,
          packetLossRatio: 0.215,
          successRate: 0.785,
          timeoutRate: 0.215,
          downloadMbps: 106,
          uploadMbps: 58.1
        },
        {
          channelRef: "channel-sgp-a-tuic",
          nodeRef: "vultr-sgp",
          source: "mihomo_urltest",
          clientProfile: "clash-verge-desktop",
          compatibility: "import_failed",
          measuredAt: "2026-06-15T08:10:00.000Z",
          latencyMs: null,
          jitterMs: null,
          packetLossRatio: null,
          successRate: 0,
          timeoutRate: 1
        }
      ]
    },
    { generatedAt: "2026-06-15T08:15:00.000Z" }
  );

  assert.deepEqual(report, {
    ok: true,
    mode: "channel-quality-measurement-report",
    generatedAt: "2026-06-15T08:15:00.000Z",
    channelCount: 3,
    observationCount: 3,
    summary: {
      autoCandidateCount: 1,
      keepOptionalCount: 1,
      clientBlockedCount: 1,
      unknownCount: 0
    },
    channels: [
      {
        channelRef: "channel-vultr-a-vless-reality-tcp",
        nodeRef: "vultr-japan",
        sampleCount: 1,
        latestMeasuredAt: "2026-06-15T08:00:00.000Z",
        clientCompatibility: "ok",
        qualityTier: "healthy",
        strategyAdvice: "auto_candidate",
        reasonCodes: ["network_quality_healthy"],
        metrics: {
          avgLatencyMs: 224,
          maxJitterMs: 12,
          maxPacketLossRatio: 0,
          minSuccessRate: 1,
          maxTimeoutRate: 0,
          maxDownloadMbps: null,
          maxUploadMbps: null
        }
      },
      {
        channelRef: "channel-sgp-a-hy2",
        nodeRef: "vultr-sgp",
        sampleCount: 1,
        latestMeasuredAt: "2026-06-15T08:05:00.000Z",
        clientCompatibility: "ok",
        qualityTier: "unstable",
        strategyAdvice: "keep_optional_collect_evidence",
        reasonCodes: ["packet_loss_high", "success_rate_low", "timeout_rate_high"],
        metrics: {
          avgLatencyMs: 262,
          maxJitterMs: 29,
          maxPacketLossRatio: 0.215,
          minSuccessRate: 0.785,
          maxTimeoutRate: 0.215,
          maxDownloadMbps: 106,
          maxUploadMbps: 58.1
        }
      },
      {
        channelRef: "channel-sgp-a-tuic",
        nodeRef: "vultr-sgp",
        sampleCount: 1,
        latestMeasuredAt: "2026-06-15T08:10:00.000Z",
        clientCompatibility: "import_failed",
        qualityTier: "client_blocked",
        strategyAdvice: "hold_for_template_or_client_fix",
        reasonCodes: ["client_compatibility_failed"],
        metrics: {
          avgLatencyMs: null,
          maxJitterMs: null,
          maxPacketLossRatio: null,
          minSuccessRate: 0,
          maxTimeoutRate: 1,
          maxDownloadMbps: null,
          maxUploadMbps: null
        }
      }
    ],
    evidence: {
      advisoryOnly: true,
      noProductionMutation: true,
      noSubscriptionOutputMutation: true,
      omittedFields: ["hosts", "ports", "tokens", "credentials", "subscriptionUrls", "rawLogs", "rawConfigs"]
    }
  });
});

test("normalizeChannelQualityObservations rejects unsafe endpoint and secret-shaped input", () => {
  assert.throws(
    () =>
      normalizeChannelQualityObservations([
        {
          channelRef: "channel-sgp-a-hy2",
          source: "cloudflare_speedtest",
          clientProfile: "desktop",
          compatibility: "ok",
          measuredAt: "2026-06-15T08:05:00.000Z",
          latencyMs: 262,
          packetLossRatio: 0.1,
          successRate: 0.9,
          server: "sgp.example.invalid"
        }
      ]),
    (error) => {
      assert.match(error.message, /channel quality observation contains unsupported field/);
      assert.doesNotMatch(error.message, /sgp\.example|server/);
      return true;
    }
  );

  assert.throws(
    () =>
      normalizeChannelQualityObservations([
        {
          channelRef: "channel-sgp-a-hy2",
          source: "cloudflare_speedtest",
          clientProfile: "desktop",
          compatibility: "ok",
          measuredAt: "2026-06-15T08:05:00.000Z",
          latencyMs: 262,
          packetLossRatio: 0.1,
          successRate: 0.9,
          notes: "subscription token leaked here"
        }
      ]),
    (error) => {
      assert.match(error.message, /channel quality observation contains unsafe text/);
      assert.doesNotMatch(error.message, /subscription token leaked/);
      return true;
    }
  );
});

test("buildChannelQualityMeasurementReport keeps missing measurements as advisory evidence only", () => {
  const report = buildChannelQualityMeasurementReport(
    {
      observations: [
        {
          channelRef: "channel-sgp-a-vless-reality-tcp",
          source: "operator_note",
          clientProfile: "unknown-client",
          compatibility: "not_tested",
          measuredAt: "2026-06-15T09:00:00.000Z"
        }
      ]
    },
    { generatedAt: "2026-06-15T09:05:00.000Z" }
  );

  assert.equal(report.channels[0].qualityTier, "unknown");
  assert.equal(report.channels[0].strategyAdvice, "collect_measurement_before_strategy_change");
  assert.deepEqual(report.channels[0].reasonCodes, ["client_compatibility_not_tested", "network_measurement_missing"]);
  assert.equal(report.evidence.noProductionMutation, true);
  assert.equal(report.evidence.noSubscriptionOutputMutation, true);
});
