/**
 * Turning location on with as few taps as the phone allows, and noticing the moment it is on.
 *
 * `switchOnLocation` is Google's one-tap "Turn on device location" dialog, falling back to the phone's
 * Location screen (the one with the switch, not the app's info page) where the dialog doesn't exist or is
 * declined. `useLocationReadyWatch` re-reads every few seconds while a screen waits on location, because
 * the quick-settings shade flips the switch without ever taking the app out of the foreground.
 */
import * as Location from "expo-location";
import { Linking, Platform } from "react-native";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { LOCATION_WATCH_MS, switchOnLocation, useLocationReadyWatch } from "../location";

jest.mock("expo-location", () => ({
  getForegroundPermissionsAsync: jest.fn(),
  hasServicesEnabledAsync: jest.fn(),
  enableNetworkProviderAsync: jest.fn(),
}));

const getPerm = Location.getForegroundPermissionsAsync as jest.Mock;
const gpsOn = Location.hasServicesEnabledAsync as jest.Mock;
const dialog = Location.enableNetworkProviderAsync as jest.Mock;
const GRANTED = { status: "granted", granted: true, canAskAgain: true };

let sendIntent: jest.SpyInstance;
let openSettings: jest.SpyInstance;
let os: { restore: () => void };
beforeEach(() => {
  jest.clearAllMocks();
  os = jest.replaceProperty(Platform, "OS", "android");
  sendIntent = jest.spyOn(Linking, "sendIntent").mockResolvedValue(undefined);
  openSettings = jest.spyOn(Linking, "openSettings").mockResolvedValue(undefined);
  getPerm.mockResolvedValue(GRANTED);
});
afterEach(() => {
  os.restore();
  sendIntent.mockRestore();
  openSettings.mockRestore();
});

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i++) await act(async () => undefined);
}

describe("switchOnLocation", () => {
  it("already on: no dialog, nothing opened", async () => {
    gpsOn.mockResolvedValue(true);
    await expect(switchOnLocation()).resolves.toBe(true);
    expect(dialog).not.toHaveBeenCalled();
    expect(sendIntent).not.toHaveBeenCalled();
  });

  it("off: Google's one-tap dialog turns it on, and the app never leaves", async () => {
    gpsOn.mockResolvedValueOnce(false).mockResolvedValue(true);
    dialog.mockResolvedValue(undefined);
    await expect(switchOnLocation()).resolves.toBe(true);
    expect(dialog).toHaveBeenCalledTimes(1);
    expect(sendIntent).not.toHaveBeenCalled();
  });

  it("off, and the dialog is declined or missing (Huawei without Google): opens the Location screen", async () => {
    gpsOn.mockResolvedValue(false);
    dialog.mockRejectedValue(new Error("unavailable"));
    await expect(switchOnLocation()).resolves.toBe(false);
    await flush();
    expect(sendIntent).toHaveBeenCalledWith("android.settings.LOCATION_SOURCE_SETTINGS");
    expect(openSettings).not.toHaveBeenCalled();
  });

  it("the Location screen can't open: falls back to the app's settings", async () => {
    gpsOn.mockResolvedValue(false);
    dialog.mockRejectedValue(new Error("unavailable"));
    sendIntent.mockRejectedValue(new Error("no activity"));
    await switchOnLocation();
    await flush();
    expect(openSettings).toHaveBeenCalledTimes(1);
  });
});

describe("useLocationReadyWatch", () => {
  const onReady = jest.fn();
  let tree: ReactTestRenderer | null = null;
  function Harness({ active }: { active: boolean }): null {
    useLocationReadyWatch(active, onReady);
    return null;
  }
  beforeEach(() => {
    jest.useFakeTimers();
    onReady.mockClear();
  });
  afterEach(() => {
    if (tree) act(() => tree!.unmount());
    tree = null;
    jest.useRealTimers();
  });
  async function tick(): Promise<void> {
    await act(async () => {
      jest.advanceTimersByTime(LOCATION_WATCH_MS);
    });
    await flush();
  }

  it("fires once when the switch comes on from the quick-settings shade, not again while it stays on", async () => {
    gpsOn.mockResolvedValue(false);
    await act(async () => {
      tree = create(<Harness active />);
    });
    await flush();
    await tick();
    expect(onReady).not.toHaveBeenCalled();

    gpsOn.mockResolvedValue(true);
    await tick();
    expect(onReady).toHaveBeenCalledTimes(1);
    await tick();
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it("fires when the permission is granted with the switch already on", async () => {
    gpsOn.mockResolvedValue(true);
    getPerm.mockResolvedValue({ status: "undetermined", granted: false, canAskAgain: true });
    await act(async () => {
      tree = create(<Harness active />);
    });
    await flush();
    getPerm.mockResolvedValue(GRANTED);
    await tick();
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it("never fires when location was already usable — nothing changed", async () => {
    gpsOn.mockResolvedValue(true);
    await act(async () => {
      tree = create(<Harness active />);
    });
    await flush();
    await tick();
    await tick();
    expect(onReady).not.toHaveBeenCalled();
  });

  it("reads nothing while inactive", async () => {
    gpsOn.mockResolvedValue(false);
    await act(async () => {
      tree = create(<Harness active={false} />);
    });
    await tick();
    expect(gpsOn).not.toHaveBeenCalled();
  });
});
