/**
 * Customer briefs 06 + 08 (`handoff/customer-briefs-06-09/`, ledger D-97): the late-cancel sheet's
 * 18d / 18e / 18b / 18f and the code card's 2.14b / 2.14c / 2.14d, rendered from the shared components.
 */
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { CodeBig, CodeCard, type RiderView } from "../cards";
import { ORDER_COPY as A, orderText } from "../copy";
import { LateCancelSheet } from "../stages";

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

/** The accessible buttons, by label → disabled. */
function buttons(r: ReactTestRenderer): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const n of r.root.findAll((x) => x.props.accessibilityRole === "button" && typeof x.props.accessibilityLabel === "string")) {
    out[n.props.accessibilityLabel as string] = !!n.props.accessibilityState?.disabled;
  }
  return out;
}

const rider: RiderView = { name: "Tendai M.", firstName: "Tendai", initials: "TM", photoUrl: null, ratingAvg: 4.9, trips: 132, plate: "ABH 4721", verified: true };
const noop = (): void => undefined;
const late = (variant: "reach" | "pending" | "hidden", title: string = A.lateCancelYouTitle) =>
  render(<LateCancelSheet title={title} rider={rider} riderFirst="Tendai" variant={variant} stackButtons={false} onCall={noop} onWhatsApp={noop} onSupport={noop} />);

describe("late cancel (brief 06)", () => {
  it("18d: the gold strip, the rider card with Call / WhatsApp, and Not answering? Call support", () => {
    const r = late("reach");
    const t = textOf(r);
    expect(t).toContain(A.lateCancelYouTitle);
    expect(t).toContain(A.nothingToPay);
    expect(t).toContain(orderText.lateCancelStripBold("Tendai"));
    expect(t).toContain(A.lateCancelStripRest);
    expect(buttons(r)).toMatchObject({ "Call Tendai": false, "WhatsApp Tendai": false, [A.riderNoAnswer]: false });
  });

  it("18b: the rider's own title", () => {
    expect(textOf(late("reach", orderText.lateCancelRiderTitle("Tendai")))).toContain("Tendai cancelled the trip");
  });

  it("18e: Call / WhatsApp off, the pending line in place of the meta", () => {
    const r = late("pending");
    const t = textOf(r);
    expect(t).toContain(orderText.riderNumberPending("Tendai"));
    expect(t).not.toContain("132 trips");
    expect(buttons(r)).toMatchObject({ "Call Tendai": true, "WhatsApp Tendai": true });
  });

  it("18f: no strip, no buttons, numbers hidden, Still need your parcel?", () => {
    const r = late("hidden");
    const t = textOf(r);
    expect(t).not.toContain(A.lateCancelStripRest);
    expect(t).toContain(A.numbersHidden);
    expect(t).toContain(A.stillNeedParcel);
    expect(Object.keys(buttons(r))).toEqual([A.stillNeedParcel]);
  });
});

describe("code card (brief 08)", () => {
  it("2.14b: the gold strip and a filled Share code; no strip once shared, the shared line instead", () => {
    const changed = render(<CodeCard code="736051" offline={false} onShare={noop} changed />);
    expect(textOf(changed)).toContain(A.codeChangedTitle);
    expect(textOf(changed)).not.toContain(A.codeHelp);
    const shared = render(<CodeCard code="736051" offline={false} onShare={noop} sharedAt="2026-10-12T09:14:00" />);
    expect(textOf(shared)).not.toContain(A.codeChangedTitle);
    expect(textOf(shared)).toContain(orderText.codeSharedLine("09:14"));
  });

  it("2.14c: no digits, Share code off, needs data — Send a new code only once the auto fetch failed", () => {
    const r = render(<CodeCard code="736051" offline onShare={noop} status="failed" onSendNew={noop} />);
    expect(textOf(r)).toContain(A.codeNeedsData);
    expect(textOf(r)).not.toContain("736");
    expect(buttons(r)).toMatchObject({ [A.shareCode]: true, [A.sendNewCode]: false });
    const noRetry = render(<CodeCard code={null} offline onShare={noop} status="failed" onSendNew={null} />);
    expect(buttons(noRetry)[A.sendNewCode]).toBeUndefined();
  });

  it("2.14 fetching a new code says so", () => {
    expect(textOf(render(<CodeCard code={null} offline={false} onShare={noop} status="fetching" fresh />))).toContain(A.codeGettingNew);
  });

  it("2.14d: no digits, the warn strip, Call support", () => {
    const r = render(<CodeCard code={null} offline={false} onShare={noop} status="limit" riderFirst="Tendai" onCallSupport={noop} />);
    const t = textOf(r);
    expect(t).toContain(A.codeLimitTitle);
    expect(t).toContain(orderText.codeLimitSub("Tendai"));
    expect(Object.keys(buttons(r))).toEqual([A.callSupport]);
  });

  it("hand-off: the New code chip above the digits", () => {
    expect(textOf(render(<CodeBig code="736051" screenWidth={360} isNew />))).toContain(A.codeNewChip);
    expect(textOf(render(<CodeBig code="736051" screenWidth={360} />))).not.toContain(A.codeNewChip);
  });
});
