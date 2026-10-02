/**
 * Owner decision 2026-10-02 (ledger D-53, 2.34 row): when LyniaGo cancels, "Nothing to pay." is said
 * on the order screen AND in the push, in the same words. The handoff's screen 18c / 2.31 left it out
 * while its push table (2.34) carried it; this pins both sides to `A.nothingOwed`.
 */
import { readFileSync } from "fs";
import { join } from "path";
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { ORDER_COPY as A } from "../copy";
import { CancelledSheet } from "../stages";

function textOf(r: ReactTestRenderer): string {
  const out: string[] = [];
  const walk = (n: unknown): void => {
    if (typeof n === "string") out.push(n);
    else if (Array.isArray(n)) n.forEach(walk);
    else if (n && typeof n === "object" && "children" in n) walk((n as { children: unknown }).children);
  };
  walk(r.toJSON());
  return out.join(" ");
}

function render(el: React.ReactElement): ReactTestRenderer {
  let r!: ReactTestRenderer;
  act(() => {
    r = create(el);
  });
  return r;
}

describe("cancelled sheet: Nothing to pay", () => {
  it("LyniaGo cancel (2.31 generic) says it", () => {
    const r = render(<CancelledSheet headline={A.cxLynia} reason={null} extra={A.cxLyniaGeneric} />);
    expect(textOf(r)).toContain(A.nothingOwed);
  });

  it("LyniaGo cancel with a reason (2.31 specific) says it", () => {
    const r = render(<CancelledSheet headline={A.cxLynia} reason="The rider reported the pickup was closed." extra={A.cxLyniaGeneric} />);
    expect(textOf(r)).toContain(A.nothingOwed);
  });

  it("customer cancel (18a / 2.30) still says it", () => {
    const r = render(<CancelledSheet headline={A.cxYou} reason={null} extra={null} />);
    expect(textOf(r)).toContain(A.nothingOwed);
  });

  it("the LyniaGo-cancelled push carries the screen's sentence verbatim", () => {
    const src = readFileSync(join(__dirname, "../../../../../api/src/notifications/notifications.service.ts"), "utf8");
    expect(src).toContain(`"Open to see why. ${A.nothingOwed}"`);
  });
});
