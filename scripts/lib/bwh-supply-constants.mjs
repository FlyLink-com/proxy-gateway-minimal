// One global-BWH host implementation consumes these fixed allowlists. These
// constants grant no execution authority and do not accept HTTP paths/units.
const protocols = Object.freeze({ vless: "xray-vless-reality.service", hy2: "hysteria2.service", tuic: "mihomo-tuic.service" });
export const SUBSCRIPTION_DISTRIBUTION_SUPPLY_UNITS = Object.freeze({ protocols,
  collectorTimer: "gccgw-full-metering-collect.timer", collectorService: "gccgw-full-metering-collect.service" });
const markerPath = "/var/lib/gccgw-bwh-supply-control/native-supply-paused";
export const SUBSCRIPTION_DISTRIBUTION_SUPPLY_GUARD = Object.freeze({ markerPath,
  content: `[Unit]\nConditionPathExists=!${markerPath}\n`,
  dropins: Object.freeze(Object.values(protocols).map(unit => Object.freeze({ unit,
    path: `/etc/systemd/system/${unit}.d/90-subscription-distribution-supply.conf` }))) });
