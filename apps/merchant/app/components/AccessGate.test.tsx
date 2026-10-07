// @vitest-environment jsdom
import { useEffect } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccessGate } from "./AccessGate";
import type { MerchantSession } from "../lib/session";

const replace = vi.fn();
let pathname = "/queue";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => pathname,
}));

let session: MerchantSession | null = null;
vi.mock("../lib/session", () => ({ loadMerchantSession: () => session }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  session = null;
  pathname = "/queue";
  window.history.replaceState(null, "", "/");
});

const SESSION: MerchantSession = { accessToken: "at", refreshToken: "rt", expiresIn: 3600, issuedAt: 0, profileId: "m1", role: "merchant" };

async function mount() {
  await act(async () => {
    render(
      <AccessGate>
        <div>page</div>
      </AccessGate>,
    );
  });
}

describe("AccessGate", () => {
  it("fails closed: no session on a dashboard page renders nothing and goes to sign-in, keeping the query", async () => {
    pathname = "/queue/order";
    window.history.replaceState(null, "", "/queue/order?id=o1");
    await mount();
    expect(screen.queryByText("page")).toBeNull();
    expect(replace).toHaveBeenCalledWith("/login?next=%2Fqueue%2Forder%3Fid%3Do1");
  });

  it("renders a dashboard page once a session is found", async () => {
    session = SESSION;
    await mount();
    expect(screen.getByText("page")).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });

  it("renders the sign-in page with no session", async () => {
    pathname = "/login";
    await mount();
    expect(screen.getByText("page")).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });

  it("sends a signed-in merchant from sign-in to Orders", async () => {
    pathname = "/login";
    session = SESSION;
    await mount();
    expect(replace).toHaveBeenCalledWith("/queue");
  });

  it("lets a rider's hand-over link through with no session", async () => {
    pathname = "/h";
    await mount();
    expect(screen.getByText("page")).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });

  it("lets an old-style hand-over link (/h/<token>) through with no session, after the check", async () => {
    pathname = "/h/tok";
    await mount();
    expect(screen.getByText("page")).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });

  it("keeps the page mounted across a navigation between dashboard pages (the alarm and socket live there)", async () => {
    session = SESSION;
    const mounts = vi.fn();
    function Shell() {
      useEffect(() => mounts(), []);
      return <div>page</div>;
    }
    let view!: ReturnType<typeof render>;
    await act(async () => {
      view = render(
        <AccessGate>
          <Shell />
        </AccessGate>,
      );
    });
    pathname = "/menu";
    await act(async () => {
      view.rerender(
        <AccessGate>
          <Shell />
        </AccessGate>,
      );
    });
    expect(screen.getByText("page")).toBeTruthy();
    expect(mounts).toHaveBeenCalledTimes(1);
  });
});
