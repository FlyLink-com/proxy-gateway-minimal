import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { readFullMeteringDataPackBindings } from "../../scripts/lib/full-metering-data-pack-bindings.mjs";

const root = join(import.meta.dirname, "../..");
const read = (path) => readFileSync(join(root, path), "utf8");

const RATED = [
  "server/services/platform/protocol-traffic-rating.mjs",
  "server/services/platform/subscription-control-db.mjs",
  "server/services/platform/traffic-accounting.mjs",
  "server/services/platform/portal-access-requests.mjs",
  "server/services/platform/subscription-usage-monitor.mjs",
  "server/services/edge/data-pack-desired-state-rows.mjs",
  "server/routes/subscription.mjs",
  "scripts/lib/full-metering-data-pack-bindings.mjs",
  "scripts/lib/full-metering-sample-writer.mjs",
  "scripts/lib/full-metering-journal.mjs",
  "scripts/lib/full-metering-command.mjs",
  "scripts/lib/full-metering-collection.mjs",
  "scripts/lib/data-pack-full-metering-session.mjs"
];
const RAW_ALLOW = new Set([
  "server/services/platform/admin-usage-ledger-query.mjs",
  "server/services/platform/subscription-control-db.mjs",
  "scripts/profile-admin-usage-ledger.mjs",
  "scripts/lib/local-plan-switch-ui-profile.mjs",
  "scripts/lib/data-pack-physical-scenario.mjs"
]);

function filesUnder(directory) {
  const found = [];
  for (const name of readdirSync(directory)) {
    if (name === "node_modules" || name === "tests" || name.startsWith(".")) continue;
    const path = join(directory, name);
    if (statSync(path).isDirectory()) found.push(...filesUnder(path));
    else if (name.endsWith(".mjs") || name.endsWith(".js")) found.push(path);
  }
  return found;
}

test("rating call sites match the read write apply stop index", () => {
  for (const path of RATED) assert.equal(read(path).includes("protocol") || read(path).includes("rating") || read(path).includes("freezeRating"), true, path);
  assert.match(read("server/services/platform/subscription-control-db.mjs"), /applySampleRating/);
  assert.match(read("server/services/platform/subscription-control-db.mjs"), /readProtocolRatedUsage/);
  assert.doesNotMatch(read("server/app.mjs"), /applyProtocolTrafficRatingMigration/);
  assert.doesNotMatch(read("server/state.mjs"), /applyProtocolTrafficRatingMigration/);
  assert.doesNotMatch(read("server/services/platform/subscription-control-db.mjs"), /applyProtocolTrafficRatingMigration/);
  assert.doesNotMatch(read("server/services/platform/admin-usage-ledger-query.mjs"), /preferRatedUsage|readProtocolRatedUsage/);
  assert.match(read("server/routes/subscription.mjs"), /usage_observation_required/);
  assert.match(read("scripts/lib/full-metering-journal.mjs"), /version: 2/);
  assert.match(read("scripts/lib/full-metering-journal.mjs"), /admitPreRatingSwitchPending/);
  assert.doesNotMatch(read("scripts/lib/full-metering-collection.mjs"), /admitPreRatingSwitchPending/);
  assert.match(read("scripts/lib/full-metering-command.mjs"), /freezeProtocolRatingDecisions/);
  assert.match(read("scripts/lib/data-pack-full-metering-session.mjs"), /freezeProtocolRatingDecisions/);
  const missed = [];
  for (const directory of ["server", "scripts"]) {
    for (const file of filesUnder(join(root, directory))) {
      const relative = file.slice(root.length + 1).replaceAll("\\", "/");
      if (relative.includes("/tests/") || relative.endsWith(".test.mjs")) continue;
      const text = readFileSync(file, "utf8");
      if (!/from platform_usage_samples|listUsageSamples\(/.test(text)) continue;
      const rated = /readProtocolRatedUsage|preferRatedUsage|applySampleRating/.test(text);
      if (!rated && !RAW_ALLOW.has(relative)) missed.push(relative);
    }
  }
  assert.deepEqual(missed, []);
});

test("a data-pack database without pack tables does not query rating", () => {
  const db = new Database(":memory:");
  db.exec("create table platform_issuance_requests (id text, node_id text, purpose text)");
  const original = db.prepare.bind(db);
  db.prepare = (sql) => {
    if (String(sql).includes("platform_protocol_rating")) throw new Error("rating_queried");
    return original(sql);
  };
  const result = readFullMeteringDataPackBindings({
    db, channels: ["channel-vultr-a-hy2"], nowMs: Date.parse("2026-10-20T00:00:00.000Z"), sources: {}
  });
  assert.equal(result.hasSchema, false);
  assert.equal(result.entries.length, 0);
  db.close();
});

test("rating dry run reports a named target and refuses to apply", () => {
  const refused = spawnSync(process.execPath, ["scripts/protocol-traffic-rating-dry-run.mjs", "--apply", "--db", "Z:\\missing.sqlite"], { cwd: root, encoding: "utf8" });
  assert.equal(refused.status, 2);
  assert.equal(JSON.parse(refused.stdout).apply, "refused");
  const missing = spawnSync(process.execPath, ["scripts/protocol-traffic-rating-dry-run.mjs"], { cwd: root, encoding: "utf8" });
  assert.equal(missing.status, 2);
  assert.equal(JSON.parse(missing.stdout).reason, "target_required");
  const relative = spawnSync(process.execPath, ["scripts/protocol-traffic-rating-dry-run.mjs", "--db", "relative.sqlite"], { cwd: root, encoding: "utf8" });
  assert.equal(relative.status, 2);
  assert.equal(JSON.parse(relative.stdout).reason, "target_unproven");
  assert.match(read("scripts/lib/protocol-traffic-rating-lifecycle.mjs"), /withFullMeteringJournalLock/);
  assert.doesNotMatch(read("scripts/lib/full-metering-collection.mjs"), /runProtocolRatingLifecycle|admitPreRatingSwitchPending|protocol-traffic-rating-operator/);
  assert.doesNotMatch(read("server/app.mjs"), /runProtocolRatingLifecycle|protocol-traffic-rating-operator/);
  assert.doesNotMatch(read("server/state.mjs"), /runProtocolRatingLifecycle|protocol-traffic-rating-operator/);
  assert.doesNotMatch(read("server/routes/admin-subscription-distribution.mjs"), /runProtocolRatingLifecycle|protocol-traffic-rating-operator/);
});
