/**
 * LJ.privacy (mock screens-shipped.jsx `Privacy`, SH7) — the in-app privacy screen Play policy wants
 * reachable from inside the app. Its copy IS the disclosure, so it is pinned verbatim, along with the
 * two action rows the mock draws at the bottom (data copy, then the red route into deletion).
 */
import renderer, { act } from "react-test-renderer";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush, back: jest.fn() }) }));

import PrivacyScreen from "../privacy";

function render(): renderer.ReactTestRenderer {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<PrivacyScreen />);
  });
  return tree;
}

function press(tree: renderer.ReactTestRenderer, label: string): void {
  const node = tree.root.findAll((n) => n.props.accessibilityLabel === label)[0];
  if (!node) throw new Error(`no row labelled ${label}`);
  act(() => node.props.onPress());
}

const text = (tree: renderer.ReactTestRenderer): string => JSON.stringify(tree.toJSON());

beforeEach(() => mockPush.mockClear());

describe("privacy screen matches its mock", () => {
  it("draws the three disclosure cards verbatim", () => {
    const out = text(render());
    expect(out).toContain("What we collect");
    expect(out).toContain("Your name, phone number and the pins on your deliveries. No ID documents for customers.");
    expect(out).toContain("What others see");
    expect(out).toContain("First name + last initial only. Your phone is shared with your rider just while a delivery runs — then it's masked.");
    expect(out).toContain("How long we keep it");
    expect(out).toContain("Order records 12 months · SOS logs 90 days · a deleted account is gone after 30 days.");
  });

  it("draws the two action rows, the delete one routing into the deletion flow", () => {
    const tree = render();
    expect(text(tree)).toContain("Request a copy of my data");
    press(tree, "Delete my account");
    expect(mockPush).toHaveBeenCalledWith("/settings/delete-account");
  });
});
