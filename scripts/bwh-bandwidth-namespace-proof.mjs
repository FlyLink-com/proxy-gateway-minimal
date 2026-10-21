import { writeSync } from "node:fs";

writeSync(1, '{"ok":false,"reason":"isolation_not_authorized"}\n');
process.exit(2);
