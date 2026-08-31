import { inspectControlPlaneDatabaseBoundary } from "./control-plane-db-snapshot-gate-lib.mjs";

export { inspectControlPlaneDatabaseBoundary };

const SCHEMA_VERSION = "1";
const TYPE = "control_plane_welcome_coins_schema_custody_gate";

function executionEnvelopeRequired() {
  const error = new Error("execution_envelope_required");
  error.name = "WelcomeCoinsSchemaCustodyGateError";
  error.condition = "execution_envelope_required";
  error.mutationPossible = false;
  return error;
}

export async function applyWelcomeCoinsSchemaUnderCustody() {
  throw executionEnvelopeRequired();
}

export async function runWelcomeCoinsSchemaCustodyGateCli({
  stderr = process.stderr
} = {}) {
  stderr.write(`${JSON.stringify({
    schemaVersion: SCHEMA_VERSION,
    type: TYPE,
    state: "blocked",
    condition: "execution_envelope_required"
  })}\n`);
  return 1;
}
