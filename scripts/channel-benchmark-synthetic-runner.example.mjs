#!/usr/bin/env node

const PROTOCOL_PROFILES = new Map([
  ["ss", { durationMs: 80, connectTimeMs: 20, timeToFirstByteMs: 50 }],
  ["vless", { durationMs: 104, connectTimeMs: 34, timeToFirstByteMs: 68 }],
  ["hysteria2", { durationMs: 112, connectTimeMs: 36, timeToFirstByteMs: 72 }],
  ["tuic", { durationMs: 118, connectTimeMs: 40, timeToFirstByteMs: 78 }]
]);

const QUALITY_OFFSETS = new Map([
  ["stable", { durationMs: 0, connectTimeMs: 0, timeToFirstByteMs: 0 }],
  ["weak-network", { durationMs: 32, connectTimeMs: 12, timeToFirstByteMs: 24 }]
]);

function metadataToken(value) {
  return String(value ?? "").trim().toLowerCase().replace(/[\s_]+/g, "-");
}

function addMetrics(profile, offset) {
  return {
    durationMs: profile.durationMs + offset.durationMs,
    connectTimeMs: profile.connectTimeMs + offset.connectTimeMs,
    timeToFirstByteMs: profile.timeToFirstByteMs + offset.timeToFirstByteMs
  };
}

export async function runProbe(probe) {
  const protocol = metadataToken(probe?.protocol);
  const qualityClass = metadataToken(probe?.qualityClass);
  const profile = PROTOCOL_PROFILES.get(protocol);

  if (!profile) {
    return {
      ok: false,
      durationMs: 0,
      connectTimeMs: 0,
      timeToFirstByteMs: 0,
      errorClass: "protocol_error"
    };
  }

  const offset = QUALITY_OFFSETS.get(qualityClass) ?? QUALITY_OFFSETS.get("stable");
  return {
    ok: true,
    ...addMetrics(profile, offset)
  };
}
