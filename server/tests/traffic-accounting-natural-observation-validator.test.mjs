import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  buildTrafficAccountingNaturalObservation
} from "../../scripts/traffic-accounting-natural-observation.mjs";

const FIXTURE_PATH = resolve(
  "server/tests/fixtures/traffic-accounting-natural-observation/valid-cumulative-growth.json"
);
const SCRIPT_PATH = resolve("scripts/traffic-accounting-natural-observation.mjs");

function fixture() {
  return JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));
}

test("natural observation reports exact redacted cumulative accounting fields", () => {
  const report = buildTrafficAccountingNaturalObservation(fixture());

  assert.equal(report.passed, true);
  assert.equal(report.accounting.acceptedPositiveCursorGrowth, 50);
  assert.equal(report.accounting.cumulativeSampleBytes, 50);
  assert.equal(report.accounting.knownDeltaSourceCursorRows, 0);
  assert.equal(report.accounting.unclassifiedCursorRows, 0);
  assert.deepEqual(Object.keys(report.accounting), [
    "cursorCountBefore",
    "cursorCountAfter",
    "removedCursorCount",
    "newSampleCount",
    "newSampleBytes",
    "cumulativeSampleCount",
    "cumulativeSampleBytes",
    "acceptedPositiveCursorGrowth",
    "cumulativeZeroByteSamples",
    "cursorInitializations",
    "cursorResets",
    "cumulativeViolations",
    "knownDeltaSourceCursorRows",
    "unclassifiedCursorRows",
    "deltaSampleCount",
    "unclassifiedSampleRows",
    "sampleConservation",
    "rollupConservation",
    "uniqueDigests",
    "attributionInvalid",
    "overQuota"
  ]);

  const serialized = JSON.stringify(report);
  for (const forbidden of [
    "collector-synthetic-1",
    "channel-synthetic-1",
    "credential-synthetic-1",
    "account-synthetic-1",
    "entitlement-synthetic-1",
    "request-synthetic-1",
    "digest-synthetic-1"
  ]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test("natural observation rejects a cursor owned by a known delta source", () => {
  const input = fixture();
  input.current.cursorRows.push({
    source_ref: "mihomo_connection_delta",
    channel_ref: "channel-synthetic-delta",
    edge_credential_ref: "credential-synthetic-delta",
    upload_bytes: 0,
    download_bytes: 0,
    epoch: 1
  });

  const report = buildTrafficAccountingNaturalObservation(input);

  assert.equal(report.accounting.knownDeltaSourceCursorRows, 1);
  assert.equal(report.accounting.unclassifiedCursorRows, 1);
  assert.equal(report.passed, false);
});

test("natural observation accepts only explicitly known delta sample sources", () => {
  const input = fixture();
  input.current.newSamples.push({
    source_ref: "hysteria2_traffic_stats",
    channel_ref: "channel-synthetic-delta",
    edge_credential_ref: "credential-synthetic-delta",
    account_id: "account-synthetic-delta",
    entitlement_id: "entitlement-synthetic-delta",
    request_id: "request-synthetic-delta",
    total_bytes: 25,
    sample_digest: "digest-synthetic-delta"
  });
  input.current.sampleBoundary.count += 1;
  input.current.sampleBoundary.totalBytes += 25;
  input.current.rollupBoundary.totalBytes += 25;

  const report = buildTrafficAccountingNaturalObservation(input);

  assert.equal(report.accounting.deltaSampleCount, 1);
  assert.equal(report.accounting.unclassifiedSampleRows, 0);
  assert.equal(report.passed, true);
});

test("natural observation rejects samples without reviewed accounting mode evidence", () => {
  const input = fixture();
  input.current.newSamples.push({
    source_ref: "unreviewed_runtime_source",
    channel_ref: "channel-synthetic-unreviewed",
    edge_credential_ref: "credential-synthetic-unreviewed",
    account_id: "account-synthetic-unreviewed",
    entitlement_id: "entitlement-synthetic-unreviewed",
    request_id: "request-synthetic-unreviewed",
    total_bytes: 25,
    sample_digest: "digest-synthetic-unreviewed"
  });
  input.current.sampleBoundary.count += 1;
  input.current.sampleBoundary.totalBytes += 25;
  input.current.rollupBoundary.totalBytes += 25;

  const report = buildTrafficAccountingNaturalObservation(input);

  assert.equal(report.accounting.unclassifiedSampleRows, 1);
  assert.equal(report.passed, false);
});

test("natural observation fails closed when cumulative source evidence is missing", () => {
  const input = fixture();
  input.cumulativeSourceRefs = [];

  const report = buildTrafficAccountingNaturalObservation(input);

  assert.equal(report.accounting.unclassifiedCursorRows, 1);
  assert.equal(report.accounting.acceptedPositiveCursorGrowth, 0);
  assert.equal(report.passed, false);
});

test("natural observation rejects samples emitted during a cumulative reset", () => {
  const input = fixture();
  input.current.cursorRows[0].epoch = 2;
  input.current.cursorRows[0].upload_bytes = 10;
  input.current.cursorRows[0].download_bytes = 5;

  const report = buildTrafficAccountingNaturalObservation(input);

  assert.equal(report.accounting.cursorResets, 1);
  assert.equal(report.accounting.cumulativeViolations, 1);
  assert.equal(report.passed, false);
});

test("natural observation rejects duplicate sample digests and rollup drift", () => {
  const input = fixture();
  input.current.newSamples.push({
    ...input.current.newSamples[0],
    total_bytes: 0
  });
  input.current.sampleBoundary.count += 1;
  input.current.rollupBoundary.totalBytes += 1;

  const report = buildTrafficAccountingNaturalObservation(input);

  assert.equal(report.accounting.uniqueDigests, false);
  assert.equal(report.accounting.rollupConservation, false);
  assert.equal(report.passed, false);
});

test("natural observation rejects contradictory unresolved provenance", () => {
  const input = fixture();
  input.projection.accounting.unresolvedReasonCounts.channelMismatch = 0;
  input.projection.accounting.unresolvedReasonCounts.unknown = 1;

  const report = buildTrafficAccountingNaturalObservation(input);

  assert.equal(report.projection.provenanceConserved, false);
  assert.equal(report.passed, false);
});

test("natural observation input errors never echo protected fixture values", () => {
  const input = fixture();
  input.current.cursorRows[0].upload_bytes = "protected-marker-must-not-echo";

  assert.throws(
    () => buildTrafficAccountingNaturalObservation(input),
    (error) => {
      assert.equal(error.message, "traffic_accounting_observation_input_invalid");
      assert.equal(error.message.includes("protected-marker-must-not-echo"), false);
      return true;
    }
  );
});

test("natural observation requires a positive observation round", () => {
  const input = fixture();
  input.round = 0;

  assert.throws(
    () => buildTrafficAccountingNaturalObservation(input),
    /traffic_accounting_observation_input_invalid/
  );
});

test("natural observation CLI emits only the redacted report", () => {
  const result = spawnSync(process.execPath, [SCRIPT_PATH], {
    cwd: process.cwd(),
    encoding: "utf8",
    input: JSON.stringify(fixture())
  });

  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  const report = JSON.parse(result.stdout);
  assert.equal(report.passed, true);
  assert.equal(report.accounting.knownDeltaSourceCursorRows, 0);
  assert.equal(result.stdout.includes("credential-synthetic-1"), false);
  assert.equal(result.stdout.includes("account-synthetic-1"), false);
});

test("natural observation CLI fails safely without echoing invalid input", () => {
  const input = fixture();
  input.current.cursorRows[0].upload_bytes = "protected-cli-marker";
  const result = spawnSync(process.execPath, [SCRIPT_PATH], {
    cwd: process.cwd(),
    encoding: "utf8",
    input: JSON.stringify(input)
  });

  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.deepEqual(JSON.parse(result.stderr), {
    schemaVersion: "1",
    type: "traffic_accounting_natural_observation",
    state: "error",
    condition: "invalid_input"
  });
  assert.equal(result.stderr.includes("protected-cli-marker"), false);
});
