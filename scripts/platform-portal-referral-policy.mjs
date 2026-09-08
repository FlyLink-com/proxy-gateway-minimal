import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createPortalReferralService } from "../server/services/platform/portal-referral-service.mjs";
import {
  digest,
  policySnapshot,
  referralError,
} from "../server/services/platform/portal-referral-contract.mjs";

export function runPortalReferralPolicyCli(argv) {
  let service;
  try {
    const flags = new Map(),
      allowed = [
        "--mode",
        "--policy-path",
        "--db-path",
        "--confirm-policy-digest",
      ];
    for (let i = 0; i < argv.length; i += 2) {
      if (
        !allowed.includes(argv[i]) ||
        flags.has(argv[i]) ||
        !argv[i + 1] ||
        argv[i + 1].startsWith("--")
      )
        throw referralError("referral_request_invalid");
      flags.set(argv[i], argv[i + 1]);
    }
    const mode = flags.get("--mode"),
      path = flags.get("--policy-path"),
      dbPath = flags.get("--db-path");
    if (
      !["validate", "publish"].includes(mode) ||
      typeof path !== "string" ||
      !isAbsolute(path)
    )
      throw referralError("referral_request_invalid");
    const policy = policySnapshot(JSON.parse(readFileSync(path, "utf8"))),
      policyDigest = digest(JSON.stringify(policy));
    if (mode === "validate") {
      if (dbPath !== undefined || flags.has("--confirm-policy-digest"))
        throw referralError("referral_request_invalid");
      return { exitCode: 0, output: { ok: true, mode, policy, policyDigest } };
    }
    if (
      typeof dbPath !== "string" ||
      !isAbsolute(dbPath) ||
      flags.get("--confirm-policy-digest") !== policyDigest
    )
      throw referralError("referral_policy_confirmation_required");
    service = createPortalReferralService({ dbPath, rewardsEnabled: true });
    service.publishPolicy(policy);
    return { exitCode: 0, output: { ok: true, mode, policy, policyDigest } };
  } catch (error) {
    const safe = [
      "referral_request_invalid",
      "referral_policy_invalid",
      "referral_policy_confirmation_required",
      "referral_policy_retroactive",
      "referral_policy_immutable",
      "referral_schema_not_ready",
    ];
    return {
      exitCode: 2,
      output: {
        ok: false,
        reason: safe.includes(error.code)
          ? error.code
          : "referral_policy_unavailable",
      },
    };
  } finally {
    service?.close();
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const outcome = runPortalReferralPolicyCli(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(outcome.output)}\n`);
  process.exitCode = outcome.exitCode;
}
