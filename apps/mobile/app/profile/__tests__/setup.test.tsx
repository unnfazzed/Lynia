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
const mockReplace = jest.fn();

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
  useLocalSearchParams: () => ({ phone: "+263 77 245 1180" }),
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
  useAuth: () => ({ session: { profileId: "p1", role: "customer", needsProfile: true }, signIn: mockSignIn }),
}));
jest.mock("../../../src/auth/session", () => ({
  loadRolePreference: async () => null,
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

beforeEach(() => {
  secureStore = {};
  mockUpdateProfile.mockReset().mockResolvedValue({ ok: true });
  mockSignIn.mockClear();
  mockReplace.mockClear();
  mockSetItemAsync.mockClear();
  mockGetItemAsync.mockClear();
  mockDeleteItemAsync.mockClear();
});

describe("profile setup — draft persistence (LC-C10)", () => {
  it("restores typed name/ID after an app kill + relaunch (unmount + fresh mount)", async () => {
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<ProfileSetupScreen />);
    });
    await settle();

    // The mock (screens.jsx `Register`) draws a single "Full name" field; setup.tsx splits it into
    // first/last only at the draft + PATCH boundaries, so the durable draft still round-trips.
    setFieldByAccessibilityLabel(tree, "Full name", "Tendai Moyo");
    setFieldByAccessibilityLabel(tree, "National ID number", "63-123456-A-42");
    await settle();

    // The app is killed here — no submit ever fired. A fresh screen mount is the relaunch.
    act(() => tree.unmount());

    let fresh!: renderer.ReactTestRenderer;
    await act(async () => {
      fresh = renderer.create(<ProfileSetupScreen />);
    });
    await settle();

    expect(getFieldValue(fresh, "Full name")).toBe("Tendai Moyo");
    expect(getFieldValue(fresh, "National ID number")).toBe("63-123456-A-42");
  });

  it("clears the draft once the profile PATCH actually lands", async () => {
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<ProfileSetupScreen />);
    });
    await settle();

    setFieldByAccessibilityLabel(tree, "Full name", "Tendai Moyo");
    setFieldByAccessibilityLabel(tree, "National ID number", "63-123456-A-42");
    await settle();

    const saveButton = tree.root.findAll((n) => n.props.label === "Continue" && typeof n.props.onPress === "function")[0];
    if (!saveButton) throw new Error("no Continue button found");
    await act(async () => {
      await saveButton.props.onPress();
    });
    await settle();

    // The ID is normalised on submit — dashes/spaces stripped, letters upper-cased — so the account
    // record and the server's duplicate-ID hash agree however the customer punctuated it.
    expect(mockUpdateProfile).toHaveBeenCalledWith({ firstName: "Tendai", lastName: "Moyo", idNumber: "63123456A42" });
    expect(secureStore["lynia.profileDraft.v1"]).toBeUndefined();
  });
});
