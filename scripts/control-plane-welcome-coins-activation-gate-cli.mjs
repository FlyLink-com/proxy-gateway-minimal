#!/usr/bin/env node
import { runWelcomeCoinsActivationGateCli } from "./control-plane-welcome-coins-activation-gate-lib.mjs";

process.exitCode = runWelcomeCoinsActivationGateCli();
