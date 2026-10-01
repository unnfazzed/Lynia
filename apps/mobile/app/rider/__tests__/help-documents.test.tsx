/**
 * Rider v2 S5 (Bike & documents) and S6 (Help & support), ledger D-54.
 */
import renderer, { act } from "react-test-renderer";
import { Linking } from "react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";

const TEST_METRICS = { insets: { top: 0, left: 0, right: 0, bottom: 0 }, frame: { x: 0, y: 0, width: 360, height: 720 } };

jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }) }));
jest.mock("../../../src/config", () => ({ supportWhatsAppUrl: () => "https://wa.me/263770000000" }));
jest.mock("../../../src/api/auth", () => ({
  getMe: async () => ({ profileId: "p1", role: "rider", firstName: "Tendai", rider: { kycStatus: "verified", bikeReg: "ABH 4721" } }),
}));

import DocumentsScreen from "../documents";
import RiderHelpScreen from "../help";

function render(which: "docs" | "help"): renderer.ReactTestRenderer {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <SafeAreaProvider initialMetrics={TEST_METRICS}>
        <QueryClientProvider client={qc}>{which === "docs" ? <DocumentsScreen /> : <RiderHelpScreen />}</QueryClientProvider>
      </SafeAreaProvider>,
    );
  });
  return tree;
}
const text = (t: renderer.ReactTestRenderer): string =>
  t.root
    .findAll((n) => typeof n.type === "string")
    .map((n) => (typeof n.props.children === "string" ? n.props.children : ""))
    .join("|");

/** Ticks until `getMe` has resolved and the rows are drawn (a cold first render can take a few). */
async function loaded(tree: renderer.ReactTestRenderer): Promise<void> {
  for (let i = 0; i < 20 && !text(tree).includes("National ID"); i += 1) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

let openURL: jest.SpyInstance;
beforeEach(() => {
  openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
});
afterEach(() => openURL.mockRestore());

describe("S5 Bike & documents", () => {
  it("lists ID, photo and bike as verified, with the plate", async () => {
    const tree = render("docs");
    await loaded(tree);
    const t = text(tree);
    for (const s of ["Bike & documents", "National ID", "Rider photo", "Bike", "ABH 4721", "Verified", "Changed bikes? Re-verify with the new plate."]) expect(t).toContain(s);
  });

  it("Re-verify my bike asks support on WhatsApp, with the plate written out", async () => {
    const tree = render("docs");
    await loaded(tree);
    const btn = tree.root.findAll((n) => n.props.label === "Re-verify my bike" && typeof n.props.onPress === "function")[0]!;
    act(() => btn.props.onPress());
    expect(openURL).toHaveBeenCalledWith(expect.stringContaining("https://wa.me/263770000000?text="));
    expect(decodeURIComponent(openURL.mock.calls[0]![0] as string)).toContain("ABH 4721");
  });
});

describe("S6 Help & support (rider)", () => {
  it("draws WhatsApp, call support, the safety line and the common questions", () => {
    const t = text(render("help"));
    for (const s of ["Help & support", "Message us on WhatsApp", "Call LyniaGo support", "Call the safety line", "24 hours, for riders in danger", "COMMON QUESTIONS", "How do strikes work?"]) expect(t).toContain(s);
  });

  it("a common question opens WhatsApp with that question", () => {
    const tree = render("help");
    const row = tree.root.findAll((n) => typeof n.props.accessibilityLabel === "string" && n.props.accessibilityLabel.startsWith("How do strikes work?") && typeof n.props.onPress === "function")[0]!;
    act(() => row.props.onPress());
    expect(decodeURIComponent(openURL.mock.calls[0]![0] as string)).toContain("How do strikes work?");
  });

  it("the safety line dials", () => {
    const tree = render("help");
    const row = tree.root.findAll((n) => typeof n.props.accessibilityLabel === "string" && n.props.accessibilityLabel.startsWith("Call the safety line") && typeof n.props.onPress === "function")[0]!;
    act(() => row.props.onPress());
    expect(openURL.mock.calls[0]![0]).toMatch(/^tel:/);
  });
});
