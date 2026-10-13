// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuditList, TimelinePage } from "../lib/adminTypes";

vi.mock("../lib/api", () => ({ adminFetch: vi.fn() }));

import { adminFetch } from "../lib/api";
import { AuditCard, auditReason, fetchAuditFor } from "./AuditSection";
import { fetchTimeline, TimelineCard } from "./Timeline";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const page: TimelinePage = {
  rows: [
    { key: "a:1", at: "2026-10-13T08:00:00Z", kind: "audit", line: "Suspended · safety report", tone: "", ref: null, by: "ops@lyniago.com" },
    { key: "o:1", at: "2026-10-13T07:00:00Z", kind: "order", line: "Delivered", tone: "good", ref: { label: "#a1b2c3", href: "/orders/a1b2c3" }, by: null },
  ],
  nextCursor: "next-1",
};

describe("TimelineCard (console v2 §4)", () => {
  it("shows each row in Harare time with its kind, line, actor and order link", () => {
    render(<TimelineCard page={page} pageHref={(c) => `/riders/r1?tlCursor=${c}`} resetHref="/riders/r1" />);
    expect(screen.getByText("13 Oct, 10:00")).toBeTruthy(); // 08:00 UTC = 10:00 Harare
    expect(screen.getByText("Audit")).toBeTruthy();
    expect(screen.getByText("Suspended · safety report")).toBeTruthy();
    expect(screen.getByText("· ops@lyniago.com")).toBeTruthy();
    expect(screen.getByText("#a1b2c3").getAttribute("href")).toBe("/orders/a1b2c3");
    expect(screen.getByText("Older →").getAttribute("href")).toBe("/riders/r1?tlCursor=next-1#timeline");
    expect(screen.queryByText("↺ Back to latest")).toBeNull();
  });

  it("degrades to a note when the timeline can't load", () => {
    render(<TimelineCard page={null} pageHref={() => ""} resetHref="/riders/r1" />);
    expect(screen.getByText("Timeline unavailable.")).toBeTruthy();
  });

  it("adds the cursor to the API path", async () => {
    vi.mocked(adminFetch).mockResolvedValue(null as never);
    await fetchTimeline("/admin/people/p1/timeline?as=rider", "c/1");
    expect(adminFetch).toHaveBeenCalledWith("/admin/people/p1/timeline?as=rider&cursor=c%2F1");
    await fetchTimeline("/admin/merchants/m1/timeline");
    expect(adminFetch).toHaveBeenLastCalledWith("/admin/merchants/m1/timeline");
  });
});

describe("AuditCard (console v2 §8)", () => {
  const list: AuditList = {
    rows: [
      {
        id: "x1",
        at: "2026-10-13T08:00:00Z",
        actor: { id: "ops@lyniago.com", name: "ops@lyniago.com", href: null },
        action: "rider.suspend",
        actionLabel: "Suspended",
        target: { type: "rider", id: "r1", label: "Tendai Moyo", href: "/riders/r1" },
        reasonCode: "safety_report",
        note: "went offline mid-job",
        amount: null,
        before: null,
        after: null,
      },
    ],
    nextCursor: null,
  };

  it("lists the record's rows and links to the full viewer", async () => {
    render(<AuditCard target="r1" list={list} />);
    expect(screen.getByText("Suspended")).toBeTruthy();
    expect(screen.getByText("Safety report · went offline mid-job")).toBeTruthy();
    expect(screen.getByText("ops@lyniago.com").getAttribute("href")).toBe("/audit?actor=ops%40lyniago.com");
    expect(screen.getByText("All audit rows →").getAttribute("href")).toBe("/audit?target=r1");
    vi.mocked(adminFetch).mockResolvedValue(null as never);
    await fetchAuditFor("r1");
    expect(adminFetch).toHaveBeenCalledWith("/admin/audit?target=r1&limit=5");
  });

  it("formats the reason with the amount", () => {
    expect(auditReason({ amount: "5", reasonCode: null, note: null })).toBe("$5.00");
    expect(auditReason({ amount: null, reasonCode: null, note: null })).toBe("—");
  });
});
