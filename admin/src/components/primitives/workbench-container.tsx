export type WorkbenchCategory =
  | "monitoring"
  | "management"
  | "configuration"
  | "audit-workflow"
  | "platform-tools";

export type WorkbenchContainerSpec = {
  category: WorkbenchCategory;
  container: string;
  dataAdapter: string;
  layoutPolicy: string;
  performanceBoundary: string;
  interactionModel: string;
};
