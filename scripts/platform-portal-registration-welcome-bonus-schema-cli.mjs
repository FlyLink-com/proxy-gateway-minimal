#!/usr/bin/env node
import { runPortalRegistrationWelcomeBonusSchemaCli } from "./platform-portal-registration-welcome-bonus-schema-lib.mjs";

const outcome = await runPortalRegistrationWelcomeBonusSchemaCli({
  argv: process.argv.slice(2)
});
process.stdout.write(`${JSON.stringify(outcome.output)}\n`);
process.exitCode = outcome.exitCode;
