import { createHash, randomBytes, randomUUID } from "node:crypto";
import { existsSync, lstatSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { createSqliteSubscriptionControlStore } from "../../server/services/platform/subscription-control-db.mjs";
import { createSqliteSubscriptionStore } from "../../server/services/subscriptions/repository.mjs";
import { createSubscriptionCore } from "../../server/services/subscriptions/core.mjs";
import { createCoinCommerceDataPackRuntimeIssuer } from "../../server/services/platform/coin-commerce-data-pack-runtime-issuer.mjs";
import { createCoinCommerceDataPackMaterialEscrow } from "../../server/services/platform/coin-commerce-data-pack-material-escrow.mjs";
import { createCoinCommerceDataPackArtifactRotation } from "../../server/services/platform/coin-commerce-data-pack-artifact-rotation.mjs";
import { createCoinCommerceDataPackOrderDelivery } from "../../server/services/platform/coin-commerce-data-pack-order-delivery.mjs";
import { createCoinCommerceDataPackCredentialReset } from "../../server/services/platform/coin-commerce-data-pack-credential-reset.mjs";
import { createFileBackedEdgeCredentialMaterialStore } from "../../server/services/edge/credential-material-store.mjs";
import { createHysteria2UsageCollector } from "../../server/services/edge/hysteria2-usage-collector.mjs";
import { createTrafficAccountingService } from "../../server/services/platform/traffic-accounting.mjs";
import { createDataPlaneDesiredStateNotifier } from "../../server/services/edge/data-plane-desired-state-notifier.mjs";
import { createDataPlaneAgentService, hashDataPlaneAgentToken } from "../../server/services/edge/data-plane-agent-service.mjs";

const CHANNEL = "channel_wsl_data_pack";
const NODE = "node_wsl_data_pack";
const ACCOUNT = "acct_wsl_data_pack";
const OWNER = "owner_wsl_data_pack";
const UNTIL = "9999-12-31T23:59:59.999Z";
const GIB = 1024 ** 3;
const INITIAL_BYTES = 4096;
const EXHAUSTION_BYTES = 65536;
const EXHAUSTION_GAP = 32768;
const FILES = ["scenario-control.sqlite", "scenario-runtime.sqlite",
  "scenario-edge-material.json", "scenario-artifact-material.json"];
const scenarioFailures = new WeakSet();

function fail(code) {
  const error = new Error(`Data-pack acceptance stopped: ${code}`);
  error.code = code;
  scenarioFailures.add(error);
  throw error;
}

function requireTrue(value, code) { if (value !== true) fail(code); }
function equalStrings(left, right) {
  return Array.isArray(left) && Array.isArray(right)
    && [...left].sort().join("\0") === [...right].sort().join("\0");
}

function freshMaterial() {
  const material = { uuid: randomUUID(), password: randomBytes(32).toString("base64") };
  return { material, materialDigest: `sha256:${createHash("sha256")
    .update(material.uuid).update("\0").update(material.password).digest("hex")}` };
}

function seedTimedPlan(store, now) {
  const validUntil = new Date(Date.parse(now) + 30 * 86400000).toISOString();
  const resource = { requestRef: "pareq_wsl_timed", entitlementRef: "ent_wsl_timed",
    credentialRef: "edgecred_wsl_timed", ...freshMaterial() };
  store.createEntitlement({ id: resource.entitlementRef, accountId: ACCOUNT,
    plan: "monthly", status: "active", validFrom: now, validUntil,
    trafficLimitBytes: 500 * GIB, createdAt: now, updatedAt: now });
  store.createIssuanceRequest({ id: resource.requestRef, accountId: ACCOUNT,
    entitlementId: resource.entitlementRef, approvalRef: "approval_wsl_timed",
    status: "issued", quantity: 1, nodeId: CHANNEL, purpose: "portal_auto_issuance",
    requestedByRef: "portal_auto_issuer", createdAt: now, updatedAt: now });
  store.linkIssuedSubscription({ id: "link_wsl_timed", requestId: resource.requestRef,
    tenantRef: "tenantref_wsl_timed", artifactRef: "artifactref_wsl_timed",
    status: "active", createdAt: now, updatedAt: now });
  store.upsertPortalAccessRequest({ id: resource.requestRef, portalUserRef: OWNER,
    plan: "monthly", clientTarget: "clash", durationDays: 30, quantity: 1,
    status: "delivered", nextAction: "user_can_use_access", noteProvided: false,
    priorTrialState: "not_applicable", submittedAt: now, updatedAt: now,
    reviewedAt: now, reviewedByRef: "portal_auto_issuer", expiresAt: validUntil,
    validUntil, entitlementRef: resource.entitlementRef, accessGrantRef: "grant_wsl_timed",
    tenantId: "tenant_wsl_timed", artifactId: "artifact_wsl_timed",
    edgeChannelRef: CHANNEL, edgeCredentialRef: resource.credentialRef,
    edgeMaterialDigest: resource.materialDigest });
  return resource;
}

/**
 * No process or network operation is implemented here. The caller supplies a
 * bounded transport and owns start/close/cleanup, including failed scenarios.
 * applyState must use the real runtime adapter and return the exact generation,
 * desiredStateRef, digest set, credential count and positive restart/readback.
 * probe/transfer must create fresh authenticated connections; readStats must
 * return real clear=1 Traffic Stats only in physical_process mode. Unit-test
 * transports MUST declare synthetic_transport; their bytes are never physical.
 * The only synthetic usage is the explicitly reported near-quota baseline.
 */
export async function runDataPackPhysicalScenario({ runDir, transport, nowFn = () => new Date() } = {}) {
  if (!["physical_process", "synthetic_transport"].includes(transport?.evidenceMode)
    || ["applyState", "probeCredential", "transferCredential", "readStats", "recover"]
      .some((name) => typeof transport[name] !== "function")
    || typeof nowFn !== "function") fail("transport_contract_invalid");
  if (typeof runDir !== "string" || !isAbsolute(runDir)) fail("scenario_workspace_invalid");
  let directory;
  try { directory = lstatSync(runDir); } catch { fail("scenario_workspace_invalid"); }
  if (!directory.isDirectory() || directory.isSymbolicLink()
    || FILES.some((name) => existsSync(join(runDir, name)))) fail("scenario_workspace_not_fresh");

  const now = () => {
    const value = new Date(nowFn()).getTime();
    if (!Number.isFinite(value)) fail("scenario_clock_invalid");
    return new Date(value).toISOString();
  };
  let store;
  let runtimeStore;
  let escrow;
  try {
    store = createSqliteSubscriptionControlStore({ dbPath: join(runDir, FILES[0]) });
    runtimeStore = createSqliteSubscriptionStore({ dbPath: join(runDir, FILES[1]) });
    const materialStore = createFileBackedEdgeCredentialMaterialStore({ filePath: join(runDir, FILES[2]) });
    escrow = createCoinCommerceDataPackMaterialEscrow({ key: randomBytes(32), filePath: join(runDir, FILES[3]) });
    const core = createSubscriptionCore({ store: runtimeStore,
      proxyConfig: { servers: [{ id: CHANNEL, name: CHANNEL, region: "Local",
        host: "127.0.0.1", port: 25443, method: "aes-256-gcm",
        password: randomBytes(32).toString("base64") }], pingHosts: [], nginx: {} },
      publicSubscriptionBaseUrl: "https://acceptance.example.invalid", nowFn: () => new Date(now()) });
    const createdAt = now();
    store.createAccount({ id: ACCOUNT, ownerRef: OWNER, status: "active",
      createdAt, updatedAt: createdAt });

    // These are synthetic control resources, not paid Commerce orders. Use
    // real issuance/Core/escrow/rotation, but state the absent purchase lane.
    const claims = new Map();
    const resources = {};
    const commerceBoundary = {
      verifyCapturedFulfillmentClaim(input) {
        const expected = claims.get(input.orderRef);
        if (!expected || input.accountId !== ACCOUNT || input.commandRef !== expected.commandRef
          || input.leaseGeneration !== 1 || input.leaseToken !== "a".repeat(64)) fail("seed_claim_invalid");
        return { ...expected, delivery: { kind: "data_pack", neverExpires: true,
          trafficGb: expected.quotaBytes / GIB } };
      },
      getDeliveredOrderBinding({ accountId, orderRef }) {
        const pack = Object.values(resources).find((item) => item.orderRef === orderRef);
        return accountId === ACCOUNT && pack ? { kind: "data_pack", orderRef,
          offerVersionRef: pack.offerVersionRef, requestRef: pack.requestRef,
          entitlementRef: pack.entitlementRef } : null;
      }
    };
    const issuer = createCoinCommerceDataPackRuntimeIssuer({ commerceStore: commerceBoundary,
      controlStore: store, runtimeCore: core, materialEscrow: escrow, nodeId: CHANNEL,
      nowFn: () => new Date(now()) });
    for (const [label, suffix, trafficGb] of [["packA", "a", 100], ["packB", "b", 200]]) {
      const claim = { commandRef: `coincmd_wsl_pack_${suffix}`, orderRef: `coinord_wsl_pack_${suffix}`,
        accountId: ACCOUNT, offerVersionRef: `offerv_pack_${trafficGb}gb_v1`, quotaBytes: trafficGb * GIB };
      claims.set(claim.orderRef, claim);
      const issued = issuer.issue(claim, { leaseGeneration: 1, leaseToken: "a".repeat(64) });
      const pack = { ...claim, ...issued, credentialRef: `edgecred_wsl_pack_${suffix}`,
        ...freshMaterial(), seededBaselineBytes: 0, collectorObservedBytes: 0 };
      store.registerCoinCommerceDataPackEdgeCredential({ requestRef: pack.requestRef,
        entitlementRef: pack.entitlementRef, edgeChannelRef: CHANNEL,
        edgeCredentialRef: pack.credentialRef, edgeMaterialDigest: pack.materialDigest, now: now() });
      store.applyCoinCommerceDataPackFulfillment({ ...claim, requestRef: pack.requestRef,
        entitlementRef: pack.entitlementRef, issuedLinkRef: pack.issuedLinkRef,
        technicalValidUntil: UNTIL, commercialNeverExpires: true, createdAt: now() });
      resources[label] = pack;
    }
    resources.timedPlan = { ...seedTimedPlan(store, now()), seededBaselineBytes: 0, collectorObservedBytes: 0 };
    const allRefs = Object.values(resources).map((item) => item.credentialRef);
    for (const resource of Object.values(resources)) materialStore.putCredentialMaterial({
      credentialRef: resource.credentialRef, materialDigest: resource.materialDigest, material: resource.material });

    const notifier = createDataPlaneDesiredStateNotifier({ controlStore: store,
      servers: [{ name: CHANNEL, physicalNodeRef: NODE, runtimeAdapter: "remote-data-plane-handoff" }], nowFn: now });
    const agentToken = randomBytes(32).toString("hex");
    const agent = createDataPlaneAgentService({ controlStore: store, credentialMaterialStore: materialStore,
      nodes: [{ nodeRef: NODE, channelRefs: [CHANNEL], tokenSha256: hashDataPlaneAgentToken(agentToken) }],
      nowFn: () => new Date(now()) });
    const identity = agent.authenticate({ authorization: `Bearer ${agentToken}` });
    const accounting = createTrafficAccountingService({ controlStore: store, nowFn: now });
    const collector = createHysteria2UsageCollector({ channelRef: CHANNEL, nowFn: now,
      trafficReader: async (input) => {
        const raw = await transport.readStats(input);
        const map = raw?.traffic || raw?.stats || raw;
        if (!map || typeof map !== "object" || Array.isArray(map)) fail("collector_invalid_stats");
        if (Object.keys(map).some((ref) => !allRefs.includes(ref))) fail("collector_unmapped_stats");
        return raw;
      } });
    let lastCapture = now();
    async function collect(expectedRefs, { requireGrowth = false, requireEmpty = false } = {}) {
      // A clear-mode delta has no cursor. Keep source-test captures in distinct
      // milliseconds without manufacturing future observations (desired state
      // correctly excludes usage observed after its current wall clock).
      await new Promise((resolve) => setTimeout(resolve, 2));
      const collected = await collector.collect({ since: lastCapture });
      lastCapture = now();
      requireTrue(collected.ok, "collector_invalid_stats");
      if (requireEmpty && collected.observations.length) fail("recovery_duplicate_usage");
      const growth = new Map(expectedRefs.map((ref) => [ref, 0]));
      for (const observation of collected.observations) {
        if (!growth.has(observation.edgeCredentialRef)) fail("collector_scope_mismatch");
        const target = Object.values(resources).find((item) => item.credentialRef === observation.edgeCredentialRef);
        const recorded = accounting.recordUsageObservation(observation);
        if (!recorded.ok || recorded.sampleInserted !== true
          || recorded.requestId !== target.requestRef || recorded.entitlementId !== target.entitlementRef) {
          fail("collector_binding_mismatch");
        }
        const bytes = observation.uploadBytes + observation.downloadBytes;
        growth.set(target.credentialRef, growth.get(target.credentialRef) + bytes);
        target.collectorObservedBytes += bytes;
      }
      if (requireGrowth && [...growth.values()].some((bytes) => bytes <= 0)) fail("collector_no_growth");
      return growth;
    }
    const usage = (resource) => resource.orderRef ? store.readDataPackResourceUsage({
      accountId: ACCOUNT, orderRef: resource.orderRef, requestRef: resource.requestRef,
      entitlementRef: resource.entitlementRef, now: now() }).usage.usedBytes
      : store.listUsageSamples({ edgeCredentialRef: resource.credentialRef })
        .reduce((total, sample) => total + sample.uploadBytes + sample.downloadBytes, 0);
    let applyCount = 0;
    async function apply(reason, expectedRefs) {
      notifier.notifyOrderLifecycle({ reason, order: { edgeChannelRef: CHANNEL } });
      const desired = agent.getDesiredState(identity).desiredStates[0];
      if (!desired || !equalStrings(desired.edgeCredentialRefs, expectedRefs)) fail("desired_state_scope_mismatch");
      const credentials = desired.materialDigests.map((item) => ({ credentialRef: item.edgeCredentialRef,
        materialDigest: item.digest, material: materialStore.resolveCredentialMaterial(item.edgeCredentialRef) }));
      const receipt = await transport.applyState({ desiredStateRef: desired.desiredStateRef,
        generation: desired.generation, materialDigests: desired.materialDigests, credentials });
      if (receipt?.status !== "applied" || receipt.desiredStateRef !== desired.desiredStateRef
        || receipt.generation !== desired.generation || receipt.credentialCount !== credentials.length
        || !equalStrings(receipt.materialDigests, desired.materialDigests.map((item) => item.digest))
        || receipt.configTest !== true || receipt.serviceActive !== true || receipt.listenerPresent !== true
        || receipt.restarted !== true) fail("apply_receipt_mismatch");
      const recorded = agent.recordReceipt(identity, { type: "gccgw_data_plane_apply_receipt",
        nodeRef: NODE, channelRef: CHANNEL, desiredStateRef: receipt.desiredStateRef,
        generation: receipt.generation, status: "applied", configTest: true,
        serviceActive: true, listenerPresent: true, credentialCount: receipt.credentialCount,
        materialDigests: receipt.materialDigests, appliedAt: now() });
      if (recorded.status !== "applied") fail("apply_receipt_mismatch");
      applyCount += 1;
    }
    const credential = (resource, material = resource.material) => ({ credentialRef: resource.credentialRef, material });
    async function probe(resource, slot, expectedAllowed, material = resource.material) {
      const result = await transport.probeCredential(credential(resource, material), { slot, expectedAllowed });
      if (result?.allowed !== expectedAllowed) fail("credential_probe_mismatch");
      return result.allowed;
    }
    async function transfer(resource, slot, bytes) {
      const result = await transport.transferCredential(credential(resource), { slot, bytes });
      if (result?.transferredBytes !== bytes) fail("traffic_transfer_mismatch");
    }
    await apply("physical_acceptance_initial", allRefs);
    await collect(allRefs, { requireEmpty: true });
    for (const [slot, resource] of Object.values(resources).entries()) {
      await probe(resource, slot, true);
      await transfer(resource, slot, INITIAL_BYTES);
      await collect([resource.credentialRef], { requireGrowth: true });
    }
    const a = resources.packA;
    const b = resources.packB;
    const timed = resources.timedPlan;
    a.seededBaselineBytes = a.quotaBytes - usage(a) - EXHAUSTION_GAP;
    if (!Number.isSafeInteger(a.seededBaselineBytes) || a.seededBaselineBytes <= 0) fail("baseline_out_of_bounds");
    const baselineAt = now();
    const baseline = accounting.recordUsageObservation({ accountingMode: "delta",
      sourceRef: "synthetic_quota_baseline", channelRef: CHANNEL, edgeCredentialRef: a.credentialRef,
      observedAt: baselineAt, intervalStartedAt: baselineAt, intervalEndedAt: baselineAt,
      uploadBytes: a.seededBaselineBytes, downloadBytes: 0 });
    if (!baseline.ok || baseline.status !== "within_quota" || usage(a) >= a.quotaBytes) fail("baseline_out_of_bounds");
    await transfer(a, 0, EXHAUSTION_BYTES);
    const crossing = await collect([a.credentialRef], { requireGrowth: true });
    if (crossing.get(a.credentialRef) < EXHAUSTION_GAP || usage(a) < a.quotaBytes) fail("quota_not_crossed_by_collector");
    await apply("physical_acceptance_exhaustion", [b.credentialRef, timed.credentialRef]);
    const newConnections = { packA: await probe(a, 0, false),
      packB: await probe(b, 1, true), timedPlan: await probe(timed, 2, true) };
    await collect([b.credentialRef, timed.credentialRef]);

    const delivery = createCoinCommerceDataPackOrderDelivery({ commerceStore: commerceBoundary,
      controlStore: store, runtimeCore: core, materialEscrow: escrow, nowFn: now });
    const beforeHandoff = delivery.get({ accountId: ACCOUNT, orderRef: b.orderRef });
    const artifactSecret = (url) => decodeURIComponent(new URL(url).pathname
      .slice("/sub/a/".length).replace(/\.yaml$/, ""));
    if (!core.resolveSubscriptionArtifact(artifactSecret(beforeHandoff.subscriptionUrl)).ok) {
      fail("artifact_initial_access_failed");
    }
    const oldMaterial = b.material;
    const usedBytesBefore = usage(b);
    const resetInput = { accountId: ACCOUNT, orderRef: b.orderRef, rotationRef: "packrot_wsl_once" };
    const reset = createCoinCommerceDataPackCredentialReset({ commerceStore: commerceBoundary,
      controlStore: store, materialStore, desiredStateNotifier: notifier,
      artifactRotation: createCoinCommerceDataPackArtifactRotation({ commerceStore: commerceBoundary,
        controlStore: store, runtimeCore: core, materialEscrow: escrow, nowFn: now }), nowFn: now });
    // Park at the durable gate, then apply asynchronously. This is the source
    // reset's normal pending-receipt boundary, not a physical-run retry.
    let pending = false;
    try { reset.rotate(resetInput); }
    catch (error) { pending = error.code === "coin_commerce_data_pack_reset_reconciliation_required"; }
    const intent = store.beginCoinCommerceDataPackCredentialReset({ ...resetInput, now: now() });
    if (!pending || intent.status !== "material_committed") fail("reset_pending_gate_mismatch");
    if (delivery.get({ accountId: ACCOUNT, orderRef: b.orderRef }).subscriptionUrl !== beforeHandoff.subscriptionUrl) {
      fail("artifact_rotated_before_apply");
    }
    await apply("coin_commerce_data_pack_credential_reset", [b.credentialRef, timed.credentialRef]);
    const completion = reset.rotate(resetInput);
    if (completion.status !== "complete") fail("reset_incomplete");
    b.material = materialStore.resolveCredentialMaterial(b.credentialRef);
    const afterHandoff = delivery.get({ accountId: ACCOUNT, orderRef: b.orderRef });
    const usedBytesAfter = usage(b);
    const oldArtifactRevoked = core.resolveSubscriptionArtifact(artifactSecret(beforeHandoff.subscriptionUrl)).status === 410;
    const newArtifactAllowed = core.resolveSubscriptionArtifact(artifactSecret(afterHandoff.subscriptionUrl)).ok === true;
    const meteringIdentityPreserved = intent.edgeCredentialRef === b.credentialRef
      && store.findIssuedSubscriptionBindingByEdgeCredentialRef(b.credentialRef)?.requestId === b.requestRef;
    if (usedBytesBefore !== usedBytesAfter || !meteringIdentityPreserved
      || b.material.password === oldMaterial.password || !oldArtifactRevoked || !newArtifactAllowed
      || afterHandoff.subscriptionUrl === beforeHandoff.subscriptionUrl) fail("rotation_invariant_failed");
    const oldCredentialAllowed = await probe(b, 1, false, oldMaterial);
    const newCredentialAllowed = await probe(b, 1, true);
    await probe(timed, 2, true);
    await collect([b.credentialRef, timed.credentialRef]);
    await transfer(b, 1, INITIAL_BYTES);
    await collect([b.credentialRef], { requireGrowth: true });

    const beforeRecovery = Object.values(resources).map(usage);
    const sampleCount = store.listUsageSamples().length;
    const resourceCount = store.listIssuedSubscriptionBindings({ accountId: ACCOUNT }).length;
    const tenantCount = core.listTenants().length;
    const recovered = await transport.recover();
    if (recovered?.interrupted !== true || recovered.recovered !== true
      || recovered.serviceActive !== true || recovered.listenerPresent !== true) fail("recovery_failed");
    await collect([b.credentialRef, timed.credentialRef], { requireEmpty: true });
    const usageUnchanged = beforeRecovery.every((bytes, i) => bytes === usage(Object.values(resources)[i]))
      && sampleCount === store.listUsageSamples().length;
    const resourceCountUnchanged = resourceCount === store.listIssuedSubscriptionBindings({ accountId: ACCOUNT }).length
      && tenantCount === core.listTenants().length;
    if (!usageUnchanged || !resourceCountUnchanged) fail("recovery_invariant_failed");
    await probe(a, 0, false);
    await probe(b, 1, true);
    await probe(timed, 2, true);
    await collect([b.credentialRef, timed.credentialRef]);

    const physical = transport.evidenceMode === "physical_process";
    return Object.freeze({ ok: true, evidenceMode: transport.evidenceMode,
      acceptanceScope: { syntheticControlResources: true, authenticatedPurchaseToDelivery: false,
        realSubscriptionArtifactRotation: true, realControlAccountingAndReset: true,
        actualProtocolProcess: physical }, credentialCount: 3, applyCount,
      resources: Object.fromEntries(Object.entries(resources).map(([label, resource]) => [label, {
        quotaBytes: resource.quotaBytes ?? 500 * GIB, seededBaselineBytes: resource.seededBaselineBytes,
        collectorObservedBytes: resource.collectorObservedBytes,
        physicallyCollectedBytes: physical ? resource.collectorObservedBytes : 0,
        usedBytes: usage(resource) }])),
      exhaustion: { crossedByCollectorDelta: true, newConnections },
      rotation: { usedBytesBefore, usedBytesAfter, meteringIdentityPreserved,
        oldCredentialAllowed, newCredentialAllowed, oldArtifactRevoked },
      recovery: { interrupted: true, recovered: true, usageUnchanged, resourceCountUnchanged } });
  } catch (error) {
    // No foreign error message, SQLite row, runtime material or raw stats can
    // escape the scenario to an outer aggregate receipt.
    if (scenarioFailures.has(error)) {
      fail(error.code);
    }
    fail("scenario_component_failed");
  } finally {
    escrow?.close();
    runtimeStore?.close();
    store?.close();
  }
}
