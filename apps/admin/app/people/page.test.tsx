// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PeoplePage from "./page";
import { adminFetchResult } from "../lib/api";
import type { FunnelView, StuckList, StuckRow, StuckSummary } from "../lib/adminTypes";

/** Admin console v2 §4 — People: the funnel strip, the stuck-list chips and a stuck list with Call / WhatsApp / Nudge. */
vi.mock("../lib/api", () => ({ adminFetchResult: vi.fn() }));
vi.mock("./actions", () => ({ nudgePerson: vi.fn() }));
vi.mock("../actions/audit", () => ({ submitAdminAction: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const funnel: FunnelView = {
  kind: "biker",
  range: "7d",
  from: "2026-10-06T22:00:00Z",
  to: "2026-10-13T10:00:00Z",
  cohort: 12,
  truncated: false,
  steps: [
    { key: "signed_up", label: "Signed up", count: 12, pctOfCohort: 100, conversionPct: null, medianMs: null, timedCount: 0, since: null, timesSince: null, stuckList: null },
    { key: "didit_started", label: "Started ID check", count: 4, pctOfCohort: 33.3, conversionPct: 50, medianMs: 600_000, timedCount: 3, since: null, timesSince: "2026-10-12", stuckList: "biker_no_didit" },
  ],
};

const listMeta = {
  key: "biker_no_didit",
  kind: "biker" as const,
  title: "Never started the ID check",
  line: "Became a biker over 24 hours ago and never opened the ID check.",
  nudge: true,
  copy: { title: "Your ID check is waiting", body: "It takes a few minutes. Open the app to start it." },
  count: 2,
  capped: false,
  queue: null,
  note: null,
};

const summary: StuckSummary = {
  kind: "biker",
  lists: [listMeta, { ...listMeta, key: "biker_plate_waiting", title: "Plate waiting", nudge: false, copy: null, count: 0 }],
};

function row(over: Partial<StuckRow> = {}): StuckRow {
  return {
    id: "p1",
    name: "Tendai Moyo",
    href: "/riders/p1",
    profileId: "p1",
    phone: "+263772451180",
    since: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    detail: "No check yet",
    link: null,
    hasPush: true,
    lastNudgeAt: null,
    nudgedToday: false,
    ...over,
  };
}

function mockApi(list: StuckList) {
  vi.mocked(adminFetchResult).mockImplementation(async (path: string) => {
    if (path.startsWith("/admin/funnels")) return { data: funnel } as never;
    if (path.startsWith("/admin/stuck?kind=")) return { data: summary } as never;
    return { data: list } as never;
  });
}

const sp = (o: Record<string, string> = {}) => Promise.resolve(o);

describe("People page", () => {
  it("reads the funnel and the stuck lists for the side and range in the URL", async () => {
    mockApi({ ...listMeta, rows: [row()] });
    render(await PeoplePage({ searchParams: sp({ kind: "biker", range: "7d" }) }));
    expect(adminFetchResult).toHaveBeenCalledWith("/admin/funnels?kind=biker&range=7d");
    expect(adminFetchResult).toHaveBeenCalledWith("/admin/stuck?kind=biker");
    expect(adminFetchResult).toHaveBeenCalledWith("/admin/stuck?list=biker_no_didit");
    expect(screen.getByText("Bikers who signed up in the last 7 days")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Started ID check: 4/ }).getAttribute("href")).toContain("list=biker_no_didit");
    expect(screen.getByRole("link", { name: "Never started the ID check · 2" }).getAttribute("aria-current")).toBe("page");
  });

  it("each stuck row links to the person and offers Call, WhatsApp and Nudge", async () => {
    mockApi({ ...listMeta, rows: [row()] });
    render(await PeoplePage({ searchParams: sp() }));
    expect(screen.getByRole("link", { name: "Tendai Moyo" }).getAttribute("href")).toBe("/riders/p1");
    expect(screen.getByText("2 d ago")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Call" }).getAttribute("href")).toBe("tel:+263772451180");
    expect(screen.getByRole("link", { name: "WhatsApp" }).getAttribute("href")).toBe("https://wa.me/263772451180");
    expect(screen.getByRole("button", { name: "Nudge" })).toBeTruthy();
  });

  it("says when a person can't be pushed, or was nudged today, instead of offering Nudge", async () => {
    mockApi({ ...listMeta, rows: [row({ id: "a", hasPush: false }), row({ id: "b", name: "Rudo", nudgedToday: true, lastNudgeAt: new Date().toISOString() })] });
    render(await PeoplePage({ searchParams: sp() }));
    expect(screen.getByText("No push")).toBeTruthy();
    expect(screen.getByText("Nudged today")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Nudge" })).toBeNull();
  });

  it("the application list sends ops to the merchant queue instead of repeating it", async () => {
    vi.mocked(adminFetchResult).mockImplementation(async (path: string) => {
      if (path.startsWith("/admin/funnels")) return { data: { ...funnel, kind: "merchant", cohort: 0 } } as never;
      if (path.startsWith("/admin/stuck?kind=")) {
        return { data: { kind: "merchant", lists: [{ ...listMeta, key: "merchant_applications", kind: "merchant", title: "Applications waiting", nudge: false, copy: null }] } } as never;
      }
      return {
        data: { ...listMeta, key: "merchant_applications", kind: "merchant", nudge: false, copy: null, rows: [], queue: { href: "/merchants?status=applied", label: "Open the application queue", count: 3 } },
      } as never;
    });
    render(await PeoplePage({ searchParams: sp({ kind: "merchant" }) }));
    expect(screen.getByText("Nobody signed up in this range")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open the application queue" }).getAttribute("href")).toBe("/merchants?status=applied");
  });

  it("offline says so", async () => {
    vi.mocked(adminFetchResult).mockResolvedValue({ reason: "unconfigured" } as never);
    render(await PeoplePage({ searchParams: sp() }));
    expect(screen.getAllByText(/not configured|API|offline/i).length).toBeGreaterThan(0);
  });
});
