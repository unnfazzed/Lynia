/**
 * Regression guards for registerForPushNotificationsAsync (push.ts):
 *  1. It must CHECK, not REQUEST, permission — the raw OS dialog is owned by the primed explainer
 *     (app/permissions.tsx). Requesting here fired the dialog uninvited at OTP-verify, raising denials.
 *  2. A transient FCM token-mint failure (flaky 3G on a fresh install) must be RETRYABLE, not terminal —
 *     the old code folded it into the outer catch and left push dead for the whole session.
 */
jest.mock("expo-device", () => ({ isDevice: true }));

const mockGetPermissions = jest.fn();
const mockRequestPermissions = jest.fn();
const mockGetDeviceToken = jest.fn();

jest.mock("expo-notifications", () => ({
  getPermissionsAsync: (...a: unknown[]) => mockGetPermissions(...a),
  requestPermissionsAsync: (...a: unknown[]) => mockRequestPermissions(...a),
  getDevicePushTokenAsync: (...a: unknown[]) => mockGetDeviceToken(...a),
  setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
  setNotificationHandler: jest.fn(),
  AndroidImportance: { HIGH: 4 },
}));

const mockRegisterDeviceToken = jest.fn();
jest.mock("../../api/notifications", () => ({
  registerDeviceToken: (...a: unknown[]) => mockRegisterDeviceToken(...a),
  unregisterDeviceToken: jest.fn(),
}));

import { registerForPushNotificationsAsync } from "../push";

beforeEach(() => {
  mockGetPermissions.mockReset();
  mockRequestPermissions.mockReset();
  mockGetDeviceToken.mockReset();
  mockRegisterDeviceToken.mockReset().mockResolvedValue(undefined);
});

describe("registerForPushNotificationsAsync", () => {
  it("never REQUESTS permission (the explainer owns the dialog) and stays retryable while the OS can still ask", async () => {
    mockGetPermissions.mockResolvedValue({ granted: false, canAskAgain: true });

    const result = await registerForPushNotificationsAsync();

    expect(result).toEqual({ registered: false, retry: true });
    expect(mockRequestPermissions).not.toHaveBeenCalled();
    expect(mockGetDeviceToken).not.toHaveBeenCalled(); // no token attempt without permission
  });

  it("is terminal (no retry) when permission is hard-denied — the OS won't ask again", async () => {
    mockGetPermissions.mockResolvedValue({ granted: false, canAskAgain: false });

    expect(await registerForPushNotificationsAsync()).toEqual({ registered: false, retry: false });
    expect(mockRequestPermissions).not.toHaveBeenCalled();
  });

  it("treats a transient FCM token-mint failure as RETRYABLE, not terminal", async () => {
    mockGetPermissions.mockResolvedValue({ granted: true, canAskAgain: false });
    mockGetDeviceToken.mockRejectedValue(new Error("FCM unreachable"));

    expect(await registerForPushNotificationsAsync()).toEqual({ registered: false, retry: true });
  });

  it("is terminal when the token is null (Expo Go / no Firebase config)", async () => {
    mockGetPermissions.mockResolvedValue({ granted: true, canAskAgain: false });
    mockGetDeviceToken.mockResolvedValue({ data: null });

    expect(await registerForPushNotificationsAsync()).toEqual({ registered: false, retry: false });
  });

  it("registers when permission is already granted and the token mints", async () => {
    mockGetPermissions.mockResolvedValue({ granted: true, canAskAgain: false });
    mockGetDeviceToken.mockResolvedValue({ data: "fcm-token-123" });

    expect(await registerForPushNotificationsAsync()).toEqual({ registered: true, token: "fcm-token-123" });
    expect(mockRegisterDeviceToken).toHaveBeenCalledWith("fcm-token-123", expect.anything());
  });

  it("is retryable when the register POST itself fails on a flaky link", async () => {
    mockGetPermissions.mockResolvedValue({ granted: true, canAskAgain: false });
    mockGetDeviceToken.mockResolvedValue({ data: "fcm-token-123" });
    mockRegisterDeviceToken.mockRejectedValue(new Error("network"));

    expect(await registerForPushNotificationsAsync()).toEqual({ registered: false, retry: true });
  });
});
