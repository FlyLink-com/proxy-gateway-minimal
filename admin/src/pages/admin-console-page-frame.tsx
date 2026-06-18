import { GripVertical, Settings } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { ADMIN_UI_CONTRACT } from "../app/admin-ui-contract";
import {
  type AdminPage,
  pageSubNavigation
} from "../app/navigation";
import {
  createDefaultModuleLayout,
  defaultModuleLayoutState,
  isWorkspaceLayoutForModules,
  loadWorkspaceLayout,
  persistWorkspaceLayout,
  type ModuleDisplayHeight,
  type ModuleDisplaySize,
  type ModuleLayoutMap,
  type ModuleLayoutState
} from "../app/plugin-layout-store";
import {
  hideModuleLayoutState,
  layoutFromResizeDrag,
  moveModuleBefore,
  resizeModuleLayoutState,
  restoreModuleLayoutState,
  type PluginResizeDirection
} from "../app/plugin-workspace-engine";
import {
  EmptyState,
  PluginFrame,
  type WorkbenchCategory,
  type MetricTone,
  type WorkbenchContainerSpec
} from "../components/primitives";

export type BlueprintModule = {
  navId: string;
  container: WorkbenchContainerSpec;
  purpose: string;
  contentFields: string[];
  states: string[];
  ownership: string;
  boundaries: string[];
  nextStep: string;
  actions?: ReactNode;
};

export type BlueprintPage = {
  page: AdminPage;
  ariaLabel: string;
  kicker: string;
  title: string;
  description: string;
  statusLabel: string;
  statusTone: MetricTone;
  modules: BlueprintModule[];
};

type OpenModuleEventDetail = {
  navId?: string;
  page?: AdminPage;
  targetId?: string;
};

type ModuleResizeSession = {
  navId: string;
  direction: PluginResizeDirection;
  startX: number;
  startY: number;
  startSize: ModuleDisplaySize;
  startHeight: ModuleDisplayHeight;
};

type ModuleMoveSession = {
  navId: string;
  lastTargetNavId: string | null;
};

const PLUGIN_CATEGORY_LABEL: Record<WorkbenchCategory, string> = {
  monitoring: "Monitoring",
  management: "Management",
  configuration: "Configuration",
  "audit-workflow": "Audit / Workflow",
  "platform-tools": "Platform Tools"
};

export function AdminConsolePageFrame({ blueprint }: { blueprint: BlueprintPage }) {
  const subNavigation = pageSubNavigation[blueprint.page];
  const moduleNavSignature = blueprint.modules.map((module) => module.navId).join("|");
  const defaultModuleLayout = useMemo(() => createDefaultModuleLayout(blueprint.modules), [moduleNavSignature]);
  const initialWorkspaceLayout = useMemo(
    () => loadWorkspaceLayout(blueprint.page, blueprint.modules, defaultModuleLayout),
    [blueprint.page, defaultModuleLayout, moduleNavSignature]
  );
  const [openCardTools, setOpenCardTools] = useState<string | null>(null);
  const [moduleLayout, setModuleLayout] = useState<ModuleLayoutMap>(() => initialWorkspaceLayout.moduleLayout);
  const [moduleOrder, setModuleOrder] = useState(() => initialWorkspaceLayout.moduleOrder);
  const [draggingModule, setDraggingModule] = useState<string | null>(null);
  const [resizingModule, setResizingModule] = useState<string | null>(null);
  const resizeSessionRef = useRef<ModuleResizeSession | null>(null);
  const moveSessionRef = useRef<ModuleMoveSession | null>(null);

  useEffect(() => {
    const nextLayout = loadWorkspaceLayout(blueprint.page, blueprint.modules, defaultModuleLayout);
    setModuleLayout(nextLayout.moduleLayout);
    setModuleOrder(nextLayout.moduleOrder);
    setOpenCardTools(null);
    setDraggingModule(null);
    setResizingModule(null);
    resizeSessionRef.current = null;
    moveSessionRef.current = null;
  }, [blueprint.page, defaultModuleLayout, moduleNavSignature]);

  useEffect(() => {
    const snapshot = { moduleLayout, moduleOrder };
    if (!isWorkspaceLayoutForModules(snapshot, blueprint.modules)) {
      return;
    }
    persistWorkspaceLayout(blueprint.page, snapshot);
  }, [blueprint.page, moduleLayout, moduleNavSignature, moduleOrder]);

  const updateModuleLayout = (navId: string, nextLayout: Partial<ModuleLayoutState>) => {
    setModuleLayout((current) => ({
      ...current,
      [navId]: {
        ...resizeModuleLayoutState(
          current[navId] ?? defaultModuleLayout[navId] ?? defaultModuleLayoutState(),
          nextLayout
        )
      }
    }));
  };

  const hideModuleLayout = (navId: string) => {
    setModuleLayout((current) => ({
      ...current,
      [navId]: hideModuleLayoutState(
        current[navId] ?? defaultModuleLayout[navId] ?? defaultModuleLayoutState()
      )
    }));
    setOpenCardTools(null);
  };

  const moduleRestoreTargets = useMemo(() => blueprint.modules.map((module) => {
    const navItem = subNavigation.find((item) => item.id === module.navId);
    return {
      navId: module.navId,
      targetId: navItem?.targetId ?? module.navId
    };
  }), [blueprint.modules, subNavigation]);

  useEffect(() => {
    const handleOpenModule = (event: Event) => {
      const detail = (event as CustomEvent<OpenModuleEventDetail>).detail;
      if (detail?.page !== blueprint.page) {
        return;
      }
      const match = moduleRestoreTargets.find((target) => (
        target.navId === detail.navId ||
        target.navId === detail.targetId ||
        target.targetId === detail.targetId
      ));
      if (!match) {
        return;
      }
      setModuleLayout((current) => ({
        ...current,
        [match.navId]: restoreModuleLayoutState(
          current[match.navId] ?? defaultModuleLayout[match.navId] ?? defaultModuleLayoutState()
        )
      }));
      setOpenCardTools(null);
    };

    window.addEventListener("admin-open-module", handleOpenModule);
    return () => window.removeEventListener("admin-open-module", handleOpenModule);
  }, [blueprint.page, defaultModuleLayout, moduleRestoreTargets]);

  const reorderModule = useCallback((sourceNavId: string, targetNavId: string) => {
    if (!sourceNavId || sourceNavId === targetNavId) {
      return;
    }
    setModuleOrder((current) => moveModuleBefore(current, sourceNavId, targetNavId));
  }, []);

  useEffect(() => {
    const handlePointerMove = (event: globalThis.PointerEvent) => {
      const session = moveSessionRef.current;
      if (!session) {
        return;
      }
      event.preventDefault();
      const targetNavId = findWorkspaceTargetNavIdFromPoint(
        document,
        event.clientX,
        event.clientY
      );
      if (!targetNavId || targetNavId === session.navId || targetNavId === session.lastTargetNavId) {
        return;
      }
      session.lastTargetNavId = targetNavId;
      reorderModule(session.navId, targetNavId);
    };

    const handlePointerEnd = () => {
      if (!moveSessionRef.current) {
        return;
      }
      moveSessionRef.current = null;
      setDraggingModule(null);
    };

    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerEnd);
    document.addEventListener("pointercancel", handlePointerEnd);
    return () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerEnd);
      document.removeEventListener("pointercancel", handlePointerEnd);
    };
  }, [reorderModule]);

  const beginModuleResize = (
    event: PointerEvent<HTMLButtonElement>,
    navId: string,
    layout: ModuleLayoutState,
    direction: PluginResizeDirection
  ) => {
    if (event.button != null && event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    resizeSessionRef.current = {
      navId,
      direction,
      startX: event.clientX,
      startY: event.clientY,
      startSize: layout.size,
      startHeight: layout.height
    };
    setResizingModule(navId);
  };

  const moveModuleResize = (event: PointerEvent<HTMLButtonElement>, navId: string) => {
    const session = resizeSessionRef.current;
    if (!session || session.navId !== navId) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const nextLayout = layoutFromResizeDrag(
      session.startSize,
      session.startHeight,
      session.direction,
      event.clientX - session.startX,
      event.clientY - session.startY
    );
    updateModuleLayout(navId, { ...nextLayout, visible: true });
  };

  const endModuleResize = (event: PointerEvent<HTMLButtonElement>, navId: string) => {
    const session = resizeSessionRef.current;
    if (!session || session.navId !== navId) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    resizeSessionRef.current = null;
    setResizingModule(null);
  };

  const beginModuleMove = (event: PointerEvent<HTMLButtonElement>, navId: string) => {
    if (event.button != null && event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    moveSessionRef.current = {
      navId,
      lastTargetNavId: null
    };
    setOpenCardTools(null);
    setDraggingModule(navId);
  };

  const moveModule = (event: PointerEvent<HTMLButtonElement>, navId: string) => {
    const session = moveSessionRef.current;
    if (!session || session.navId !== navId) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const targetNavId = findWorkspaceTargetNavId(event);
    if (!targetNavId || targetNavId === navId || targetNavId === session.lastTargetNavId) {
      return;
    }
    session.lastTargetNavId = targetNavId;
    reorderModule(navId, targetNavId);
  };

  const endModuleMove = (event: PointerEvent<HTMLButtonElement>, navId: string) => {
    const session = moveSessionRef.current;
    if (!session || session.navId !== navId) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    moveSessionRef.current = null;
    setDraggingModule(null);
  };

  const moduleRows = blueprint.modules.map((module, index) => {
    const navItem = subNavigation.find((item) => item.id === module.navId);
    const targetId = navItem?.targetId ?? module.navId;
    const sectionTitle = navItem?.label ?? module.navId;
    const layout = moduleLayout[module.navId] ?? defaultModuleLayout[module.navId] ?? defaultModuleLayoutState();
    return {
      layout,
      module,
      navItem,
      index,
      sectionTitle,
      targetId
    };
  });
  const orderIndexByNavId = new Map(moduleOrder.map((navId, index) => [navId, index]));
  const orderedModuleRows = [...moduleRows]
    .sort((left, right) => (
      (orderIndexByNavId.get(left.module.navId) ?? left.index) -
      (orderIndexByNavId.get(right.module.navId) ?? right.index)
    ));
  const displayedModuleRows = orderedModuleRows
    .filter((row) => row.layout.visible);

  return (
    <div
      className="page-stack admin-blueprint-page"
      data-density={ADMIN_UI_CONTRACT.pageFrame.density}
      data-page={blueprint.page}
      data-ui-contract={ADMIN_UI_CONTRACT.pageFrame.contractId}
    >
      <header className="sr-only" aria-label={blueprint.ariaLabel}>
        <p>{blueprint.kicker}</p>
        <h2>{blueprint.title}</h2>
        <p>{blueprint.description}</p>
      </header>

      <div className="admin-blueprint-module-board" aria-label={`${blueprint.title} module layout`}>
        {displayedModuleRows.length > 0 ? displayedModuleRows.map((row) => {
          const { layout, module, navItem, sectionTitle, targetId } = row;
          const cardToolsOpen = openCardTools === module.navId;
          return (
            <PluginFrame
              actions={module.actions}
              ariaLabel={`${PLUGIN_CATEGORY_LABEL[module.container.category]} container contract`}
              category={module.container.category}
              className={[
                cardToolsOpen ? "admin-blueprint-module-card-editing" : "",
                layout.visible ? "" : "admin-blueprint-module-card-hidden",
                draggingModule === module.navId ? "admin-blueprint-module-card-dragging" : "",
                resizingModule === module.navId ? "admin-blueprint-module-card-resizing" : ""
              ].filter(Boolean).join(" ")}
              containerLabel={module.container.container}
              dataModuleNavId={module.navId}
              dragHandle={(
                <button
                  aria-label={`${sectionTitle} move plugin`}
                  className="admin-blueprint-card-drag-handle"
                  onPointerCancel={(event) => endModuleMove(event, module.navId)}
                  onPointerDown={(event) => beginModuleMove(event, module.navId)}
                  onPointerMove={(event) => moveModule(event, module.navId)}
                  onPointerUp={(event) => endModuleMove(event, module.navId)}
                  title={`${sectionTitle} move plugin`}
                  type="button"
                >
                  <GripVertical />
                </button>
              )}
              fieldLabels={module.contentFields.slice(0, visibleFieldCount(layout.size, module.contentFields.length))}
              height={layout.height}
              id={targetId}
              key={module.navId}
              notes={(
                <BlueprintDisclosure className="admin-blueprint-module-notes" title="Details">
                <p className="admin-blueprint-module-purpose">{module.purpose}</p>
                <dl className="admin-blueprint-module-contract">
                  <div>
                    <dt>Ownership</dt>
                    <dd>{module.ownership}</dd>
                  </div>
                  <div>
                    <dt>Data adapter</dt>
                    <dd>{module.container.dataAdapter}</dd>
                  </div>
                  <div>
                    <dt>Layout policy</dt>
                    <dd>{module.container.layoutPolicy}</dd>
                  </div>
                  <div>
                    <dt>Performance boundary</dt>
                    <dd>{module.container.performanceBoundary}</dd>
                  </div>
                  <div>
                    <dt>Interaction model</dt>
                    <dd>{module.container.interactionModel}</dd>
                  </div>
                </dl>
                <div className="admin-blueprint-module-grid">
                  <BlueprintList title="Content fields" items={module.contentFields} />
                  <BlueprintList title="State coverage" items={module.states} />
                  <BlueprintList title="Boundaries" items={module.boundaries} />
                </div>
                <div className="admin-blueprint-next-step">
                  <div>
                    <strong>Ownership</strong>
                    <span>{module.ownership}</span>
                  </div>
                  <div>
                    <strong>Implementation gate</strong>
                    <span>{module.nextStep}</span>
                  </div>
                </div>
                </BlueprintDisclosure>
              )}
              onHide={() => hideModuleLayout(module.navId)}
              onResize={(nextLayout) => updateModuleLayout(module.navId, nextLayout)}
              onResizePointerCancel={(event) => endModuleResize(event, module.navId)}
              onResizePointerDown={(event, direction) => beginModuleResize(event, module.navId, layout, direction)}
              onResizePointerMove={(event) => moveModuleResize(event, module.navId)}
              onResizePointerUp={(event) => endModuleResize(event, module.navId)}
              ownerMode={navItem?.mode === "preview" ? "preview" : "owner"}
              settingsOpen={cardToolsOpen}
              settingsTrigger={(
                <button
                  aria-expanded={cardToolsOpen}
                  aria-label={`${sectionTitle} plugin settings`}
                  className="admin-blueprint-card-tool-trigger"
                  onClick={() => setOpenCardTools((current) => current === module.navId ? null : module.navId)}
                  title={`${sectionTitle} plugin settings`}
                  type="button"
                >
                  <Settings aria-hidden="true" />
                </button>
              )}
              size={layout.size}
              title={sectionTitle}
            />
          );
        }) : (
          <EmptyState
            className="admin-blueprint-empty-workbench"
            description="Open App Library to restore plugins."
            role="status"
            title="All plugins are hidden."
          />
        )}
      </div>
    </div>
  );
}

function visibleFieldCount(size: ModuleDisplaySize, count: number) {
  if (size === "large") {
    return count;
  }
  if (size === "small") {
    return Math.min(2, count);
  }
  return Math.min(3, count);
}

function findWorkspaceTargetNavId(event: PointerEvent<HTMLElement>) {
  return findWorkspaceTargetNavIdFromPoint(
    event.currentTarget.ownerDocument,
    event.clientX,
    event.clientY
  );
}

function findWorkspaceTargetNavIdFromPoint(
  ownerDocument: Document,
  clientX: number,
  clientY: number
) {
  const target = ownerDocument.elementFromPoint?.(clientX, clientY);
  return target
    ?.closest<HTMLElement>("[data-module-nav-id]")
    ?.dataset.moduleNavId ?? null;
}

function BlueprintDisclosure({
  title,
  children,
  className = ""
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  const classes = ["admin-blueprint-disclosure", className].filter(Boolean).join(" ");

  return (
    <details className={classes}>
      <summary>{title}</summary>
      <div className="admin-blueprint-disclosure-body">{children}</div>
    </details>
  );
}

function BlueprintList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="admin-blueprint-list">
      <div className="admin-blueprint-list-heading">
        <h4>{title}</h4>
        <span aria-label={`${title} item count`}>{items.length}</span>
      </div>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
