// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OwnerOnlyNotice } from "./OwnerOnlyNotice";
import { RetryableError } from "./RetryableError";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("RetryableError (D-O1; Order flow v2's failed first load, ledger D-74)", () => {
  it("says what didn't load, then the drawn line and '↻ Try again', which retries", () => {
    const onRetry = vi.fn();
    const { container } = render(<RetryableError message="Couldn't load this order." onRetry={onRetry} />);

    expect(screen.getByText("Couldn't load this order.")).toBeTruthy();
    expect(screen.getByText("Check your data connection and try again.")).toBeTruthy();
    const button = screen.getByRole("button", { name: "Try again" });
    expect(button.textContent).toBe("↻Try again");
    expect(button.className).toBe("m-btn");
    fireEvent.click(button);
    expect(onRetry).toHaveBeenCalledTimes(1);
    // Calm, never red: no danger box, no inline danger colour (README "Never red text on white").
    expect(container.innerHTML).not.toMatch(/danger/);
  });
});

describe("OwnerOnlyNotice (L4)", () => {
  it("is the muted hint line Staff see on Team, not a card", () => {
    render(<OwnerOnlyNotice>Only the owner sees the money.</OwnerOnlyNotice>);
    const line = screen.getByRole("status");
    expect(line.textContent).toBe("Only the owner sees the money.");
    expect(line.tagName).toBe("P");
    expect(line.className).toBe("m-sub");
    expect(line.getAttribute("style")).toBeNull();
  });
});
