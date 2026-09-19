// Stable production facade. HTTP behavior and shared Portal types stay public
// here; local/demo construction belongs to the preview facade.
export * from "./user-portal-types";
export { createHttpUserPortalClient } from "./user-portal-http";
