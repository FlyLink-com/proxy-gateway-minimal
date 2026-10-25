// Shared UTC window parsing for read-only operations aggregates.
// Calendar checks happen before Date so an impossible instant cannot throw
// RangeError or roll into a different real day.

const UTC_INSTANT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})Z$/;
const MONTH_LENGTHS = Object.freeze([31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]);

export const OPERATIONS_DAY_MS = 24 * 60 * 60 * 1000;
export const OPERATIONS_DEFAULT_SPAN_MS = 30 * OPERATIONS_DAY_MS;
export const OPERATIONS_MAX_SPAN_MS = 31 * OPERATIONS_DAY_MS;

function daysInMonth(year, month) {
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  return MONTH_LENGTHS[month - 1];
}

export function readUtcInstant(value) {
  if (typeof value !== "string") return null;
  const match = UTC_INSTANT.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const millisecond = Number(match[7]);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  if (hour > 23 || minute > 59 || second > 59) return null;
  let time;
  try {
    time = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  } catch {
    return null;
  }
  if (!Number.isFinite(time)) return null;
  let iso;
  try {
    iso = new Date(time).toISOString();
  } catch {
    return null;
  }
  return iso === value ? value : null;
}

export function isPlainQueryObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function parseUtcWindowPair(input, fail, maxSpanMs = OPERATIONS_MAX_SPAN_MS) {
  if (typeof fail !== "function") {
    throw new TypeError("parseUtcWindowPair requires fail");
  }
  if (!isPlainQueryObject(input)) fail("invalid_query");
  const keys = Object.keys(input);
  if (keys.length === 0) return null;
  if (keys.length !== 2 || !Object.hasOwn(input, "from") || !Object.hasOwn(input, "to")) {
    fail("invalid_query");
  }
  const from = readUtcInstant(input.from);
  const to = readUtcInstant(input.to);
  if (!from || !to) fail("invalid_query");
  const span = Date.parse(to) - Date.parse(from);
  if (!Number.isSafeInteger(span) || span <= 0 || span > maxSpanMs) fail("invalid_query");
  return { from, to };
}
