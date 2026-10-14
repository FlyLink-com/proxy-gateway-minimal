// This gate is for a synthetic local frontend preview, not an Admin auth bypass.
export const THIRD_PARTY_NAMES_PREVIEW_HASH = "#/third-party-node-names-preview";

export function isThirdPartyNodeNamesPreviewEnabled(input: {
  dev?: boolean;
  prod?: boolean;
  hostname?: string;
  hash?: string;
} = {}) {
  const dev = input.dev ?? import.meta.env.DEV;
  const prod = input.prod ?? import.meta.env.PROD;
  const hostname = input.hostname ?? (typeof window === "undefined" ? "" : window.location.hostname);
  const hash = input.hash ?? (typeof window === "undefined" ? "" : window.location.hash);
  return dev === true && prod === false
    && ["127.0.0.1", "localhost", "[::1]", "::1"].includes(hostname)
    && hash === THIRD_PARTY_NAMES_PREVIEW_HASH;
}
