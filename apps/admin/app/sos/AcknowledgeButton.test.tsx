// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AcknowledgeButton } from "./AcknowledgeButton";

vi.mock("./actions", () => ({
  acknowledgeSos: vi.fn(),
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

describe("AcknowledgeButton — CF-02-SIB-4 (crash-fuzz 2026-08-23)", () => {
  it("a same-tick double-click acknowledges only once (server-side CAS already covers this; the client shouldn't rely on it alone)", async () => {
    const { acknowledgeSos } = await import("./actions");
    const gate = deferred<void>();
    vi.mocked(acknowledgeSos).mockReturnValue(gate.promise);

    render(<AcknowledgeButton id="sos-1" />);

    const button = screen.getByRole("button", { name: "Acknowledge" });
    act(() => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(acknowledgeSos).toHaveBeenCalledTimes(1);

    gate.resolve();
    await screen.findByRole("button", { name: "Acknowledge" });
    expect(acknowledgeSos).toHaveBeenCalledTimes(1);
  });
});
