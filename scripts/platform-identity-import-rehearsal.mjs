import { runSyntheticPortalIdentityImportRehearsal } from "../server/services/platform/portal-identity-import-rehearsal.mjs";

if (process.argv.length > 2) {
  throw new Error("synthetic_identity_rehearsal_accepts_no_arguments");
}

const receipt = runSyntheticPortalIdentityImportRehearsal();
process.stdout.write(JSON.stringify(receipt, null, 2) + "\n");
