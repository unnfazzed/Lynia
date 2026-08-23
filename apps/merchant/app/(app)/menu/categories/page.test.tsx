// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MerchantCategoryResponse } from "@lynia/shared";
import CategoryManagePage from "./page";
import { deleteCategory, listCategories } from "../../../lib/menu-api";

/**
 * CF-02-SIB-5 (crash-fuzz 2026-08-23): `run()` — the shared helper behind move/toggle/delete — guarded
 * only with `busyId` (React state), the same async-state-only race CF-02 fixed elsewhere. Unlike
 * move/toggle (which recompute an identical target value on both same-tick calls — the accepted
 * hours/shop non-fix shape), a same-tick double-tap on Delete sends two DELETE calls for one id.
 */

vi.mock("../../../lib/menu-api", () => ({
  listCategories: vi.fn(),
  updateCategory: vi.fn(),
  createCategory: vi.fn(),
  deleteCategory: vi.fn(),
}));

const signOut = vi.fn();
vi.mock("../../../components/KitchenConnectionProvider", () => ({
  useKitchenConnection: () => ({ actionsDisabled: false, signOut }),
}));

vi.mock("../../../components/Kitchen", () => ({
  Kitchen: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function category(over: Partial<MerchantCategoryResponse> = {}): MerchantCategoryResponse {
  return {
    id: "c1",
    name: "Mains",
    sortOrder: 0,
    availableFrom: null,
    availableTo: null,
    hidden: false,
    dishCount: 0,
    ...over,
  };
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("menu/categories/page.tsx — CF-02-SIB-5 (crash-fuzz 2026-08-23)", () => {
  it("a same-tick double-click on Delete sends only one DELETE for that category", async () => {
    vi.mocked(listCategories).mockResolvedValue([category()]);
    const gate = deferred<{ ok: true }>();
    vi.mocked(deleteCategory).mockReturnValue(gate.promise);

    await act(async () => {
      render(<CategoryManagePage />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    const button = await screen.findByRole("button", { name: "Delete Mains" });
    act(() => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(deleteCategory).toHaveBeenCalledTimes(1);

    await act(async () => {
      gate.resolve({ ok: true });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(deleteCategory).toHaveBeenCalledTimes(1);
  });
});
