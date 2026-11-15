import { runSyntheticCognitoScryptImportRehearsal } from "../server/services/platform/portal-cognito-scrypt-import-rehearsal.mjs";

if (process.argv.length > 2) {
  throw new Error("synthetic_cognito_rehearsal_accepts_no_arguments");
}

const receipt = runSyntheticCognitoScryptImportRehearsal();
process.stdout.write(JSON.stringify(receipt, null, 2) + "\n");
