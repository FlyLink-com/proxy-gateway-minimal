#!/usr/bin/env node
import { runDependencyArtifactCli } from "./control-plane-dependency-artifact-lib.mjs";

process.exitCode = await runDependencyArtifactCli();
