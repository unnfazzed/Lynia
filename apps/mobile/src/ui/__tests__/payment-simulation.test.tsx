/**
 * Guards on the payment-preview gate — the rider top-up flow and the customer food-checkout
 * prompt/decline pair, shipped to real users on 2026-08-12 behind a server kill switch.
 *
 * The invariant these tests exist to hold: **the gate controls whether a preview is REACHABLE, never
 * whether it tells the truth.** Before this change the warning components re-checked `isTestBuild()`
 * themselves, so relaxing the entry gate alone would have shipped the fabricated payment screens with
 * their warnings silently switched off — the worst reachable state, and a plausible next refactor.
 * Anyone who re-introduces a build/flag condition on a warning breaks a test here.
 */
let mockIsTestBuild = false;
let mockPaymentSimulationEnabled = false;
jest.mock("../test-build", () => ({ isTestBuild: () => mockIsTestBuild }));
jest.mock("../../net/use-preview-flags", () => ({
  usePreviewFlags: () => ({ paymentSimulationEnabled: mockPaymentSimulationEnabled }),
}));

import React from "react";
import renderer, { act } from "react-test-renderer";

import { SimulatedPathNotice } from "../food/SimulatedPathNotice";
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

describe("SimulatedPathNotice — unconditional (the sign is not on the same switch as the door)", () => {
  it("renders its warning in a real release build, with the flag off", () => {
    // The headline interpolates `what`, so it lands as sibling text children, not one string.
    const text = allText(render(<SimulatedPathNotice what="no payment prompt was sent" />));
    expect(text).toContain("PREVIEW —");
    expect(text).toContain("no payment prompt was sent");
    expect(text).toContain("Nothing was charged");
  });

  it("no longer says 'test build' now that it ships to real customers", () => {
    expect(allText(render(<SimulatedPathNotice what="no payment prompt was sent" />)).toLowerCase()).not.toContain(
      "test build",
    );
  });
});

describe("TopUpSimulator — the preview cannot render without its warning, or without the real path", () => {
  const props = { balance: 0, minTopUp: 5, maxTopUp: 50, onExit: () => {} };

  it("carries the PREVIEW strip on the amount step in a release build", () => {
    const text = allText(render(<TopUpSimulator {...props} />));
    expect(text).toContain("PREVIEW — no payment request was sent");
    expect(text).toContain("no money moves");
  });

  it("keeps the only working top-up route — calling support — on the screen it replaced", () => {
    // Regression pin: the preview took over the screen that used to be nothing BUT the support card.
    // Shipping it without carrying that action forward would have left riders unable to add balance
    // at all, which is strictly worse than the screen it replaced.
    const text = allText(render(<TopUpSimulator {...props} />));
    expect(text).toContain("TO TOP UP FOR REAL");
    expect(text).toContain("LyniaGo support");
  });

  it("never claims the balance moved — the amount step states the balance is untouched", () => {
    expect(allText(render(<TopUpSimulator {...props} />))).toContain("your balance is untouched");
  });
});
