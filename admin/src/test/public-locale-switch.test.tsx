import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import {
  PublicPreferenceSwitch,
  PublicThemeSwitch,
  usePublicThemePreference,
  type PublicTheme
} from "../features/user-portal/public-locale-switch";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-portal-theme");
});

function ThemeHarness({ defaultTheme = "light" }: { defaultTheme?: PublicTheme }) {
  const { theme, setTheme } = usePublicThemePreference(defaultTheme);
  return (
    <div>
      <span data-testid="active-theme">{theme}</span>
      <PublicThemeSwitch locale="en" theme={theme} onThemeChange={setTheme} />
    </div>
  );
}

describe("public portal preference switch", () => {
  test("renders theme choices with accessible pressed state", () => {
    const changes: PublicTheme[] = [];

    render(
      <PublicThemeSwitch
        locale="en"
        theme="light"
        onThemeChange={(theme) => changes.push(theme)}
      />
    );

    expect(screen.getByRole("button", { name: "Light theme" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Dark theme" }).getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: "Dark theme" }));

    expect(changes).toEqual(["dark"]);
  });

  test("persists selected theme and applies it to the document", () => {
    window.localStorage.setItem("gccwebos-portal-theme", "dark");

    render(<ThemeHarness />);

    expect(screen.getByTestId("active-theme").textContent).toBe("dark");
    expect(document.documentElement.dataset.portalTheme).toBe("dark");

    fireEvent.click(screen.getByRole("button", { name: "Light theme" }));

    expect(screen.getByTestId("active-theme").textContent).toBe("light");
    expect(window.localStorage.getItem("gccwebos-portal-theme")).toBe("light");
    expect(document.documentElement.dataset.portalTheme).toBe("light");
  });

  test("groups locale and theme controls without merging their labels", () => {
    const localeChanges: string[] = [];
    const themeChanges: PublicTheme[] = [];

    render(
      <PublicPreferenceSwitch
        ariaLabel="Portal preferences"
        localeAriaLabel="Language"
        themeAriaLabel="Theme"
        locale="zh"
        theme="dark"
        onLocaleChange={(locale) => localeChanges.push(locale)}
        onThemeChange={(theme) => themeChanges.push(theme)}
      />
    );

    expect(screen.getByRole("group", { name: "Portal preferences" })).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "English" }));
    fireEvent.click(screen.getByRole("button", { name: "日间主题" }));

    expect(localeChanges).toEqual(["en"]);
    expect(themeChanges).toEqual(["light"]);
  });
});
