// Acceptance-only composition. Four explicitly synthetic quiet sources keep
// the real five-source contract intact; they are never physical evidence.
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { existsSync, lstatSync, realpathSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { readFullMeteringBindings } from "./traffic-vless-recovery-baseline.mjs";
import { FULL_METERING_CHANNELS, runFullMeteringCollection } from "./full-metering-collection.mjs";
import { createFullMeteringSourceDriver, fullMeteringRuntimeFingerprint } from "./full-metering-source-driver.mjs";
import { createFullMeteringSampleWriter } from "./full-metering-sample-writer.mjs";
import { fullMeteringDigest } from "./full-metering-journal.mjs";

const CHANNEL = "channel-vultr-a-hy2";
const fail = code => { throw Object.assign(new Error(code), { code }); };
const key = item => `${item.channelRef}\0${item.edgeCredentialRef}`;
const digestMaterial = material => `sha256:${createHash("sha256").update(material.uuid).update("\0").update(material.password).digest("hex")}`;

export function createDataPackFullMeteringSession({ database, controlStore, materialStore,
  transport, runDir, accountId, ownerRef, nowFn = () => new Date().toISOString() } = {}) {
  if (!database?.open || typeof database.transaction !== "function"
    || typeof controlStore?.getAccount !== "function" || typeof materialStore?.listCredentialMaterialSummaries !== "function"
    || !["physical_process", "synthetic_transport"].includes(transport?.evidenceMode)
    || typeof transport.readMeteringSnapshot !== "function" || typeof nowFn !== "function"
    || typeof runDir !== "string" || !isAbsolute(runDir)) fail("data_pack_metering_session_invalid");
  const directory = join(runDir, "full-metering-journal");
  const info = lstatSync(runDir), normalize = value => process.platform === "win32" ? value.toLowerCase() : value;
  if (!info.isDirectory() || info.isSymbolicLink() || normalize(realpathSync(runDir)) !== normalize(resolve(runDir))
    || existsSync(directory)) fail("data_pack_metering_workspace_invalid");
  const now = () => new Date(nowFn()).toISOString();
  const activationId = `acceptance_${randomUUID()}`;
  const context = { databaseIdentityDigest: fullMeteringDigest({ database: database.name, runDir: realpathSync(runDir), activationId }),
    scopeDigest: fullMeteringDigest(FULL_METERING_CHANNELS) };
  const channels = FULL_METERING_CHANNELS.map(source => source.channelRef);
  const read = channelRefs => database.transaction(() => readFullMeteringBindings({ db: database,
    databaseIdentityDigest: context.databaseIdentityDigest, channelRefs, now: now() }))();
  const requests = () => database.prepare("SELECT id,account_id,node_id FROM platform_issuance_requests ORDER BY id").all();
  const credentialScope = () => database.prepare(`SELECT request_id AS requestRef,edge_channel_ref AS channelRef,
    edge_credential_ref AS edgeCredentialRef FROM platform_portal_edge_credentials
    UNION ALL SELECT request_ref,edge_channel_ref,edge_credential_ref FROM platform_data_pack_edge_credentials
    ORDER BY requestRef,channelRef,edgeCredentialRef`).all();
  const account = controlStore.getAccount(accountId);
  const originalRows = requests();
  if (account?.ownerRef !== ownerRef || account.status !== "active" || originalRows.length !== 3
    || originalRows.some(row => row.account_id !== accountId || row.node_id !== CHANNEL)) fail("data_pack_metering_scope_invalid");
  const original = read([CHANNEL]);
  const originalKeys = new Set(original.entries.map(key));
  if (original.entries.length !== 3 || original.retainedBindings.length || credentialScope().length !== 3
    || credentialScope().some(entry => !originalKeys.has(key(entry)))) fail("data_pack_metering_scope_invalid");
  const synthetic = [];
  // These are explicit fixture-only control resources, not paid orders or live
  // principals. They never enter the actual Hy2 desired state or transport.
  database.transaction(() => {
    for (const [index, source] of FULL_METERING_CHANNELS.entries()) {
      if (source.channelRef === CHANNEL) continue;
      const suffix = `full_fixture_${index}`, at = now();
      const until = new Date(Date.parse(at) + 30 * 86400000).toISOString();
      const requestRef = `request_${suffix}`, entitlementRef = `entitlement_${suffix}`;
      const edgeCredentialRef = `edge_${suffix}`;
      const material = { uuid: randomUUID(), password: randomBytes(32).toString("base64") };
      const materialDigest = digestMaterial(material);
      controlStore.createEntitlement({ id: entitlementRef, accountId, plan: "monthly", status: "active",
        validFrom: at, validUntil: until, trafficLimitBytes: 1024 ** 3, createdAt: at, updatedAt: at });
      controlStore.createIssuanceRequest({ id: requestRef, accountId, entitlementId: entitlementRef,
        approvalRef: `approval_${suffix}`, status: "issued", quantity: 1, nodeId: source.channelRef,
        purpose: "portal_auto_issuance", requestedByRef: "synthetic_acceptance", createdAt: at, updatedAt: at });
      controlStore.linkIssuedSubscription({ id: `link_${suffix}`, requestId: requestRef,
        tenantRef: `tenant_${suffix}`, artifactRef: `artifact_${suffix}`, status: "active", createdAt: at, updatedAt: at });
      controlStore.upsertPortalAccessRequest({ id: requestRef, portalUserRef: accountId, plan: "monthly",
        clientTarget: "clash", durationDays: 30, quantity: 1, status: "delivered", nextAction: "user_can_use_access",
        noteProvided: false, priorTrialState: "not_applicable", submittedAt: at, updatedAt: at,
        validUntil: until, entitlementRef, accessGrantRef: `grant_${suffix}`, tenantId: `tenant_${suffix}`,
        artifactId: `artifact_${suffix}`, edgeChannelRef: source.channelRef, edgeCredentialRef, edgeMaterialDigest: materialDigest });
      synthetic.push({ channelRef: source.channelRef, edgeCredentialRef, materialDigest, material });
    }
  })();
  for (const entry of synthetic) materialStore.putCredentialMaterial({ credentialRef: entry.edgeCredentialRef,
    materialDigest: entry.materialDigest, material: entry.material });
  const requestDigest = fullMeteringDigest(requests());
  const credentialScopeDigest = fullMeteringDigest(credentialScope());
  const allowed = new Set([...original.entries, ...synthetic].map(key));
  const readInventory = () => {
    if (fullMeteringDigest(requests()) !== requestDigest || fullMeteringDigest(credentialScope()) !== credentialScopeDigest
      || controlStore.getAccount(accountId)?.ownerRef !== ownerRef) fail("data_pack_metering_scope_invalid");
    const inventory = read(channels), entries = [...inventory.entries, ...inventory.retainedBindings];
    if (entries.length !== allowed.size || entries.some(entry => !allowed.has(key(entry)))) fail("data_pack_metering_scope_invalid");
    return inventory;
  };
  const sources = FULL_METERING_CHANNELS.map((source, index) => ({ channelRef: source.channelRef,
    host: source.channelRef.startsWith("channel-sgp-") ? "sgp" : "local",
    kind: index < 2 ? "xray" : index < 4 ? "hy2" : "tuic",
    runtimeUnit: index < 2 ? "xray-vless-reality.service" : index < 4 ? "hysteria2.service" : "mihomo-tuic.service",
    // A logical acceptance descriptor, not production config-path evidence.
    configPath: `/acceptance_only/source_${index}/config` }));
  const readSources = createFullMeteringSourceDriver({ sources,
    readMaterial: () => ({ records: materialStore.listCredentialMaterialSummaries().map(item => ({
      credentialRef: item.credentialRef, materialDigest: item.materialDigest,
      material: materialStore.resolveCredentialMaterial(item.credentialRef) })) }),
    readSource: async source => {
      if (source.channelRef === CHANNEL) return transport.readMeteringSnapshot({
        credentialRefByRuntimeUser: source.credentialRefByRuntimeUser, nowFn: now });
      const entry = synthetic.find(item => item.channelRef === source.channelRef);
      const runtimeUser = source.kind === "tuic" ? entry.material.uuid : entry.edgeCredentialRef;
      return { generation: fullMeteringDigest({ syntheticSource: source.channelRef }),
        configDigest: fullMeteringDigest({ syntheticCredential: entry.edgeCredentialRef }), observedAt: now(),
        runtimeUsers: [{ runtimeUser, materialFingerprint: fullMeteringRuntimeFingerprint(source.kind, entry.material) }],
        observations: source.kind === "tuic" ? [] : [{ edgeCredentialRef: entry.edgeCredentialRef, uploadBytes: 0, downloadBytes: 0 }] };
    } });
  const applySamples = createFullMeteringSampleWriter({ database, controlStore, readBindings: readInventory });
  let closed = false, initialized = false;
  async function run(mode) {
    if (closed) fail("data_pack_metering_session_closed");
    if (mode === "initialize" ? initialized : !initialized) fail("data_pack_metering_session_state_invalid");
    const result = await runFullMeteringCollection({ directory, context, activationId, mode,
      nowFn: now, readInventory, readSources, applySamples,
      ...(mode === "collect-pack-resets" ? { dataPackResetStore: controlStore } : {}) });
    if (mode === "initialize") initialized = true;
    return result;
  }
  return Object.freeze({ evidenceMode: "full_metering_journal",
    initialize: () => run("initialize"), collect: () => run("collect"),
    async continueReset(input) {
      if (closed) fail("data_pack_metering_session_closed");
      if (input?.controlStore !== controlStore || input.proof?.accountId !== accountId
        || input.proof?.edgeChannelRef !== CHANNEL || input.resetScope?.rotationRef !== input.proof.rotationRef
        || input.resetScope?.orderRef !== input.proof.orderRef || input.resetScope?.accountId !== accountId) fail("data_pack_metering_reset_invalid");
      const proofs = controlStore.readCoinCommerceDataPackMeteringResetProofs({ now: now() });
      if (proofs.length !== 1 || fullMeteringDigest(proofs[0]) !== fullMeteringDigest(input.proof)) fail("data_pack_metering_reset_invalid");
      return run("collect-pack-resets");
    },
    close() { closed = true; } // Borrowed DB/material/transport are caller-owned.
  });
}
