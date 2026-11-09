import assert from "node:assert/strict";
import test from "node:test";

import {
  createPaymentActionRecord,
  projectPaymentActionPointer,
  purgePaymentActionTombstone,
  resolvePaymentActionRecord,
  transitionPaymentActionRecord
} from "../services/platform/payment-action-custody-contract.mjs";

const KEY_ID = "synthetic-key-v1";
const KEY = Buffer.alloc(32, 0x5a);
const KEYRING = new Map([[KEY_ID, KEY]]);
const CREATED_AT = "2026-11-08T12:00:00.000Z";
const EXPIRES_AT = "2026-11-08T12:10:00.000Z";
const NOW = "2026-11-08T12:01:00.000Z";
const PURGE_AFTER = "2026-11-09T12:00:00.000Z";
const RAW_URL = "https://pay.example.test/checkout?token=synthetic-capability";

function createRecord(overrides = {}) {
  return createPaymentActionRecord({
    orderRef: "order_synthetic_001",
    accountRef: "acct_synthetic_001",
    actionRef: "action_synthetic_001",
    actionType: "redirect_url",
    rawValue: RAW_URL,
    keyId: KEY_ID,
    key: KEY,
    createdAt: CREATED_AT,
    expiresAt: EXPIRES_AT,
    nonce: Buffer.alloc(12, 0x11),
    ...overrides
  });
}

test("encrypts the raw action and returns it only for the exact active binding", () => {
  const record = createRecord();
  assert.equal(JSON.stringify(record).includes("synthetic-capability"), false);
  assert.equal(resolvePaymentActionRecord({
    record,
    keyring: KEYRING,
    accountRef: "acct_synthetic_001",
    orderRef: "order_synthetic_001",
    actionRef: "action_synthetic_001",
    orderStatus: "pending",
    now: NOW
  }), RAW_URL);
});

test("D1 pointer projection contains no raw value or ciphertext", () => {
  const record = createRecord();
  const pointer = projectPaymentActionPointer(record);
  assert.deepEqual(pointer, {
    actionRef: "action_synthetic_001",
    actionType: "redirect_url",
    expiresAt: EXPIRES_AT,
    status: "active"
  });
  assert.equal(JSON.stringify(pointer).includes("synthetic-capability"), false);
  assert.equal("actionEnvelope" in pointer, false);
});

test("rejects an account mismatch", () => {
  const record = createRecord();
  assert.throws(() => resolvePaymentActionRecord({
    record, keyring: KEYRING, accountRef: "acct_other",
    orderRef: record.orderRef, actionRef: record.actionRef,
    orderStatus: "pending", now: NOW
  }), /payment_action_forbidden/);
});

test("rejects an order or action pointer mismatch", () => {
  const record = createRecord();
  assert.throws(() => resolvePaymentActionRecord({
    record, keyring: KEYRING, accountRef: record.accountRef,
    orderRef: "order_other", actionRef: record.actionRef,
    orderStatus: "pending", now: NOW
  }), /payment_action_binding_mismatch/);
});

test("rejects expired actions and non-active payment orders", () => {
  const record = createRecord();
  const args = {
    record, keyring: KEYRING, accountRef: record.accountRef,
    orderRef: record.orderRef, actionRef: record.actionRef,
    orderStatus: "pending", now: EXPIRES_AT
  };
  assert.throws(() => resolvePaymentActionRecord(args), /payment_action_expired/);
  assert.throws(() => resolvePaymentActionRecord({
    ...args, now: NOW, orderStatus: "payment_verified"
  }), /payment_action_order_not_active/);
});

test("authenticated additional data prevents record-binding tampering", () => {
  const record = createRecord();
  const tampered = Object.freeze({ ...record, actionType: "qr_payload" });
  assert.throws(() => resolvePaymentActionRecord({
    record: tampered, keyring: KEYRING, accountRef: record.accountRef,
    orderRef: record.orderRef, actionRef: record.actionRef,
    orderStatus: "pending", now: NOW
  }), /payment_action_authentication_failed/);
});

test("authenticated additional data binds the action key id", () => {
  const record = createRecord();
  const aliasKeyring = new Map([
    [KEY_ID, KEY],
    ["synthetic-key-alias-v1", KEY]
  ]);
  const tampered = Object.freeze({
    ...record,
    actionEnvelope: Object.freeze({
      ...record.actionEnvelope,
      keyId: "synthetic-key-alias-v1"
    })
  });
  assert.throws(() => resolvePaymentActionRecord({
    record: tampered,
    keyring: aliasKeyring,
    accountRef: record.accountRef,
    orderRef: record.orderRef,
    actionRef: record.actionRef,
    orderStatus: "pending",
    now: NOW
  }), /payment_action_authentication_failed/);
});

test("rejects extra record or action-envelope fields", () => {
  const record = createRecord();
  const withExtraRecordField = { ...record, rawValue: RAW_URL };
  const withExtraEnvelopeField = {
    ...record,
    actionEnvelope: { ...record.actionEnvelope, rawValue: RAW_URL }
  };
  assert.throws(() => projectPaymentActionPointer(withExtraRecordField), /payment_action_record_invalid/);
  assert.throws(() => projectPaymentActionPointer(withExtraEnvelopeField), /payment_action_envelope_invalid/);
});

test("rejects terminal timestamps earlier than action creation", () => {
  const record = createRecord();
  assert.throws(() => transitionPaymentActionRecord(record, {
    nextStatus: "revoked",
    at: "2026-11-08T11:59:59.999Z",
    purgeAfter: PURGE_AFTER
  }), /payment_action_terminal_time_invalid/);
});

test("fails closed when the envelope key id is unavailable", () => {
  const record = createRecord();
  assert.throws(() => resolvePaymentActionRecord({
    record, keyring: new Map(), accountRef: record.accountRef,
    orderRef: record.orderRef, actionRef: record.actionRef,
    orderStatus: "pending", now: NOW
  }), /payment_action_key_unavailable/);
});

test("terminal transition removes ciphertext and is idempotent for the same state", () => {
  const record = createRecord();
  const terminal = transitionPaymentActionRecord(record, {
    nextStatus: "consumed", at: NOW, purgeAfter: PURGE_AFTER
  });
  assert.equal(terminal.status, "consumed");
  assert.equal(terminal.actionEnvelope, null);
  assert.equal(transitionPaymentActionRecord(terminal, {
    nextStatus: "consumed", at: NOW, purgeAfter: PURGE_AFTER
  }), terminal);
});

test("rejects conflicting terminal transitions", () => {
  const terminal = transitionPaymentActionRecord(createRecord(), {
    nextStatus: "revoked", at: NOW, purgeAfter: PURGE_AFTER
  });
  assert.throws(() => transitionPaymentActionRecord(terminal, {
    nextStatus: "consumed", at: NOW, purgeAfter: PURGE_AFTER
  }), /payment_action_terminal_conflict/);
});

test("tombstones are retained until the caller-supplied purge boundary", () => {
  const terminal = transitionPaymentActionRecord(createRecord(), {
    nextStatus: "expired", at: NOW, purgeAfter: PURGE_AFTER
  });
  assert.equal(purgePaymentActionTombstone(terminal, { now: "2026-11-09T11:59:59.999Z" }), terminal);
  assert.equal(purgePaymentActionTombstone(terminal, { now: PURGE_AFTER }), null);
});

test("rejects unsafe redirect URLs and invalid key material", () => {
  assert.throws(() => createRecord({ rawValue: "http://pay.example.test/action" }), /payment_action_url_invalid/);
  assert.throws(() => createRecord({ rawValue: "https://user:pass@pay.example.test/action" }), /payment_action_url_invalid/);
  assert.throws(() => createRecord({ key: Buffer.alloc(16) }), /payment_action_key_invalid/);
});

test("rejects unsupported record and envelope schema versions", () => {
  const record = createRecord();
  assert.throws(() => resolvePaymentActionRecord({
    record: { ...record, schemaVersion: 2 },
    keyring: KEYRING,
    accountRef: record.accountRef,
    orderRef: record.orderRef,
    actionRef: record.actionRef,
    orderStatus: "pending",
    now: NOW
  }), /payment_action_schema_version_invalid/);
  assert.throws(() => resolvePaymentActionRecord({
    record: { ...record, actionEnvelope: { ...record.actionEnvelope, schemaVersion: 2 } },
    keyring: KEYRING,
    accountRef: record.accountRef,
    orderRef: record.orderRef,
    actionRef: record.actionRef,
    orderStatus: "pending",
    now: NOW
  }), /payment_action_authentication_failed|payment_action_record_invalid/);
});

test("rejects malformed tombstone purge bounds", () => {
  const terminal = transitionPaymentActionRecord(createRecord(), {
    nextStatus: "expired", at: NOW, purgeAfter: PURGE_AFTER
  });
  const malformed = Object.freeze({ ...terminal, purgeAfter: "not-a-time" });
  assert.throws(() => purgePaymentActionTombstone(malformed, { now: PURGE_AFTER }), /payment_action_timestamp_invalid/);
});

test("rejects oversized QR payloads", () => {
  assert.throws(() => createPaymentActionRecord({
    orderRef: "order_synthetic_001",
    accountRef: "acct_synthetic_001",
    actionRef: "action_synthetic_001",
    actionType: "qr_payload",
    rawValue: "x".repeat(4097),
    keyId: KEY_ID,
    key: KEY,
    createdAt: CREATED_AT,
    expiresAt: EXPIRES_AT
  }), /payment_action_value_too_large/);
});
