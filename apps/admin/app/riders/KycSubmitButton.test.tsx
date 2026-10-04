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

describe("KycApproveButton — CF-02-SIB-4 (crash-fuzz 2026-08-23, KYC gating — sensitive lane)", () => {
  it("a same-tick double-click approves only once", async () => {
    const { setKyc } = await import("./actions");
    const gate = deferred<{ ok: true }>();
    vi.mocked(setKyc).mockReturnValue(gate.promise);

    render(<KycApproveButton profileId="rider-1" />);

    const button = screen.getByRole("button", { name: "Approve" });
    act(() => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(setKyc).toHaveBeenCalledTimes(1);

    gate.resolve({ ok: true });
    await screen.findByRole("button", { name: "Approve" });
    expect(setKyc).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("D-75: a refused approval shows the API's own words inline", async () => {
    const { setKyc } = await import("./actions");
    vi.mocked(setKyc).mockResolvedValue({
      ok: false,
      message: "Can't approve: the national ID from this rider's ID check is already on another live account. Resolve that account first.",
    });

    render(<KycApproveButton profileId="rider-1" />);
    act(() => {
      screen.getByRole("button", { name: "Approve" }).dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect((await screen.findByRole("alert")).textContent).toContain("already on another live account");
  });
});
