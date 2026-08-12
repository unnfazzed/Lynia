/**
 * PostHog must not be on the cold-start path (src/telemetry/analytics.tsx).
 *
 * The SDK was always key-gated, but the gate is a RENDER-time check while a top-level import is an
 * EVALUATION-time cost — so 307 KB across 108 modules ran on every launch whether analytics was
 * configured or not, and ahead of the first frame when it was. The fix requires the SDK lazily; these
 * tests pin the two properties that fix depends on, because both are invisible in ordinary use and a
 * single re-added top-level `import` would silently undo them.
 *
 * `mockRequirePostHog` counts REQUIRES, not calls: jest.mock factories are lazy, so the factory body
 * runs on the first `require("posthog-react-native")` and never if the module is never reached.
 */
const mockRequirePostHog = jest.fn();
jest.mock("posthog-react-native", () => {
  mockRequirePostHog();
  return {
    PostHogProvider: ({ children }: { children: React.ReactNode }) => children,
    usePostHog: () => ({ screen: jest.fn() }),
  };
});

let mockEnabled = false;
jest.mock("../../config", () => ({
  analyticsEnabled: () => mockEnabled,
  POSTHOG_API_KEY: "phc_test",
  POSTHOG_HOST: "https://eu.i.posthog.com",
}));

jest.mock("expo-router", () => ({ useSegments: () => ["(tabs)", "home"] }));

// runAfterInteractions is the deferral seam — capture the task so a test can decide when (or whether)
// the post-first-frame work runs, rather than depending on real frame timing.
let mockDeferred: (() => void) | null = null;
const mockCancel = jest.fn();
jest.mock("react-native", () => ({
  InteractionManager: {
    runAfterInteractions: (task: () => void) => {
      mockDeferred = task;
      return { cancel: mockCancel };
    },
  },
}));

import React from "react";
import renderer, { act } from "react-test-renderer";
import { AnalyticsProvider } from "../analytics";

function renderProvider(): renderer.ReactTestRenderer {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <AnalyticsProvider>
        <></>
      </AnalyticsProvider>,
    );
  });
  return tree;
}

describe("AnalyticsProvider — PostHog stays off the startup path", () => {
  beforeEach(() => {
    mockRequirePostHog.mockClear();
    mockCancel.mockClear();
    mockDeferred = null;
  });

  it("never loads the SDK at all when no key is configured", () => {
    mockEnabled = false;
    const tree = renderProvider();

    expect(mockRequirePostHog).not.toHaveBeenCalled();
    // Not even scheduled — an unconfigured build pays nothing, not even a deferred cost.
    expect(mockDeferred).toBeNull();
    tree.unmount();
  });

  it("with a key, still does not load the SDK during the first render", () => {
    mockEnabled = true;
    const tree = renderProvider();

    // The whole point: mounting the provider must not drag the SDK onto the critical path. It is
    // merely SCHEDULED for after the first interactions have settled.
    expect(mockRequirePostHog).not.toHaveBeenCalled();
    expect(mockDeferred).not.toBeNull();

    act(() => {
      mockDeferred?.();
    });
    expect(mockRequirePostHog).toHaveBeenCalledTimes(1);
    tree.unmount();
  });

  it("cancels the deferred load if the tree unmounts first", () => {
    mockEnabled = true;
    renderProvider().unmount();
    expect(mockCancel).toHaveBeenCalled();
  });
});
