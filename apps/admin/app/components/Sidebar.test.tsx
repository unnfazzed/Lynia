// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/orders",
  useSearchParams: () => new URLSearchParams(),
}));

import { Sidebar } from "./Sidebar";

afterEach(() => cleanup());

// D-105: the phone top bar's nav disclosure. The CSS hides the button above 900px; this pins the
// behaviour the button carries wherever it is shown.
describe("Sidebar phone menu (D-105)", () => {
  it("toggles the nav panel with aria-expanded / aria-controls", () => {
    const { container } = render(<Sidebar counts={{ kycPending: 3, foodDisputes: 0, openIssues: 0, sosPending: 0 }} />);
    const button = screen.getByRole("button", { name: "Open menu" });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(button.getAttribute("aria-controls")).toBe("sidenav-panel");
    expect(container.querySelector("#sidenav-panel")).not.toBeNull();
    expect(container.querySelector("aside")?.getAttribute("data-open")).toBeNull();

    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(button.getAttribute("aria-label")).toBe("Close menu");
    expect(container.querySelector("aside")?.getAttribute("data-open")).toBe("true");
    // Nav badges survive inside the panel.
    expect(screen.getByLabelText("3 awaiting")).toBeTruthy();
  });

  it("closes on Escape and returns focus to the menu button", () => {
    render(<Sidebar />);
    const button = screen.getByRole("button", { name: "Open menu" });
    fireEvent.click(button);
    (screen.getByRole("link", { name: "Bikers" }) as HTMLElement).focus();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(button);
  });

  it("carries Live second and Settings last (console v2 PR 7)", () => {
    render(<Sidebar />);
    const items = screen.getAllByRole("link").filter((a) => a.classList.contains("nav-item"));
    expect(items[1]?.textContent).toBe("Live");
    expect(items[1]?.getAttribute("href")).toBe("/live");
    expect(items.at(-1)?.textContent).toBe("Settings");
    expect(items.at(-1)?.getAttribute("href")).toBe("/config");
  });

  it("carries the Audit item and the phone copy of the search box (console v2 PR 3)", () => {
    const { container } = render(<Sidebar />);
    expect(screen.getByRole("link", { name: "Audit" }).getAttribute("href")).toBe("/audit");
    const form = container.querySelector("#sidenav-panel form[role='search']");
    expect(form?.getAttribute("action")).toBe("/search");
    expect(form?.querySelector("input[name='q']")).not.toBeNull();
  });

  it("carries Own bikers with the overdue fleets as a danger badge (OB-A1)", () => {
    render(<Sidebar counts={{ kycPending: 0, foodDisputes: 0, openIssues: 0, sosPending: 0, fleetsOverdue: 2 }} />);
    const item = screen.getByRole("link", { name: /Own bikers/ });
    expect(item.getAttribute("href")).toBe("/own-bikers");
    const badge = item.querySelector(".nav-badge");
    expect(badge?.textContent).toBe("2");
    expect(badge?.className).toBe("nav-badge danger");
  });

  it("closes on a tap outside the bar", () => {
    render(<Sidebar />);
    const button = screen.getByRole("button", { name: "Open menu" });
    fireEvent.click(button);
    fireEvent.pointerDown(document.body);
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });
});
