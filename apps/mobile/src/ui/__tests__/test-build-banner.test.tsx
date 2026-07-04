/**
 * The TEST BUILD banner shows only on a bypass build and the Field defaults to a text keyboard (the
 * fix that unblocks alphanumeric National-ID entry on the rider KYC form). We mock ../test-build so
 * the banner's gating is controlled without touching expo-constants (isTestBuild logic is covered in
 * test-build.test.ts); importing ../index then pulls the real font chain, which is fine unmocked.
 */
let mockIsTestBuild = false;
jest.mock("../test-build", () => ({ isTestBuild: () => mockIsTestBuild }));

import React from "react";
import renderer, { act } from "react-test-renderer";

import { Field, Screen, TestBuildBanner } from "../index";

afterEach(() => {
  mockIsTestBuild = false;
});

function texts(tree: renderer.ReactTestRenderer): string[] {
  return tree.root.findAllByType("Text" as never).flatMap((n) => {
    const c = n.props.children;
    return typeof c === "string" ? [c] : [];
  });
}

describe("TestBuildBanner", () => {
  it("renders nothing in a real release", () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<TestBuildBanner />);
    });
    expect(tree.toJSON()).toBeNull();
  });

  it("shows the live-API warning on a test build", () => {
    mockIsTestBuild = true;
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<TestBuildBanner />);
    });
    expect(texts(tree)).toContain("TEST BUILD — live API");
  });

  it("Screen surfaces the banner only when the flag is set", () => {
    let off!: renderer.ReactTestRenderer;
    act(() => {
      off = renderer.create(
        <Screen>
          <></>
        </Screen>,
      );
    });
    expect(texts(off)).not.toContain("TEST BUILD — live API");

    mockIsTestBuild = true;
    let on!: renderer.ReactTestRenderer;
    act(() => {
      on = renderer.create(
        <Screen>
          <></>
        </Screen>,
      );
    });
    expect(texts(on)).toContain("TEST BUILD — live API");
  });
});

describe("Field keyboard default (National-ID fix)", () => {
  it("defaults to the text keyboard so alphanumeric IDs are typeable", () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<Field label="National ID number" value="" onChangeText={() => {}} maxLength={40} />);
    });
    const input = tree.root.findByType("TextInput" as never);
    expect(input.props.keyboardType).toBe("default");
  });
});
