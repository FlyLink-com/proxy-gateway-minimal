#!/usr/bin/env node
import {
  runCandidateDependencyGateCli,
  runCandidateDependencyWorker
} from "./control-plane-candidate-dependency-gate-lib.mjs";

if (process.argv[2] === "--worker") {
  try {
    runCandidateDependencyWorker();
    process.exitCode = 0;
  } catch {
    process.exitCode = 70;
  }
} else {
  process.exitCode = await runCandidateDependencyGateCli();
}
