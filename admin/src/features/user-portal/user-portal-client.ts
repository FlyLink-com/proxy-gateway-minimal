// Stable facade. Re-exports exactly the symbols that were originally public
// from the single user-portal-client.ts file. Internal helpers (file-local
// parsers/utilities) live in the split modules but are intentionally NOT
// re-exported here; cross-module consumers must import them directly from
// their owning module.
export * from "./user-portal-types";
export { createLocalUserPortalClient } from "./user-portal-local";
export { createHttpUserPortalClient } from "./user-portal-http";
export { createLocalPreviewInitialAccounts } from "./user-portal-parsers";