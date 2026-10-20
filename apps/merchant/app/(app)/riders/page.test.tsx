// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import RidersPage from "./page";

const nav = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: nav.replace }) }));

describe("Preferred riders is retired (Own bikers T9)", () => {
  it("a bookmark to the old screen lands on Account", () => {
    render(<RidersPage />);
    expect(nav.replace).toHaveBeenCalledWith("/account");
  });
});
