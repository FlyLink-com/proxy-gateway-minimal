export const ADMIN_DENSITY_MODES = [
  "compact",
  "normal",
  "spacious"
] as const;

export type AdminDensityMode = (typeof ADMIN_DENSITY_MODES)[number];

export type AdminDensitySpec = {
  id: AdminDensityMode;
  cardPadding: string;
  sectionGap: string;
  rowHeight: string;
  minTouchTargetPx: number;
  comfortableTouchTargetPx: number;
};

export const ADMIN_DENSITY_SPECS: Record<AdminDensityMode, AdminDensitySpec> = {
  compact: {
    id: "compact",
    cardPadding: "12px",
    comfortableTouchTargetPx: 48,
    minTouchTargetPx: 44,
    rowHeight: "36px",
    sectionGap: "12px"
  },
  normal: {
    id: "normal",
    cardPadding: "16px",
    comfortableTouchTargetPx: 48,
    minTouchTargetPx: 44,
    rowHeight: "44px",
    sectionGap: "20px"
  },
  spacious: {
    id: "spacious",
    cardPadding: "20px",
    comfortableTouchTargetPx: 48,
    minTouchTargetPx: 44,
    rowHeight: "48px",
    sectionGap: "24px"
  }
} as const;
