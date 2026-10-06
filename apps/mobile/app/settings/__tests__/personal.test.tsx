/**
 * Personal details (ledger D-78, owner 2026-10-06): name, the verified phone, an optional national ID.
 * Pins: the form is seeded from `me`; the ID is sent normalised and only when it changed; the one-ID-one-
 * account 409 is shown under the field in the API's words; a verified rider's ID is read-only, masked to
 * its last three characters; a stored ID can't be silently "cleared".
 */
import renderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ApiError } from "../../../src/api/client";

const TEST_METRICS = { insets: { top: 0, left: 0, right: 0, bottom: 0 }, frame: { x: 0, y: 0, width: 360, height: 720 } };
const mockGetMe = jest.fn();
const mockUpdate = jest.fn();
const mockBack = jest.fn();

jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn(), back: mockBack }) }));
jest.mock("../../../src/api/auth", () => ({ getMe: () => mockGetMe(), updateProfile: (b: unknown) => mockUpdate(b) }));

import PersonalDetailsScreen from "../personal";

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
const saveBtn = (t: renderer.ReactTestRenderer) => t.root.findAll((n) => n.props.accessibilityLabel === "Save" && typeof n.props.onPress === "function")[0]!;
const type = async (t: renderer.ReactTestRenderer, label: string, v: string): Promise<void> => {
  await act(async () => input(t, label)!.props.onChangeText(v));
};
const save = async (t: renderer.ReactTestRenderer): Promise<void> => {
  await act(async () => {
    saveBtn(t).props.onPress();
    await new Promise((r) => setTimeout(r, 0));
  });
};

describe("Personal details", () => {
  it("draws the name fields seeded from the account, the verified phone and an optional ID field", async () => {
    const t = await render(CUSTOMER);
    const s = out(t);
    for (const k of ["Personal details", "First name", "Surname", "Verified", "National ID (optional)"]) expect(s).toContain(k);
    expect(input(t, "First name")!.props.value).toBe("Chipo");
    expect(input(t, "Surname")!.props.value).toBe("Marufu");
    expect(input(t, "National ID (optional)")!.props.value).toBe("");
    // Nothing changed yet → nothing to save.
    expect(saveBtn(t).props.disabled).toBe(true);
  });

  it("adds an ID: sent normalised, with the name, then back", async () => {
    mockUpdate.mockResolvedValue({ ...CUSTOMER, idNumber: "63123456A42" });
    const t = await render(CUSTOMER);
    await type(t, "National ID (optional)", "63-123456 a 42");
    await save(t);
    expect(mockUpdate).toHaveBeenCalledWith({ firstName: "Chipo", lastName: "Marufu", idNumber: "63123456A42" });
    expect(mockBack).toHaveBeenCalled();
  });

  it("a name-only edit sends no idNumber", async () => {
    mockUpdate.mockResolvedValue({ ...CUSTOMER, firstName: "Chiedza" });
    const t = await render({ ...CUSTOMER, idNumber: "63123456A42" });
    await type(t, "First name", " Chiedza ");
    await save(t);
    expect(mockUpdate).toHaveBeenCalledWith({ firstName: "Chiedza", lastName: "Marufu" });
  });

  it("an ID already on another account is explained under the field, in the API's words", async () => {
    const msg = "This national ID is already linked to another account. Contact support if it's yours.";
    mockUpdate.mockRejectedValue(new ApiError(409, msg, "id_in_use"));
    const t = await render(CUSTOMER);
    await type(t, "National ID (optional)", "63123456A42");
    await save(t);
    expect(out(t)).toContain(msg);
    expect(mockBack).not.toHaveBeenCalled();
  });

  it("a stored ID can't be cleared here: Save stays off and the screen says how", async () => {
    const t = await render({ ...CUSTOMER, idNumber: "63123456A42" });
    await type(t, "National ID (optional)", "");
    expect(saveBtn(t).props.disabled).toBe(true);
    expect(out(t)).toContain("To remove your national ID, contact support.");
  });

  it("a verified rider sees the ID from the check read-only, masked, 'Verified' — no field", async () => {
    const t = await render({ ...CUSTOMER, role: "rider", idNumber: "63123456A42", rider: { kycStatus: "verified", bikeReg: null } });
    const s = out(t);
    expect(s).toContain("••••••••A42");
    expect(s).not.toContain("63123456A42");
    expect(s).toContain("This came from your ID check. To change it, contact support.");
    expect(input(t, "National ID (optional)")).toBeUndefined();
  });
});
