// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AdminError from "./error";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AdminError (UX21-01, now via the shared RetryableError — D-O1)", () => {
  it("shows the error message and calls reset() on Try again", () => {
    const reset = vi.fn();
    render(<AdminError error={new Error("Boom")} reset={reset} />);

    expect(screen.getByText(/Boom/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
