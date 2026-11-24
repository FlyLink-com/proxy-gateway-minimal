// start.mjs coordinator snapshots: getStatus forwarding (W-114, 2026-11-24).
//
// Scope, stated plainly: these tests prove the snapshot wrapper forwards
// the read-only quiescence read (getStatus) when the coordinator has one,
// binds it to the live coordinator, and omits it when the coordinator has
// none (deferred-transition). They do NOT prove any scheduler item
// quiesced: quiescence evidence is only produced by the freeze executor
// inside a freeze window, against the live process. All fixtures are
// synthetic; no production data, no network, no E4/D1 calls.
import assert from "node:assert/strict";
import test from "node:test";

import { snapshotRuntimeCoordinators } from "../start.mjs";

function fakeCoordinator({ withStatus = true } = {}) {
  let running = false;
  let statusCalls = 0;
  const coordinator = {
    start() { running = true; },
    stop() { running = false; },
  };
  if (withStatus) {
    coordinator.getStatus = () => {
      statusCalls += 1;
      return Object.freeze({ running });
    };
  }
  return {
    coordinator,
    statusCalls: () => statusCalls,
    isRunning: () => running,
  };
}

function fakeState({ commerce, rotation, welcome, deferred } = {}) {
  return {
    platform: {
      coinsCommerceEnabled: commerce !== undefined,
      coinCommerceCoordinator: commerce?.coordinator ?? null,
      coinCommerceDataPackRotationCoordinator: rotation?.coordinator ?? null,
      registrationWelcomeCoinsWorkerEnabled: welcome !== undefined,
      portalRegistrationWelcomeBonusCoordinator: welcome?.coordinator ?? null,
      walletFirstDeferredRuntimeEnabled: deferred !== undefined,
      deferredTransitionCoordinator: deferred?.coordinator ?? null,
    },
  };
}

test("W-114 snapshot forwards getStatus bound to the live coordinator", () => {
  const commerce = fakeCoordinator();
  const rotation = fakeCoordinator();
  const welcome = fakeCoordinator();
  const deferred = fakeCoordinator({ withStatus: false });
  const snapshots = snapshotRuntimeCoordinators(fakeState({ commerce, rotation, welcome, deferred }));
  assert.equal(snapshots.length, 4);

  // The snapshot reads the live coordinator: start the underlying
  // coordinator and the snapshot's read follows.
  assert.deepEqual(snapshots[0].getStatus(), { running: false });
  commerce.coordinator.start();
  assert.deepEqual(snapshots[0].getStatus(), { running: true });
  assert.equal(commerce.statusCalls(), 2);

  // The forwarded read stays bound when detached from the snapshot.
  const { getStatus } = snapshots[1];
  rotation.coordinator.start();
  assert.deepEqual(getStatus(), { running: true });

  // The welcome-bonus snapshot forwards its read too; the
  // deferred-transition snapshot (no getStatus) omits it.
  assert.equal(typeof snapshots[2].getStatus, "function");
  assert.equal("getStatus" in snapshots[3], false);
  assert.equal(typeof snapshots[3].start, "function");
  assert.equal(typeof snapshots[3].stop, "function");

  for (const snapshot of snapshots) {
    assert.equal(Object.isFrozen(snapshot), true);
  }
});

test("W-114 snapshot without a created rotation coordinator filters it out", () => {
  const commerce = fakeCoordinator();
  const welcome = fakeCoordinator();
  const snapshots = snapshotRuntimeCoordinators(fakeState({ commerce, welcome }));
  assert.equal(snapshots.length, 2);
  assert.equal(typeof snapshots[0].getStatus, "function");
  assert.equal(typeof snapshots[1].getStatus, "function");
});

test("W-114 snapshot fails closed when start/stop/getStatus is not a function", () => {
  const brokenStop = fakeCoordinator();
  delete brokenStop.coordinator.stop;
  assert.throws(
    () => snapshotRuntimeCoordinators(fakeState({ commerce: brokenStop })),
    (error) => error.code === "coin_commerce_prerequisite_missing",
  );

  const brokenStatus = fakeCoordinator();
  brokenStatus.coordinator.getStatus = "not-a-function";
  assert.throws(
    () => snapshotRuntimeCoordinators(fakeState({ commerce: brokenStatus })),
    (error) => error.code === "coin_commerce_prerequisite_missing",
  );
});
