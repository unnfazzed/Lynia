/**
 * Settings' permission rows (mock screens-shipped.jsx `SettingsPerms`, SH11 — LJ.settings_perms /
 * LJ.settings_perms_ok). Both read the phone's REAL state: they exist precisely because a hardcoded
 * "On" lies to anyone who denied the permission. Pinned here: the granted values the mock draws, and
 * the denied variant's warning + the consequence line the mock spells out.
 *
 * The rows now live INSIDE the single settings card, not in a section of their own, and the section
 * header + framing paragraph are gone with it (`docs/DESIGN-DEVIATIONS.md` D-25, owner instruction
 * 2026-08-16: "Permissions must fall under the same card and not be separate"). What they SAY is
 * unchanged and still asserted here; the third case below is what keeps the section from creeping
 * back.
 */
import renderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mockNotifPerms = jest.fn(async () => ({ granted: true, canAskAgain: true }));
const mockLocPerms = jest.fn(async () => ({ granted: true, canAskAgain: true }));

jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));
jest.mock("expo-notifications", () => ({ getPermissionsAsync: () => mockNotifPerms() }));
jest.mock("expo-location", () => ({ getForegroundPermissionsAsync: () => mockLocPerms() }));
jest.mock("../../../src/auth/auth-context", () => ({
  useAuth: () => ({ session: { role: "customer" }, signOut: jest.fn() }),
}));
jest.mock("../../../src/api/auth", () => ({
  getMe: jest.fn(async () => ({ firstName: "Chipo", lastName: "Marufu", phone: "+263772451180", role: "customer" })),
}));

import SettingsScreen from "../index";

async function render(): Promise<renderer.ReactTestRenderer> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <QueryClientProvider client={client}>
        <SettingsScreen />
      </QueryClientProvider>,
    );
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return tree;
}

const text = (tree: renderer.ReactTestRenderer): string => JSON.stringify(tree.toJSON());

beforeEach(() => {
  mockNotifPerms.mockResolvedValue({ granted: true, canAskAgain: true });
  mockLocPerms.mockResolvedValue({ granted: true, canAskAgain: true });
});

describe("settings permission rows", () => {
  it("all granted (LJ.settings_perms_ok): 'While using' and 'On', no warning", async () => {
    const out = text(await render());
    expect(out).toContain("While using");
    expect(out).toContain("On");
    expect(out).not.toContain("You won't hear when a rider offers");
  });

  // D-25: the permissions are rows in the one settings card now. Neither piece of section chrome may
  // come back — they framed a section that no longer exists, and reinstating either would re-split
  // the card the owner asked be made whole.
  it("draws neither the section header nor the framing paragraph (D-25)", async () => {
    const out = text(await render());
    expect(out).not.toContain("PERMISSIONS — READ FROM YOUR PHONE");
    expect(out).not.toContain("These show your phone's real settings");
  });

  it("denied (LJ.settings_perms): 'Ask every time', 'Off', and the consequence spelled out", async () => {
    mockNotifPerms.mockResolvedValue({ granted: false, canAskAgain: true });
    mockLocPerms.mockResolvedValue({ granted: false, canAskAgain: true });
    const out = text(await render());
    expect(out).toContain("Ask every time");
    expect(out).toContain("Off");
    expect(out).toContain("You won't hear when a rider offers or when your parcel arrives.");
    expect(out).toContain("Open system settings");
  });

  it("a permanently denied location reads 'Off', never a value we made up", async () => {
    mockLocPerms.mockResolvedValue({ granted: false, canAskAgain: false });
    const out = text(await render());
    expect(out).toContain("Off");
    expect(out).not.toContain("Ask every time");
  });
});
