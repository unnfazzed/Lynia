// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RetryableError } from "./RetryableError";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("RetryableError (D-O1)", () => {
  it("renders the message and calls onRetry when Retry is clicked", () => {
    const onRetry = vi.fn();
    render(<RetryableError message="Couldn't reach the server." onRetry={onRetry} />);

    expect(screen.getByText("Couldn't reach the server.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
