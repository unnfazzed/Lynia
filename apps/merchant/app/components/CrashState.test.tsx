// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CRASH_TITLE, screenForPath } from "./CrashState";
import AppError from "../(app)/error";
import RootError from "../error";

const nav = vi.hoisted(() => ({ pathname: "/statement" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));
// The real shell needs the (app) layout's connection provider; this boundary only decides its tab.
vi.mock("./Kitchen", () => ({
  Kitchen: ({ active, children }: { active: string; children: React.ReactNode }) => <div data-active={active}>{children}</div>,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("the crash boundaries", () => {
  it("maps each tab-shell route to the screen id that lights its tab", () => {
    expect(screenForPath("/statement")).toBe("money");
    expect(screenForPath("/menu")).toBe("catalog");
    expect(screenForPath("/queue/order")).toBe("queue");
    expect(screenForPath("/deliveries/booking")).toBe("deliveries");
    expect(screenForPath("/branches/new")).toBe("account");
    expect(screenForPath("/team")).toBe("account");
    expect(screenForPath("/somewhere-else")).toBe("queue");
    expect(screenForPath(null)).toBe("queue");
  });

  it("keeps a crashed Money screen inside the shell, Money lit, and Try again re-renders it", () => {
    nav.pathname = "/statement";
    const reset = vi.fn();
    const { container } = render(<AppError error={new Error("boom")} reset={reset} />);
    expect(container.querySelector("[data-active]")?.getAttribute("data-active")).toBe("money");
    expect(screen.getByText(CRASH_TITLE)).toBeTruthy();
    expect(screen.getByText("Check your data connection and try again.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Try again/ }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("shows the same crash state outside the shell, with no tab bar", () => {
    const reset = vi.fn();
    const { container } = render(<RootError error={new Error("boom")} reset={reset} />);
    expect(container.querySelector("[data-active]")).toBeNull();
    expect(screen.getByText(CRASH_TITLE)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Try again/ }));
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
