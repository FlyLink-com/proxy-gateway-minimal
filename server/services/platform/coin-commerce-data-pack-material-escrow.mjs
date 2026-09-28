import { createWalletFirstSetupDeliveryEscrow } from "./wallet-first-setup-delivery-escrow.mjs";

// A separate file and key scope are required: pack material must remain
// retrievable from its order after the first dialog closes. Never acknowledge
// (discard) the underlying escrow record as the one-time wallet-first flow does.
export function createCoinCommerceDataPackMaterialEscrow({ key, filePath } = {}) {
  const backing = createWalletFirstSetupDeliveryEscrow({ key, filePath });
  const binding = ({ orderRef, commandRef, tenantId, artifactId }) => ({
    transitionRef: orderRef, effectRef: commandRef, tenantId, artifactId
  });
  return Object.freeze({
    capture(input) {
      return backing.runtimeEscrow.captureInitialSetupDelivery({
        ...binding(input), subscriptionUrl: input.subscriptionUrl
      });
    },
    verify(input) {
      return backing.runtimeEscrow.verifyInitialSetupDelivery(binding(input));
    },
    probe(input) {
      return backing.probeInitialSetupDelivery(binding(input));
    },
    release(input) {
      const scope = binding(input);
      const summary = backing.deliveryEscrow.getSetupDeliverySummary(scope);
      return backing.deliveryEscrow.releaseSetupDelivery({
        handoffRef: summary.handoffRef, ...scope
      });
    },
    close: () => backing.close()
  });
}
