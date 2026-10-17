/**
 * Device facts on every event (src/telemetry/device-props.ts): the font scale and screen width, so a
 * large-text layout problem or crash can be split by them. Coarse values only.
 */
const mockSetDeviceProps = jest.fn();
const mockSetTags = jest.fn();
jest.mock("../events", () => ({ setDeviceProps: (p: unknown) => mockSetDeviceProps(p) }));
jest.mock("../sentry", () => ({ setTags: (t: unknown) => mockSetTags(t) }));
const mockDims = { width: 360, height: 720, scale: 3, fontScale: 1.7 };
jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({ __esModule: true, default: () => mockDims }));

import { renderSync } from "../../testing/render-sync";
import { deviceFacts, useDeviceTelemetry } from "../device-props";

function Probe(): null {
  useDeviceTelemetry();
  return null;
}

describe("deviceFacts", () => {
  it("rounds the font scale to 0.05 and the width to whole dp", () => {
    expect(deviceFacts(360.4, 1.0)).toEqual({ font_scale: 1, screen_width_dp: 360 });
    expect(deviceFacts(411.43, 1.312)).toEqual({ font_scale: 1.3, screen_width_dp: 411 });
    expect(deviceFacts(320, 2.0)).toEqual({ font_scale: 2, screen_width_dp: 320 });
  });
});

describe("useDeviceTelemetry", () => {
  it("hands the system font scale (not the app's capped one) to analytics and Sentry", () => {
    renderSync(<Probe />);
    expect(mockSetDeviceProps).toHaveBeenCalledWith({ font_scale: 1.7, screen_width_dp: 360 });
    expect(mockSetTags).toHaveBeenCalledWith({ font_scale: "1.7", screen_width_dp: "360" });
  });
});
