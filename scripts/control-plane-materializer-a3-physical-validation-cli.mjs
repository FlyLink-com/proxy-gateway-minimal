#!/usr/bin/env node
import { runA3PhysicalValidationCli } from "./control-plane-materializer-a3-physical-validation-lib.mjs";

process.exitCode = runA3PhysicalValidationCli();
