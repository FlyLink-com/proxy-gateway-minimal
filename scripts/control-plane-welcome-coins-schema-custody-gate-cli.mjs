#!/usr/bin/env node
import { runWelcomeCoinsSchemaCustodyGateCli } from "./control-plane-welcome-coins-schema-custody-gate-lib.mjs";

process.exitCode = await runWelcomeCoinsSchemaCustodyGateCli();
