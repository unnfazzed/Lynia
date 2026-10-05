// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import HandoverLinkPage from "./page";
import { ApiError, confirmHandoverLink, getHandoverLink } from "../../lib/api-client";

vi.mock("next/navigation", () => ({ useParams: () => ({ token: "tok" }) }));
vi.mock("../../lib/api-client", async (orig) => ({
  ...(await orig<typeof import("../../lib/api-client")>()),
  getHandoverLink: vi.fn(),
  confirmHandoverLink: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("the rider's hand-over page (Merchant v2, D-77)", () => {
  it("names the order, takes the 6-digit code and confirms the pickup", async () => {
    vi.mocked(getHandoverLink).mockResolvedValue({ orderLabel: "#A1B2", venueName: "Sadza Republic", expiresAt: "2026-10-05T10:15:00Z" });
    vi.mocked(confirmHandoverLink).mockResolvedValue({ orderId: "o1", status: "picked_up" });
    render(<HandoverLinkPage />);
    expect(await screen.findByText("#A1B2 · Sadza Republic")).toBeTruthy();
    const confirm = screen.getByRole("button", { name: "Confirm pickup" }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Pickup code"), { target: { value: "731 604" } });
    fireEvent.click(confirm);
    expect(await screen.findByText(/^Picked up\./)).toBeTruthy();
    expect(confirmHandoverLink).toHaveBeenCalledWith("tok", "731604");
  });

  it("says a dead link has expired, and shows a wrong code's own message", async () => {
    vi.mocked(getHandoverLink).mockRejectedValueOnce(new ApiError(404, "gone"));
    render(<HandoverLinkPage />);
    expect((await screen.findByRole("alert")).textContent).toBe("This link has expired. Ask the counter for a new one.");
    cleanup();

    vi.mocked(getHandoverLink).mockResolvedValue({ orderLabel: "#A1B2", venueName: "Sadza Republic", expiresAt: "2026-10-05T10:15:00Z" });
    vi.mocked(confirmHandoverLink).mockRejectedValue(new ApiError(400, "That code doesn't match. 4 attempts left."));
    render(<HandoverLinkPage />);
    fireEvent.change(await screen.findByLabelText("Pickup code"), { target: { value: "111111" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm pickup" }));
    expect((await screen.findByRole("alert")).textContent).toBe("That code doesn't match. 4 attempts left.");
  });
});
