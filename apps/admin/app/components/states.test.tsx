// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RetryableError, SubsectionUnavailable } from "./states";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SubsectionUnavailable (D-O1)", () => {
  // Before this, a sub-resource failure (e.g. the rider wallet view, a best-effort side query on an
  // otherwise-loaded page) rendered as unstyled inline text with no icon and no reuse of the
  // whole-page OfflineBanner's styling.
  it("capitalizes the noun and names it unavailable", () => {
    render(<SubsectionUnavailable noun="wallet view" />);
    expect(screen.getByText(/Wallet view unavailable\./)).toBeTruthy();
  });
});

describe("RetryableError (D-O1)", () => {
  // error.tsx used to hand-roll this banner+button inline; extracted here so any future client
  // component needing an in-place retry doesn't re-duplicate the markup.
  it("renders the message and calls onRetry when Try again is clicked", () => {
    const onRetry = vi.fn();
    render(<RetryableError message="This page hit an unexpected error." onRetry={onRetry} />);

    expect(screen.getByText("This page hit an unexpected error.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
