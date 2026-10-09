// Public, constant-only output. Never accepts a tenant, token, catalog or URL.
export const SUBSCRIPTION_RENEWAL_URL = "https://portal.gccwebos.com";
export const SUBSCRIPTION_EXPIRY_MESSAGE = "当前订阅已过期，请访问用户面板进行充值";

export function generateSubscriptionExpiryNotice({ providerOnly = false } = {}) {
  const labels = [SUBSCRIPTION_EXPIRY_MESSAGE, SUBSCRIPTION_RENEWAL_URL];
  const proxies = ["proxies:", ...labels.flatMap(name => [
    `  - name: ${JSON.stringify(name)}`,
    "    type: reject"
  ])];
  if (providerOnly) return [...proxies, ""].join("\n");
  return [
    "# Expired subscription: no service endpoints or credentials are included.",
    "mode: rule",
    "allow-lan: false",
    ...proxies,
    "proxy-groups:",
    '  - name: "GLOBAL"',
    "    type: select",
    "    proxies:",
    ...labels.map(name => `      - ${JSON.stringify(name)}`),
    "rules:",
    // Permit only the public panel and subscription-refresh host by direct access.
    // No provider is used, so a cached provider cannot supply stale endpoints.
    "  - DOMAIN,portal.gccwebos.com,DIRECT",
    "  - DOMAIN,sub.gccwebos.com,DIRECT",
    "  - MATCH,REJECT",
    ""
  ].join("\n");
}
