#!/usr/bin/env node
import { runControlPlaneDatabaseSnapshotGateCli } from "./control-plane-db-snapshot-gate-lib.mjs";

process.exitCode = await runControlPlaneDatabaseSnapshotGateCli();
