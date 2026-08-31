#!/usr/bin/env node

import { runWelcomeCoinsSchemaCustodyChildCli } from "./control-plane-db-snapshot-gate-lib.mjs";

process.exitCode = await runWelcomeCoinsSchemaCustodyChildCli();
