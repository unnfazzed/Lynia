// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KycApproveButton } from "./KycSubmitButton";

vi.mock("./actions", () => ({
  setKyc: vi.fn(),
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

describe("KycApproveButton — CF-04-SIB (crash-fuzz 2026-08-23, KYC gating — sensitive lane)", () => {
  it("a same-tick double-click approves only once", async () => {
    const { setKyc } = await import("./actions");
    const gate = deferred<void>();
    vi.mocked(setKyc).mockReturnValue(gate.promise);

    render(<KycApproveButton profileId="rider-1" />);

    const button = screen.getByRole("button", { name: "Approve" });
    act(() => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(setKyc).toHaveBeenCalledTimes(1);

    gate.resolve();
    await screen.findByRole("button", { name: "Approve" });
    expect(setKyc).toHaveBeenCalledTimes(1);
  });
});
