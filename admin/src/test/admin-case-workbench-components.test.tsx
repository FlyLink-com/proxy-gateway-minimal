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
        title="监管案件摘要"
        description="只读展示需要人工复核的监管候选。"
        cases={[
          caseFixture({
            caseRef: "case_candidate:usage:order_over:over_limit",
            title: "订单流量已超额",
            severity: "critical",
            reasonCode: "over_limit"
          }),
          caseFixture({
            caseRef: "case_candidate:usage:order_stale:usage_stale",
            title: "用量采集延迟",
            severity: "warning",
            reasonCode: "usage_stale"
          })
        ]}
        selectedCaseRef="case_candidate:usage:order_over:over_limit"
        onSelect={onSelect}
      />
    );

    const queue = screen.getByLabelText("监管案件摘要");
    expect(within(queue).getByText("只读展示需要人工复核的监管候选。")).not.toBeNull();
    expect(within(queue).getByText("2")).not.toBeNull();
    expect(within(queue).getByText("订单流量已超额")).not.toBeNull();
    expect(within(queue).getByText("高")).not.toBeNull();
    expect(within(queue).getByText("超额")).not.toBeNull();
    expect(within(queue).getAllByText("order_safe_1").length).toBeGreaterThanOrEqual(1);

    fireEvent.click(within(queue).getByRole("button", { name: /用量采集延迟/ }));

    expect(onSelect).toHaveBeenCalledWith("case_candidate:usage:order_stale:usage_stale");
    expect(within(queue).queryByRole("button", { name: DESTRUCTIVE_ACTION_PATTERN })).toBeNull();
  });

  test("renders case detail with linked objects and timeline while hiding raw material", () => {
    render(<CaseDetailPanel caseItem={caseFixture()} />);

    expect(screen.getByRole("heading", { name: "订单流量已超额" })).not.toBeNull();
    expect(screen.getByText("待复核")).not.toBeNull();
    expect(screen.getByText("高")).not.toBeNull();
    expect(screen.getByText("流量与通道")).not.toBeNull();
    expect(screen.getByText("超额")).not.toBeNull();
    expect(screen.getByText("需要单独门禁")).not.toBeNull();
    expect(screen.getByText("2026/06/05 09:00")).not.toBeNull();

    const linkedObjects = screen.getByLabelText("关联对象");
    expect(within(linkedObjects).getByRole("heading", { name: "关联对象" })).not.toBeNull();
    expect(within(linkedObjects).getByText("用户账号")).not.toBeNull();
    expect(within(linkedObjects).getByText("portal_user_safe")).not.toBeNull();
    expect(within(linkedObjects).getByText("资源订单")).not.toBeNull();
    expect(within(linkedObjects).getByText("order_safe_1")).not.toBeNull();

    const timeline = screen.getByLabelText("对象时间线");
    expect(within(timeline).getByRole("heading", { name: "对象时间线" })).not.toBeNull();
    expect(within(timeline).getByText("用量采集事实已记录")).not.toBeNull();

    expect(screen.getByText("阶段一只读展示候选和证据；关闭、误报、归档和备注写入等待后端 Case 契约。")).not.toBeNull();
    expect(document.body.textContent ?? "").not.toMatch(SENSITIVE_TEXT_PATTERN);
    expect(screen.queryByRole("button", { name: DESTRUCTIVE_ACTION_PATTERN })).toBeNull();
  });

  test("renders a non-interactive queue when no select handler is provided", () => {
    render(
      <CaseQueue
        title="监管案件摘要"
        description="只读展示最高优先级监管候选。"
        cases={[caseFixture()]}
      />
    );

    const queue = screen.getByLabelText("监管案件摘要");
    expect(within(queue).getByText("订单流量已超额")).not.toBeNull();
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

    expect(screen.getByLabelText("关联对象")).not.toBeNull();
    expect(screen.getByLabelText("对象时间线")).not.toBeNull();
  });

  test("renders stable empty, error, and loading states", () => {
    render(
      <>
        <CaseDetailPanel caseItem={null} />
        <EmptyState title="暂无监管案件" description="当前筛选条件下没有活跃候选。" />
        <ErrorState title="监管案件不可用" message="用量监护暂不可用。" />
        <LoadingSkeleton label="正在加载监管案件" rows={2} />
      </>
    );

    expect(screen.getByText("选择一个监管案件")).not.toBeNull();
    expect(screen.getByText("暂无监管案件")).not.toBeNull();
    expect(screen.getByRole("alert")).not.toBeNull();
    expect(screen.getByText("用量监护暂不可用。")).not.toBeNull();
    expect(screen.getByLabelText("正在加载监管案件")).not.toBeNull();
    expect(document.querySelectorAll(".case-skeleton-row")).toHaveLength(2);
  });
});

function caseFixture(overrides: Partial<CaseCandidate> = {}): CaseCandidate {
  return {
    caseRef: "case_candidate:usage:order_safe_1:over_limit",
    title: "订单流量已超额",
    objectType: "usage",
    objectRef: "order_safe_1",
    status: "待复核",
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
        label: "用户账号"
      },
      {
        relationType: "about",
        objectType: "order",
        objectRef: "order_safe_1",
        label: "资源订单"
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
        summary: "用量采集事实已记录",
        severity: "critical",
        reasonCode: "over_limit",
        relatedRefs: ["portal_user_safe", "order_safe_1"]
      }
    ],
    ...overrides
  };
}
