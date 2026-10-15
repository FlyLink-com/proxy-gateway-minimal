import Database from "better-sqlite3";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import { readFullMeteringBindings } from "../../scripts/lib/traffic-vless-recovery-baseline.mjs";

export const START = "2026-09-29T00:00:00.000Z";
export const NOW = "2026-10-01T00:00:01.000Z";
export const CHANNELS = ["channel-vultr-a-vless-reality-tcp", "channel-sgp-a-vless-reality-tcp",
  "channel-vultr-a-hy2", "channel-sgp-a-hy2", "channel-vultr-a-tuic"];
export const MATERIAL = `sha256:${"a".repeat(64)}`;

export function packFixture(t, channels = [CHANNELS[2]]) {
  const db = new Database(":memory:");
  const control = createSqliteSubscriptionControlStore({ database: db });
  t.after(() => { control.close(); db.close(); });
  control.createAccount({ id: "acct_meter_packs", ownerRef: "owner_meter_packs",
    status: "active", createdAt: START, updatedAt: START });
  let next = 0;
  function timed(channel = channels[0], { materialDigest = MATERIAL } = {}) {
    const suffix = String(++next);
    const accountId = "acct_meter_packs", entitlementId = `ent_meter_timed_${suffix}`;
    const requestId = `request_meter_timed_${suffix}`, edgeCredentialRef = `edge_meter_timed_${suffix}`;
    const until = "2027-09-29T00:00:00.000Z";
    control.createEntitlement({ id: entitlementId, accountId, plan: "yearly", status: "active",
      validFrom: START, validUntil: until, trafficLimitBytes: 1024 ** 3,
      createdAt: START, updatedAt: START });
    control.createIssuanceRequest({ id: requestId, accountId, entitlementId, approvalRef: `approval_meter_${suffix}`,
      status: "issued", quantity: 1, nodeId: channel, purpose: "portal_auto_issuance",
      requestedByRef: "fixture_issuer", createdAt: START, updatedAt: START });
    control.linkIssuedSubscription({ id: `link_meter_${suffix}`, requestId, tenantRef: `tenant_meter_${suffix}`,
      artifactRef: `artifact_meter_${suffix}`, status: "active", createdAt: START, updatedAt: START });
    control.upsertPortalAccessRequest({ id: requestId, portalUserRef: accountId, plan: "yearly",
      clientTarget: "clash", durationDays: 365, quantity: 1, status: "delivered",
      nextAction: "user_can_use_access", noteProvided: false, priorTrialState: "not_applicable",
      submittedAt: START, updatedAt: START, validUntil: until, entitlementRef: entitlementId,
      accessGrantRef: `grant_meter_${suffix}`, tenantId: `tenant_meter_${suffix}`,
      artifactId: `artifact_meter_${suffix}`, edgeChannelRef: channel, edgeCredentialRef,
      edgeMaterialDigest: materialDigest });
    return { accountId, entitlementId, requestId, edgeCredentialRef, channelRef: channel };
  }
  function pack({ channel = channels[0], gigabytes = 100, materialDigest = MATERIAL } = {}) {
    const suffix = String(++next);
    const accountId = "acct_meter_packs", orderRef = `order_meter_pack_${suffix}`;
    const commandRef = `command_meter_pack_${suffix}`, offerVersionRef = `offerv_pack_${gigabytes}gb_v1`;
    const quotaBytes = gigabytes * 1024 ** 3;
    const reservation = control.reserveCoinCommerceDataPackIssuance({
      commandRef, orderRef, accountId, offerVersionRef, quotaBytes, nodeId: channel, now: START });
    const issued = control.completeCoinCommerceDataPackIssuance({
      commandRef, orderRef, accountId, requestRef: reservation.requestRef,
      entitlementRef: reservation.entitlementRef, nodeId: channel, tenantRef: `tenant_meter_pack_${suffix}`,
      artifactRef: `artifact_meter_pack_${suffix}`, now: START });
    const edgeCredentialRef = `edge_meter_pack_${suffix}`;
    control.registerCoinCommerceDataPackEdgeCredential({ requestRef: reservation.requestRef,
      entitlementRef: reservation.entitlementRef, edgeChannelRef: channel, edgeCredentialRef,
      edgeMaterialDigest: materialDigest, now: START });
    const effect = control.applyCoinCommerceDataPackFulfillment({ commandRef, orderRef, accountId,
      requestRef: reservation.requestRef, entitlementRef: reservation.entitlementRef,
      issuedLinkRef: issued.issuedLinkRef, offerVersionRef, quotaBytes,
      technicalValidUntil: "9999-12-31T23:59:59.999Z", commercialNeverExpires: true, createdAt: START });
    return { accountId, orderRef, commandRef, requestId: reservation.requestRef,
      entitlementId: reservation.entitlementRef, edgeCredentialRef, channelRef: channel,
      quotaBytes, effectRef: effect.effectRef, linkRef: issued.issuedLinkRef };
  }
  const read = (at = NOW) => db.transaction(() => readFullMeteringBindings({
    db, databaseIdentityDigest: "b".repeat(64), channelRefs: channels, now: at
  }))();
  return { db, control, timed, pack, read, channels };
}
