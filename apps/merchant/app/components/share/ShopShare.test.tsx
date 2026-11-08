// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/share-api", async (orig) => ({
  ...(await orig<typeof import("../../lib/share-api")>()),
  getCounterQrSvg: async () => '<svg xmlns="http://www.w3.org/2000/svg"/>',
}));

import { fill, SH } from "../../lib/shop-share-copy";
import { ShareRow, ShopShareSheet, type SharePreview } from "./ShopShare";

afterEach(cleanup);

const LINK = { live: true, code: "7KQ2MX", link: "https://lyniago.com/s/chicken-inn-avondale-7KQ2MX" };
const PREVIEW: SharePreview = { name: "Chicken Inn Avondale", coverUrl: null, logoUrl: null, service: "restaurants" };

describe("Shop share links v1 · merchant (SH-M1–M4, D-129)", () => {
  it("SH-M1: the row reads the handoff's copy and opens the sheet", () => {
    const onOpen = vi.fn();
    render(<ShareRow onOpen={onOpen} />);
    fireEvent.click(screen.getByRole("button", { name: new RegExp(SH.merchant.rowT) }));
    expect(onOpen).toHaveBeenCalled();
    expect(screen.getByText(SH.merchant.rowS)).toBeTruthy();
  });

  it("SH-M2: WhatsApp opens wa.me with waText (no number); the link shows without its scheme", () => {
    render(<ShopShareSheet link={LINK} preview={PREVIEW} onClose={vi.fn()} onToast={vi.fn()} />);
    const wa = screen.getByRole("link", { name: SH.merchant.shareWa });
    expect(wa.getAttribute("href")).toBe(`https://wa.me/?text=${encodeURIComponent(fill(SH.merchant.waText, { shop: PREVIEW.name, link: LINK.link }))}`);
    expect(screen.getByText("lyniago.com/s/chicken-inn-avondale-7KQ2MX")).toBeTruthy();
    expect(screen.getAllByText(PREVIEW.name).length).toBeGreaterThan(0);
  });

  it("SH-M3: Copy link copies the full link, says Copied and toasts", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const onToast = vi.fn();
    render(<ShopShareSheet link={LINK} preview={PREVIEW} onClose={vi.fn()} onToast={onToast} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: SH.merchant.copyLink }));
    });
    expect(writeText).toHaveBeenCalledWith(LINK.link);
    expect(screen.getByText(SH.merchant.copied)).toBeTruthy();
    expect(onToast).toHaveBeenCalledWith(SH.merchant.toastCopied);
  });

  it("SH-M4: Show QR opens the counter QR; ✕ goes back to the sheet", async () => {
    Object.assign(URL, { createObjectURL: () => "blob:qr", revokeObjectURL: () => undefined });
    render(<ShopShareSheet link={LINK} preview={PREVIEW} onClose={vi.fn()} onToast={vi.fn()} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: new RegExp(SH.merchant.qrRow) }));
    });
    expect(screen.getByRole("heading", { name: SH.merchant.qrTitle })).toBeTruthy();
    expect(screen.getByAltText(fill(SH.merchant.qrA11y, { link: "lyniago.com/s/chicken-inn-avondale-7KQ2MX" }))).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByRole("heading", { name: SH.merchant.sheetT })).toBeTruthy();
  });
});
