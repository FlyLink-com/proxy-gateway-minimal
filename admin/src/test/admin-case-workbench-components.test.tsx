import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  CaseDetailPanel,
  CaseQueue,
  EmptyState,
  ErrorState,
  LinkedObjects,
  LoadingSkeleton,
  ObjectTimeline
} from "../features/admin-case-workbench/case-workbench";
import type { CaseCandidate } from "../features/admin-case-workbench/types";

const SENSITIVE_TEXT_PATTERN = /subscriptionUrl|token|secret|password|yaml|raw/i;
const DESTRUCTIVE_ACTION_PATTERN = /禁用|归档|创建|删除|关闭|误报|disable|archive|create|delete|close|false positive|note/i;

afterEach(() => {
  cleanup();
});

describe("case workbench components", () => {
  test("renders a selectable read-only case queue", () => {
    const onSelect = vi.fn();

    render(
      <CaseQueue
        title="Case summary"
        description="Read-only supervision candidates that need manual review."
        cases={[
          caseFixture({
            caseRef: "case_candidate:usage:order_over:over_limit",
            title: "Order traffic over limit",
            severity: "critical",
            reasonCode: "over_limit"
          }),
          caseFixture({
            caseRef: "case_candidate:usage:order_stale:usage_stale",
            title: "Usage collection stale",
            severity: "warning",
            reasonCode: "usage_stale"
          })
        ]}
        selectedCaseRef="case_candidate:usage:order_over:over_limit"
        onSelect={onSelect}
      />
    );

    const queue = screen.getByLabelText("Case summary");
    expect(within(queue).getByText("Read-only supervision candidates that need manual review.")).not.toBeNull();
    expect(within(queue).getByLabelText("Cases count 2")).not.toBeNull();
    expect(within(queue).getByRole("button", { name: "All 2" })).not.toBeNull();
    expect(within(queue).getByRole("button", { name: "High risk 1" })).not.toBeNull();
    expect(within(queue).getByRole("button", { name: "Medium risk 1" })).not.toBeNull();
    expect(within(queue).getByRole("button", { name: "Low risk 0" })).not.toBeNull();
    expect(within(queue).getByText("Order traffic over limit")).not.toBeNull();
    expect(within(queue).getByText("High")).not.toBeNull();
    expect(within(queue).getByText("Over limit")).not.toBeNull();
    expect(within(queue).getAllByText("order_safe_1").length).toBeGreaterThanOrEqual(1);

    fireEvent.click(within(queue).getByRole("button", { name: /Usage collection stale/ }));

    expect(onSelect).toHaveBeenCalledWith("case_candidate:usage:order_stale:usage_stale");
    expect(within(queue).queryByRole("button", { name: DESTRUCTIVE_ACTION_PATTERN })).toBeNull();
  });

  test("renders case detail with linked objects and timeline while hiding raw material", () => {
    render(<CaseDetailPanel caseItem={caseFixture()} />);

    expect(screen.getByRole("heading", { name: "Order traffic over limit" })).not.toBeNull();
    expect(screen.getByText("Pending review")).not.toBeNull();
    expect(screen.getByText("High")).not.toBeNull();
    expect(screen.getByText("Usage & Channels")).not.toBeNull();
    expect(screen.getByText("Over limit")).not.toBeNull();
    expect(screen.getByText("Separate gate required")).not.toBeNull();
    expect(screen.getByText("2026/06/05 09:00")).not.toBeNull();

    const linkedObjects = screen.getByLabelText("Linked objects");
    expect(within(linkedObjects).getByRole("heading", { name: "Linked objects" })).not.toBeNull();
    expect(within(linkedObjects).getByText("User account")).not.toBeNull();
    expect(within(linkedObjects).getByText("portal_user_safe")).not.toBeNull();
    expect(within(linkedObjects).getByText("Resource order")).not.toBeNull();
    expect(within(linkedObjects).getByText("order_safe_1")).not.toBeNull();

    const timeline = screen.getByLabelText("Object timeline");
    expect(within(timeline).getByRole("heading", { name: "Object timeline" })).not.toBeNull();
    expect(within(timeline).getByText("Usage collection fact recorded")).not.toBeNull();

    expect(screen.getByText("Phase one is read-only for candidates and evidence; close, false-positive, archive, and note writes wait for the backend Case contract.")).not.toBeNull();
    expect(document.body.textContent ?? "").not.toMatch(SENSITIVE_TEXT_PATTERN);
    expect(screen.queryByRole("button", { name: DESTRUCTIVE_ACTION_PATTERN })).toBeNull();
  });

  test("renders a non-interactive queue when no select handler is provided", () => {
    render(
      <CaseQueue
        title="Case summary"
        description="Read-only display of the highest-priority supervision candidate."
        cases={[caseFixture()]}
      />
    );

    const queue = screen.getByLabelText("Case summary");
    expect(within(queue).getByText("Order traffic over limit")).not.toBeNull();
    expect(within(queue).queryByRole("button")).toBeNull();
    expect(within(queue).queryByRole("button", { name: DESTRUCTIVE_ACTION_PATTERN })).toBeNull();
  });

  test("renders direct linked object and timeline sections with accessible labels", () => {
    const item = caseFixture();

    render(
      <>
        <LinkedObjects objects={item.linkedObjects} />
        <ObjectTimeline events={item.timeline} />
      </>
    );

    expect(screen.getByLabelText("Linked objects")).not.toBeNull();
    expect(screen.getByLabelText("Object timeline")).not.toBeNull();
  });

  test("renders stable empty, error, and loading states", () => {
    render(
      <>
        <CaseDetailPanel caseItem={null} />
        <EmptyState title="No supervision cases" description="No active candidates match the current filters." />
        <ErrorState title="Cases unavailable" message="Usage monitor is unavailable." />
        <LoadingSkeleton label="Loading cases" rows={2} />
      </>
    );

    expect(screen.getByText("Select a supervision case")).not.toBeNull();
    expect(screen.getByText("No supervision cases")).not.toBeNull();
    expect(screen.getByRole("alert")).not.toBeNull();
    expect(screen.getByText("Usage monitor is unavailable.")).not.toBeNull();
    expect(screen.getByLabelText("Loading cases")).not.toBeNull();
    expect(document.querySelectorAll(".case-skeleton-row")).toHaveLength(2);
  });
});

function caseFixture(overrides: Partial<CaseCandidate> = {}): CaseCandidate {
  return {
    caseRef: "case_candidate:usage:order_safe_1:over_limit",
    title: "Order traffic over limit",
    objectType: "usage",
    objectRef: "order_safe_1",
    status: "Pending review",
    severity: "critical",
    reasonCode: "over_limit",
    source: "subscription_usage_monitor",
    gateRequired: true,
    createdAt: "2026-06-05T08:00:00.000Z",
    updatedAt: "2026-06-05T09:00:00.000Z",
    linkedObjects: [
      {
        relationType: "owns",
        objectType: "account",
        objectRef: "portal_user_safe",
        label: "User account"
      },
      {
        relationType: "about",
        objectType: "order",
        objectRef: "order_safe_1",
        label: "Resource order"
      }
    ],
    timeline: [
      {
        eventRef: "event:usage:order_safe_1:over_limit",
        category: "usage_collection",
        action: "over_limit",
        objectType: "usage",
        objectRef: "order_safe_1",
        occurredAt: "2026-06-05T09:00:00.000Z",
        source: "subscription_usage_monitor",
        summary: "Usage collection fact recorded",
        severity: "critical",
        reasonCode: "over_limit",
        relatedRefs: ["portal_user_safe", "order_safe_1"]
      }
    ],
    ...overrides
  };
}
