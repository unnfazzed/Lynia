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

  it("closes on a tap outside the bar", () => {
    render(<Sidebar />);
    const button = screen.getByRole("button", { name: "Open menu" });
    fireEvent.click(button);
    fireEvent.pointerDown(document.body);
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });
});
