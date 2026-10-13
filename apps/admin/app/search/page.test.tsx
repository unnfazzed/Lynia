// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SearchResults } from "../lib/adminTypes";

const redirect = vi.fn((href: string) => {
  throw new Error(`REDIRECT ${href}`);
});
vi.mock("next/navigation", () => ({ redirect: (href: string) => redirect(href) }));
vi.mock("../lib/api", () => ({ adminFetchResult: vi.fn() }));

import { adminFetchResult } from "../lib/api";
import SearchPage from "./page";
import { onlyHit } from "./groups";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const empty = (): SearchResults => ({ q: "tendai", tooShort: false, total: 0, groups: { bikers: [], customers: [], merchants: [], orders: [], topups: [] } });
const hit = (id: string, href: string) => ({ id, label: `Hit ${id}`, sub: "sub", href });

async function show(q: string, data?: SearchResults) {
  if (data) vi.mocked(adminFetchResult).mockResolvedValue({ data } as never);
  render(await SearchPage({ searchParams: Promise.resolve({ q }) }));
}

describe("Search results (console v2 §4)", () => {
  it("goes straight to the record when there is exactly one hit", async () => {
    const r = empty();
    r.total = 1;
    r.groups.orders = [hit("o1", "/orders/o1")];
    await expect(show("#a1b2c3", r)).rejects.toThrow("REDIRECT /orders/o1");
    expect(adminFetchResult).toHaveBeenCalledWith("/admin/search?q=%23a1b2c3");
  });

  it("lists each group that has hits", async () => {
    const r = empty();
    r.total = 3;
    r.groups.bikers = [hit("b1", "/riders/b1"), hit("b2", "/riders/b2")];
    r.groups.customers = [hit("c1", "/customers/c1")];
    await show("moyo", r);
    expect(screen.getByText("Bikers")).toBeTruthy();
    expect(screen.getByText("Customers")).toBeTruthy();
    expect(screen.queryByText("Top-ups")).toBeNull();
    expect(screen.getByText("Hit b2").closest("a")?.getAttribute("href")).toBe("/riders/b2");
    expect(redirect).not.toHaveBeenCalled();
  });

  it("asks for 3 characters without calling the API", async () => {
    await show("ab");
    expect(screen.getByText("Type at least 3 characters")).toBeTruthy();
    expect(adminFetchResult).not.toHaveBeenCalled();
  });

  it("says when nothing matched", async () => {
    await show("zzzz", empty());
    expect(screen.getByText("No matches")).toBeTruthy();
  });

  it("never redirects outside the console", () => {
    const r = empty();
    r.total = 1;
    r.groups.bikers = [hit("x", "//evil.example")];
    expect(onlyHit(r)).toBeNull();
  });
});
