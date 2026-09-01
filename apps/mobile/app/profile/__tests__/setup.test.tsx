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
let mockLocalSearchParams: { phone: string; deliveryChannel?: string } = { phone: "+263 77 245 1180" };

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
  useAuth: () => ({ session: { profileId: "p1", role: "customer", needsProfile: true }, signIn: mockSignIn, signOut: mockSignOut }),
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
  mockSignOut.mockClear();
  mockReplace.mockClear();
  mockSetItemAsync.mockClear();
  mockGetItemAsync.mockClear();
  mockDeleteItemAsync.mockClear();
  mockLocalSearchParams = { phone: "+263 77 245 1180" };
});

/**
 * The screen's only drawn exit (design handoff kyc-2026-08 §6, mock `LJ.register`).
 *
 * A customer who mistyped their number and then passed the code sent to THAT number is trapped here:
 * the phone field is deliberately read-only, so nothing on screen corrects it. The ghost must exist,
 * and it must SIGN OUT rather than merely navigate — by this point the wrong number is a verified
 * session, and routing to /phone while still authenticated returns them here on the next guard pass.
 */
describe("profile setup — the different-number exit", () => {
  function pressGhost(tree: renderer.ReactTestRenderer): void {
    const btn = tree.root.findAll((n) => n.props.label === "Use a different number")[0];
    if (!btn) throw new Error("no 'Use a different number' action on the screen");
    act(() => {
      void btn.props.onPress();
    });
  }

  it("offers the exit, and it is a ghost so it never competes with Continue", async () => {
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<ProfileSetupScreen />);
    });
    await settle();

    const ghost = tree.root.findAll((n) => n.props.label === "Use a different number")[0];
    if (!ghost) throw new Error("no 'Use a different number' action on the screen");
    expect(ghost.props.variant).toBe("ghost");
    // Exact label. "Back" would suggest losing the code they just passed; "Change number" is a
    // system word. The mock draws this string and the app ships it verbatim.
    expect(tree.root.findAll((n) => n.props.label === "Back").length).toBe(0);
  });

  it("signs out before returning to the phone step", async () => {
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<ProfileSetupScreen />);
    });
    await settle();

    pressGhost(tree);
    await settle();

    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith("/phone");
    // The ORDER is the point, not just that both happened: navigating before the revoke lands would
    // race the auth guard on /phone against a session that is still valid.
    const [signOutAt] = mockSignOut.mock.invocationCallOrder;
    const [replaceAt] = mockReplace.mock.invocationCallOrder;
    if (signOutAt === undefined || replaceAt === undefined) throw new Error("both calls must have happened");
    expect(signOutAt).toBeLessThan(replaceAt);
  });

  // A double-tap must not fire two sign-outs. The guard is a ref precisely because the `leaving`
  // state write is not visible to a second press in the same tick — assert the behaviour, so a
  // future refactor back to state-guarding fails here.
  it("ignores a second press in the same tick", async () => {
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<ProfileSetupScreen />);
    });
    await settle();

    const btn = tree.root.findAll((n) => n.props.label === "Use a different number")[0];
    if (!btn) throw new Error("no 'Use a different number' action on the screen");
    act(() => {
      void btn.props.onPress();
      void btn.props.onPress();
    });
    await settle();

    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledTimes(1);
  });

  it("replaces rather than pushes, so no back-stack entry returns to a dead session", async () => {
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<ProfileSetupScreen />);
    });
    await settle();

    pressGhost(tree);
    await settle();

    // `replace` is the only navigation this action performs — a push would leave this screen
    // reachable by back, with the session it depends on already revoked.
    expect(mockReplace).toHaveBeenCalledTimes(1);
  });

  it("drops the typed draft, because it holds a national ID and this is a sign-out", async () => {
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<ProfileSetupScreen />);
    });
    await settle();

    setFieldByAccessibilityLabel(tree, "Full name", "Tendai Moyo");
    setFieldByAccessibilityLabel(tree, "National ID number", "63123456A42");
    await settle();

    pressGhost(tree);
    await settle();

    // The rider retypes their name, and that is the intended trade. Preserving the draft across a
    // sign-out would leave whoever verifies a number NEXT on this handset looking at a stranger's
    // name and national ID — the leak LC-C10 closed. This assertion is the guard on that: a future
    // "improvement" that re-saves the draft to spare the retyping fails here.
    act(() => tree.unmount());
    let fresh!: renderer.ReactTestRenderer;
    await act(async () => {
      fresh = renderer.create(<ProfileSetupScreen />);
    });
    await settle();
    expect(getFieldValue(fresh, "Full name")).toBe("");
    expect(getFieldValue(fresh, "National ID number")).toBe("");
  });
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

/**
 * D-40 (docs/DESIGN-DEVIATIONS.md): the read-only "Verified" phone field's hint no longer hardcodes
 * "by SMS" — it names whichever channel verify.tsx actually verified the code over, threaded here as
 * the `deliveryChannel` route param.
 */
describe("profile setup — 'Verified by X' hint reflects the actual delivery channel (D-40)", () => {
  function verifiedHint(tree: renderer.ReactTestRenderer): string | undefined {
    const field = tree.root.findAll(
      (n) => n.props.label === "Phone number" && typeof n.props.hint === "string",
    )[0];
    return field?.props.hint as string | undefined;
  }

  it("reads 'Verified by WhatsApp' when the OTP verified over WhatsApp", async () => {
    mockLocalSearchParams = { phone: "+263 77 245 1180", deliveryChannel: "whatsapp" };
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<ProfileSetupScreen />);
    });
    await settle();
    expect(verifiedHint(tree)).toBe("Verified by WhatsApp ✓");
  });

  it("reads 'Verified by SMS' when deliveryChannel is sms or absent", async () => {
    mockLocalSearchParams = { phone: "+263 77 245 1180" };
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<ProfileSetupScreen />);
    });
    await settle();
    expect(verifiedHint(tree)).toBe("Verified by SMS ✓");
  });
});
