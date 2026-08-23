// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FollowUpNoteButton } from "./FollowUpNoteButton";

vi.mock("../../actions/audit", () => ({
  logOrderFollowUpNote: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("FollowUpNoteButton — CF-02-SIB-4 (crash-fuzz 2026-08-23)", () => {
  it("a same-tick double-click logs the note only once (was: two distinct audit_logs rows ~2ms apart)", async () => {
    const { logOrderFollowUpNote } = await import("../../actions/audit");
    const gate = deferred<void>();
    vi.mocked(logOrderFollowUpNote).mockReturnValue(gate.promise);

    render(<FollowUpNoteButton orderId="order-1" />);

    const button = screen.getByRole("button", { name: /Log a follow-up note/ });
    // Two native click events dispatched inside ONE `act()` call — React only flushes/re-renders
    // AFTER the act() callback returns, so both onClick handlers run against the same pre-update
    // closure, exactly like two real taps landing in the same event-loop tick. Two separate
    // `fireEvent.click()` statements would NOT reproduce this (see ConfirmModal.test.tsx's CF-02 case).
    act(() => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(logOrderFollowUpNote).toHaveBeenCalledTimes(1);

    gate.resolve();
    await screen.findByRole("button", { name: /Log a follow-up note/ });
    expect(logOrderFollowUpNote).toHaveBeenCalledTimes(1);
  });
});
