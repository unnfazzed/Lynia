/**
 * B-O11 (LC lane B, Go-class runtime perf): the KYC photo preview must render the already-
 * downscaled upload asset (`downscaleForUpload`'s ~1280px/0.7 JPEG output), not the original
 * 3000-4000px camera capture — this preview stays mounted for the rest of the multi-field KYC
 * form, and the full-resolution bitmap is real avoidable peak-memory pressure on a 1-2GB device
 * (this screen's own OOM-kill comment already flags camera capture as the risk here).
 */
import renderer, { act } from "react-test-renderer";

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
}));
jest.mock("expo-secure-store", () => ({
  getItemAsync: (...args: [string]) => mockGetItemAsync(...args),
  setItemAsync: (...args: [string, string]) => mockSetItemAsync(...args),
  deleteItemAsync: (...args: [string]) => mockDeleteItemAsync(...args),
}));
jest.mock("expo-image-picker", () => ({
  requestCameraPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  requestMediaLibraryPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  launchCameraAsync: jest.fn().mockResolvedValue({
    canceled: false,
    assets: [{ uri: "file://original-4000px-capture.jpg", width: 4000, height: 3000, mimeType: "image/jpeg" }],
  }),
  launchImageLibraryAsync: jest.fn(),
  MediaTypeOptions: { Images: "Images" },
}));
jest.mock("../../../src/logic/image-downscale", () => ({
  downscaleForUpload: jest.fn().mockResolvedValue({ uri: "file://downscaled-1280px.jpg", contentType: "image/jpeg" }),
}));
jest.mock("../../../src/api/uploads", () => ({
  requestKycPhotoUpload: jest.fn().mockResolvedValue({ uploadUrl: "https://gcs.example/put", key: "obj-key-1" }),
  uploadImage: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../../src/api/riders", () => ({
  becomeRider: jest.fn(),
  completeProfile: jest.fn(),
}));

import BecomeRiderScreen from "../become";

function findByText(tree: renderer.ReactTestRenderer, text: string): renderer.ReactTestInstance {
  const node = tree.root.findAll((n) => n.props.children === text)[0];
  if (!node) throw new Error(`no node with text "${text}"`);
  return node;
}

function press(node: renderer.ReactTestInstance): void {
  let n: typeof node | null = node;
  while (n && typeof n.props.onPress !== "function") n = n.parent;
  n?.props.onPress();
}

beforeEach(() => {
  secureStore = {};
  mockReplace.mockClear();
  mockSetItemAsync.mockClear();
  mockGetItemAsync.mockClear();
  mockDeleteItemAsync.mockClear();
});

describe("BecomeRiderScreen — KYC photo preview uses the downscaled asset", () => {
  it("renders the downscaled upload uri, not the original camera-capture uri", async () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<BecomeRiderScreen />);
    });
    // Let the initial draft-hydration effect settle before interacting.
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      press(findByText(tree, "Take photo"));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // The capture now lands on the kit's `photo_preview` review step first ("Can you read everything?")
    // — the upload only fires once the rider commits, so drive that here.
    await act(async () => {
      press(findByText(tree, "Use this photo"));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const image = tree.root.findAll(
      (n) => typeof n.props.source === "object" && n.props.source !== null && "uri" in n.props.source,
    )[0];
    expect(image?.props.source.uri).toBe("file://downscaled-1280px.jpg");
    expect(image?.props.source.uri).not.toBe("file://original-4000px-capture.jpg");

    act(() => {
      tree.unmount();
    });
  });
});
