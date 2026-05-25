import { describe, expect, test } from "vitest";
import { navItems, pageTitles } from "../app/navigation";

describe("admin navigation", () => {
  test("exposes only active operator surfaces", () => {
    const activePages = ["overview", "subscriptions", "nodes"];
    const navPageIds = navItems.map((item) => item.id);

    expect(navPageIds).toEqual(activePages);
    expect(Object.keys(pageTitles)).toEqual(activePages);
  });
});
