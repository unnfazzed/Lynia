/**
 * Personal details — First Run v2 D2–D7 (`packages/design/handoff/first-run-v2` README §2 D, ledger D-80;
 * the screen is D-79's). Pins: the back header + large title; the form seeded from `me`; the ID
 * normalised and validated on blur and on Save (D5); the ID sent canonical and only when it changed;
 * D3's inline "Saved" for 1.5s (no toast, no navigation); D4's 409 → danger box + WhatsApp CTA; D6's
 * verified ID read-only, masked but the last three; a stored ID can't be silently cleared.
 */
import renderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ApiError } from "../../../src/api/client";

const TEST_METRICS = { insets: { top: 0, left: 0, right: 0, bottom: 0 }, frame: { x: 0, y: 0, width: 360, height: 720 } };
const mockGetMe = jest.fn();
const mockUpdate = jest.fn();
const mockBack = jest.fn();
const mockOpenWhatsApp = jest.fn();

jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn(), back: mockBack }) }));
jest.mock("../../../src/api/auth", () => ({ getMe: () => mockGetMe(), updateProfile: (b: unknown) => mockUpdate(b) }));
jest.mock("../../../src/config", () => ({ ...jest.requireActual("../../../src/config"), openSupportWhatsApp: () => mockOpenWhatsApp() }));

import PersonalDetailsScreen, { SAVED_MS } from "../personal";

const CUSTOMER = { profileId: "p1", firstName: "Chipo", lastName: "Marufu", phone: "+263772451180", role: "customer", idNumber: null, rider: null };

const trees: renderer.ReactTestRenderer[] = [];
afterEach(() => {
  while (trees.length) {
    const t = trees.pop()!;
    act(() => t.unmount());
  }
});
beforeEach(() => jest.clearAllMocks());

async function render(me: object): Promise<renderer.ReactTestRenderer> {
  mockGetMe.mockResolvedValue(me);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <SafeAreaProvider initialMetrics={TEST_METRICS}>
        <QueryClientProvider client={client}>
          <PersonalDetailsScreen />
        </QueryClientProvider>
      </SafeAreaProvider>,
    );
  });
  for (let i = 0; i < 5; i += 1) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
  trees.push(tree);
  return tree;
}

const out = (t: renderer.ReactTestRenderer): string => JSON.stringify(t.toJSON());
const input = (t: renderer.ReactTestRenderer, label: string) => t.root.findAll((n) => n.props.accessibilityLabel === label && typeof n.props.onChangeText === "function")[0];
const cta = (t: renderer.ReactTestRenderer) => t.root.findAll((n) => n.props.testID === "personal-cta" && typeof n.props.onPress === "function")[0]!;
const idBox = (t: renderer.ReactTestRenderer) => t.root.findAll((n) => n.props.testID === "national-id-box" && n.props.style)[0]!;
const type = async (t: renderer.ReactTestRenderer, label: string, v: string): Promise<void> => {
  await act(async () => input(t, label)!.props.onChangeText(v));
};
const blur = async (t: renderer.ReactTestRenderer, label: string): Promise<void> => {
  await act(async () => input(t, label)!.props.onBlur());
};
const save = async (t: renderer.ReactTestRenderer): Promise<void> => {
  await act(async () => {
    cta(t).props.onPress();
    await new Promise((r) => setTimeout(r, 0));
  });
};

describe("Personal details · D2", () => {
  it("draws the back header + large title, the names seeded, the verified phone and the optional ID", async () => {
    const t = await render(CUSTOMER);
    const s = out(t);
    for (const k of ["Personal details", "First name", "Surname", "+263 77 245 1180", "Verified", "National ID", "optional", "Some pharmacy or high-value orders need it.", "Save"]) expect(s).toContain(k);
    expect(t.root.findAll((n) => n.props.testID === "back-button").length).toBeGreaterThan(0);
    expect(input(t, "First name")!.props.value).toBe("Chipo");
    expect(input(t, "Surname")!.props.value).toBe("Marufu");
    expect(input(t, "National ID")!.props.value).toBe("");
    expect(input(t, "National ID")!.props.placeholder).toBe("63-123456A78");
  });

  it("Back goes back", async () => {
    const t = await render(CUSTOMER);
    await act(async () => t.root.findAll((n) => n.props.testID === "back-button" && typeof n.props.onPress === "function")[0]!.props.onPress());
    expect(mockBack).toHaveBeenCalled();
  });
});

describe("D5 · format", () => {
  it("normalises spaces and case on blur, and flags a bad ID on blur", async () => {
    const t = await render(CUSTOMER);
    await type(t, "National ID", "63 123456 a 78");
    await blur(t, "National ID");
    expect(input(t, "National ID")!.props.value).toBe("63-123456A78");
    expect(out(t)).not.toContain("Use the format 63-123456A78");
    await type(t, "National ID", "63 4829");
    await blur(t, "National ID");
    expect(out(t)).toContain("Use the format 63-123456A78");
    expect(JSON.stringify(idBox(t).props.style)).toContain('"borderColor":"#C0392B"');
  });

  it("also checks on Save, and sends nothing when it doesn't fit", async () => {
    const t = await render(CUSTOMER);
    await type(t, "National ID", "1234");
    await save(t);
    expect(out(t)).toContain("Use the format 63-123456A78");
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe("D3 · saved", () => {
  it("adds an ID: sent in the server's canonical form with the name; the button reads 'Saved' for 1.5s, no navigation", async () => {
    mockUpdate.mockResolvedValue({ ...CUSTOMER, idNumber: "63123456A78" });
    const t = await render(CUSTOMER);
    await type(t, "National ID", "63-123456a78");
    await save(t);
    expect(mockUpdate).toHaveBeenCalledWith({ firstName: "Chipo", lastName: "Marufu", idNumber: "63123456A78" });
    expect(out(t)).toContain('"Saved"');
    expect(mockBack).not.toHaveBeenCalled();
    await act(async () => {
      await new Promise((r) => setTimeout(r, SAVED_MS + 50));
    });
    expect(out(t)).not.toContain('"Saved"');
    expect(out(t)).toContain('"Save"');
  }, 15_000);

  it("a name-only edit sends no idNumber", async () => {
    mockUpdate.mockResolvedValue({ ...CUSTOMER, firstName: "Chiedza" });
    const t = await render({ ...CUSTOMER, idNumber: "63123456A78" });
    expect(input(t, "National ID")!.props.value).toBe("63-123456A78");
    await type(t, "First name", " Chiedza ");
    await save(t);
    expect(mockUpdate).toHaveBeenCalledWith({ firstName: "Chiedza", lastName: "Marufu" });
  });
});

describe("D4 · ID on another account", () => {
  it("the 409 puts the field in red, shows the danger box and turns the button into WhatsApp — until the ID is edited", async () => {
    mockUpdate.mockRejectedValue(new ApiError(409, "This national ID is already linked to another account.", "id_in_use"));
    const t = await render(CUSTOMER);
    await type(t, "National ID", "63-482913K07");
    await save(t);
    const s = out(t);
    expect(s).toContain("This ID is on another account");
    expect(s).toContain("One ID, one account. Message us and we’ll sort it.");
    expect(s).toContain("Message us on WhatsApp");
    expect(JSON.stringify(idBox(t).props.style)).toContain('"borderColor":"#C0392B"');
    await act(async () => cta(t).props.onPress());
    expect(mockOpenWhatsApp).toHaveBeenCalled();
    await type(t, "National ID", "63-482913K08");
    expect(out(t)).not.toContain("This ID is on another account");
    expect(out(t)).toContain("Save");
  });
});

describe("D6 · verified rider", () => {
  it("shows the ID from the check read-only, masked but the last three, with ✓ Verified — no field", async () => {
    const t = await render({ ...CUSTOMER, role: "rider", idNumber: "63482913K07", rider: { kycStatus: "verified", bikeReg: null } });
    const s = out(t);
    expect(s).toContain("••-••••••K07");
    expect(s).not.toContain("63482913K07");
    expect(s).toContain("From your ID check");
    expect(input(t, "National ID")).toBeUndefined();
  });
});

describe("guard", () => {
  it("a stored ID can't be cleared here: Save says how instead of sending", async () => {
    const t = await render({ ...CUSTOMER, idNumber: "63123456A78" });
    await type(t, "National ID", "");
    await save(t);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(out(t)).toContain("To remove your national ID, contact support.");
  });
});
