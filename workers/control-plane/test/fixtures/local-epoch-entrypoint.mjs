// Synthetic harness for the real G4 startup composition. Never installed.
import { runConfiguredCycle } from "../../../../agent/g4/configured-cycle.mjs";
import { validateBaseUrl, writeAppliedMaterials } from "../../../../agent/g4/run-once.mjs";
import { localEpochProvider } from "./local-epoch-handoff.mjs";

try {
  const result = await runConfiguredCycle({
    validateBaseUrl,
    writeAppliedMaterials,
    stagedAdapter: ({ baseUrl, nodeRef }) => localEpochProvider({
      baseUrl,
      nodeRef,
      handoffPath: process.env.GCCGW_G4_LOCAL_EPOCH_HANDOFF_FILE,
      publicKeyPath: process.env.GCCGW_G4_LOCAL_EPOCH_PUBLIC_KEY_FILE,
    }),
  });
  const { status, generation = null, stage = null, code = null } = result;
  console.log(JSON.stringify({ status, generation, stage, code }));
  if (status === "retry_later") process.exitCode = 3;
  if (status === "rejected") process.exitCode = 4;
} catch {
  console.log(JSON.stringify({ status: "error", code: "staged_startup_rejected" }));
  process.exitCode = 1;
}
