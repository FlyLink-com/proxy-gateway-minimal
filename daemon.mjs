import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createDaemonLauncher } from "./server/services/daemon-launcher.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
createDaemonLauncher({ rootDir: __dirname }).start();
process.exit(0);
