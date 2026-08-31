#!/usr/bin/env node
import { runProductionStageControllerCli } from "./control-plane-production-stage-controller-lib.mjs";

process.exitCode = runProductionStageControllerCli();
