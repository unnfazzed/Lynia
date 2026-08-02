// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfirmModal } from "./ConfirmModal";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// Deferred promise so the test controls exactly when the in-flight `onConfirm` resolves, simulating
// a slow/2G wallet-credit POST.
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("ConfirmModal dismissal guards — D-D0c (LC-D06, sensitive: money)", () => {
  it("does not let Escape close the dialog while a submit is in flight, so a wallet credit can't double-apply", async () => {
    const gate = deferred<void>();
    const onConfirm = vi.fn().mockReturnValue(gate.promise);

    render(
      <ConfirmModal
        action="rider.wallet_credit"
        auditInEndpoint
        target="Rider A"
        path="/riders/1"
        triggerLabel="Credit account…"
        title="Credit Rider A's commission account?"
        consequence="Adds a manual prepaid credit."
        amount={{ label: "Amount", prefix: "$", placeholder: "0.00", required: true }}
        confirmLabel="Credit account"
        onConfirm={onConfirm}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Credit account…" }));
    fireEvent.change(screen.getByLabelText(/Amount/), { target: { value: "5.00" } });
    fireEvent.click(screen.getByRole("button", { name: "Credit account" }));

    // The submit is now in flight (onConfirm called once, its promise unresolved).
    expect(onConfirm).toHaveBeenCalledTimes(1);
    const firstKey = onConfirm.mock.calls[0]![0].idempotencyKey;
    expect(firstKey).toBeTruthy();

    // Escape must be a no-op while pending — closing here would let the operator reopen the modal,
    // which mints a NEW formKey (see the trigger's onClick), so a lost-response retry of the original
    // request would land as a SECOND wallet credit instead of deduping against the first.
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByRole("dialog")).toBeTruthy();

    // Backdrop click must also be a no-op while pending.
    fireEvent.click(screen.getByRole("presentation"));
    expect(screen.getByRole("dialog")).toBeTruthy();

    // Cancel must be disabled (and inert) while pending.
    const cancelButton = screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement;
    expect(cancelButton.disabled).toBe(true);
    fireEvent.click(cancelButton);
    expect(screen.getByRole("dialog")).toBeTruthy();

    // The trigger can't mint a second formKey because it's unreachable behind the modal overlay and
    // the dialog never closed — onConfirm was still only called once.
    expect(onConfirm).toHaveBeenCalledTimes(1);

    // Let the original request land; the dialog closes on its own success path.
    gate.resolve();
    await screen.findByRole("button", { name: "Credit account…" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("does close on Escape/backdrop/Cancel once no submit is in flight", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmModal
        action="rider.suspend"
        target="Rider B"
        path="/riders/2"
        triggerLabel="Suspend"
        title="Suspend Rider B?"
        consequence="Suspends the rider."
        confirmLabel="Suspend"
        onConfirm={onConfirm}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Suspend" }));
    expect(screen.getByRole("dialog")).toBeTruthy();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
