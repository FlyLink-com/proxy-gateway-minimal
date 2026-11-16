// One named lifecycle step. This file does not grant permission to run it.
import { runProtocolRatingOperator, readOperatorBaselines } from "./lib/protocol-traffic-rating-operator.mjs";

const FLAGS = new Set([
  "--action", "--db", "--journal", "--scope-digest", "--database-identity", "--metering-scope",
  "--now", "--expected-checkpoint", "--expected-policy-version", "--expected-policy-digest",
  "--expected-active-version", "--baselines", "--legacy-payload-digest"
]);

function refuse(action, error) {
  process.stdout.write(`${JSON.stringify({ ok: false, action, error })}\n`);
  process.exit(2);
}

function argumentsOf(argv) {
  const found = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!FLAGS.has(flag) || found.has(flag) || value === undefined || value.startsWith("--")) return null;
    found.set(flag, value);
  }
  return found;
}

const found = argumentsOf(process.argv.slice(2));
if (!found) refuse(null, "rating_operator_rejected");
const action = found.get("--action") || null;
const required = ["--action", "--db", "--journal", "--scope-digest", "--database-identity", "--now", "--expected-checkpoint"];
if (action === "activate") required.push("--expected-policy-version", "--expected-policy-digest", "--expected-active-version");
if (action === "baseline") required.push("--baselines");
if (found.has("--legacy-payload-digest") && action !== "drain") refuse(action, "rating_operator_rejected");
if (required.some((flag) => !found.has(flag)) || [...found.keys()].some((flag) => !required.includes(flag) && flag !== "--metering-scope" && flag !== "--legacy-payload-digest")) {
  refuse(action, "rating_operator_rejected");
}

const version = found.has("--expected-policy-version") ? Number(found.get("--expected-policy-version")) : undefined;
const previous = found.get("--expected-active-version");
let baselines;
try {
  baselines = found.has("--baselines") ? readOperatorBaselines(found.get("--baselines")) : undefined;
} catch (error) {
  refuse(action, error?.code || "rating_operator_rejected");
}

try {
  const receipt = await runProtocolRatingOperator({
    action,
    dbPath: found.get("--db"),
    directory: found.get("--journal"),
    context: {
      scopeDigest: found.get("--scope-digest"),
      databaseIdentityDigest: found.get("--database-identity"),
      ...(found.has("--metering-scope") ? { meteringScope: found.get("--metering-scope") } : {})
    },
    now: found.get("--now"),
    expectedCheckpointDigest: found.get("--expected-checkpoint"),
    ...(action === "baseline" ? { baselines } : {}),
    ...(action === "activate" ? {
      expectedPolicyVersion: version,
      expectedPolicyDigest: found.get("--expected-policy-digest"),
      expectedActiveVersion: previous === "none" ? null : Number(previous)
    } : {}),
    ...(found.has("--legacy-payload-digest") ? { legacyPayloadDigest: found.get("--legacy-payload-digest") } : {})
  });
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
  if (receipt.ok === false) process.exit(2);
} catch (error) {
  refuse(action, error?.code || "rating_operator_rejected");
}
