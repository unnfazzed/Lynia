/**
 * P21 + P33 — the customer web build fetches the Google Maps JS script during idle after Home's first
 * paint, so the first map (Send, the order screen) isn't a grey panel while two cold Google origins
 * connect at the tap. Nothing is scheduled outside the web build.
 */
const mockLoadGoogle = jest.fn(() => Promise.resolve({}));
jest.mock("react-native-maps", () => ({ loadGoogle: () => mockLoadGoogle() }));

let mockWebBuild = true;
jest.mock("../../web-build", () => ({ isCustomerWebBuild: () => mockWebBuild }));

import { InteractionManager } from "react-native";
import { prewarmGoogleMapsOnWeb } from "../maps-prewarm";

let deferred: (() => void) | null = null;
const cancel = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  deferred = null;
  jest.spyOn(InteractionManager, "runAfterInteractions").mockImplementation(((task: () => void) => {
    deferred = task;
    return { cancel };
  }) as never);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("prewarmGoogleMapsOnWeb", () => {
  it("loads the Maps script once the first interactions settle — not during the first paint", () => {
    mockWebBuild = true;
    prewarmGoogleMapsOnWeb();
    expect(mockLoadGoogle).not.toHaveBeenCalled();
    deferred?.();
    expect(mockLoadGoogle).toHaveBeenCalledTimes(1);
  });

  it("schedules nothing outside the customer web build", () => {
    mockWebBuild = false;
    prewarmGoogleMapsOnWeb();
    expect(InteractionManager.runAfterInteractions).not.toHaveBeenCalled();
    expect(mockLoadGoogle).not.toHaveBeenCalled();
  });

  it("cancels the pending load when Home unmounts first", () => {
    mockWebBuild = true;
    prewarmGoogleMapsOnWeb()();
    expect(cancel).toHaveBeenCalled();
  });

  it("swallows a refused script — maps keep their grey-panel fallback", async () => {
    mockWebBuild = true;
    mockLoadGoogle.mockReturnValueOnce(Promise.reject(new Error("maps-unavailable")));
    prewarmGoogleMapsOnWeb();
    expect(() => deferred?.()).not.toThrow();
    await Promise.resolve();
  });
});
