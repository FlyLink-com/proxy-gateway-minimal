import { createHash } from "node:crypto";
import { usageCycleForBinding } from "./usage-billing-cycle.mjs";

// Protocol multipliers are a quota charge on top of raw usage samples.
// They are not part of runtime identity, material digest, or credential refs.
export const PROTOCOL_RATING_MIGRATION_ID = "protocol-traffic-rating-v1";
// Only an admitted pre-switch version-1 pending may set this. A new commit cannot obtain it by omitting a decision or storing null.
export const PROTOCOL_RATING_JOURNAL_V1 = Symbol("protocol-rating-journal-v1");
export const PROTOCOL_RATING_DENOMINATOR = 10000n;
const MIN_UNITS = 1000n;
const MAX_UNITS = 100000n;
const ONE_UNITS = 10000n;
const MAX_SAFE_SQL_INTEGER = BigInt(Number.MAX_SAFE_INTEGER);
const PROTOCOLS = Object.freeze(["vless", "hy2", "tuic"]);
const CHANNEL_PROTOCOL = Object.freeze({
  "channel-vultr-a-vless-reality-tcp\0full_metering_xray_cumulative_v1": "vless",
  "channel-vultr-a-hy2\0full_metering_hy2_cumulative_v1": "hy2",
  "channel-vultr-a-tuic\0full_metering_tuic_connections_v1": "tuic"
});

const SCHEMA_SQL = `
create table if not exists platform_protocol_rating_migrations (
  id text primary key,
  checksum text not null,
  applied_at text not null
);
create table if not exists platform_protocol_rating_policies (
  version integer primary key check (version >= 1),
  vless_units integer not null,
  hy2_units integer not null,
  tuic_units integer not null,
  status text not null check (status in ('pending', 'active', 'superseded')),
  requested_at text not null,
  effective_not_before text not null,
  policy_digest text not null
);
create unique index if not exists platform_protocol_rating_one_pending
  on platform_protocol_rating_policies(status) where status = 'pending';
create unique index if not exists platform_protocol_rating_one_active
  on platform_protocol_rating_policies(status) where status = 'active';
create table if not exists platform_protocol_rating_baselines (
  account_id text not null,
  entitlement_id text not null,
  request_id text not null,
  cycle_key text not null,
  window_started_at text not null,
  boundary_observed_at text not null,
  observation text not null check (observation in ('unobserved', 'measured', 'measured_zero')),
  confirmed_upload_bytes integer,
  confirmed_download_bytes integer,
  confirmed_total_bytes integer,
  evidence_sample_count integer not null check (evidence_sample_count >= 0),
  policy_version integer not null,
  created_at text not null,
  primary key (account_id, entitlement_id, request_id, cycle_key)
);
create table if not exists platform_protocol_rating_charges (
  raw_sample_id text primary key,
  policy_version integer not null,
  protocol text not null,
  multiplier_units integer not null,
  raw_upload_bytes integer not null,
  raw_download_bytes integer not null,
  raw_total_bytes integer not null,
  charged_upload_bytes integer not null,
  charged_download_bytes integer not null,
  charged_total_bytes integer not null,
  carry_in integer not null,
  carry_out integer not null,
  account_id text not null,
  entitlement_id text not null,
  request_id text not null,
  cycle_key text not null,
  channel_ref text not null,
  source_ref text not null,
  created_at text not null
);
create table if not exists platform_protocol_rating_carry (
  account_id text not null,
  entitlement_id text not null,
  request_id text not null,
  cycle_key text not null,
  channel_ref text not null,
  protocol text not null,
  remainder integer not null check (remainder >= 0 and remainder < 10000),
  updated_at text not null,
  primary key (account_id, entitlement_id, request_id, cycle_key, channel_ref, protocol)
);
`;

export const PROTOCOL_RATING_SCHEMA_CHECKSUM = createHash("sha256").update(SCHEMA_SQL).digest("hex");

const fail = (code) => {
  throw Object.assign(new Error(code), { code });
};

function iso(value) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value) fail("rating_invalid");
  return value;
}

function bigintToSql(value, code = "rating_overflow") {
  if (typeof value !== "bigint" || value < 0n || value > MAX_SAFE_SQL_INTEGER) fail(code);
  return Number(value);
}

function sqlToBigint(value) {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  fail("rating_overflow");
}

export function protocolForChannel(channelRef, sourceRef) {
  return CHANNEL_PROTOCOL[`${channelRef}\0${sourceRef}`] || null;
}

export function multiplierUnitsFromDecimal(text) {
  if (typeof text !== "string" || !/^\d{1,2}(\.\d{1,4})?$/.test(text)) fail("rating_invalid");
  const [whole, fraction = ""] = text.split(".");
  const units = BigInt(whole) * PROTOCOL_RATING_DENOMINATOR + BigInt((fraction + "0000").slice(0, 4));
  if (units < MIN_UNITS || units > MAX_UNITS) fail("rating_invalid");
  return units;
}

export function decimalFromUnits(units) {
  const value = sqlToBigint(units);
  const whole = value / PROTOCOL_RATING_DENOMINATOR;
  const fraction = (value % PROTOCOL_RATING_DENOMINATOR).toString().padStart(4, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : `${whole}.0`;
}

export function chargeBytes({ rawUploadBytes, rawDownloadBytes, multiplierUnits, carryIn = 0n }) {
  const upload = sqlToBigint(rawUploadBytes);
  const download = sqlToBigint(rawDownloadBytes);
  const units = sqlToBigint(multiplierUnits);
  const carry = sqlToBigint(carryIn);
  if (units < MIN_UNITS || units > MAX_UNITS || carry >= PROTOCOL_RATING_DENOMINATOR) fail("rating_invalid");
  const rawTotal = upload + download;
  if (rawTotal <= 0n) fail("rating_invalid");
  const numerator = rawTotal * units + carry;
  const chargedTotal = numerator / PROTOCOL_RATING_DENOMINATOR;
  const carryOut = numerator % PROTOCOL_RATING_DENOMINATOR;
  const chargedUpload = (chargedTotal * upload) / rawTotal;
  const chargedDownload = chargedTotal - chargedUpload;
  for (const value of [chargedTotal, chargedUpload, chargedDownload, carryOut]) bigintToSql(value);
  return {
    rawUploadBytes: upload,
    rawDownloadBytes: download,
    rawTotalBytes: rawTotal,
    chargedUploadBytes: chargedUpload,
    chargedDownloadBytes: chargedDownload,
    chargedTotalBytes: chargedTotal,
    carryIn: carry,
    carryOut
  };
}

function tableExists(db, name) {
  return Boolean(db.prepare("select 1 from sqlite_master where type = 'table' and name = ?").get(name));
}

const RATING_TABLES = Object.freeze([
  "platform_protocol_rating_migrations",
  "platform_protocol_rating_policies",
  "platform_protocol_rating_baselines",
  "platform_protocol_rating_charges",
  "platform_protocol_rating_carry"
]);

export function protocolRatingSchemaInstalled(db) {
  return RATING_TABLES.every((name) => tableExists(db, name));
}

export function inspectProtocolTrafficRating(db) {
  if (!db || typeof db.prepare !== "function") fail("rating_target_unproven");
  const present = RATING_TABLES.filter((name) => tableExists(db, name));
  const missing = RATING_TABLES.filter((name) => !present.includes(name));
  let schema = "absent";
  let reason = "ready_to_apply";
  let recordedChecksum = null;
  if (present.length > 0 && missing.length > 0) {
    schema = "partial";
    reason = "partial_schema";
  } else if (missing.length === 0) {
    recordedChecksum = db.prepare("select checksum from platform_protocol_rating_migrations where id = ?")
      .get(PROTOCOL_RATING_MIGRATION_ID)?.checksum || null;
    if (recordedChecksum !== PROTOCOL_RATING_SCHEMA_CHECKSUM) {
      schema = "checksum_mismatch";
      reason = "checksum_mismatch";
    } else {
      schema = "installed";
      reason = "already_applied";
    }
  }
  return {
    ok: reason === "ready_to_apply" || reason === "already_applied",
    apply: "not_performed",
    migrationId: PROTOCOL_RATING_MIGRATION_ID,
    checksum: PROTOCOL_RATING_SCHEMA_CHECKSUM,
    recordedChecksum,
    schema,
    reason,
    objects: { required: [...RATING_TABLES], present, missing },
    rollback: {
      rawOnly: "allowed_only_without_non_identity_charge",
      snapshotRestore: "refused",
      restoringOneTimesMultiplierKeepsCharges: true
    }
  };
}

export function applyProtocolTrafficRatingMigration(db, { now }) {
  const appliedAt = iso(now);
  const existing = protocolRatingSchemaInstalled(db)
    ? db.prepare("select checksum from platform_protocol_rating_migrations where id = ?").get(PROTOCOL_RATING_MIGRATION_ID)
    : null;
  if (existing && existing.checksum !== PROTOCOL_RATING_SCHEMA_CHECKSUM) fail("rating_checksum_mismatch");
  db.exec(SCHEMA_SQL);
  if (!existing) {
    db.prepare("insert into platform_protocol_rating_migrations (id, checksum, applied_at) values (?, ?, ?)")
      .run(PROTOCOL_RATING_MIGRATION_ID, PROTOCOL_RATING_SCHEMA_CHECKSUM, appliedAt);
  }
  return { id: PROTOCOL_RATING_MIGRATION_ID, checksum: PROTOCOL_RATING_SCHEMA_CHECKSUM };
}

function policyRow(db, status) {
  return db.prepare("select * from platform_protocol_rating_policies where status = ?").get(status) || null;
}

function unitsOf(row) {
  return { vless: row.vless_units, hy2: row.hy2_units, tuic: row.tuic_units };
}

function policyDigest(version, units, requestedAt) {
  return createHash("sha256").update(JSON.stringify({
    version,
    vless: units.vless.toString(),
    hy2: units.hy2.toString(),
    tuic: units.tuic.toString(),
    requestedAt
  })).digest("hex");
}

export function protocolRatingRevision(db) {
  if (!protocolRatingSchemaInstalled(db)) return null;
  const migration = db.prepare("select checksum from platform_protocol_rating_migrations where id = ?").get(PROTOCOL_RATING_MIGRATION_ID);
  const rows = db.prepare("select version, status, vless_units, hy2_units, tuic_units from platform_protocol_rating_policies order by version").all();
  return createHash("sha256").update(JSON.stringify({ checksum: migration?.checksum || null, rows })).digest("hex");
}

function publicPolicy(row) {
  if (!row) return null;
  return {
    version: row.version,
    state: row.status,
    effectiveNotBefore: row.effective_not_before,
    multipliers: {
      vless: decimalFromUnits(row.vless_units),
      hy2: decimalFromUnits(row.hy2_units),
      tuic: decimalFromUnits(row.tuic_units)
    }
  };
}

export function readProtocolRatingStatus(db) {
  if (!protocolRatingSchemaInstalled(db)) {
    return { installed: false, revision: null, active: null, pending: null };
  }
  return {
    installed: true,
    revision: protocolRatingRevision(db),
    active: publicPolicy(policyRow(db, "active")),
    pending: publicPolicy(policyRow(db, "pending"))
  };
}

export function publishProtocolRatingPolicy(db, { vless, hy2, tuic, now, expectedRevision }) {
  if (!protocolRatingSchemaInstalled(db)) fail("rating_schema_required");
  const requestedAt = iso(now);
  const units = {
    vless: multiplierUnitsFromDecimal(vless),
    hy2: multiplierUnitsFromDecimal(hy2),
    tuic: multiplierUnitsFromDecimal(tuic)
  };
  db.transaction(() => {
    if (expectedRevision !== protocolRatingRevision(db)) fail("rating_conflict");
    const version = Number(db.prepare("select coalesce(max(version), 0) + 1 as version from platform_protocol_rating_policies").get().version);
    db.prepare("delete from platform_protocol_rating_policies where status = 'pending'").run();
    db.prepare(`insert into platform_protocol_rating_policies (
      version, vless_units, hy2_units, tuic_units, status, requested_at, effective_not_before, policy_digest
    ) values (?, ?, ?, ?, 'pending', ?, ?, ?)`).run(
      version,
      bigintToSql(units.vless),
      bigintToSql(units.hy2),
      bigintToSql(units.tuic),
      requestedAt,
      requestedAt,
      policyDigest(version, units, requestedAt)
    );
  })();
  return readProtocolRatingStatus(db);
}

export function activatePendingProtocolRatingPolicy(db, { now, version = null, policyDigest = null, expectedActiveVersion } = {}) {
  if (!protocolRatingSchemaInstalled(db)) fail("rating_schema_required");
  const at = iso(now);
  db.transaction(() => {
    const pending = policyRow(db, "pending");
    if (!pending) fail("rating_pending_missing");
    if (at < pending.effective_not_before) fail("rating_not_yet_effective");
    if (version !== null && Number(pending.version) !== Number(version)) fail("rating_conflict");
    if (policyDigest !== null && pending.policy_digest !== policyDigest) fail("rating_conflict");
    const active = policyRow(db, "active");
    if (expectedActiveVersion !== undefined && (active ? Number(active.version) : null) !== expectedActiveVersion) fail("rating_conflict");
    if (active) db.prepare("update platform_protocol_rating_policies set status = 'superseded' where version = ?").run(active.version);
    const changed = db.prepare("update platform_protocol_rating_policies set status = 'active' where version = ? and status = 'pending'").run(pending.version);
    if (changed.changes !== 1) fail("rating_conflict");
  })();
  return readProtocolRatingStatus(db);
}

function entitlementCycle(db, record) {
  if (!tableExists(db, "platform_entitlements")) fail("rating_cycle_unavailable");
  const row = db.prepare("select plan, valid_from as validFrom, valid_until as validUntil from platform_entitlements where id = ?").get(record.entitlementId);
  if (!row) fail("rating_cycle_unavailable");
  const cycle = usageCycleForBinding(row, record.observedAt);
  if (!cycle) fail("rating_cycle_unavailable");
  return { cycleKey: cycle.cadence === "lifetime" ? "lifetime" : cycle.startedAt, windowStartedAt: cycle.startedAt };
}

function baselineFor(db, record, cycleKey) {
  return db.prepare(`select * from platform_protocol_rating_baselines
    where account_id = ? and entitlement_id = ? and request_id = ? and cycle_key = ?`).get(
    record.accountId, record.entitlementId, record.requestId, cycleKey
  ) || null;
}

function sumRaw(db, scope, through) {
  const row = db.prepare(`select count(*) as count,
      coalesce(sum(upload_bytes), 0) as upload_bytes,
      coalesce(sum(download_bytes), 0) as download_bytes,
      coalesce(sum(total_bytes), 0) as total_bytes
    from platform_usage_samples
    where account_id = ? and entitlement_id = ? and request_id = ?
      and observed_at >= ? and observed_at <= ?`).get(
    scope.accountId, scope.entitlementId, scope.requestId, scope.windowStartedAt, through
  );
  return {
    count: Number(row.count),
    upload: sqlToBigint(row.upload_bytes),
    download: sqlToBigint(row.download_bytes),
    total: sqlToBigint(row.total_bytes)
  };
}

export function recordProtocolRatingBaseline(db, { accountId, entitlementId, requestId, cycleKey, windowStartedAt, boundaryObservedAt, observation, now, policyVersion = null }) {
  if (!protocolRatingSchemaInstalled(db)) fail("rating_schema_required");
  const at = iso(now);
  const boundary = iso(boundaryObservedAt);
  const windowStart = iso(windowStartedAt);
  if (!["unobserved", "measured", "measured_zero"].includes(observation)) fail("rating_invalid");
  if (typeof accountId !== "string" || typeof entitlementId !== "string" || typeof requestId !== "string" || typeof cycleKey !== "string") fail("rating_invalid");
  const active = policyRow(db, "active");
  const version = policyVersion === null ? active?.version : policyVersion;
  if (!Number.isInteger(version)) fail("rating_policy_missing");
  let confirmed = { upload: null, download: null, total: null, count: 0 };
  if (observation === "measured") {
    if (!tableExists(db, "platform_usage_samples")) fail("rating_baseline_unproven");
    const summed = sumRaw(db, { accountId, entitlementId, requestId, windowStartedAt: windowStart }, boundary);
    if (summed.count < 1 || summed.upload + summed.download !== summed.total) fail("rating_baseline_unproven");
    confirmed = { upload: summed.upload, download: summed.download, total: summed.total, count: summed.count };
  } else if (observation === "measured_zero") {
    confirmed = { upload: 0n, download: 0n, total: 0n, count: 0 };
  }
  const existing = db.prepare(`select * from platform_protocol_rating_baselines
    where account_id = ? and entitlement_id = ? and request_id = ? and cycle_key = ?`).get(accountId, entitlementId, requestId, cycleKey);
  const stored = {
    observation,
    upload: confirmed.upload === null ? null : bigintToSql(confirmed.upload),
    download: confirmed.download === null ? null : bigintToSql(confirmed.download),
    total: confirmed.total === null ? null : bigintToSql(confirmed.total),
    count: confirmed.count
  };
  if (existing) {
    const same = existing.observation === stored.observation
      && existing.confirmed_total_bytes === stored.total
      && existing.evidence_sample_count === stored.count
      && existing.boundary_observed_at === boundary
      && existing.window_started_at === windowStart;
    if (!same) fail("rating_baseline_conflict");
    return existing;
  }
  db.prepare(`insert into platform_protocol_rating_baselines (
    account_id, entitlement_id, request_id, cycle_key, window_started_at, boundary_observed_at,
    observation, confirmed_upload_bytes, confirmed_download_bytes, confirmed_total_bytes,
    evidence_sample_count, policy_version, created_at
  ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    accountId, entitlementId, requestId, cycleKey, windowStart, boundary, observation,
    stored.upload, stored.download, stored.total, stored.count, version, at
  );
  return db.prepare(`select * from platform_protocol_rating_baselines
    where account_id = ? and entitlement_id = ? and request_id = ? and cycle_key = ?`).get(accountId, entitlementId, requestId, cycleKey);
}

function decisionMatches(charge, decision, protocol) {
  return decision
    && decision.sampleId === charge.raw_sample_id
    && decision.policyVersion === charge.policy_version
    && decision.protocol === protocol
    && decision.protocol === charge.protocol
    && sqlToBigint(decision.multiplierUnits) === sqlToBigint(charge.multiplier_units);
}

function policyUnits(db, version, protocol) {
  const row = db.prepare("select * from platform_protocol_rating_policies where version = ?").get(version);
  if (!row || !PROTOCOLS.includes(protocol)) fail("rating_policy_missing");
  return sqlToBigint(row[`${protocol}_units`]);
}

export function applySampleRating(db, record, { decision, inserted, legacy }) {
  if (!protocolRatingSchemaInstalled(db)) {
    if (decision && typeof decision === "object") fail("rating_schema_required");
    return { mode: "legacy_raw" };
  }
  const protocol = protocolForChannel(record.channelRef, record.sourceRef);
  const cycle = entitlementCycle(db, record);
  const baseline = baselineFor(db, record, cycle.cycleKey);
  if (!baseline) {
    if (decision && typeof decision === "object") fail("rating_decision_unexpected");
    return { mode: "legacy_raw" };
  }
  const historical = record.observedAt <= baseline.boundary_observed_at;
  if (historical) {
    if (inserted) fail("rating_baseline_conflict");
    if (decision && typeof decision === "object") fail("rating_decision_unexpected");
    return { mode: "historical" };
  }
  if (!protocol) fail("rating_protocol_unmapped");
  if (legacy === "journal-v1" && decision === undefined) return { mode: "legacy_raw" };
  if (!decision || typeof decision !== "object") fail("rating_decision_required");
  const existing = db.prepare("select * from platform_protocol_rating_charges where raw_sample_id = ?").get(record.id);
  if (!inserted) {
    if (!existing) fail("rating_charge_missing");
    if (!decisionMatches(existing, decision, protocol)) fail("rating_replay_conflict");
    return { mode: "replayed", charge: existing };
  }
  if (existing) fail("rating_replay_conflict");
  const units = policyUnits(db, decision.policyVersion, protocol);
  if (decision.sampleId !== record.id || decision.protocol !== protocol || sqlToBigint(decision.multiplierUnits) !== units) fail("rating_policy_conflict");
  const carryKey = [record.accountId, record.entitlementId, record.requestId, cycle.cycleKey, record.channelRef, protocol];
  const carry = db.prepare(`select remainder from platform_protocol_rating_carry
    where account_id = ? and entitlement_id = ? and request_id = ? and cycle_key = ? and channel_ref = ? and protocol = ?`).get(...carryKey);
  const rated = chargeBytes({
    rawUploadBytes: record.uploadBytes,
    rawDownloadBytes: record.downloadBytes,
    multiplierUnits: units,
    carryIn: carry ? sqlToBigint(carry.remainder) : 0n
  });
  if (rated.rawTotalBytes !== sqlToBigint(record.totalBytes)) fail("rating_invalid");
  db.prepare(`insert into platform_protocol_rating_charges (
    raw_sample_id, policy_version, protocol, multiplier_units,
    raw_upload_bytes, raw_download_bytes, raw_total_bytes,
    charged_upload_bytes, charged_download_bytes, charged_total_bytes,
    carry_in, carry_out, account_id, entitlement_id, request_id, cycle_key,
    channel_ref, source_ref, created_at
  ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    record.id, decision.policyVersion, protocol, bigintToSql(units),
    bigintToSql(rated.rawUploadBytes), bigintToSql(rated.rawDownloadBytes), bigintToSql(rated.rawTotalBytes),
    bigintToSql(rated.chargedUploadBytes), bigintToSql(rated.chargedDownloadBytes), bigintToSql(rated.chargedTotalBytes),
    bigintToSql(rated.carryIn), bigintToSql(rated.carryOut),
    record.accountId, record.entitlementId, record.requestId, cycle.cycleKey,
    record.channelRef, record.sourceRef, record.createdAt
  );
  db.prepare(`insert into platform_protocol_rating_carry (
    account_id, entitlement_id, request_id, cycle_key, channel_ref, protocol, remainder, updated_at
  ) values (?, ?, ?, ?, ?, ?, ?, ?)
  on conflict(account_id, entitlement_id, request_id, cycle_key, channel_ref, protocol)
  do update set remainder = excluded.remainder, updated_at = excluded.updated_at`).run(
    ...carryKey, bigintToSql(rated.carryOut), record.createdAt
  );
  return { mode: "charged", chargedTotalBytes: rated.chargedTotalBytes };
}

export function readProtocolRatedUsage(db, filters) {
  if (!protocolRatingSchemaInstalled(db)) return { mode: "legacy_raw" };
  const clauses = ["request_id = ?"];
  const params = [filters.requestId];
  if (filters.accountId) {
    clauses.push("account_id = ?");
    params.push(filters.accountId);
  }
  if (filters.entitlementId) {
    clauses.push("entitlement_id = ?");
    params.push(filters.entitlementId);
  }
  if (filters.cycleKey) {
    clauses.push("cycle_key = ?");
    params.push(filters.cycleKey);
  }
  const baselines = db.prepare(`select * from platform_protocol_rating_baselines where ${clauses.join(" and ")}`).all(...params);
  if (baselines.length === 0) return { mode: "legacy_raw" };
  if (baselines.length !== 1) fail("rating_cycle_ambiguous");
  const baseline = baselines[0];
  if (filters.observedFrom && filters.observedFrom !== baseline.window_started_at) fail("rating_window_mismatch");
  const upper = filters.observedTo || "9999-12-31T23:59:59.999Z";
  const inclusive = filters.inclusiveEnd === true;
  const sampleSql = `select id, observed_at, upload_bytes, download_bytes, total_bytes
    from platform_usage_samples
    where account_id = ? and entitlement_id = ? and request_id = ?
      and observed_at >= ? and observed_at ${inclusive ? "<=" : "<"} ?`;
  const samples = tableExists(db, "platform_usage_samples")
    ? db.prepare(sampleSql).all(baseline.account_id, baseline.entitlement_id, baseline.request_id, baseline.window_started_at, upper)
    : [];
  const late = samples.filter((sample) => sample.observed_at > baseline.boundary_observed_at);
  const charges = late.length
    ? db.prepare(`select * from platform_protocol_rating_charges where raw_sample_id in (${late.map(() => "?").join(",")})`).all(...late.map((sample) => sample.id))
    : [];
  if (charges.length !== late.length) fail("rating_charge_missing");
  const byId = new Map(charges.map((charge) => [charge.raw_sample_id, charge]));
  let chargedUpload = 0n;
  let chargedDownload = 0n;
  let chargedTotal = 0n;
  let rawUpload = 0n;
  let rawDownload = 0n;
  let rawTotal = 0n;
  for (const sample of late) {
    const charge = byId.get(sample.id);
    if (!charge || charge.account_id !== baseline.account_id || charge.request_id !== baseline.request_id || charge.cycle_key !== baseline.cycle_key) fail("rating_charge_missing");
    if (sqlToBigint(charge.raw_total_bytes) !== sqlToBigint(sample.total_bytes)) fail("rating_inconsistent");
    chargedUpload += sqlToBigint(charge.charged_upload_bytes);
    chargedDownload += sqlToBigint(charge.charged_download_bytes);
    chargedTotal += sqlToBigint(charge.charged_total_bytes);
    rawUpload += sqlToBigint(sample.upload_bytes);
    rawDownload += sqlToBigint(sample.download_bytes);
    rawTotal += sqlToBigint(sample.total_bytes);
  }
  if (chargedUpload + chargedDownload !== chargedTotal) fail("rating_inconsistent");
  if (tableExists(db, "platform_usage_samples")) {
    const overlap = db.prepare(`select count(*) as count from platform_protocol_rating_charges charge
      join platform_usage_samples sample on sample.id = charge.raw_sample_id
      where charge.account_id = ? and charge.entitlement_id = ? and charge.request_id = ? and charge.cycle_key = ?
        and sample.observed_at <= ?`).get(
      baseline.account_id, baseline.entitlement_id, baseline.request_id, baseline.cycle_key, baseline.boundary_observed_at
    );
    if (Number(overlap.count) !== 0) fail("rating_historical_charge");
  }
  if (baseline.observation === "unobserved") {
    return {
      mode: "rated",
      historyUnobserved: true,
      uploadBytes: null,
      downloadBytes: null,
      totalBytes: null,
      rawUploadBytes: null,
      rawDownloadBytes: null,
      rawTotalBytes: null,
      chargedUploadBytes: null,
      chargedDownloadBytes: null,
      chargedTotalBytes: null
    };
  }
  if (baseline.confirmed_upload_bytes === null || baseline.confirmed_download_bytes === null || baseline.confirmed_total_bytes === null) {
    fail("rating_inconsistent");
  }
  const baseUpload = sqlToBigint(baseline.confirmed_upload_bytes);
  const baseDownload = sqlToBigint(baseline.confirmed_download_bytes);
  const baseTotal = sqlToBigint(baseline.confirmed_total_bytes);
  const usedUpload = baseUpload + chargedUpload;
  const usedDownload = baseDownload + chargedDownload;
  const usedTotal = baseTotal + chargedTotal;
  if (usedUpload + usedDownload !== usedTotal) fail("rating_inconsistent");
  return {
    mode: "rated",
    historyUnobserved: false,
    uploadBytes: bigintToSql(usedUpload),
    downloadBytes: bigintToSql(usedDownload),
    totalBytes: bigintToSql(usedTotal),
    rawUploadBytes: bigintToSql(baseUpload + rawUpload),
    rawDownloadBytes: bigintToSql(baseDownload + rawDownload),
    rawTotalBytes: bigintToSql(baseTotal + rawTotal),
    chargedUploadBytes: bigintToSql(usedUpload),
    chargedDownloadBytes: bigintToSql(usedDownload),
    chargedTotalBytes: bigintToSql(usedTotal)
  };
}

export function preferRatedUsage(controlStore, filters, rawSummary) {
  if (typeof controlStore?.readProtocolRatedUsage !== "function") return rawSummary;
  const rated = controlStore.readProtocolRatedUsage(filters);
  if (!rated || rated.mode !== "rated") return rawSummary;
  if (rated.historyUnobserved || rated.totalBytes === null) {
    return {
      ...rawSummary,
      ratingMode: "rated",
      historyUnobserved: true,
      uploadBytes: null,
      downloadBytes: null,
      totalBytes: null,
      chargedUploadBytes: null,
      chargedDownloadBytes: null,
      chargedTotalBytes: null
    };
  }
  return {
    ...rawSummary,
    ratingMode: "rated",
    uploadBytes: rated.uploadBytes,
    downloadBytes: rated.downloadBytes,
    totalBytes: rated.totalBytes,
    rawUploadBytes: rated.rawUploadBytes,
    rawDownloadBytes: rated.rawDownloadBytes,
    rawTotalBytes: rated.rawTotalBytes,
    chargedUploadBytes: rated.chargedUploadBytes,
    chargedDownloadBytes: rated.chargedDownloadBytes,
    chargedTotalBytes: rated.chargedTotalBytes
  };
}

export function freezeProtocolRatingDecisions(db, samples) {
  if (!protocolRatingSchemaInstalled(db)) return null;
  const active = policyRow(db, "active");
  const decisions = samples.map((sample) => {
    const record = sample.record || sample;
    const protocol = protocolForChannel(record.channelRef, record.sourceRef);
    let cycle;
    try { cycle = entitlementCycle(db, record); } catch { return null; }
    const baseline = baselineFor(db, record, cycle.cycleKey);
    if (!baseline || record.observedAt <= baseline.boundary_observed_at) return null;
    if (!protocol || !active) fail("rating_decision_required");
    const multiplierUnits = active[`${protocol}_units`];
    return { sampleId: record.id, policyVersion: active.version, protocol, multiplierUnits };
  });
  return decisions.some((decision) => decision) ? decisions : null;
}

export function assertRawOnlyRollbackAllowed(db) {
  if (!protocolRatingSchemaInstalled(db)) return { allowed: true, reason: "schema_absent" };
  const row = db.prepare("select count(*) as count from platform_protocol_rating_charges where multiplier_units != ?").get(Number(ONE_UNITS));
  if (Number(row.count) !== 0) fail("rating_raw_only_rollback_forbidden");
  return { allowed: true, reason: "no_non_identity_charge" };
}
