const REF = /^[A-Za-z0-9._:-]{1,128}$/;
function invalid() { throw Object.assign(new Error("recovery_counters_invalid"), { code: "recovery_counters_invalid" }); }
function counter(value) {
  if (typeof value === "string") {
    if (!/^(0|[1-9][0-9]*)$/.test(value)) invalid();
    value = Number(value);
  }
  if (!Number.isSafeInteger(value) || value < 0) invalid();
  return value;
}
// Recovery must never turn absent, duplicate or malformed counters into zero.
export function parseStrictXrayUserCounters(payload) {
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.stat)) invalid();
  const entries = new Map();
  for (const row of payload.stat) {
    if (!row || typeof row.name !== "string") invalid();
    if (/^(inbound|outbound)>>>[^>]+>>>traffic>>>(uplink|downlink)$/.test(row.name)) {
      counter(row.value);
      continue;
    }
    const match = /^user>>>([^>]+)>>>traffic>>>(uplink|downlink)$/.exec(row.name);
    if (!match || !REF.test(match[1])) invalid();
    const entry = entries.get(match[1]) || { edgeCredentialRef: match[1] };
    const field = match[2] === "uplink" ? "uploadBytes" : "downloadBytes";
    if (Object.hasOwn(entry, field)) invalid();
    entry[field] = counter(row.value);
    entries.set(match[1], entry);
  }
  for (const entry of entries.values()) {
    if (!Object.hasOwn(entry, "uploadBytes") || !Object.hasOwn(entry, "downloadBytes")) invalid();
    if (!Number.isSafeInteger(entry.uploadBytes + entry.downloadBytes)) invalid();
  }
  return [...entries.values()].sort((a, b) => a.edgeCredentialRef.localeCompare(b.edgeCredentialRef));
}

// Only the Xray statsquery CLI protobuf serializer can omit a scalar zero.
// Preserve missing rows/directions as missing and leave the generic parser strict.
export function parseXrayStatsCliProtobufUserCounters(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || !Array.isArray(payload.stat)) invalid();
  const stat = payload.stat.map(row => {
    if (!row || typeof row !== "object" || Array.isArray(row) || !Object.hasOwn(row, "name")) invalid();
    return Object.hasOwn(row, "value") ? row : { ...row, value: 0 };
  });
  return parseStrictXrayUserCounters({ ...payload, stat });
}
