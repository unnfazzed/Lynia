// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MerchantBranchResponse, MerchantProfileResponse } from "@lynia/shared";
import { OrdersHeader, type useOpenSwitch } from "./OrdersHeader";

const { list } = vi.hoisted(() => ({ list: { branches: [] as MerchantBranchResponse[] } }));
vi.mock("../../lib/branches", async (orig) => ({ ...(await orig<typeof import("../../lib/branches")>()), useBranches: () => list.branches }));
vi.mock("../../lib/orders-api", () => ({ getTodaySummary: vi.fn(() => Promise.resolve({ orders: 7, sales: 59.5, cashOverdue: 9.5 })) }));
vi.mock("../branches/BranchSheet", () => ({ BranchSheet: () => <div role="dialog">Your branches</div> }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));

afterEach(() => {
  cleanup();
  list.branches = [];
});

const branch = (id: string): MerchantBranchResponse => ({ id, name: id, landmark: null, role: "owner", active: id === "m1", pilotEnabled: true });
const open = { status: { open: true, closedByHand: false, label: "Open · until 22:00" }, switching: false, toggleOpen: vi.fn() } as unknown as ReturnType<typeof useOpenSwitch>;
const merchant = (over: Partial<MerchantProfileResponse> = {}) =>
  ({ id: "m1", name: "Sadza Republic", myRole: "owner", businessType: "restaurant", pilotEnabled: true, ...over }) as MerchantProfileResponse;

describe("B1 / D1 header · branches (ledger D-51)", () => {
  it("one branch: exactly today's header, no chevron", () => {
    list.branches = [branch("m1")];
    render(<OrdersHeader merchant={merchant()} open={open} disabled={false} />);
    expect(screen.queryByRole("button", { name: /Sadza Republic/ })).toBeNull();
    expect(screen.getByText("Open · until 22:00")).toBeTruthy();
  });

  it("2+ branches: the name and chevron are one button that opens C6", () => {
    list.branches = [branch("m1"), branch("m2")];
    render(<OrdersHeader merchant={merchant()} open={open} disabled={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Sadza Republic" }));
    expect(screen.getByRole("dialog").textContent).toBe("Your branches");
  });

  it("a branch not live yet: the grey pill instead of the open line, no switch, no tiles", () => {
    list.branches = [branch("m1"), branch("m2")];
    render(<OrdersHeader merchant={merchant({ pilotEnabled: false })} open={open} disabled={false} />);
    expect(screen.getByText("Not live yet")).toBeTruthy();
    expect(screen.queryByText("Open · until 22:00")).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByText("Orders")).toBeNull();
  });

  it("staff never see the chevron", () => {
    list.branches = [branch("m1"), branch("m2")];
    render(<OrdersHeader merchant={merchant({ myRole: "staff" })} open={open} disabled={false} />);
    expect(screen.queryByRole("button", { name: "Sadza Republic" })).toBeNull();
  });
});
