/**
 * Guards on the payment gate — the rider top-up flow and the customer food-checkout prompt/decline
 * pair, shipped to real users on 2026-08-12 behind a server kill switch, and de-labelled later the
 * same day on the owner's explicit instruction.
 *
 * With the SIMULATED/PREVIEW markers gone, the gate is the ONLY control over these flows, so what is
 * pinned here changed shape:
 *   - the gate itself (two doors, shut by default, server `false` closes a release build);
 *   - the behavioural invariants that outlived the labels — no network call, and the real
 *     support-call route surviving on the screen the top-up flow took over.
 *
 * The copy assertions are deliberately NOT re-pointed at the new unlabelled strings. Pinning "added
 * to your balance" would turn a decision the owner can revisit into a test that fights the revert.
 */
let mockIsTestBuild = false;
let mockPaymentSimulationEnabled = false;
jest.mock("../test-build", () => ({ isTestBuild: () => mockIsTestBuild }));
jest.mock("../../net/use-preview-flags", () => ({
  usePreviewFlags: () => ({ paymentSimulationEnabled: mockPaymentSimulationEnabled }),
}));

import React from "react";
import renderer, { act } from "react-test-renderer";

import { usePaymentSimulation } from "../payment-simulation";
import { TopUpSimulator } from "../rider/TopUpSimulator";

afterEach(() => {
  mockIsTestBuild = false;
  mockPaymentSimulationEnabled = false;
});

function render(node: React.ReactElement): renderer.ReactTestRenderer {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(node);
  });
  return tree;
}

/** Every string rendered anywhere in the tree, flattened — copy invariants are asserted against this. */
function allText(tree: renderer.ReactTestRenderer): string {
  return tree.root
    .findAllByType("Text" as never)
    .flatMap((n) => {
      const c = n.props.children;
      return Array.isArray(c) ? c.filter((x) => typeof x === "string") : typeof c === "string" ? [c] : [];
    })
    .join(" | ");
}

function gateValue(): boolean {
  let seen!: boolean;
  function Harness(): null {
    seen = usePaymentSimulation();
    return null;
  }
  act(() => {
    renderer.create(<Harness />);
  });
  return seen;
}

describe("usePaymentSimulation — two independent doors, closed by default", () => {
  it("is shut when neither the QA build nor the server flag opens it", () => {
    expect(gateValue()).toBe(false);
  });

  it("opens on the QA test build with no server involvement (the APK must work against a dead API)", () => {
    mockIsTestBuild = true;
    expect(gateValue()).toBe(true);
  });

  it("opens on the server flag — this is what ships the previews to riders", () => {
    mockPaymentSimulationEnabled = true;
    expect(gateValue()).toBe(true);
  });

  it("a server false still shuts a release build — the kill switch works without an app update", () => {
    mockIsTestBuild = false;
    mockPaymentSimulationEnabled = false;
    expect(gateValue()).toBe(false);
  });
});

describe("TopUpSimulator — what survived the de-labelling", () => {
  const props = { balance: 0, minTopUp: 5, maxTopUp: 50, onExit: () => {} };

  it("keeps the only working top-up route — calling support — on the screen it replaced", () => {
    // Regression pin, and the one that matters most now. The flow took over the screen that used to be
    // nothing BUT the support card, and calling support is still the only way a balance actually
    // moves. Losing this leaves riders with no route to their money at all.
    const text = allText(render(<TopUpSimulator {...props} />));
    expect(text).toContain("TOP UP BY PHONE");
    expect(text).toContain("LyniaGo support");
  });

  it("renders the amount step without touching the network", () => {
    // The flow draws a rail that does not exist; it must never open a real `TopUp` intent, which could
    // only ever expire (DOC-16-02). No fetch means no intent, no PendingTopup marker, no ledger row.
    const fetchSpy = jest.fn();
    const realFetch = global.fetch;
    global.fetch = fetchSpy as unknown as typeof fetch;
    try {
      render(<TopUpSimulator {...props} />);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      global.fetch = realFetch;
    }
  });
});
