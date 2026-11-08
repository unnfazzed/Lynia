import renderer, { act } from "react-test-renderer";
import { Share } from "react-native";

let mockLink: { live: boolean; code: string | null; link: string | null } = { live: true, code: "7KQ2MX", link: "https://lyniago.com/s/avondale-fresh-7KQ2MX" };
jest.mock("../../api/share", () => ({ getShareLinkFor: async () => mockLink }));
const mockTrack = jest.fn();
jest.mock("../../telemetry/events", () => ({ EVENTS: { shopLinkShared: "shop_link_shared" }, track: (...a: unknown[]) => mockTrack(...a) }));

import { useShareStore } from "../use-share-store";

let share!: () => void;
function Probe({ id }: { id?: string }): null {
  share = useShareStore(id, "Avondale Fresh", "shops");
  return null;
}

beforeEach(() => {
  jest.restoreAllMocks();
  mockTrack.mockClear();
  mockLink = { live: true, code: "7KQ2MX", link: "https://lyniago.com/s/avondale-fresh-7KQ2MX" };
});

it("SH-C4: opens the share menu with the handoff's text and the full link, and counts a share", async () => {
  const spy = jest.spyOn(Share, "share").mockResolvedValue({ action: Share.sharedAction });
  act(() => {
    renderer.create(<Probe id="m-1" />);
  });
  await act(async () => share());
  expect(spy).toHaveBeenCalledWith({
    message: "See what’s on, order in a tap. From Avondale Fresh to your door: https://lyniago.com/s/avondale-fresh-7KQ2MX",
    title: "From Avondale Fresh to your door",
  });
  expect(mockTrack).toHaveBeenCalledWith("shop_link_shared", { service: "shops", channel: "system" });
});

it("a business that isn't live shares nothing", async () => {
  mockLink = { live: false, code: null, link: null };
  const spy = jest.spyOn(Share, "share");
  act(() => {
    renderer.create(<Probe id="m-1" />);
  });
  await act(async () => share());
  expect(spy).not.toHaveBeenCalled();
});
