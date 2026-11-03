import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildNodeImageFirstBootPacket } from "../server/services/node-image-first-boot-packet.mjs";
import { buildNodeProvisioningDryRunPlan } from "../server/services/node-provisioning-dry-run.mjs";
import { buildVultrNodeProvisioningDryRun } from "../ops/node-provisioning/providers/vultr/adapter.mjs";

const PROFILE_PATH = fileURLToPath(new URL("../ops/node-provisioning/profiles/jp-01.json", import.meta.url));

function parseArguments(argv) {
  if (argv.length !== 2 || argv[0] !== "--profile" || argv[1] !== "jp-01") {
    throw new Error("node_provisioning_dry_run_requires_the_jp_01_profile");
  }
  return { profileRef: argv[1] };
}

function main(argv) {
  const { profileRef } = parseArguments(argv);
  if (profileRef !== "jp-01") throw new Error("node_provisioning_dry_run_profile_invalid");
  const profile = JSON.parse(readFileSync(PROFILE_PATH, "utf8"));
  const firstBootPacket = buildNodeImageFirstBootPacket(profile.firstBoot);
  const providerPlan = buildVultrNodeProvisioningDryRun({
    providerRef: profile.node.providerRef,
    regionRef: profile.node.regionRef,
    instancePlanRef: profile.installation.instancePlanRef,
    sizePlanRef: profile.installation.sizePlanRef,
    installationMethod: profile.installation.method,
    bootMode: profile.installation.bootMode,
    sizeDecisionApproved: profile.installation.sizeDecisionApproved,
    regionDecisionApproved: profile.installation.regionDecisionApproved
  });
  return buildNodeProvisioningDryRunPlan({ profile, firstBootPacket, providerPlan });
}

try {
  process.stdout.write(`${JSON.stringify(main(process.argv.slice(2)), null, 2)}\n`);
} catch {
  process.stderr.write("node_provisioning_dry_run_blocked: safe profile or evidence validation failed\n");
  process.exitCode = 1;
}
