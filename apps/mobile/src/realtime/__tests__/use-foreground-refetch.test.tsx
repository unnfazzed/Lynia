import { act, create } from "react-test-renderer";
import { useForegroundRefetch } from "../use-foreground-refetch";

type Listener = (state: string) => void;
let mockListener: Listener | null = null;
const mockRemove = jest.fn();
const mockAddEventListener = jest.fn((_: string, cb: Listener) => {
  mockListener = cb;
  return { remove: mockRemove };
});

jest.mock("react-native", () => ({
  AppState: {
    addEventListener: (...args: [string, Listener]) => mockAddEventListener(...args),
  },
}));

function Harness({ onForeground, enabled }: { onForeground: () => void; enabled?: boolean }): null {
  useForegroundRefetch(onForeground, enabled);
  return null;
}

// Regression guard for stale negotiation/tracking UIs: the customer order screen, the rider board,
// and the rider job screen all rely on this hook to self-heal when the app resumes from background.
describe("useForegroundRefetch", () => {
  beforeEach(() => {
    mockListener = null;
    mockAddEventListener.mockClear();
    mockRemove.mockClear();
  });

  it("runs the callback when the app becomes active", () => {
    const cb = jest.fn();
    act(() => {
      create(<Harness onForeground={cb} />);
    });
    expect(cb).not.toHaveBeenCalled();

    act(() => {
      mockListener?.("active");
    });
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("ignores non-active transitions (backgrounded/inactive)", () => {
    const cb = jest.fn();
    act(() => {
      create(<Harness onForeground={cb} />);
    });
    act(() => {
      mockListener?.("background");
      mockListener?.("inactive");
    });
    expect(cb).not.toHaveBeenCalled();
  });

  it("does not subscribe when disabled", () => {
    const cb = jest.fn();
    act(() => {
      create(<Harness onForeground={cb} enabled={false} />);
    });
    expect(mockAddEventListener).not.toHaveBeenCalled();
  });

  it("unsubscribes on unmount", () => {
    const cb = jest.fn();
    let renderer: ReturnType<typeof create> | undefined;
    act(() => {
      renderer = create(<Harness onForeground={cb} />);
    });
    act(() => {
      renderer?.unmount();
    });
    expect(mockRemove).toHaveBeenCalledTimes(1);
  });
});
