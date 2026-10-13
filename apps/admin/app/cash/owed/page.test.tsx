// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import OwedPage from "./page";
import { adminFetchResult } from "../../lib/api";

/** Admin console v2 §6 — Money owed: negative balances, longest owing first, with a call link. */
vi.mock("../../lib/api", () => ({ adminFetchResult: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Money owed page", () => {
  it("lists who owes what, since when, last job, last top-up, and a call link", async () => {
    vi.mocked(adminFetchResult).mockResolvedValue({
      data: {
        total: "2.50",
        rows: [
          {
            riderId: "r-1",
            name: "Tendai Moyo",
            phone: "+263772451180",
            owed: "2.50",
            negativeSince: new Date(Date.now() - 2 * 86_400_000).toISOString(),
            lastJobAt: "2026-10-12T09:00:00Z",
            lastTopupAt: null,
          },
        ],
      },
    } as never);
    render(await OwedPage());
    expect(adminFetchResult).toHaveBeenCalledWith("/admin/cash/owed");
    expect(screen.getByRole("link", { name: "Tendai Moyo" }).getAttribute("href")).toBe("/riders/r-1");
    expect(screen.getAllByText("$2.50").length).toBeGreaterThan(0);
    expect(screen.getByText("2 d ago")).toBeTruthy();
    expect(screen.getByText("never")).toBeTruthy();
    expect(screen.getByRole("link", { name: /^Call/ }).getAttribute("href")).toBe("tel:+263772451180");
  });

  it("nobody owing says so", async () => {
    vi.mocked(adminFetchResult).mockResolvedValue({ data: { total: "0.00", rows: [] } } as never);
    render(await OwedPage());
    expect(screen.getByText("Nobody owes money")).toBeTruthy();
  });
});
