import { createHash } from "node:crypto";

// Closed cursors are not accounting records. Only a generation-bound fingerprint
// and its closure time are needed to reject accidental replay during retention.
// Keeping these in a packed, sorted buffer avoids one JS object/string per old
// connection and does not share the 100,000-live-observation admission limit.
export const FULL_METERING_CONNECTION_RETENTION_MS = 30 * 86400000;
export const FULL_METERING_CONNECTION_HISTORY_LIMIT = 2000000;
const RECORD_BYTES = 40;
const ENCODING = "sha256-uint64be-ms-v1";
const fail = () => { throw Object.assign(new Error("counter_connection_history_invalid"), { code: "counter_connection_history_invalid" }); };
const assert = condition => { if (!condition) fail(); };
const key = (generation, connectionId) => createHash("sha256").update(`${generation}\0${connectionId}`).digest();
const timeAt = (buffer, index) => Number(buffer.readBigUInt64BE(index * RECORD_BYTES + 32));
const hashAt = (buffer, index) => buffer.subarray(index * RECORD_BYTES, index * RECORD_BYTES + 32);
const encoded = buffer => ({ encoding: ENCODING, count: buffer.length / RECORD_BYTES, data: buffer.toString("base64") });

export function emptyFullMeteringConnectionHistory() { return encoded(Buffer.alloc(0)); }

export function readFullMeteringConnectionHistory(history, { minObservedAt, lastObservedAt }) {
  assert(history !== null && typeof history === "object" && !Array.isArray(history));
  assert([Object.prototype, null].includes(Object.getPrototypeOf(history)));
  const fields = Reflect.ownKeys(history);
  assert(fields.length === 3 && fields.every(field => ["encoding", "count", "data"].includes(field)
    && Object.hasOwn(Object.getOwnPropertyDescriptor(history, field), "value")));
  assert(history.encoding === ENCODING && Number.isSafeInteger(history.count)
    && history.count >= 0 && history.count <= FULL_METERING_CONNECTION_HISTORY_LIMIT);
  assert(typeof history.data === "string" && history.data.length === 4 * Math.ceil(history.count * RECORD_BYTES / 3));
  const buffer = Buffer.from(history.data, "base64");
  assert(buffer.length === history.count * RECORD_BYTES && buffer.toString("base64") === history.data);
  const minimum = Date.parse(minObservedAt), maximum = Date.parse(lastObservedAt);
  assert(Number.isSafeInteger(minimum) && minimum >= 0 && Number.isSafeInteger(maximum) && maximum >= minimum);
  for (let index = 0; index < history.count; index++) {
    const closedAt = timeAt(buffer, index);
    assert(Number.isSafeInteger(closedAt) && closedAt >= minimum && closedAt <= maximum);
    if (index > 0) assert(Buffer.compare(hashAt(buffer, index - 1), hashAt(buffer, index)) < 0);
  }
  return buffer;
}

export function hasFullMeteringClosedConnection(buffer, generation, connectionId) {
  const wanted = key(generation, connectionId);
  let low = 0, high = buffer.length / RECORD_BYTES;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const comparison = Buffer.compare(hashAt(buffer, middle), wanted);
    if (comparison === 0) return true;
    if (comparison < 0) low = middle + 1;
    else high = middle;
  }
  return false;
}

export function compactFullMeteringConnectionHistory(history, closedConnections, { minObservedAt, observedAt }) {
  const buffer = readFullMeteringConnectionHistory(history, { minObservedAt, lastObservedAt: observedAt });
  const cutoff = Date.parse(observedAt) - FULL_METERING_CONNECTION_RETENTION_MS;
  const additions = new Map();
  for (const connection of closedConnections) {
    if (connection.closedAt === null) continue;
    const closedAt = Date.parse(connection.closedAt);
    assert(Number.isSafeInteger(closedAt) && closedAt >= Date.parse(minObservedAt) && closedAt <= Date.parse(observedAt));
    if (closedAt < cutoff) continue;
    const fingerprint = key(connection.generation, connection.connectionId);
    const hex = fingerprint.toString("hex");
    const prior = additions.get(hex);
    assert(!prior || prior.closedAt === closedAt);
    additions.set(hex, { fingerprint, closedAt });
  }
  const sorted = [...additions.values()].sort((a, b) => Buffer.compare(a.fingerprint, b.fingerprint));
  // At most one extra observation batch is admitted. Bound allocation before
  // accepting it, then enforce the retained count after expired records leave.
  const retainedCount = (() => { let count = 0; for (let index = 0; index < history.count; index++) if (timeAt(buffer, index) >= cutoff) count++; return count; })();
  if (sorted.length === 0 && retainedCount === history.count) {
    // Most snapshots only advance active counters. Reuse the immutable packed
    // string instead of allocating/encoding the entire thirty-day history.
    return { history: { ...history }, buffer, expiredCount: 0, compactedCount: 0 };
  }
  assert(retainedCount + sorted.length <= FULL_METERING_CONNECTION_HISTORY_LIMIT + 100000);
  const output = Buffer.allocUnsafe((retainedCount + sorted.length) * RECORD_BYTES);
  let previousIndex = 0, addedIndex = 0, written = 0;
  const copyOld = index => { buffer.copy(output, written++ * RECORD_BYTES, index * RECORD_BYTES, (index + 1) * RECORD_BYTES); };
  const copyNew = item => { const offset = written++ * RECORD_BYTES; item.fingerprint.copy(output, offset); output.writeBigUInt64BE(BigInt(item.closedAt), offset + 32); };
  while (previousIndex < history.count || addedIndex < sorted.length) {
    if (previousIndex < history.count && timeAt(buffer, previousIndex) < cutoff) { previousIndex++; continue; }
    if (previousIndex === history.count) { copyNew(sorted[addedIndex++]); continue; }
    if (addedIndex === sorted.length) { copyOld(previousIndex++); continue; }
    const comparison = Buffer.compare(hashAt(buffer, previousIndex), sorted[addedIndex].fingerprint);
    if (comparison < 0) copyOld(previousIndex++);
    else if (comparison > 0) copyNew(sorted[addedIndex++]);
    else {
      assert(timeAt(buffer, previousIndex) === sorted[addedIndex].closedAt);
      copyOld(previousIndex++); addedIndex++;
    }
  }
  assert(written <= FULL_METERING_CONNECTION_HISTORY_LIMIT);
  const result = output.subarray(0, written * RECORD_BYTES);
  return { history: encoded(result), buffer: result, expiredCount: history.count - retainedCount, compactedCount: sorted.length };
}
