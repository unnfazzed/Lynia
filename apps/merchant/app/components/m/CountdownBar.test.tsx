// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { clock, CountdownBar } from "./CountdownBar";

afterEach(cleanup);

describe("Own bikers v1 · the countdown bar (OB-M9)", () => {
  it("reads the time left like the drawing, never below 0:00", () => {
    expect(clock(84_000)).toBe("1:24");
    expect(clock(120_000)).toBe("2:00");
    expect(clock(500)).toBe("0:01");
    expect(clock(-3_000)).toBe("0:00");
  });

  it("is a progressbar labelled with the time left, filled by the share of the two minutes", () => {
    render(<CountdownBar msLeft={84_000} totalMs={120_000} />);
    const bar = screen.getByRole("progressbar", { name: "1:24 left" });
    expect(bar.getAttribute("aria-valuenow")).toBe("70");
    expect((bar.firstElementChild as HTMLElement).style.width).toBe("70%");
  });
});
