/**
 * LC-C10 (onboarding/OTP/KYC resilience audit, C-T3): the post-OTP "Tell us who you are" screen is the
 * FIRST screen a brand-new account ever lands on (verify.tsx routes here whenever `needsProfile` is
 * true) — but before this fix it held firstName/lastName/idNumber in plain React state with no durable
 * draft, unlike the become-a-rider KYC form (`kyc-draft.ts`) which collects the exact same fields and
 * already survives an app kill. An OS-level kill while typing a name/ID here — the classic low-RAM
 * Android OOM-kill scenario the KYC draft's own comment names — silently lost everything typed, forcing
 * a full retype on relaunch.
 *
 * This test drives the real `setup.tsx` screen (mocking only SecureStore/api/router/auth-context edges,
 * per the pattern in `app/__tests__/send.test.tsx`), types into all three fields, then unmounts and
 * remounts the screen (simulating an app kill + relaunch) and asserts the fields come back populated
 * from the persisted draft. Against the pre-fix code (no `profile-draft.ts` wiring) this fails: a fresh
 * mount always starts every field empty.
 */
import renderer, { act } from "react-test-renderer";

const mockUpdateProfile = jest.fn();
const mockSignIn = jest.fn(async () => undefined);
const mockUpdateSession = jest.fn(async () => undefined);
// Mirrors what the REAL signOut does to this key: clearDeviceState deletes PROFILE_DRAFT_KEY
// because the draft holds a national ID (LC-C10). A no-op mock here would let the screen claim a
// draft-survival behaviour the shipped app does not have — which is exactly what it did before.
const PROFILE_DRAFT_KEY = "lynia.profileDraft.v1";
const mockSignOut = jest.fn(async () => {
  delete secureStore[PROFILE_DRAFT_KEY];
});
const mockReplace = jest.fn();
// Mutable so individual tests can vary the route params (D-40, docs/DESIGN-DEVIATIONS.md) without
// re-declaring the whole expo-router mock — see the reset in beforeEach below.
let mockLocalSearchParams: { phone: string; deliveryChannel?: string; intent?: string } = { phone: "+263 77 245 1180" };

let secureStore: Record<string, string> = {};
const mockSetItemAsync = jest.fn(async (key: string, value: string) => {
  secureStore[key] = value;
});
const mockGetItemAsync = jest.fn(async (key: string) => secureStore[key] ?? null);
const mockDeleteItemAsync = jest.fn(async (key: string) => {
  delete secureStore[key];
});

jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace }),
  useLocalSearchParams: () => mockLocalSearchParams,
}));
jest.mock("expo-secure-store", () => ({
  getItemAsync: (...args: [string]) => mockGetItemAsync(...args),
  setItemAsync: (...args: [string, string]) => mockSetItemAsync(...args),
  deleteItemAsync: (...args: [string]) => mockDeleteItemAsync(...args),
}));
jest.mock("../../../src/api/auth", () => ({
  updateProfile: (...args: unknown[]) => mockUpdateProfile(...args),
}));
jest.mock("../../../src/auth/auth-context", () => ({
  useAuth: () => ({
    session: { profileId: "p1", role: "customer", needsProfile: true },
    signIn: mockSignIn,
    updateSession: mockUpdateSession,
    signOut: mockSignOut,
  }),
}));
const mockSaveRole = jest.fn(async (_role: string) => undefined);
jest.mock("../../../src/auth/session", () => ({
  loadRolePreference: async () => null,
  saveRolePreference: (r: string) => mockSaveRole(r),
}));

import ProfileSetupScreen from "../setup";

/** Fields are located by the accessibilityLabel `Field` derives from `label` (see src/ui/index.tsx). */
function setFieldByAccessibilityLabel(tree: renderer.ReactTestRenderer, accessibilityLabel: string, value: string): void {
  const node = tree.root.findAll((n) => n.props.accessibilityLabel === accessibilityLabel && typeof n.props.onChangeText === "function")[0];
  if (!node) throw new Error(`no field labelled ${accessibilityLabel}`);
  act(() => node.props.onChangeText(value));
}

function getFieldValue(tree: renderer.ReactTestRenderer, accessibilityLabel: string): string {
  const node = tree.root.findAll((n) => n.props.accessibilityLabel === accessibilityLabel && typeof n.props.onChangeText === "function")[0];
  if (!node) throw new Error(`no field labelled ${accessibilityLabel}`);
  return node.props.value as string;
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function pressStart(tree: renderer.ReactTestRenderer): Promise<void> {
  const btn = tree.root.findAll((n) => n.props.accessibilityLabel === "Start using LyniaGo" && typeof n.props.onPress === "function")[0];
  if (!btn) throw new Error("no Start using LyniaGo button");
  await act(async () => {
    btn.props.onPress();
    await new Promise((r) => setTimeout(r, 0));
  });
  await settle();
}

async function mountSetup(): Promise<renderer.ReactTestRenderer> {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<ProfileSetupScreen />);
  });
  await settle();
  return tree;
}

const text = (t: renderer.ReactTestRenderer): string => JSON.stringify(t.toJSON());

beforeEach(() => {
  secureStore = {};
  mockUpdateProfile.mockReset().mockResolvedValue({ ok: true });
  mockSignIn.mockClear();
  mockUpdateSession.mockClear();
  mockSignOut.mockClear();
  mockReplace.mockClear();
  mockSetItemAsync.mockClear();
  mockGetItemAsync.mockClear();
  mockDeleteItemAsync.mockClear();
  mockSaveRole.mockClear();
  mockLocalSearchParams = { phone: "+263 77 245 1180" };
});

describe("C5 · Name (Calm Mint v2, D-55)", () => {
  it("draws the handoff's copy: two name fields, the verified row, the no-ID note — and no ID field", async () => {
    const out = text(await mountSetup());
    for (const s of ["What should riders call you?", "First name", "Surname", "+263 77 245 1180", "Verified", "No ID needed.", "Start using LyniaGo"]) {
      expect(out).toContain(s);
    }
    expect(out).not.toContain("National ID number");
    expect(out).not.toContain("Use a different number");
  });

  it("saves the name alone and starts a new account as a customer on Home", async () => {
    const tree = await mountSetup();
    setFieldByAccessibilityLabel(tree, "First name", "Chipo");
    setFieldByAccessibilityLabel(tree, "Surname", "Marufu");
    await settle();
    await pressStart(tree);
    expect(mockUpdateProfile).toHaveBeenCalledWith({ firstName: "Chipo", lastName: "Marufu" });
    expect(mockSaveRole).toHaveBeenCalledWith("customer");
    expect(mockReplace).toHaveBeenCalledWith("/home");
  });

  it("a rider intent from C1 starts the account as a rider", async () => {
    mockLocalSearchParams = { phone: "+263 77 245 1180", intent: "rider" };
    const tree = await mountSetup();
    setFieldByAccessibilityLabel(tree, "First name", "Tendai");
    setFieldByAccessibilityLabel(tree, "Surname", "Moyo");
    await settle();
    await pressStart(tree);
    expect(mockSaveRole).toHaveBeenCalledWith("rider");
    expect(mockReplace).toHaveBeenCalledWith("/permissions?next=/rider");
  });

  it("needs both names before it submits", async () => {
    const tree = await mountSetup();
    setFieldByAccessibilityLabel(tree, "First name", "Chipo");
    await settle();
    await pressStart(tree);
    expect(mockUpdateProfile).not.toHaveBeenCalled();
  });
});

describe("profile setup — draft persistence (LC-C10)", () => {
  it("restores the typed names after an app kill + relaunch (unmount + fresh mount)", async () => {
    const tree = await mountSetup();
    setFieldByAccessibilityLabel(tree, "First name", "Tendai");
    setFieldByAccessibilityLabel(tree, "Surname", "Moyo");
    await settle();
    act(() => tree.unmount());
    const fresh = await mountSetup();
    expect(getFieldValue(fresh, "First name")).toBe("Tendai");
    expect(getFieldValue(fresh, "Surname")).toBe("Moyo");
  });

  it("clears the draft once the profile PATCH actually lands", async () => {
    const tree = await mountSetup();
    setFieldByAccessibilityLabel(tree, "First name", "Tendai");
    setFieldByAccessibilityLabel(tree, "Surname", "Moyo");
    await settle();
    await pressStart(tree);
    expect(secureStore[PROFILE_DRAFT_KEY]).toBeUndefined();
  });
});

/**
 * Saving the name used to finish with `signIn({ ...session, needsProfile: false })`, where `session` is
 * the one THIS RENDER captured — which could write back a rotated-away refresh token and sign a brand-new
 * user out. The flag must be cleared by patching whatever session the auth layer holds now.
 */
describe("profile setup — finishing sign-up never writes back a stale session", () => {
  it("clears needsProfile via updateSession, never signIn with the render's session", async () => {
    const tree = await mountSetup();
    setFieldByAccessibilityLabel(tree, "First name", "Tendai");
    setFieldByAccessibilityLabel(tree, "Surname", "Moyo");
    await settle();
    await pressStart(tree);
    expect(mockUpdateSession).toHaveBeenCalledTimes(1);
    expect(mockUpdateSession).toHaveBeenCalledWith({ needsProfile: false });
    expect(mockSignIn).not.toHaveBeenCalled();
  });
});
