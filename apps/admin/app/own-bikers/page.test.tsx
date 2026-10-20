// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { adminFetchResult } from "../lib/api";
import { CHICKEN, DETAIL, ROWS } from "./fixtures.test-data";
import OwnBikersPage from "./page";

/** OB-A1 · the fleets table and its states; OB-A2 opens beside it (the panel's own behaviour is FleetPanel.test). */
vi.mock("../lib/api", () => ({ adminFetchResult: vi.fn() }));
vi.mock("./actions", () => ({ enableFleet: vi.fn(), switchFleet: vi.fn(), markFleetBillPaid: vi.fn(), adjustFleet: vi.fn() }));
vi.mock("../actions/audit", () => ({ submitAdminAction: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const api = (rows: unknown, detail: unknown = DETAIL) =>
  vi.mocked(adminFetchResult).mockImplementation(async (path: string) => (path === "/admin/fleets" ? rows : { data: detail }) as never);

const page = async (sp: Record<string, string> = {}) => render(await OwnBikersPage({ searchParams: Promise.resolve(sp) }));
const bodyRows = () => screen.getAllByRole("row").slice(1);

describe("OB-A1 · the fleets table", () => {
  it("one row per business: the business, its branches, bikers, this week, unpaid, days overdue in words, status", async () => {
    api({ data: ROWS });
    await page();
    expect(screen.getByRole("heading", { name: "Own bikers" })).toBeTruthy();
    expect(screen.getByText("3 fleets · commission billed weekly")).toBeTruthy();
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "Owner",
      "Branches",
      "Bikers",
      "This week",
      "Unpaid",
      "Days overdue",
      "Status",
    ]);
    const [pizza, chicken, mamas] = bodyRows().map((r) =>
      within(r)
        .getAllByRole("cell")
        .map((c) => c.textContent),
    );
    expect(pizza).toEqual(["Pizza Inn", "Belgravia, Eastgate, Mt Pleasant", "9", "$42.00", "$81.00", "9 days overdue", "Overdue"]);
    expect(chicken).toEqual(["Chicken Inn", "Avondale, Borrowdale", "4", "$34.50", "$36.00", "2 days overdue", "Overdue"]);
    expect(mamas).toEqual(["Mama's Kitchen", "Mama's Kitchen", "6", "$21.00", "$0.00", "—", "Paid"]);
    // A row opens its side panel; nothing is open yet.
    expect(screen.getByRole("link", { name: "Chicken Inn" }).getAttribute("href")).toBe(`/own-bikers?owner=${CHICKEN}`);
    expect(screen.queryByRole("complementary")).toBeNull();
  });

  it("the subnav counts each status and filters the rows", async () => {
    api({ data: ROWS });
    await page({ status: "paid" });
    expect(screen.getAllByRole("link", { name: /·/ }).map((a) => a.textContent)).toEqual(["All · 3", "Overdue · 2", "Unpaid · 0", "Paid · 1", "Paused · 0"]);
    expect(screen.getByRole("link", { name: "Paid · 1" }).getAttribute("aria-current")).toBe("page");
    expect(bodyRows()).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Mama's Kitchen" }).getAttribute("href")).toBe(`/own-bikers?status=paid&owner=${ROWS[2]!.ownerProfileId}`);
  });

  it("OB-A2: ?owner= opens the side panel beside the table with that row marked", async () => {
    api({ data: ROWS });
    await page({ owner: CHICKEN });
    const panel = screen.getByRole("complementary", { name: "Chicken Inn" });
    expect(within(panel).getByText("Owner Rumbi Chari · Avondale, Borrowdale · 4 bikers · 2 online · $36.00 unpaid")).toBeTruthy();
    expect(within(panel).getByRole("link", { name: "Close" }).getAttribute("href")).toBe("/own-bikers");
    expect(bodyRows()[1]!.getAttribute("aria-current")).toBe("true");
    expect(adminFetchResult).toHaveBeenCalledWith(`/admin/fleets/${CHICKEN}`);
  });

  it("empty: No fleets yet", async () => {
    api({ data: [] });
    await page();
    expect(screen.getByText("No fleets yet")).toBeTruthy();
    expect(screen.getByText("Merchants who invite their own bikers show here.")).toBeTruthy();
  });

  it("error: Couldn't load fleets, with Try again, under the table's head", async () => {
    api({ reason: "error" });
    await page({ status: "overdue" });
    expect(screen.getByRole("alert").textContent).toContain("Couldn't load fleets.");
    expect(screen.getByRole("link", { name: "Try again" }).getAttribute("href")).toBe("/own-bikers?status=overdue");
    expect(screen.getAllByRole("columnheader")).toHaveLength(7);
  });

  it("offline: the console's offline banner, and the header says so", async () => {
    api({ reason: "unreachable" });
    await page();
    expect(screen.getByText("API unreachable.")).toBeTruthy();
    expect(screen.getByText("○ API unreachable")).toBeTruthy();
  });
});
