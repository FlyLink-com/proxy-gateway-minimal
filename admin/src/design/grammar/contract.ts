import type {
  AdminPageContract,
  AdminPageRequiredBlock
} from "../../app/admin-ui-contract";
import {
  ADMIN_HIERARCHY_RULES,
  type AdminHierarchyRole
} from "./hierarchy";
import { ADMIN_LAYOUT_SPECS } from "./layout";

export const ADMIN_HIERARCHY_BLOCK_HINTS: Readonly<
  Record<AdminHierarchyRole, readonly AdminPageRequiredBlock[]>
> = {
  action: ["owner-action"],
  context: ["page-context"],
  detail: ["primary-panel"],
  evidence: ["evidence-row"],
  metric: ["summary", "status-chip"],
  state: ["state-preview"]
} as const;

export function getRequiredAdminHierarchyRoles(): AdminHierarchyRole[] {
  return ADMIN_HIERARCHY_RULES
    .filter((rule) => rule.required)
    .sort((left, right) => left.order - right.order)
    .map((rule) => rule.role);
}

export function validateAdminPageContract(contract: AdminPageContract): AdminPageContract {
  const layoutSpec = ADMIN_LAYOUT_SPECS[contract.layout];

  if (!layoutSpec) {
    throw new Error(`[admin-ui-contract] page=${contract.page} uses unknown layout: ${contract.layout}`);
  }

  if (contract.mobileProjection !== layoutSpec.mobileProjection) {
    throw new Error(
      `[admin-ui-contract] page=${contract.page} mobileProjection=${contract.mobileProjection} does not match layout=${contract.layout}`
    );
  }

  for (const role of getRequiredAdminHierarchyRoles()) {
    if (!contract.hierarchy.includes(role)) {
      throw new Error(`[admin-ui-contract] page=${contract.page} missing required hierarchy role: ${role}`);
    }

    const matchingBlocks = ADMIN_HIERARCHY_BLOCK_HINTS[role];
    const hasMatchingBlock = matchingBlocks.some((block) => contract.requiredBlocks.includes(block));

    if (!hasMatchingBlock) {
      throw new Error(`[admin-ui-contract] page=${contract.page} role=${role} has no matching required block`);
    }
  }

  return contract;
}

export function defineAdminPageContract(contract: AdminPageContract): AdminPageContract {
  return validateAdminPageContract(contract);
}
