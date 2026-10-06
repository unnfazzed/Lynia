/**
 * The sign-in screens' only fields are a phone pad and a number pad, and neither has a return key on
 * iOS: a tap outside the field is the only way to put the keyboard away (docs/APP-STORE-SUBMISSION.md
 * B6). Each screen's content sits inside a `DismissKeyboardArea`, field included.
 */
import React from "react";
import renderer, { act } from "react-test-renderer";
import { DismissKeyboardArea } from "../../src/ui";

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), replace: jest.fn(), push: jest.fn() }),
  useNavigation: () => ({ getState: () => undefined }),
  useLocalSearchParams: () => ({ phone: "+263772451180" }),
}));
jest.mock("../../src/auth/auth-context", () => ({ useAuth: () => ({ signIn: jest.fn() }) }));
jest.mock("../../src/api/auth", () => ({ requestOtp: jest.fn(async () => undefined), verifyOtp: jest.fn(async () => ({})) }));

import PhoneScreen from "../phone";
import VerifyScreen from "../verify";

const SCREENS: [string, () => React.ReactElement, string][] = [
  ["phone", () => <PhoneScreen />, "phone-pad"],
  ["verify", () => <VerifyScreen />, "number-pad"],
];

it.each(SCREENS)("the %s screen closes the keyboard on a tap outside its field", (_name, screen, keyboardType) => {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(screen());
  });
  try {
    const areas = tree.root.findAllByType(DismissKeyboardArea);
    expect(areas).toHaveLength(1);
    expect(areas[0]!.findAll((n) => n.props.keyboardType === keyboardType).length).toBeGreaterThan(0);
  } finally {
    // The verify screen runs a 1s cooldown interval; unmount so it can't outlive the test.
    act(() => tree.unmount());
  }
});
