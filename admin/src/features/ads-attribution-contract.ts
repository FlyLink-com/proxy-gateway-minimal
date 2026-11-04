export type PortalAdsClickDescriptor = {
  type: "gclid" | "gbraid" | "wbraid";
  value: string;
  clickAt: number;
  consent: { adUserData: true; adPersonalization: false };
};
