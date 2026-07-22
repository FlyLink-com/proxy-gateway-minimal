import { createHash } from 'node:crypto';

import { commerceError, createDefaultCommerceCatalog } from './coins-commerce-model.mjs';

const ORIGINS = ['bonus', 'paid', 'referral'];
const REFERRAL_TYPES = new Set([
  'referral_freeze', 'referral_release', 'referral_settlement', 'referral_reversal'
]);
const SENSITIVE_KEY = /token|secret|credential|password|raw|customer|email|ip/i;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
}

function compareOrdinal(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
  }
  return value;
}

function freeze(value) {
  if (Array.isArray(value)) value.forEach(freeze);
  else if (isPlainObject(value)) Object.values(value).forEach(freeze);
  return Object.freeze(value);
}

function snapshot(value) {
  return freeze(clone(value));
}

function validation(reason) {
  throw commerceError('validation_error', { reason });
}

function requirePlainObject(value, reason) {
  if (!isPlainObject(value)) validation(reason);
  return value;
}

function requireTrimmedString(value, reason) {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) validation(reason);
  return value;
}

function requirePositiveCoins(value, reason = 'invalid_amount_coins') {
  if (!Number.isSafeInteger(value) || value <= 0) validation(reason);
  return value;
}

function checkedAddCoins(left, right) {
  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right)) validation('coins_arithmetic_overflow');
  const result = left + right;
  if (!Number.isSafeInteger(result)) validation('coins_arithmetic_overflow');
  return result;
}

function checkedSubtractCoins(left, right) {
  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right)) validation('coins_arithmetic_overflow');
  const result = left - right;
  if (!Number.isSafeInteger(result)) validation('coins_arithmetic_overflow');
  return result;
}

function requireCanonicalIso(value, reason = 'invalid_timestamp') {
  requireTrimmedString(value, reason);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) validation(reason);
  return value;
}

function requireExactKeys(value, required, optional, reason) {
  requirePlainObject(value, reason);
  const allowed = new Set([...required, ...optional]);
  if (!required.every((key) => Object.hasOwn(value, key)) || Object.keys(value).some((key) => !allowed.has(key))) {
    validation(reason);
  }
}

function requireNow(nowFn) {
  if (typeof nowFn !== 'function') validation('invalid_now_function');
  return requireCanonicalIso(nowFn(), 'invalid_now_timestamp');
}

function notFound() {
  throw commerceError('not_found', {});
}

function closedDataEntries(value, reason) {
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key === 'symbol')) validation(reason);
  if (Array.isArray(value)) {
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
    if (!lengthDescriptor || !Object.hasOwn(lengthDescriptor, 'value')
      || lengthDescriptor.value !== value.length || lengthDescriptor.enumerable
      || lengthDescriptor.configurable || typeof lengthDescriptor.writable !== 'boolean') {
      validation(reason);
    }
    const expectedKeys = new Set(['length', ...Array.from({ length: value.length }, (_, index) => String(index))]);
    if (ownKeys.length !== expectedKeys.size || ownKeys.some((key) => !expectedKeys.has(key))) validation(reason);
    return Array.from({ length: value.length }, (_, index) => {
      const key = String(index);
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) validation(reason);
      return [key, descriptor.value];
    });
  }
  const entries = [];
  for (const key of ownKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) validation(reason);
    entries.push([key, descriptor.value]);
  }
  return entries;
}

function requireClosedStructure(value, active = new WeakSet()) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return;
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) validation('invalid_closed_value');
    return;
  }
  if (!Array.isArray(value) && !isPlainObject(value)) validation('invalid_closed_value');
  if (active.has(value)) validation('invalid_closed_value');
  active.add(value);
  for (const [key, item] of closedDataEntries(value, 'invalid_closed_value')) {
    if (!Array.isArray(value) && /Ref$/.test(key)) requireTrimmedString(item, 'invalid_ref');
    if (!Array.isArray(value) && (/At$/.test(key) || key === 'validUntil') && item !== null) requireCanonicalIso(item);
    requireClosedStructure(item, active);
  }
  active.delete(value);
}

function requireClosedValue(value, path = []) {
  requireClosedStructure(value);
  if (!Array.isArray(value) && !isPlainObject(value)) return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => requireClosedValue(item, [...path, index]));
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    const parent = path.at(-1);
    const actionType = value.type;
    const allowedUrl = parent === 'nextAction' && key === 'url';
    const allowedQrPayload = parent === 'nextAction' && key === 'payload' && actionType === 'qr';
    if ((SENSITIVE_KEY.test(key) || key === 'url' || key === 'payload') && !allowedUrl && !allowedQrPayload) {
      validation('sensitive_key_not_allowed');
    }
    requireClosedValue(item, [...path, key]);
  }
}

function canonicalize(value, active = new WeakSet()) {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) validation('invalid_idempotency_value');
    return value;
  }
  if (typeof value === 'string') {
    if (value.length === 0) validation('invalid_idempotency_value');
    return value;
  }
  if (!Array.isArray(value) && !isPlainObject(value)) validation('invalid_idempotency_value');
  if (active.has(value)) validation('invalid_idempotency_value');
  active.add(value);
  const entries = closedDataEntries(value, 'invalid_idempotency_value');
  const orderedEntries = Array.isArray(value) ? entries : entries.sort(([left], [right]) => compareOrdinal(left, right));
  const canonical = Array.isArray(value)
    ? orderedEntries.map(([, item]) => canonicalize(item, active))
    : Object.fromEntries(orderedEntries.map(([key, item]) => [key, canonicalize(item, active)]));
  active.delete(value);
  return canonical;
}

export function canonicalCommerceRequestDigest(value) {
  const canonicalJson = JSON.stringify(canonicalize(value));
  return createHash('sha256')
    .update(`COINS_COMMERCE_IDEMPOTENCY:v1\0${canonicalJson}`, 'utf8')
    .digest('hex');
}

function normalizeLot(value) {
  requireExactKeys(
    value,
    ['lotRef', 'accountRef', 'origin', 'issuedCoins', 'sourceRef', 'createdAt'],
    ['expiresAt'],
    'invalid_coin_lot'
  );
  const normalized = {
    lotRef: requireTrimmedString(value.lotRef, 'invalid_lot_ref'),
    accountRef: requireTrimmedString(value.accountRef, 'invalid_account_ref'),
    origin: value.origin,
    issuedCoins: requirePositiveCoins(value.issuedCoins),
    sourceRef: requireTrimmedString(value.sourceRef, 'invalid_source_ref'),
    createdAt: requireCanonicalIso(value.createdAt),
    expiresAt: value.expiresAt ?? null
  };
  if (!ORIGINS.includes(normalized.origin)) validation('invalid_lot_origin');
  if (normalized.origin === 'bonus') {
    if (normalized.expiresAt === null) {
      normalized.expiresAt = new Date(new Date(normalized.createdAt).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
    } else {
      requireCanonicalIso(normalized.expiresAt);
    }
  } else if (normalized.expiresAt !== null) {
    validation('non_bonus_lot_expiry');
  }
  return snapshot(normalized);
}

function normalizeAllocation(value, expectedOrigin = null) {
  requireExactKeys(value, ['lotRef', 'origin', 'amountCoins'], [], 'invalid_allocation');
  const normalized = {
    lotRef: requireTrimmedString(value.lotRef, 'invalid_lot_ref'),
    origin: value.origin,
    amountCoins: requirePositiveCoins(value.amountCoins)
  };
  if (!ORIGINS.includes(normalized.origin) || (expectedOrigin !== null && normalized.origin !== expectedOrigin)) {
    validation('invalid_allocation_origin');
  }
  return normalized;
}

function normalizeTransaction(value, allowedTypes = null) {
  requireExactKeys(value, [
    'transactionRef', 'accountRef', 'type', 'amountCoins', 'allocations', 'relatedRef', 'createdAt'
  ], [], 'invalid_wallet_transaction');
  const type = requireTrimmedString(value.type, 'invalid_transaction_type');
  if (allowedTypes !== null && !allowedTypes.has(type)) validation('invalid_transaction_type');
  if (!Array.isArray(value.allocations) || value.allocations.length === 0) validation('invalid_allocations');
  const expectedOrigin = allowedTypes === REFERRAL_TYPES ? 'referral' : null;
  const allocations = value.allocations.map((allocation) => normalizeAllocation(allocation, expectedOrigin));
  const amountCoins = requirePositiveCoins(value.amountCoins);
  if (allocations.reduce((total, allocation) => checkedAddCoins(total, allocation.amountCoins), 0) !== amountCoins) {
    validation('allocation_amount_mismatch');
  }
  if (new Set(allocations.map(({ lotRef }) => lotRef)).size !== allocations.length) validation('duplicate_allocation_lot');
  return snapshot({
    transactionRef: requireTrimmedString(value.transactionRef, 'invalid_transaction_ref'),
    accountRef: requireTrimmedString(value.accountRef, 'invalid_account_ref'),
    type,
    amountCoins,
    allocations,
    relatedRef: requireTrimmedString(value.relatedRef, 'invalid_related_ref'),
    createdAt: requireCanonicalIso(value.createdAt)
  });
}

function sameAllocations(left, right) {
  return left.length === right.length && left.every((allocation, index) => (
    allocation.lotRef === right[index].lotRef
      && allocation.origin === right[index].origin
      && allocation.amountCoins === right[index].amountCoins
  ));
}

function addAmount(map, lotRef, amount) {
  map.set(lotRef, checkedAddCoins(map.get(lotRef) ?? 0, amount));
}

function subtractAmount(map, lotRef, amount) {
  const next = checkedSubtractCoins(map.get(lotRef) ?? 0, amount);
  if (next < 0) validation('impossible_transaction_history');
  map.set(lotRef, next);
}

function latestByRef(revisions, refField, ref) {
  for (let index = revisions.length - 1; index >= 0; index -= 1) {
    if (revisions[index][refField] === ref) return revisions[index];
  }
  return null;
}

export function createInMemoryCoinsCommerceStore({
  nowFn = () => new Date().toISOString(),
  catalog = createDefaultCommerceCatalog(),
  walletLots = [],
  referralEntries = [],
  accountMemberships = []
} = {}) {
  if (typeof nowFn !== 'function') validation('invalid_now_function');
  requirePlainObject(catalog, 'invalid_catalog');
  if (!Array.isArray(catalog.productVersions) || !Array.isArray(catalog.offerVersions) || !Array.isArray(catalog.rechargeOffers)) {
    validation('invalid_catalog');
  }
  requireClosedStructure(catalog);
  const storedCatalog = snapshot(catalog);
  const productVersions = new Map();
  const offerVersions = new Map();
  const rechargeOffers = new Map();
  for (const product of storedCatalog.productVersions) {
    requirePlainObject(product, 'invalid_catalog');
    const ref = requireTrimmedString(product.productVersionRef, 'invalid_product_version_ref');
    if (productVersions.has(ref)) validation('duplicate_product_version_ref');
    productVersions.set(ref, product);
  }
  for (const offer of storedCatalog.offerVersions) {
    requirePlainObject(offer, 'invalid_catalog');
    const ref = requireTrimmedString(offer.offerVersionRef, 'invalid_offer_version_ref');
    if (offerVersions.has(ref)) validation('duplicate_offer_version_ref');
    offerVersions.set(ref, offer);
  }
  for (const offer of storedCatalog.rechargeOffers) {
    requirePlainObject(offer, 'invalid_catalog');
    const ref = requireTrimmedString(offer.rechargeOfferRef, 'invalid_recharge_offer_ref');
    if (rechargeOffers.has(ref)) validation('duplicate_recharge_offer_ref');
    rechargeOffers.set(ref, offer);
  }

  if (!Array.isArray(walletLots) || !Array.isArray(referralEntries) || !Array.isArray(accountMemberships)) {
    validation('invalid_factory_seed');
  }
  const lots = [];
  const lotsByRef = new Map();
  const transactions = [];
  const transactionRefs = new Set();
  const holdRevisions = [];
  const referralFreezeRevisions = [];
  const reversalRefs = new Set();
  const orders = new Map();
  const attemptRevisions = new Map();
  const plans = new Map();
  const idempotencyResults = new Map();
  let eventTimestampWatermark = null;

  function appendTransaction(transaction) {
    if (transactionRefs.has(transaction.transactionRef)) validation('duplicate_transaction_ref');
    transactionRefs.add(transaction.transactionRef);
    transactions.push(transaction);
    if (eventTimestampWatermark === null || transaction.createdAt > eventTimestampWatermark) {
      eventTimestampWatermark = transaction.createdAt;
    }
  }

  function requireAppendTime(candidateTime, relatedCreatedAt = null) {
    if ((eventTimestampWatermark !== null && candidateTime < eventTimestampWatermark)
      || (relatedCreatedAt !== null && candidateTime < relatedCreatedAt)) {
      validation('event_time_before_watermark');
    }
  }

  function requireIssuedCapacity(accountRef, issuedCoins) {
    let existingCoins = 0;
    for (const coinLot of lots) {
      if (coinLot.accountRef === accountRef) existingCoins = checkedAddCoins(existingCoins, coinLot.issuedCoins);
    }
    checkedAddCoins(existingCoins, issuedCoins);
  }

  for (const inputLot of walletLots) {
    const storedLot = normalizeLot(inputLot);
    if (lotsByRef.has(storedLot.lotRef)) validation('duplicate_lot_ref');
    const transactionRef = `seed_credit:${storedLot.lotRef}`;
    if (transactionRefs.has(transactionRef)) validation('duplicate_transaction_ref');
    requireIssuedCapacity(storedLot.accountRef, storedLot.issuedCoins);
    lots.push(storedLot);
    lotsByRef.set(storedLot.lotRef, storedLot);
    appendTransaction(snapshot({
      transactionRef,
      accountRef: storedLot.accountRef,
      type: 'credit',
      amountCoins: storedLot.issuedCoins,
      allocations: [{ lotRef: storedLot.lotRef, origin: storedLot.origin, amountCoins: storedLot.issuedCoins }],
      relatedRef: storedLot.lotRef,
      createdAt: storedLot.createdAt
    }));
  }

  const memberships = accountMemberships.map((membership) => {
    requireExactKeys(membership, ['accountRef', 'productVersionRef', 'validUntil'], [], 'invalid_account_membership');
    const productVersionRef = requireTrimmedString(membership.productVersionRef, 'invalid_product_version_ref');
    const product = productVersions.get(productVersionRef);
    if (!product || product.kind !== 'membership') validation('invalid_membership_product');
    if (membership.validUntil !== null) requireCanonicalIso(membership.validUntil);
    return snapshot({
      accountRef: requireTrimmedString(membership.accountRef, 'invalid_account_ref'),
      productVersionRef,
      validUntil: membership.validUntil
    });
  });

  function balancesAt(accountRef, at) {
    const consumed = new Map();
    const purchaseFrozen = new Map();
    const settlementFrozen = new Map();
    const settled = new Map();
    const reversed = new Map();
    const applicable = transactions.filter((transaction) => transaction.accountRef === accountRef && transaction.createdAt <= at);
    for (const transaction of applicable) {
      for (const allocation of transaction.allocations) {
        if (transaction.type === 'hold') addAmount(purchaseFrozen, allocation.lotRef, allocation.amountCoins);
        else if (transaction.type === 'capture') {
          subtractAmount(purchaseFrozen, allocation.lotRef, allocation.amountCoins);
          addAmount(consumed, allocation.lotRef, allocation.amountCoins);
        } else if (transaction.type === 'release') {
          subtractAmount(purchaseFrozen, allocation.lotRef, allocation.amountCoins);
        } else if (transaction.type === 'referral_freeze') {
          addAmount(settlementFrozen, allocation.lotRef, allocation.amountCoins);
        } else if (transaction.type === 'referral_release') {
          subtractAmount(settlementFrozen, allocation.lotRef, allocation.amountCoins);
        } else if (transaction.type === 'referral_settlement') {
          subtractAmount(settlementFrozen, allocation.lotRef, allocation.amountCoins);
          addAmount(settled, allocation.lotRef, allocation.amountCoins);
        } else if (transaction.type === 'referral_reversal') {
          addAmount(reversed, allocation.lotRef, allocation.amountCoins);
        }
      }
    }
    const result = new Map();
    for (const coinLot of lots) {
      if (coinLot.accountRef !== accountRef || coinLot.createdAt > at) continue;
      const committed = [
        consumed.get(coinLot.lotRef) ?? 0,
        purchaseFrozen.get(coinLot.lotRef) ?? 0,
        settlementFrozen.get(coinLot.lotRef) ?? 0,
        settled.get(coinLot.lotRef) ?? 0,
        reversed.get(coinLot.lotRef) ?? 0
      ].reduce(checkedAddCoins, 0);
      if (committed > coinLot.issuedCoins) validation('impossible_transaction_history');
      const expired = coinLot.origin === 'bonus' && coinLot.expiresAt <= at;
      result.set(coinLot.lotRef, {
        lot: coinLot,
        available: expired ? 0 : checkedSubtractCoins(coinLot.issuedCoins, committed),
        consumed: consumed.get(coinLot.lotRef) ?? 0,
        purchaseFrozen: purchaseFrozen.get(coinLot.lotRef) ?? 0,
        settlementFrozen: settlementFrozen.get(coinLot.lotRef) ?? 0,
        settled: settled.get(coinLot.lotRef) ?? 0,
        reversed: reversed.get(coinLot.lotRef) ?? 0
      });
    }
    return result;
  }

  function allocate(accountRef, amountCoins, at, referralOnly = false) {
    const balances = balancesAt(accountRef, at);
    const candidates = [...balances.values()].filter(({ lot: coinLot, available }) => (
      available > 0 && (!referralOnly || coinLot.origin === 'referral')
    ));
    candidates.sort((left, right) => {
      if (referralOnly) {
        return compareOrdinal(left.lot.createdAt, right.lot.createdAt)
          || compareOrdinal(left.lot.lotRef, right.lot.lotRef);
      }
      const leftOrigin = ORIGINS.indexOf(left.lot.origin);
      const rightOrigin = ORIGINS.indexOf(right.lot.origin);
      if (leftOrigin !== rightOrigin) return leftOrigin - rightOrigin;
      if (left.lot.origin === 'bonus') {
        return compareOrdinal(left.lot.expiresAt, right.lot.expiresAt)
          || compareOrdinal(left.lot.createdAt, right.lot.createdAt)
          || compareOrdinal(left.lot.lotRef, right.lot.lotRef);
      }
      return compareOrdinal(left.lot.createdAt, right.lot.createdAt)
        || compareOrdinal(left.lot.lotRef, right.lot.lotRef);
    });
    const availableCoins = candidates.reduce((total, candidate) => checkedAddCoins(total, candidate.available), 0);
    if (availableCoins < amountCoins) {
      throw commerceError('insufficient_coins', {
        availableCoins,
        shortfallCoins: checkedSubtractCoins(amountCoins, availableCoins)
      });
    }
    const allocations = [];
    let remaining = amountCoins;
    for (const candidate of candidates) {
      if (remaining === 0) break;
      const allocated = Math.min(remaining, candidate.available);
      allocations.push({ lotRef: candidate.lot.lotRef, origin: candidate.lot.origin, amountCoins: allocated });
      remaining = checkedSubtractCoins(remaining, allocated);
    }
    return snapshot(allocations);
  }

  function validateSeedAllocations(transaction) {
    const balances = balancesAt(transaction.accountRef, transaction.createdAt);
    for (const allocation of transaction.allocations) {
      const balance = balances.get(allocation.lotRef);
      if (!balance || balance.lot.origin !== 'referral' || balance.available < allocation.amountCoins) {
        validation('impossible_referral_history');
      }
    }
  }

  function replayReferralEntry(input) {
    const transaction = normalizeTransaction(input, REFERRAL_TYPES);
    if (transactionRefs.has(transaction.transactionRef)) validation('duplicate_transaction_ref');
    if (transaction.type === 'referral_freeze') {
      if (latestByRef(referralFreezeRevisions, 'freezeRef', transaction.relatedRef)) validation('duplicate_freeze_ref');
      validateSeedAllocations(transaction);
      referralFreezeRevisions.push(snapshot({
        freezeRef: transaction.relatedRef,
        accountRef: transaction.accountRef,
        amountCoins: transaction.amountCoins,
        status: 'frozen',
        allocations: transaction.allocations,
        createdAt: transaction.createdAt,
        releasedAt: null,
        settledAt: null,
        releaseTransactionRef: null,
        settlementTransactionRef: null
      }));
    } else if (transaction.type === 'referral_reversal') {
      if (reversalRefs.has(transaction.relatedRef)) validation('duplicate_reversal_ref');
      validateSeedAllocations(transaction);
      reversalRefs.add(transaction.relatedRef);
    } else {
      const current = latestByRef(referralFreezeRevisions, 'freezeRef', transaction.relatedRef);
      if (!current || current.accountRef !== transaction.accountRef || current.status !== 'frozen'
        || current.amountCoins !== transaction.amountCoins || !sameAllocations(current.allocations, transaction.allocations)) {
        validation('impossible_referral_history');
      }
      referralFreezeRevisions.push(snapshot({
        ...current,
        status: transaction.type === 'referral_release' ? 'released' : 'settled',
        releasedAt: transaction.type === 'referral_release' ? transaction.createdAt : null,
        settledAt: transaction.type === 'referral_settlement' ? transaction.createdAt : null,
        releaseTransactionRef: transaction.type === 'referral_release' ? transaction.transactionRef : null,
        settlementTransactionRef: transaction.type === 'referral_settlement' ? transaction.transactionRef : null
      }));
    }
    appendTransaction(transaction);
  }

  [...referralEntries]
    .sort((left, right) => compareOrdinal(String(left?.createdAt), String(right?.createdAt))
      || compareOrdinal(String(left?.transactionRef), String(right?.transactionRef)))
    .forEach(replayReferralEntry);

  function listCatalog() {
    return snapshot(storedCatalog);
  }

  function lookup(map, ref, reason) {
    requireTrimmedString(ref, reason);
    const value = map.get(ref);
    if (!value) notFound();
    return snapshot(value);
  }

  function getActiveMemberships({ accountRef, at }) {
    requireTrimmedString(accountRef, 'invalid_account_ref');
    requireCanonicalIso(at);
    return snapshot(memberships
      .filter((membership) => membership.accountRef === accountRef
        && (membership.validUntil === null || membership.validUntil > at))
      .map((membership) => productVersions.get(membership.productVersionRef))
      .sort((left, right) => compareOrdinal(left.productVersionRef, right.productVersionRef)));
  }

  function appendCoinLot({ transactionRef, lot }) {
    requireTrimmedString(transactionRef, 'invalid_transaction_ref');
    const storedLot = normalizeLot(lot);
    if (lotsByRef.has(storedLot.lotRef)) validation('duplicate_lot_ref');
    if (transactionRefs.has(transactionRef)) validation('duplicate_transaction_ref');
    requireAppendTime(storedLot.createdAt);
    requireIssuedCapacity(storedLot.accountRef, storedLot.issuedCoins);
    const transaction = snapshot({
      transactionRef,
      accountRef: storedLot.accountRef,
      type: 'credit',
      amountCoins: storedLot.issuedCoins,
      allocations: [{ lotRef: storedLot.lotRef, origin: storedLot.origin, amountCoins: storedLot.issuedCoins }],
      relatedRef: storedLot.lotRef,
      createdAt: storedLot.createdAt
    });
    lots.push(storedLot);
    lotsByRef.set(storedLot.lotRef, storedLot);
    appendTransaction(transaction);
    return snapshot({ lot: storedLot, transaction });
  }

  function getWalletSummary({ accountRef, at }) {
    requireTrimmedString(accountRef, 'invalid_account_ref');
    requireCanonicalIso(at);
    const balances = balancesAt(accountRef, at);
    const byOrigin = Object.fromEntries(ORIGINS.map((origin) => [origin, { availableCoins: 0, frozenCoins: 0 }]));
    for (const balance of balances.values()) {
      byOrigin[balance.lot.origin].availableCoins = checkedAddCoins(
        byOrigin[balance.lot.origin].availableCoins,
        balance.available
      );
      byOrigin[balance.lot.origin].frozenCoins = checkedAddCoins(
        byOrigin[balance.lot.origin].frozenCoins,
        checkedAddCoins(balance.purchaseFrozen, balance.settlementFrozen)
      );
    }
    return snapshot({
      accountRef,
      at,
      totalAvailableCoins: ORIGINS.reduce(
        (total, origin) => checkedAddCoins(total, byOrigin[origin].availableCoins), 0
      ),
      totalFrozenCoins: ORIGINS.reduce(
        (total, origin) => checkedAddCoins(total, byOrigin[origin].frozenCoins), 0
      ),
      byOrigin
    });
  }

  function listWalletTransactions({ accountRef, limit = 50 }) {
    requireTrimmedString(accountRef, 'invalid_account_ref');
    if (!Number.isSafeInteger(limit) || limit <= 0) validation('invalid_transaction_limit');
    return snapshot(transactions
      .filter((transaction) => transaction.accountRef === accountRef)
      .sort((left, right) => compareOrdinal(right.createdAt, left.createdAt)
        || compareOrdinal(left.transactionRef, right.transactionRef))
      .slice(0, limit));
  }

  function createCoinHold({ accountRef, holdRef, amountCoins }) {
    requireTrimmedString(accountRef, 'invalid_account_ref');
    requireTrimmedString(holdRef, 'invalid_hold_ref');
    requirePositiveCoins(amountCoins);
    if (latestByRef(holdRevisions, 'holdRef', holdRef)) validation('duplicate_hold_ref');
    const transactionRef = `hold:${holdRef}`;
    if (transactionRefs.has(transactionRef)) validation('duplicate_transaction_ref');
    const createdAt = requireNow(nowFn);
    requireAppendTime(createdAt);
    const allocations = allocate(accountRef, amountCoins, createdAt);
    const hold = snapshot({
      holdRef, accountRef, amountCoins, status: 'held', allocations, createdAt,
      capturedAt: null, releasedAt: null, captureTransactionRef: null, releaseTransactionRef: null
    });
    appendTransaction(snapshot({
      transactionRef, accountRef, type: 'hold', amountCoins, allocations, relatedRef: holdRef, createdAt
    }));
    holdRevisions.push(hold);
    return snapshot(hold);
  }

  function getHold(accountRef, holdRef) {
    requireTrimmedString(accountRef, 'invalid_account_ref');
    requireTrimmedString(holdRef, 'invalid_hold_ref');
    const current = latestByRef(holdRevisions, 'holdRef', holdRef);
    if (!current || current.accountRef !== accountRef) notFound();
    return current;
  }

  function terminateHold({ accountRef, holdRef, transactionRef }, operation) {
    requireTrimmedString(transactionRef, 'invalid_transaction_ref');
    const current = getHold(accountRef, holdRef);
    const storedTerminalRef = operation === 'capture' ? current.captureTransactionRef : current.releaseTransactionRef;
    if (current.status !== 'held') {
      if (storedTerminalRef === transactionRef) return snapshot(current);
      validation('hold_not_active');
    }
    if (transactionRefs.has(transactionRef)) validation('duplicate_transaction_ref');
    const createdAt = requireNow(nowFn);
    requireAppendTime(createdAt, current.createdAt);
    const next = snapshot({
      ...current,
      status: operation === 'capture' ? 'captured' : 'released',
      capturedAt: operation === 'capture' ? createdAt : null,
      releasedAt: operation === 'release' ? createdAt : null,
      captureTransactionRef: operation === 'capture' ? transactionRef : null,
      releaseTransactionRef: operation === 'release' ? transactionRef : null
    });
    appendTransaction(snapshot({
      transactionRef,
      accountRef,
      type: operation,
      amountCoins: current.amountCoins,
      allocations: current.allocations,
      relatedRef: holdRef,
      createdAt
    }));
    holdRevisions.push(next);
    return snapshot(next);
  }

  function freezeReferralCoins({ accountRef, freezeRef, amountCoins }) {
    requireTrimmedString(accountRef, 'invalid_account_ref');
    requireTrimmedString(freezeRef, 'invalid_freeze_ref');
    requirePositiveCoins(amountCoins);
    if (latestByRef(referralFreezeRevisions, 'freezeRef', freezeRef)) validation('duplicate_freeze_ref');
    const transactionRef = `referral_freeze:${freezeRef}`;
    if (transactionRefs.has(transactionRef)) validation('duplicate_transaction_ref');
    const createdAt = requireNow(nowFn);
    requireAppendTime(createdAt);
    const allocations = allocate(accountRef, amountCoins, createdAt, true);
    const freezeState = snapshot({
      freezeRef, accountRef, amountCoins, status: 'frozen', allocations, createdAt,
      releasedAt: null, settledAt: null, releaseTransactionRef: null, settlementTransactionRef: null
    });
    appendTransaction(snapshot({
      transactionRef, accountRef, type: 'referral_freeze', amountCoins, allocations,
      relatedRef: freezeRef, createdAt
    }));
    referralFreezeRevisions.push(freezeState);
    return snapshot(freezeState);
  }

  function getReferralFreeze(accountRef, freezeRef) {
    requireTrimmedString(accountRef, 'invalid_account_ref');
    requireTrimmedString(freezeRef, 'invalid_freeze_ref');
    const current = latestByRef(referralFreezeRevisions, 'freezeRef', freezeRef);
    if (!current || current.accountRef !== accountRef) notFound();
    return current;
  }

  function terminateReferralFreeze({ accountRef, freezeRef, transactionRef }, operation) {
    requireTrimmedString(transactionRef, 'invalid_transaction_ref');
    const current = getReferralFreeze(accountRef, freezeRef);
    const storedTerminalRef = operation === 'release' ? current.releaseTransactionRef : current.settlementTransactionRef;
    if (current.status !== 'frozen') {
      if (storedTerminalRef === transactionRef) return snapshot(current);
      validation('freeze_not_active');
    }
    if (transactionRefs.has(transactionRef)) validation('duplicate_transaction_ref');
    const createdAt = requireNow(nowFn);
    requireAppendTime(createdAt, current.createdAt);
    const next = snapshot({
      ...current,
      status: operation === 'release' ? 'released' : 'settled',
      releasedAt: operation === 'release' ? createdAt : null,
      settledAt: operation === 'settlement' ? createdAt : null,
      releaseTransactionRef: operation === 'release' ? transactionRef : null,
      settlementTransactionRef: operation === 'settlement' ? transactionRef : null
    });
    appendTransaction(snapshot({
      transactionRef,
      accountRef,
      type: operation === 'release' ? 'referral_release' : 'referral_settlement',
      amountCoins: current.amountCoins,
      allocations: current.allocations,
      relatedRef: freezeRef,
      createdAt
    }));
    referralFreezeRevisions.push(next);
    return snapshot(next);
  }

  function reverseReferralCoins({ accountRef, reversalRef, amountCoins }) {
    requireTrimmedString(accountRef, 'invalid_account_ref');
    requireTrimmedString(reversalRef, 'invalid_reversal_ref');
    requirePositiveCoins(amountCoins);
    if (reversalRefs.has(reversalRef)) validation('duplicate_reversal_ref');
    const transactionRef = `referral_reversal:${reversalRef}`;
    if (transactionRefs.has(transactionRef)) validation('duplicate_transaction_ref');
    const createdAt = requireNow(nowFn);
    requireAppendTime(createdAt);
    const allocations = allocate(accountRef, amountCoins, createdAt, true);
    const transaction = snapshot({
      transactionRef, accountRef, type: 'referral_reversal', amountCoins, allocations,
      relatedRef: reversalRef, createdAt
    });
    appendTransaction(transaction);
    reversalRefs.add(reversalRef);
    return snapshot(transaction);
  }

  function getReferralSummary({ accountRef, at }) {
    requireTrimmedString(accountRef, 'invalid_account_ref');
    requireCanonicalIso(at);
    const balances = balancesAt(accountRef, at);
    let cumulativeEarnedCoins = 0;
    let availableCoins = 0;
    let internallyConsumedCoins = 0;
    let purchaseFrozenCoins = 0;
    let frozenForSettlementCoins = 0;
    let externallySettledCoins = 0;
    let reversedCoins = 0;
    for (const balance of balances.values()) {
      if (balance.lot.origin !== 'referral') continue;
      cumulativeEarnedCoins = checkedAddCoins(cumulativeEarnedCoins, balance.lot.issuedCoins);
      availableCoins = checkedAddCoins(availableCoins, balance.available);
      internallyConsumedCoins = checkedAddCoins(internallyConsumedCoins, balance.consumed);
      purchaseFrozenCoins = checkedAddCoins(purchaseFrozenCoins, balance.purchaseFrozen);
      frozenForSettlementCoins = checkedAddCoins(frozenForSettlementCoins, balance.settlementFrozen);
      externallySettledCoins = checkedAddCoins(externallySettledCoins, balance.settled);
      reversedCoins = checkedAddCoins(reversedCoins, balance.reversed);
    }
    return snapshot({
      accountRef,
      at,
      cumulativeEarnedCoins,
      availableCoins,
      internallyConsumedCoins,
      frozenCoins: checkedAddCoins(purchaseFrozenCoins, frozenForSettlementCoins),
      frozenForSettlementCoins,
      externallySettledCoins,
      reversedCoins
    });
  }

  function prepareAggregate(value, requiredFields, reason) {
    requirePlainObject(value, reason);
    requireClosedValue(value);
    requiredFields.forEach((field) => requireTrimmedString(value[field], `invalid_${field}`));
    requireCanonicalIso(value.createdAt);
    return snapshot(value);
  }

  function insertOrder(order) {
    const stored = prepareAggregate(order, ['orderRef', 'accountRef'], 'invalid_order');
    if (orders.has(stored.orderRef)) validation('duplicate_order_ref');
    orders.set(stored.orderRef, stored);
    return snapshot(stored);
  }

  function getOrderForAccount({ accountRef, orderRef }) {
    requireTrimmedString(accountRef, 'invalid_account_ref');
    requireTrimmedString(orderRef, 'invalid_order_ref');
    const order = orders.get(orderRef);
    if (!order || order.accountRef !== accountRef) notFound();
    return snapshot(order);
  }

  function listOrdersForAccount({ accountRef }) {
    requireTrimmedString(accountRef, 'invalid_account_ref');
    return snapshot([...orders.values()]
      .filter((order) => order.accountRef === accountRef)
      .sort((left, right) => compareOrdinal(left.createdAt, right.createdAt)
        || compareOrdinal(left.orderRef, right.orderRef)));
  }

  function insertPaymentAttempt(attempt) {
    const stored = prepareAggregate(attempt, ['attemptRef', 'accountRef', 'orderRef', 'providerId'], 'invalid_payment_attempt');
    if (attemptRevisions.has(stored.attemptRef)) validation('duplicate_attempt_ref');
    attemptRevisions.set(stored.attemptRef, [stored]);
    return snapshot(stored);
  }

  function updatePaymentAttempt(attempt) {
    requirePlainObject(attempt, 'invalid_payment_attempt');
    requireClosedValue(attempt);
    const attemptRef = requireTrimmedString(attempt.attemptRef, 'invalid_attemptRef');
    const accountRef = requireTrimmedString(attempt.accountRef, 'invalid_accountRef');
    const revisions = attemptRevisions.get(attemptRef);
    if (!revisions || revisions.at(-1).accountRef !== accountRef) notFound();
    const stored = prepareAggregate(attempt, ['attemptRef', 'accountRef', 'orderRef', 'providerId'], 'invalid_payment_attempt');
    const current = revisions.at(-1);
    for (const field of ['attemptRef', 'accountRef', 'orderRef', 'providerId', 'sourceAttemptRef']) {
      if (current[field] !== stored[field]) validation('payment_attempt_identity_changed');
    }
    revisions.push(stored);
    return snapshot(stored);
  }

  function getPaymentAttemptForAccount({ accountRef, attemptRef }) {
    requireTrimmedString(accountRef, 'invalid_account_ref');
    requireTrimmedString(attemptRef, 'invalid_attempt_ref');
    const attempt = attemptRevisions.get(attemptRef)?.at(-1);
    if (!attempt || attempt.accountRef !== accountRef) notFound();
    return snapshot(attempt);
  }

  function listPaymentAttempts({ status, limit = 50, cursor = 0 } = {}) {
    if (status !== undefined) requireTrimmedString(status, 'invalid_attempt_status');
    if (!Number.isSafeInteger(limit) || limit <= 0 || limit > 100) validation('invalid_attempt_limit');
    if (!Number.isSafeInteger(cursor) || cursor < 0) validation('invalid_attempt_cursor');
    const latest = [...attemptRevisions.values()].map((revisions) => revisions.at(-1))
      .filter((attempt) => status === undefined || attempt.status === status)
      .sort((left, right) => compareOrdinal(right.createdAt, left.createdAt)
        || compareOrdinal(left.attemptRef, right.attemptRef));
    const items = latest.slice(cursor, cursor + limit);
    const nextCursor = cursor + items.length < latest.length ? cursor + items.length : null;
    return snapshot({ items, nextCursor });
  }

  function insertFulfillmentPlan(plan) {
    const stored = prepareAggregate(plan, ['planRef', 'orderRef'], 'invalid_fulfillment_plan');
    if (plans.has(stored.planRef)) validation('duplicate_plan_ref');
    plans.set(stored.planRef, stored);
    return snapshot(stored);
  }

  function getFulfillmentPlan(planRef) {
    requireTrimmedString(planRef, 'invalid_plan_ref');
    const plan = plans.get(planRef);
    if (!plan) notFound();
    return snapshot(plan);
  }

  function idempotencyKey({ scope, accountRef, idempotencyKey, requestDigest }) {
    requireTrimmedString(scope, 'invalid_scope');
    requireTrimmedString(accountRef, 'invalid_account_ref');
    requireTrimmedString(idempotencyKey, 'invalid_idempotency_key');
    requireTrimmedString(requestDigest, 'invalid_request_digest');
    if (!/^[0-9a-f]{64}$/.test(requestDigest)) validation('invalid_request_digest');
    return `${scope.length}:${scope}${accountRef.length}:${accountRef}${idempotencyKey.length}:${idempotencyKey}`;
  }

  function getIdempotencyResult(input) {
    const key = idempotencyKey(input);
    const stored = idempotencyResults.get(key);
    if (!stored) return null;
    if (stored.requestDigest !== input.requestDigest) throw commerceError('idempotency_conflict', {});
    return snapshot(stored.result);
  }

  function recordIdempotencyResult(input) {
    requirePlainObject(input, 'invalid_idempotency_record');
    const key = idempotencyKey(input);
    const existing = idempotencyResults.get(key);
    if (existing) {
      if (existing.requestDigest !== input.requestDigest) throw commerceError('idempotency_conflict', {});
      return snapshot(existing.result);
    }
    requireClosedValue(input.result);
    const stored = snapshot({ requestDigest: input.requestDigest, result: input.result });
    idempotencyResults.set(key, stored);
    return snapshot(stored.result);
  }

  return Object.freeze({
    listCatalog,
    getProductVersion: (productVersionRef) => lookup(productVersions, productVersionRef, 'invalid_product_version_ref'),
    getOffer: (offerVersionRef) => lookup(offerVersions, offerVersionRef, 'invalid_offer_version_ref'),
    getRechargeOffer: (rechargeOfferRef) => lookup(rechargeOffers, rechargeOfferRef, 'invalid_recharge_offer_ref'),
    getActiveMemberships,
    appendCoinLot,
    getWalletSummary,
    listWalletTransactions,
    createCoinHold,
    captureCoinHold: (input) => terminateHold(input, 'capture'),
    releaseCoinHold: (input) => terminateHold(input, 'release'),
    freezeReferralCoins,
    releaseReferralFreeze: (input) => terminateReferralFreeze(input, 'release'),
    settleReferralFreeze: (input) => terminateReferralFreeze(input, 'settlement'),
    reverseReferralCoins,
    getReferralSummary,
    insertOrder,
    getOrderForAccount,
    listOrdersForAccount,
    insertPaymentAttempt,
    updatePaymentAttempt,
    getPaymentAttemptForAccount,
    listPaymentAttempts,
    insertFulfillmentPlan,
    getFulfillmentPlan,
    getIdempotencyResult,
    recordIdempotencyResult
  });
}
