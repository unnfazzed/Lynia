// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MerchantCategoryResponse } from "@lynia/shared";
import { DishEditorSheet } from "./DishEditorSheet";

vi.mock("../../lib/business", () => ({ useBusiness: () => null }));
vi.mock("../../lib/order-flags", () => ({ useRxEnabled: () => false }));
// The picker is tested on its own: here it only reports an upload starting and landing.
vi.mock("./PhotoPicker", () => ({
  PhotoPicker: ({ onBusy, onUploaded }: { onBusy?: (b: boolean) => void; onUploaded: (key: string, preview: string) => void }) => (
    <>
      <button type="button" onClick={() => onBusy?.(true)}>
        start upload
      </button>
      <button
        type="button"
        onClick={() => {
          onUploaded("dish/p1/k1.jpg", "blob:1");
          onBusy?.(false);
        }}
      >
        upload landed
      </button>
    </>
  ),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const CATEGORY: MerchantCategoryResponse = { id: "c1", name: "Mains", sortOrder: 0, availableFrom: null, availableTo: null, hidden: false, dishCount: 0 };

describe("DishEditorSheet", () => {
  it("MJ-RM11: Save waits while the photo is still uploading, then saves it with the photo", () => {
    const onSave = vi.fn();
    render(<DishEditorSheet dish={null} categories={[CATEGORY]} disabled={false} submitting={false} error={null} onSave={onSave} onCancel={vi.fn()} />);
    const [name, , price] = screen.getAllByRole("textbox");
    fireEvent.change(name!, { target: { value: "Rice" } });
    fireEvent.change(price!, { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "start upload" }));
    const save = screen.getByRole("button", { name: "Save as draft" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.click(save);
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "upload landed" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ name: "Rice", priceUsd: 2, photoUrl: "dish/p1/k1.jpg" }));
  });
});
