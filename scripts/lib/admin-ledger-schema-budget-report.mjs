import { createSchemaBudgetProbeParser } from "./admin-ledger-schema-budget-probe-supervisor.mjs";
import { assertNoDuplicateObjectKeys } from "../../server/services/deployment/strict-json-scan.mjs";

export const VERSION = "admin-ledger-schema-budget-report/v1";
export const MAX_REPORT_BYTES = 16384;
// Array positions are part of this version's wire contract. Null means unknown,
// not zero. CPU is microseconds; maxRSS is KiB high-water, not current memory;
// fsRead is the process resource counter, not bytes or proof of physical IO.
export const METRIC_FIELDS = Object.freeze({
  wallMs: "elapsed operation wall milliseconds",
  cpuUs: Object.freeze(["userUs", "systemUs"]),
  resources: Object.freeze(["minorFaults", "majorFaults", "fsRead", "voluntaryCS", "involuntaryCS", "maxRssKiB", "maxRssGrowthKiB"])
});
const CORE_CATEGORIES = new Set(["invalid_query", "source_unavailable", "scan_limit_exceeded", "integer_overflow",
  "diagnostic_unavailable", "cleanup_unconfirmed", "invalid_input", "import_failed"]);
const FIRST_FAILURES = new Set(["reader_timeout", "worker_io_error", "diagnostic_invalid", "spawn_failed", "cancelled"]);
const CATEGORIES = new Set(["accepted", ...CORE_CATEGORIES, ...FIRST_FAILURES, "incomplete_probe", "worker_exit"]);
const RESULT_FIELDS = ["ok", "category", "failureCategory", "workerClosed", "killRequested", "elapsedMs", "events"];

class ReportError extends Error {
  constructor(code = "invalid_report") { super(code === "report_too_large" ? "Schema budget report exceeds limit" : "Invalid schema budget report"); this.code = code; }
}
function requireThat(value) { if (!value) throw new ReportError(); }
function exact(value, fields) {
  requireThat(value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === fields.length && fields.every(key => Object.hasOwn(value, key)));
}
function boundedData(input) {
  let nodes = 0;
  const ancestors = new Set();
  const visit = (value, depth) => {
    requireThat(++nodes <= 5000 && depth <= 16);
    if (value === null || typeof value === "boolean") return value;
    if (typeof value === "number") { requireThat(Number.isFinite(value)); return value; }
    if (typeof value === "string") { requireThat(value.length <= 128); return value; }
    requireThat(value && typeof value === "object" && !ancestors.has(value));
    const array = Array.isArray(value), prototype = Object.getPrototypeOf(value);
    requireThat(array ? prototype === Array.prototype : prototype === Object.prototype || prototype === null);
    const names = Reflect.ownKeys(value);
    requireThat(names.every(key => typeof key === "string"));
    if (array) requireThat(value.length <= 70 && names.length === value.length + 1
      && names.every(key => key === "length" || /^(0|[1-9]\d*)$/.test(key) && Number(key) < value.length));
    ancestors.add(value);
    const output = array ? [] : {};
    for (const key of names) {
      if (array && key === "length") continue;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      requireThat(descriptor && Object.hasOwn(descriptor, "value") && descriptor.enumerable && key !== "__proto__");
      Object.defineProperty(output, key, { value: visit(descriptor.value, depth + 1), enumerable: true, writable: true, configurable: true });
    }
    ancestors.delete(value);
    return output;
  };
  return visit(input, 0);
}
function validateResult(input) {
  const result = boundedData(input);
  exact(result, RESULT_FIELDS);
  requireThat(typeof result.ok === "boolean" && typeof result.workerClosed === "boolean" && typeof result.killRequested === "boolean"
    && Number.isSafeInteger(result.elapsedMs) && result.elapsedMs >= 0 && CATEGORIES.has(result.category)
    && (result.failureCategory === null || FIRST_FAILURES.has(result.failureCategory)) && Array.isArray(result.events));
  const parser = createSchemaBudgetProbeParser();
  for (const event of result.events) parser.push(Buffer.from(`${JSON.stringify(event)}\n`));
  const terminal = parser.finish();
  if (result.ok) {
    requireThat(result.category === "accepted" && result.failureCategory === null && result.workerClosed && !result.killRequested && terminal?.ok === true);
  } else {
    requireThat(result.category !== "accepted");
    if (!result.workerClosed) {
      if (result.category === "cleanup_unconfirmed") requireThat(result.failureCategory !== null && result.killRequested);
      else requireThat(result.events.length === 0 && !result.killRequested
        && ((result.category === "cancelled" && result.failureCategory === null)
          || (result.category === "spawn_failed" && result.failureCategory === "spawn_failed")));
    } else if (result.failureCategory !== null) {
      requireThat(result.killRequested && result.category === result.failureCategory);
    } else {
      requireThat(!result.killRequested);
      if (CORE_CATEGORIES.has(result.category)) requireThat(terminal?.ok === false && terminal.category === result.category);
      else if (result.category === "worker_exit") requireThat(terminal?.ok === true);
      else if (result.category === "incomplete_probe") requireThat(terminal === null);
      else requireThat(result.category === "reader_timeout" || result.category === "diagnostic_invalid");
    }
  }
  return { ...result, events: parser.snapshot() };
}
function encodeEvent(event) {
  if (event.kind !== "probe" || !event.record.metrics) return event;
  const metrics = event.record.metrics;
  return { ...event, record: { ...event.record, metrics: {
    wallMs: metrics.wallMs,
    cpuUs: metrics.cpu.state === "unknown" ? null : METRIC_FIELDS.cpuUs.map(key => metrics.cpu[key]),
    resources: metrics.resource.state === "unknown" ? null : METRIC_FIELDS.resources.map(key => metrics.resource[key])
  } } };
}
function decodeMetrics(metrics) {
  exact(metrics, ["wallMs", "cpuUs", "resources"]);
  const values = (input, fields) => {
    if (input === null) return { state: "unknown" };
    requireThat(Array.isArray(input) && input.length === fields.length
      && input.every(value => Number.isSafeInteger(value) && value >= 0));
    return { state: "available", ...Object.fromEntries(fields.map((key, index) => [key, input[index]])) };
  };
  return { wallMs: metrics.wallMs, cpu: values(metrics.cpuUs, METRIC_FIELDS.cpuUs), resource: values(metrics.resources, METRIC_FIELDS.resources) };
}
function decodeEvent(event) {
  if (event?.kind !== "probe" || !Object.hasOwn(event.record ?? {}, "metrics")) return event;
  return { ...event, record: { ...event.record, metrics: decodeMetrics(event.record.metrics) } };
}
function guarded(action) {
  try { return action(); } catch (error) { throw error instanceof ReportError ? error : new ReportError(); }
}

export function serializeSchemaBudgetReport(input) {
  return guarded(() => {
    const result = validateResult(input);
    const text = JSON.stringify({ version: VERSION, result: { ...result, events: result.events.map(encodeEvent) } });
    if (Buffer.byteLength(text) > MAX_REPORT_BYTES) throw new ReportError("report_too_large");
    return text;
  });
}

export function parseSchemaBudgetReport(input) {
  return guarded(() => {
    requireThat(typeof input === "string" || Buffer.isBuffer(input));
    if (Buffer.byteLength(input) > MAX_REPORT_BYTES) throw new ReportError("report_too_large");
    const text = typeof input === "string" ? input : new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(input);
    // A JS string may contain lone UTF-16 surrogates; UTF-8 conversion must not
    // silently replace those before duplicate-key and structural validation.
    requireThat(new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(Buffer.from(text)) === text);
    assertNoDuplicateObjectKeys(text);
    const wire = boundedData(JSON.parse(text));
    exact(wire, ["version", "result"]); requireThat(wire.version === VERSION);
    exact(wire.result, RESULT_FIELDS); requireThat(Array.isArray(wire.result.events));
    return validateResult({ ...wire.result, events: wire.result.events.map(decodeEvent) });
  });
}
