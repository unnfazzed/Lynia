// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AlertStrip } from "./AlertStrip";

/** Admin console v2 §7 — the alert strip above every page. */
afterEach(cleanup);

const none = { sosPending: 0, topupAnomalies: 0, kitchenConfirmations: 0, merchantApplications: 0, ordersBreaching: 0 };

describe("AlertStrip", () => {
  it("shows one linked chip per thing waiting, SOS first", () => {
    render(<AlertStrip alerts={{ sosPending: 1, topupAnomalies: 2, kitchenConfirmations: 3, merchantApplications: 1, ordersBreaching: 4 }} />);
    const links = screen.getAllByRole("link");
    expect(links.map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      ["1 SOS waiting", "/sos"],
      ["4 orders past the time limit", "/live"],
      ["3 orders to confirm with the kitchen", "/merchants/confirm"],
      ["2 top-ups to sort out", "/cash/topups"],
      ["1 application waiting over 24 h", "/merchants?status=applied"],
    ]);
  });

  it("only the chips with something in them", () => {
    render(<AlertStrip alerts={{ ...none, ordersBreaching: 1 }} />);
    expect(screen.getAllByRole("link").map((a) => a.textContent)).toEqual(["1 order past the time limit"]);
  });

  it("hidden when nothing is waiting or the API didn't answer", () => {
    const { container, rerender } = render(<AlertStrip alerts={none} />);
    expect(container.innerHTML).toBe("");
    rerender(<AlertStrip alerts={null} />);
    expect(container.innerHTML).toBe("");
  });
});
