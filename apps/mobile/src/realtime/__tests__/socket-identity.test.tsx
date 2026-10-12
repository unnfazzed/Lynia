import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { acquireSocket, releaseSocket } from "../socket";
import { socketIdentity } from "../socket-identity";
import { useRiderBoard } from "../use-rider-board";

let mockSession: { accessToken: string; profileId: string } | null = { accessToken: "jwt-1", profileId: "p-1" };
jest.mock("../../auth/auth-context", () => ({ useAuth: () => ({ session: mockSession }) }));
jest.mock("../../telemetry/rum", () => ({
  clampGlassSample: jest.fn(() => null),
  enqueue: jest.fn(),
  noteDropped: jest.fn(),
  setActiveRole: jest.fn(),
}));
jest.mock("../socket", () => ({
  acquireSocket: jest.fn(() => ({ on: jest.fn(), off: jest.fn(), emit: jest.fn(), connected: false })),
  releaseSocket: jest.fn(),
}));

const acquire = acquireSocket as jest.Mock;
const release = releaseSocket as jest.Mock;

function Board(): null {
  useRiderBoard(true, null);
  return null;
}

describe("socketIdentity", () => {
  it("is the profile id while signed in, null when signed out", () => {
    expect(socketIdentity({ accessToken: "a", profileId: "p" })).toBe("p");
    expect(socketIdentity(null)).toBeNull();
    expect(socketIdentity({ accessToken: "", profileId: "p" })).toBeNull();
  });
});

describe("rider board socket across an access-token rotation", () => {
  it("does not release/re-acquire on rotation, but does on sign-out", () => {
    acquire.mockClear();
    release.mockClear();
    mockSession = { accessToken: "jwt-1", profileId: "p-1" };
    const qc = new QueryClient();
    const ui = (): React.ReactElement => (
      <QueryClientProvider client={qc}>
        <Board />
      </QueryClientProvider>
    );
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(ui());
    });
    expect(acquire).toHaveBeenCalledTimes(1);
    expect(acquire).toHaveBeenCalledWith("p-1", "jwt-1");

    // ~15 min later the access token rotates — same identity.
    mockSession = { accessToken: "jwt-2", profileId: "p-1" };
    act(() => tree.update(ui()));
    expect(acquire).toHaveBeenCalledTimes(1);
    expect(release).not.toHaveBeenCalled();

    // Sign-out still tears the socket down.
    mockSession = null;
    act(() => tree.update(ui()));
    expect(release).toHaveBeenCalledTimes(1);
    expect(release.mock.calls[0]![0]).toBe("p-1");
  });
});
