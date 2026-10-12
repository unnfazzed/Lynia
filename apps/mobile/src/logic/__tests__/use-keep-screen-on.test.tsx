import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { BOARD_KEEP_AWAKE_TAG, useKeepScreenOn } from "../use-keep-screen-on";

jest.mock("expo-keep-awake", () => ({
  activateKeepAwakeAsync: jest.fn(async () => undefined),
  deactivateKeepAwake: jest.fn(async () => undefined),
}));

const activate = activateKeepAwakeAsync as jest.Mock;
const deactivate = deactivateKeepAwake as jest.Mock;

function Harness({ active }: { active: boolean }): null {
  useKeepScreenOn(active);
  return null;
}

async function mount(active: boolean): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<Harness active={active} />);
  });
  return tree;
}

beforeEach(() => {
  activate.mockClear();
  deactivate.mockClear();
});

describe("useKeepScreenOn (owner 2026-10-12)", () => {
  it("keeps the screen on only while active, under the board's own tag", async () => {
    const tree = await mount(false);
    expect(activate).not.toHaveBeenCalled();

    await act(async () => tree.update(<Harness active />));
    expect(activate).toHaveBeenCalledWith(BOARD_KEEP_AWAKE_TAG);

    // Going offline or leaving the board releases it.
    await act(async () => tree.update(<Harness active={false} />));
    expect(deactivate).toHaveBeenCalledWith(BOARD_KEEP_AWAKE_TAG);

    await act(async () => tree.unmount());
  });

  it("releases it on unmount", async () => {
    const tree = await mount(true);
    await act(async () => tree.unmount());
    expect(deactivate).toHaveBeenCalledWith(BOARD_KEEP_AWAKE_TAG);
  });

  it("a native failure never throws into the board", async () => {
    activate.mockRejectedValueOnce(new Error("no activity"));
    deactivate.mockRejectedValueOnce(new Error("no activity"));
    const tree = await mount(true);
    await act(async () => tree.unmount());
  });
});
