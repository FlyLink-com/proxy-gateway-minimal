import { redactedLastFailure, sanitizeDiagnosticsCounters } from "./diagnostics.mjs";

const SAFE_CANDIDATE_ID = /^[a-z0-9_-]{1,64}$/i;

function normalizeCandidateId(value) {
  const id = String(value ?? "").trim();
  if (!SAFE_CANDIDATE_ID.test(id)) {
    throw new Error("channel candidate id must be a non-secret identifier");
  }
  return id;
}

export function normalizeChannelCandidate(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("channel candidate must be an object");
  }
  if (!input.channel || typeof input.channel.openTcp !== "function") {
    throw new Error("channel candidate openTcp is required");
  }

  return {
    id: normalizeCandidateId(input.id),
    channel: input.channel
  };
}

export function createChannelManager({ candidates } = {}) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new Error("channel manager requires at least one candidate");
  }

  const normalizedCandidates = candidates.map((candidate) => normalizeChannelCandidate(candidate));
  const counters = {
    connectOk: 0,
    connectFailure: 0
  };
  let activeCandidateId = null;
  let lastFailure = null;

  return {
    async openTcp(target) {
      for (const candidate of normalizedCandidates) {
        try {
          const socket = await candidate.channel.openTcp(target);
          counters.connectOk += 1;
          activeCandidateId = candidate.id;
          lastFailure = null;
          return socket;
        } catch {
          counters.connectFailure += 1;
        }
      }

      lastFailure = { class: "channel_failure" };
      throw new Error("channel manager connect failed");
    },
    diagnosticsSnapshot() {
      return {
        ok: true,
        activeCandidateId,
        candidateIds: normalizedCandidates.map((candidate) => candidate.id),
        counters: sanitizeDiagnosticsCounters(counters),
        lastFailure: redactedLastFailure(lastFailure)
      };
    }
  };
}
