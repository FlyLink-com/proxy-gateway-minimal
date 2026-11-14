// B2-4c (G-10A): identity deletion service — deletion jobs, proof and
// failure recovery for portal accounts.
//
// The technical direction is approved (Yi, 2026-11-14 15:19): P-1 deletion
// flow (steps 0-8), P-3 deletion proof (audit events + independent proof
// record), P-4 persistent state machine with idempotent retry, P-2 scope
// decided by the C5 retention policy. Full acceptance still depends on C5.
//
// Design notes (all fail-closed):
// - Service layer only. No HTTP route is wired here and no public endpoint
//   is added; the deletion trigger is out of scope for this batch.
// - The verification mode ('physical' | 'logical') is a required per-job
//   parameter. There is no silent default and it cannot change mid-job.
// - Every step is idempotent and runs inside one store transaction: the
//   domain writes, the job step update and the step audit event commit or
//   roll back together. A failed step is persisted as failed and the job
//   stops; resume restarts from the failed step, never from the beginning.
// - Step 5 is the irreversible boundary. In physical mode the account row
//   is deleted only after the in-scope personal rows are gone AND no
//   out-of-scope referencing rows remain; otherwise step 5 fails with the
//   blocking tables named instead of deleting undecided data. In logical
//   mode the account row stays (suspended) and only the personal originals
//   are stripped from metadata.
// - The freeze (step 1) is effective through the existing login paths
//   that check account status (password login, session creation, session
//   use, entry issuance), but it does NOT cover the second-factor
//   completion paths: `completeSecondFactor` / `verifyTotpAndCreateSession`
//   do not re-check account status, so a challenge issued before the
//   freeze (300s TTL) plus a valid TOTP code can still create a new
//   session row between steps 1 and 3. Three mitigations make the window
//   fail-closed: step 3 revokes all credentials (after which those paths
//   find no active credential), session use still checks account status
//   (`getActiveSessionContext` rejects non-active accounts), and the
//   step 7 read-back verification fails the job if any active session
//   row exists. This module does not touch login code; making the
//   second-factor completion paths re-check account status is a
//   follow-up batch item (see below).
// - "Recovery" here means safe resume / retry / compensation of a failed
//   deletion task, never restoring already-deleted data. Deleted data is
//   not restored by this module.
// - No credential material, password, secret or personal-data original is
//   recorded, returned or persisted by this module. Stripping metadata
//   necessarily reads it into memory; the originals are never written to
//   audit metadata, proof records, job rows or logs. Audit metadata
//   carries only references, scope, results and timestamps.
// - A failed job can be explicitly abandoned (`abandonDeletion`, with an
//   authorization basis and an audit event). Abandonment is terminal:
//   the job cannot resume or recover, and it no longer blocks a new
//   deletion request for the same account. Abandonment does NOT unfreeze
//   the account: the account keeps its current status, and unfreezing is
//   a separate decision.
// - Follow-up batch items (out of scope for this batch, recorded here so
//   they are not silently dropped): (a) second-factor completion paths
//   re-check account status (see the freeze note above); (b) the
//   unfreeze decision for abandoned jobs.

import { randomBytes } from "node:crypto";

export const IDENTITY_DELETION_STEPS = Object.freeze([
  "persist_request",
  "freeze_account",
  "revoke_sessions",
  "revoke_credentials",
  "d1_placeholder",
  "delete_personal_data",
  "write_tombstone",
  "verify_readback",
  "issue_proof"
]);

export const IDENTITY_DELETION_VERIFICATION_MODES = Object.freeze(["physical", "logical"]);
export const IDENTITY_DELETION_AUTHORIZATION_BASES = Object.freeze(["owner_request", "compliance_order"]);

// P-2 data categories. Only account / credentials / sessions are executed
// by this batch; the rest are recorded as deferred scope, pending the C5
// retention decision. A job scope must include the executed trio.
export const IDENTITY_DELETION_SCOPE_CATEGORIES = Object.freeze([
  "account",
  "credentials",
  "sessions",
  "entitlements",
  "entries",
  "recommendations",
  "coin",
  "ads"
]);
export const IDENTITY_DELETION_EXECUTED_SCOPE_CATEGORIES = Object.freeze([
  "account",
  "credentials",
  "sessions"
]);
export const IDENTITY_DELETION_DEFERRED_SCOPE_CATEGORIES = Object.freeze([
  "entitlements",
  "entries",
  "recommendations",
  "coin",
  "ads"
]);

export const IDENTITY_DELETION_RETENTION_POLICY_PENDING = "pending-c5-decision";
export const IDENTITY_DELETION_TOMBSTONE_RETAINED_CATEGORIES = Object.freeze([
  "financial_facts",
  "audit_events"
]);

const SAFE_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_:/-]{0,127}$/;

function deletionError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function requireRef(value, field) {
  if (typeof value !== "string" || !SAFE_REF_PATTERN.test(value.trim())) {
    throw deletionError("identity_deletion_validation_error", `${field} must be a safe reference`);
  }
  return value.trim();
}

function requireText(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    throw deletionError("identity_deletion_validation_error", `${field} is required`);
  }
  return value.trim();
}

function requireIso(value, field) {
  const raw = requireText(value, field);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw deletionError("identity_deletion_validation_error", `${field} must be a valid ISO timestamp`);
  }
  return date.toISOString();
}

function mintRef(prefix) {
  return `${prefix}_${randomBytes(12).toString("hex")}`;
}

function initialSteps() {
  return IDENTITY_DELETION_STEPS.map((name, step) => ({
    step,
    name,
    status: "pending",
    completedAt: null,
    failureReason: null,
    retryCount: 0,
    eventRef: null,
    counts: null
  }));
}

const STORE_METHODS = [
  "getAccount",
  "createIdentityDeletionJob",
  "getIdentityDeletionJob",
  "getIdentityDeletionJobByRequestId",
  "getPendingIdentityDeletionJobByAccountId",
  "updateIdentityDeletionJob",
  "createIdentityDeletionProof",
  "getIdentityDeletionProof",
  "getIdentityDeletionProofByRequestId",
  "createIdentityDeletionTombstone",
  "listIdentityDeletionTombstonesByRequestId",
  "freezeAccountForDeletion",
  "listPortalSessions",
  "revokePortalSession",
  "revokePortalPasswordCredentialsForAccount",
  "revokePortalTotpCredentialsForAccount",
  "revokePortalPasskeyCredentialsForAccount",
  "deletePortalCredentialsForAccount",
  "deletePortalSessionsForAccount",
  "deletePortalSecondFactorChallengesForAccount",
  "deletePortalEntriesForAccount",
  "deleteAccountRowForDeletion",
  "redactAccountMetadataForDeletion",
  "readIdentityDeletionState",
  "recordAuditEvent",
  "getAuditEvent",
  "runInTransaction"
];

export class PortalIdentityDeletionService {
  constructor({ controlStore, now = () => new Date().toISOString() } = {}) {
    for (const name of STORE_METHODS) {
      if (!controlStore || typeof controlStore[name] !== "function") {
        throw new TypeError(`PortalIdentityDeletionService requires controlStore.${name}`);
      }
    }
    if (typeof now !== "function") {
      throw new TypeError("PortalIdentityDeletionService requires a now function");
    }
    this.store = controlStore;
    this.now = now;
  }

  requestDeletion(input = {}) {
    const requestRef = requireRef(input.requestRef, "requestRef");
    const accountId = requireRef(input.accountId, "accountId");
    const actorRef = requireRef(input.actorRef, "actorRef");
    if (!IDENTITY_DELETION_AUTHORIZATION_BASES.includes(input.authorizationBasis)) {
      throw deletionError(
        "identity_deletion_validation_error",
        "authorizationBasis must be owner_request or compliance_order"
      );
    }
    // The verification mode is required: there is no silent default.
    if (!IDENTITY_DELETION_VERIFICATION_MODES.includes(input.verificationMode)) {
      throw deletionError(
        "identity_deletion_validation_error",
        "verificationMode is required and must be physical or logical"
      );
    }
    const scope = this.#validateScope(input.scope);
    const requestedAt = input.requestedAt === undefined
      ? this.now()
      : requireIso(input.requestedAt, "requestedAt");

    const existing = this.store.getIdentityDeletionJobByRequestId(requestRef);
    if (existing) {
      // Step 0 is idempotent: the same request returns the existing job.
      // A request that reuses the identifier with different parameters is
      // a conflict, not a retry.
      if (
        existing.accountId !== accountId
        || existing.authorizationBasis !== input.authorizationBasis
        || existing.verificationMode !== input.verificationMode
        || existing.actorRef !== actorRef
        || JSON.stringify(existing.scope) !== JSON.stringify(scope)
      ) {
        throw deletionError(
          "identity_deletion_request_conflict",
          "requestRef is already used by a different deletion request"
        );
      }
      return existing;
    }

    return this.store.runInTransaction(() => {
      const account = this.store.getAccount(accountId);
      if (!account) {
        throw deletionError("identity_deletion_account_not_found", "account not found");
      }
      const pending = this.store.getPendingIdentityDeletionJobByAccountId(accountId);
      if (pending) {
        throw deletionError(
          "identity_deletion_account_has_pending_job",
          "account already has an unfinished deletion job"
        );
      }
      const steps = initialSteps();
      steps[0] = { ...steps[0], status: "completed", completedAt: requestedAt };
      const job = this.store.createIdentityDeletionJob({
        id: mintRef("deljob"),
        requestId: requestRef,
        accountId,
        authorizationBasis: input.authorizationBasis,
        verificationMode: input.verificationMode,
        scope,
        status: "pending",
        currentStep: 1,
        steps,
        failureReason: null,
        retryCount: 0,
        proofRef: null,
        actorRef,
        createdAt: requestedAt,
        updatedAt: requestedAt
      });
      this.store.recordAuditEvent({
        id: mintRef("delaudit"),
        entityType: "identity_deletion",
        entityRef: accountId,
        action: "identity_deletion_requested",
        actorRef,
        createdAt: requestedAt,
        metadata: {
          requestRef,
          accountRef: accountId,
          authorizationBasis: input.authorizationBasis,
          scope,
          verificationMode: input.verificationMode
        }
      });
      return job;
    });
  }

  getDeletionJob({ requestRef } = {}) {
    const job = this.store.getIdentityDeletionJobByRequestId(requireRef(requestRef, "requestRef"));
    if (!job) {
      throw deletionError("identity_deletion_job_not_found", "deletion job not found");
    }
    return job;
  }

  getDeletionProof({ proofRef } = {}) {
    const proof = this.store.getIdentityDeletionProof(requireRef(proofRef, "proofRef"));
    if (!proof) {
      throw deletionError("identity_deletion_proof_not_found", "deletion proof not found");
    }
    return proof;
  }

  runDeletion({ requestRef } = {}) {
    let job = this.getDeletionJob({ requestRef });
    if (job.status === "completed" || job.status === "abandoned") {
      return job;
    }
    // One resume of a failed job counts as one job-level retry.
    const jobRetryCount = job.status === "failed" ? job.retryCount + 1 : job.retryCount;
    for (let step = job.currentStep; step <= 8; step += 1) {
      if (job.steps[step].status === "completed") {
        continue;
      }
      job = this.#executeStep(job, step, { force: false, jobRetryCount });
    }
    return job;
  }

  runDeletionStep({ requestRef, step, force = false } = {}) {
    const job = this.getDeletionJob({ requestRef });
    if (step === 0) {
      throw deletionError("identity_deletion_step_invalid", "step 0 runs at request time only");
    }
    if (!Number.isInteger(step) || step < 1 || step > 8) {
      throw deletionError("identity_deletion_step_invalid", "step must be an integer from 1 to 8");
    }
    if (job.status === "completed" || job.status === "abandoned") {
      // A completed or abandoned job is terminal: the proof is issued
      // (completed) or the job was given up (abandoned), and no step
      // may run afterwards.
      return job;
    }
    if (job.steps[step].status === "completed" && !force) {
      return job;
    }
    if (force) {
      // Force only re-runs a completed or failed step; it never starts
      // a pending step out of order.
      if (job.steps[step].status !== "completed" && job.steps[step].status !== "failed") {
        throw deletionError(
          "identity_deletion_step_invalid",
          "force only re-runs a completed or failed step"
        );
      }
    } else {
      // A non-force call must run the steps in order: every prior step
      // has to be completed first, so the step trail on the job always
      // matches what actually ran.
      const incompletePrior = job.steps
        .slice(1, step)
        .filter((entry) => entry.status !== "completed")
        .map((entry) => entry.step);
      if (incompletePrior.length > 0) {
        throw deletionError(
          "identity_deletion_step_out_of_order",
          `prior steps must complete first: ${incompletePrior.join(", ")}`
        );
      }
    }
    return this.#executeStep(job, step, { force, jobRetryCount: job.retryCount });
  }

  abandonDeletion({ requestRef, authorizationBasis, actorRef } = {}) {
    // B2-4c fix (P2-2): only a failed job can be abandoned. Abandonment
    // needs an authorization basis and is written to the audit trail;
    // it is terminal (no resume, no recovery) and the job no longer
    // blocks a new deletion request for the same account. The account
    // is NOT unfrozen: it keeps its current status, and unfreezing is a
    // separate decision (see the module header).
    const job = this.getDeletionJob({ requestRef });
    if (!IDENTITY_DELETION_AUTHORIZATION_BASES.includes(authorizationBasis)) {
      throw deletionError(
        "identity_deletion_validation_error",
        "authorizationBasis must be owner_request or compliance_order"
      );
    }
    const abandoningActor = requireRef(actorRef, "actorRef");
    if (job.status !== "failed") {
      throw deletionError(
        "identity_deletion_job_not_abandonable",
        "only a failed deletion job can be abandoned"
      );
    }
    const abandonedAt = this.now();
    return this.store.runInTransaction(() => {
      const updated = this.store.updateIdentityDeletionJob({
        id: job.id,
        status: "abandoned",
        currentStep: job.currentStep,
        steps: job.steps,
        failureReason: job.failureReason,
        retryCount: job.retryCount,
        proofRef: job.proofRef ?? null,
        updatedAt: abandonedAt
      });
      this.store.recordAuditEvent({
        id: mintRef("delaudit"),
        entityType: "identity_deletion",
        entityRef: job.accountId,
        action: "identity_deletion_job_abandoned",
        actorRef: abandoningActor,
        createdAt: abandonedAt,
        metadata: {
          requestRef: job.requestId,
          accountRef: job.accountId,
          authorizationBasis,
          abandonedAt,
          failureReason: job.failureReason && job.failureReason.length > 0
            ? job.failureReason
            : "failed: no reason recorded"
        }
      });
      return updated;
    });
  }

  #validateScope(scope) {
    if (!Array.isArray(scope) || scope.length === 0) {
      throw deletionError("identity_deletion_validation_error", "scope must be a non-empty array");
    }
    const unique = [...new Set(scope)];
    if (unique.length !== scope.length) {
      throw deletionError("identity_deletion_validation_error", "scope must not contain duplicates");
    }
    for (const category of unique) {
      if (!IDENTITY_DELETION_SCOPE_CATEGORIES.includes(category)) {
        throw deletionError(
          "identity_deletion_validation_error",
          `scope category is not supported: ${category}`
        );
      }
    }
    for (const required of IDENTITY_DELETION_EXECUTED_SCOPE_CATEGORIES) {
      if (!unique.includes(required)) {
        throw deletionError(
          "identity_deletion_validation_error",
          `scope must include ${required}`
        );
      }
    }
    return unique;
  }

  #executeStep(job, step, { force, jobRetryCount }) {
    const nowIso = this.now();
    const previous = job.steps[step];
    const wasFailed = previous.status === "failed";
    const stepRecord = {
      ...previous,
      retryCount: wasFailed || force ? previous.retryCount + 1 : previous.retryCount,
      failureReason: null
    };
    try {
      return this.store.runInTransaction(() => {
        const result = this.#runStepWork(job, step, nowIso);
        stepRecord.status = "completed";
        stepRecord.completedAt = nowIso;
        if (result.eventRef) {
          stepRecord.eventRef = result.eventRef;
        }
        if (result.counts) {
          stepRecord.counts = result.counts;
        }
        const steps = job.steps.map((entry, index) => (index === step ? stepRecord : entry));
        const updated = this.store.updateIdentityDeletionJob({
          id: job.id,
          status: step === 8 ? "completed" : "in_progress",
          currentStep: Math.min(step + 1, 8),
          steps,
          failureReason: null,
          retryCount: jobRetryCount,
          proofRef: result.proofRef ?? job.proofRef ?? null,
          updatedAt: nowIso
        });
        this.store.recordAuditEvent({
          id: mintRef("delaudit"),
          entityType: "identity_deletion",
          entityRef: job.accountId,
          action: "identity_deletion_step_completed",
          actorRef: job.actorRef,
          createdAt: nowIso,
          metadata: {
            requestRef: job.requestId,
            accountRef: job.accountId,
            step,
            stepName: IDENTITY_DELETION_STEPS[step],
            result: result.result,
            completedAt: nowIso,
            ...(result.counts ? { counts: result.counts } : {})
          }
        });
        return updated;
      });
    } catch (error) {
      // The step transaction rolled back; persist the failure outside it
      // so the job stops at this step with a traceable reason.
      const failureReason = `${error.code ?? "error"}: ${error.message}`;
      const failedSteps = job.steps.map((entry, index) => (index === step
        ? { ...entry, status: "failed", failureReason, retryCount: stepRecord.retryCount }
        : entry));
      this.store.updateIdentityDeletionJob({
        id: job.id,
        status: "failed",
        currentStep: step,
        steps: failedSteps,
        failureReason,
        retryCount: jobRetryCount,
        proofRef: job.proofRef ?? null,
        updatedAt: this.now()
      });
      // Keep the caller's error (with its code) as the thrown error.
      throw error;
    }
  }

  #runStepWork(job, step, nowIso) {
    const accountId = job.accountId;
    switch (step) {
      case 1: {
        const account = this.store.freezeAccountForDeletion({ accountId, updatedAt: nowIso });
        if (!account) {
          throw deletionError("identity_deletion_account_not_found", "account not found");
        }
        if (account.status !== "suspended" && account.status !== "disabled") {
          throw deletionError("identity_deletion_freeze_failed", "account could not be frozen");
        }
        return { result: "completed", counts: { accountFrozen: 1 } };
      }
      case 2: {
        const sessions = this.store.listPortalSessions({ accountId });
        let revokedCount = 0;
        for (const session of sessions) {
          if (session.status === "active") {
            this.store.revokePortalSession(session.sessionRef, { revokedAt: nowIso, updatedAt: nowIso });
            revokedCount += 1;
          }
        }
        return {
          result: "completed",
          counts: { sessionRevoked: revokedCount, sessionTotal: sessions.length }
        };
      }
      case 3: {
        const password = this.store.revokePortalPasswordCredentialsForAccount({
          accountId, revokedAt: nowIso, updatedAt: nowIso
        });
        const totp = this.store.revokePortalTotpCredentialsForAccount({
          accountId, revokedAt: nowIso, updatedAt: nowIso
        });
        const passkey = this.store.revokePortalPasskeyCredentialsForAccount({
          accountId, revokedAt: nowIso, updatedAt: nowIso
        });
        return {
          result: "completed",
          counts: {
            pwdRevoked: password.revokedCount,
            totpRevoked: totp.revokedCount,
            passkeyRevoked: passkey.revokedCount
          }
        };
      }
      case 4: {
        // D1 is not deployed: there are no D1-side identity records to
        // delete or unlink. The step records that fact instead of
        // pretending to act.
        return { result: "skipped", counts: { d1RecordsSkipped: 0 } };
      }
      case 5: {
        if (job.verificationMode === "physical") {
          return this.#deletePersonalDataPhysical(job, nowIso);
        }
        return this.#deletePersonalDataLogical(job, nowIso);
      }
      case 6: {
        const existing = this.store.listIdentityDeletionTombstonesByRequestId(job.requestId);
        if (existing.length > 0) {
          return { result: "completed", counts: { tombstoneWritten: 0 } };
        }
        this.store.createIdentityDeletionTombstone({
          id: mintRef("deltomb"),
          requestId: job.requestId,
          accountRef: accountId,
          retainedCategories: [...IDENTITY_DELETION_TOMBSTONE_RETAINED_CATEGORIES],
          retentionPolicyRef: IDENTITY_DELETION_RETENTION_POLICY_PENDING,
          createdAt: nowIso
        });
        return { result: "completed", counts: { tombstoneWritten: 1 } };
      }
      case 7: {
        const state = this.store.readIdentityDeletionState({ accountId });
        const assertions = buildReadbackAssertions(job.verificationMode, state);
        const failed = assertions.filter((assertion) => !assertion.passed);
        if (failed.length > 0) {
          throw deletionError(
            "identity_deletion_verification_failed",
            `read-back verification failed: ${failed.map((assertion) => assertion.name).join(", ")}`
          );
        }
        const event = this.store.recordAuditEvent({
          id: mintRef("delaudit"),
          entityType: "identity_deletion",
          entityRef: accountId,
          action: "identity_deletion_verified",
          actorRef: job.actorRef,
          createdAt: nowIso,
          metadata: {
            requestRef: job.requestId,
            accountRef: accountId,
            verificationMode: job.verificationMode,
            verifiedAt: nowIso,
            assertions
          }
        });
        return {
          result: "completed",
          eventRef: event.id,
          counts: { assertionsPassed: assertions.length }
        };
      }
      case 8: {
        const existing = this.store.getIdentityDeletionProofByRequestId(job.requestId);
        if (existing) {
          return { result: "completed", proofRef: existing.id, counts: { proofIssued: 0 } };
        }
        const verifiedEventRef = job.steps[7].eventRef;
        if (!verifiedEventRef) {
          throw deletionError(
            "identity_deletion_verification_event_missing",
            "verified audit event is missing, proof cannot be issued"
          );
        }
        const verifiedEvent = this.store.getAuditEvent(verifiedEventRef);
        const assertions = verifiedEvent?.metadata?.assertions;
        if (!Array.isArray(assertions) || assertions.length === 0) {
          throw deletionError(
            "identity_deletion_verification_event_missing",
            "verified audit event has no assertions, proof cannot be issued"
          );
        }
        const proofRef = mintRef("delproof");
        this.store.createIdentityDeletionProof({
          id: proofRef,
          requestId: job.requestId,
          accountRef: accountId,
          verificationMode: job.verificationMode,
          scope: job.scope,
          verification: assertions,
          deferredScope: job.scope.filter(
            (category) => !IDENTITY_DELETION_EXECUTED_SCOPE_CATEGORIES.includes(category)
          ),
          issuedAt: nowIso,
          createdAt: nowIso
        });
        this.store.recordAuditEvent({
          id: mintRef("delaudit"),
          entityType: "identity_deletion",
          entityRef: accountId,
          action: "identity_deletion_proof_issued",
          actorRef: job.actorRef,
          createdAt: nowIso,
          metadata: {
            requestRef: job.requestId,
            accountRef: accountId,
            proofRef,
            verificationMode: job.verificationMode,
            issuedAt: nowIso,
            verificationEventRef: verifiedEventRef
          }
        });
        return { result: "completed", proofRef, counts: { proofIssued: 1 } };
      }
      default: {
        throw deletionError("identity_deletion_step_invalid", `step is not executable: ${step}`);
      }
    }
  }

  #deletePersonalDataPhysical(job, nowIso) {
    const accountId = job.accountId;
    // Check the blocking tables BEFORE mutating anything: a blocked step
    // performs no writes at all, so the retry starts from a clean state.
    const state = this.store.readIdentityDeletionState({ accountId });
    const blocking = Object.entries(state.blocking)
      .filter(([, count]) => count > 0)
      .map(([table, count]) => `${table}:${count}`);
    if (blocking.length > 0) {
      // Fail closed: the remaining rows belong to categories whose
      // handling is pending the C5 retention decision. Deleting the
      // account row now would cascade-delete some of them and fail on
      // the NO ACTION / RESTRICT ones.
      throw deletionError(
        "identity_deletion_blocked_by_retained_rows",
        `account row cannot be deleted, retained rows remain: ${blocking.join(", ")}`
      );
    }
    const credentialCounts = this.store.deletePortalCredentialsForAccount({ accountId });
    const sessions = this.store.deletePortalSessionsForAccount({ accountId });
    const challenges = this.store.deletePortalSecondFactorChallengesForAccount({ accountId });
    const entries = this.store.deletePortalEntriesForAccount({ accountId });
    const accountDelete = state.accountExists
      ? this.store.deleteAccountRowForDeletion({ accountId })
      : { deletedCount: 0 };
    if (state.accountExists && accountDelete.deletedCount !== 1) {
      throw deletionError(
        "identity_deletion_account_row_not_deleted",
        "account row was not deleted"
      );
    }
    return {
      result: "completed",
      counts: {
        pwdDeleted: credentialCounts["platform_portal_password_credentials"] ?? 0,
        totpDeleted: credentialCounts["platform_portal_totp_credentials"] ?? 0,
        passkeyDeleted: credentialCounts["platform_portal_passkey_credentials"] ?? 0,
        sessionDeleted: sessions.deletedCount,
        challengeDeleted: challenges.deletedCount,
        entryDeleted: entries.deletedCount,
        accountRowDeleted: accountDelete.deletedCount
      }
    };
  }

  #deletePersonalDataLogical(job, nowIso) {
    // Deliberate: second-factor challenge rows are left to their natural
    // 300s expiry instead of being deleted or revoked. That is harmless:
    // completing a challenge needs an active TOTP credential, and step 3
    // already revoked every credential for this account. The read-back
    // verification intentionally does not assert on challenge rows.
    const result = this.store.redactAccountMetadataForDeletion({
      accountId: job.accountId,
      updatedAt: nowIso
    });
    return {
      result: "completed",
      counts: { metadataFieldsStripped: result.strippedKeys.length }
    };
  }
}

export function buildReadbackAssertions(verificationMode, state) {
  if (verificationMode === "physical") {
    return [
      {
        name: "account_row_absent",
        expected: false,
        actual: state.accountExists,
        passed: state.accountExists === false
      },
      {
        name: "password_rows_absent",
        expected: 0,
        actual: state.password.total,
        passed: state.password.total === 0
      },
      {
        name: "totp_rows_absent",
        expected: 0,
        actual: state.totp.total,
        passed: state.totp.total === 0
      },
      {
        name: "passkey_rows_absent",
        expected: 0,
        actual: state.passkey.total,
        passed: state.passkey.total === 0
      },
      {
        name: "session_rows_absent",
        expected: 0,
        actual: state.sessions.total,
        passed: state.sessions.total === 0
      },
      {
        name: "challenge_rows_absent",
        expected: 0,
        actual: state.challenges,
        passed: state.challenges === 0
      },
      {
        name: "entry_rows_absent",
        expected: 0,
        actual: state.entries,
        passed: state.entries === 0
      }
    ];
  }
  if (verificationMode === "logical") {
    return [
      {
        name: "account_row_present",
        expected: true,
        actual: state.accountExists,
        passed: state.accountExists === true
      },
      {
        name: "account_status_frozen",
        expected: "not-active",
        actual: state.accountStatus,
        passed: state.accountStatus !== null && state.accountStatus !== "active"
      },
      {
        name: "metadata_personal_fields_absent",
        expected: false,
        actual: state.metadataHasPersonalFields,
        passed: state.metadataHasPersonalFields === false
      },
      {
        name: "password_rows_revoked",
        expected: state.password.total,
        actual: state.password.revoked,
        passed: state.password.active === 0 && state.password.locked === 0
      },
      {
        name: "totp_rows_revoked",
        expected: state.totp.total,
        actual: state.totp.revoked,
        passed: state.totp.active === 0 && state.totp.locked === 0
      },
      {
        name: "passkey_rows_revoked",
        expected: state.passkey.total,
        actual: state.passkey.revoked,
        passed: state.passkey.active === 0 && state.passkey.locked === 0
      },
      {
        name: "session_no_active_rows",
        expected: 0,
        actual: state.sessions.active,
        passed: state.sessions.active === 0
      }
    ];
  }
  throw deletionError(
    "identity_deletion_validation_error",
    "verificationMode is required and must be physical or logical"
  );
}
