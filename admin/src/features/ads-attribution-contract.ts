export type PortalAdsClickDescriptor = {
  type: "gclid" | "gbraid" | "wbraid";
  value: string;
  clickAt: number;
  consent: { adUserData: true; adPersonalization: false };
};

export type PortalAdsConsentDecision = "unknown" | "granted" | "denied";
export type PortalAdsConsentState = {
  decision: PortalAdsConsentDecision;
  adUserData: boolean | null;
  adPersonalization: false;
  updatedAt: number | null;
};
export type PortalAdsConsentClient = {
  getConsent(input: { sessionRef: string }): Promise<PortalAdsConsentState>;
  setConsent(input: { sessionRef: string; adUserData: boolean }): Promise<PortalAdsConsentState>;
};
