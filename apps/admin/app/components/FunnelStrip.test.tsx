// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FunnelStrip, stuckHref } from "./FunnelStrip";
import type { FunnelStep } from "../lib/adminTypes";

/** Admin console v2 §4: the funnel strip — count, conversion, median, "since", and the link to the stuck list. */

afterEach(cleanup);

const step = (over: Partial<FunnelStep>): FunnelStep => ({
  key: "k",
  label: "Step",
  count: 0,
  pctOfCohort: null,
  conversionPct: null,
  medianMs: null,
  timedCount: 0,
  since: null,
  timesSince: null,
  stuckList: null,
  ...over,
});

describe("FunnelStrip", () => {
  it("shows each step's count, conversion and median, and links a tile to its stuck list", () => {
    render(
      <FunnelStrip
        kind="biker"
        range="7d"
        label="Bikers funnel"
        steps={[
          step({ key: "signed_up", label: "Signed up", count: 40, pctOfCohort: 100 }),
          step({ key: "didit_started", label: "Started ID check", count: 12, pctOfCohort: 30, conversionPct: 60, medianMs: 3 * 3_600_000, stuckList: "biker_no_didit", timesSince: "2026-10-12" }),
        ]}
      />,
    );
    expect(screen.getByRole("list", { name: "Bikers funnel" })).toBeTruthy();
    expect(screen.getByText("40")).toBeTruthy();
    const link = screen.getByRole("link", { name: /Started ID check: 12 \(60% · 3 hr\)/ });
    expect(link.getAttribute("href")).toBe("/people?kind=biker&range=7d&list=biker_no_didit#stuck");
    expect(screen.getByText("since 12 Oct")).toBeTruthy();
    // The first step has no stuck list: a plain tile, not a link.
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("an unmeasured median shows a dash, never a made-up time", () => {
    render(<FunnelStrip kind="customer" range="today" label="f" steps={[step({}), step({ key: "b", label: "Rated", count: 1, conversionPct: null })]} />);
    expect(screen.getByText("—")).toBeTruthy();
  });

  it("stuckHref keeps the side and range", () => {
    expect(stuckHref("merchant", "30d", "merchant_live_idle")).toBe("/people?kind=merchant&range=30d&list=merchant_live_idle#stuck");
  });
});
