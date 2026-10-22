// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { saveMerchantShopFront } from "./actions";
import { ShopFrontEditor, shopFrontChanges } from "./ShopFrontEditor";

vi.mock("./actions", () => ({ saveMerchantShopFront: vi.fn() }));
vi.mock("../actions/audit", () => ({ submitAdminAction: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const INITIAL = { name: "Mama's Kitchen", about: "Home cooking", tags: ["Sadza", "Grill"], priceLevel: 2 };
const FORM = { name: "Mama's Kitchen", about: "Home cooking", tags: "Sadza, Grill", priceLevel: "2", removeLogo: false, removeCover: false };

describe("shopFrontChanges", () => {
  it("sends only what changed", () => {
    expect(shopFrontChanges(INITIAL, FORM)).toEqual({ changes: {}, problem: null });
    expect(shopFrontChanges(INITIAL, { ...FORM, name: "  Mama's Kitchen Avondale ", tags: "Sadza,Grill" }).changes).toEqual({ name: "Mama's Kitchen Avondale" });
    expect(shopFrontChanges(INITIAL, { ...FORM, priceLevel: "", tags: "Sadza", removeLogo: true }).changes).toEqual({ priceLevel: null, cuisineTags: ["Sadza"], removeLogo: true });
    expect(shopFrontChanges({ ...INITIAL, about: null }, { ...FORM, about: "" }).changes).toEqual({});
  });

  it("names the first problem the API would refuse", () => {
    expect(shopFrontChanges(INITIAL, { ...FORM, name: "  " }).problem).toMatch(/name can't be empty/);
    expect(shopFrontChanges(INITIAL, { ...FORM, tags: "a, b, c, d" }).problem).toMatch(/at most 3 tags/);
    expect(shopFrontChanges(INITIAL, { ...FORM, tags: "x".repeat(25) }).problem).toMatch(/24 characters/);
    expect(shopFrontChanges(INITIAL, { ...FORM, tags: "Sadza, sad za" }).problem).toMatch(/listed twice/);
  });
});

function renderEditor(connected = true) {
  render(<ShopFrontEditor merchantId="m-1" name="Mama's Kitchen" about="Home cooking" tags={["Sadza"]} priceLevel={2} hasLogo hasCover={false} shop={false} connected={connected} />);
}

describe("ShopFrontEditor (admin assist)", () => {
  it("renames the business, with the reason on the audit", async () => {
    vi.mocked(saveMerchantShopFront).mockResolvedValue({ ok: true });
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Edit shop front" }));
    const save = screen.getByRole("button", { name: "Save changes…" });
    expect(save).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Mama's Kitchen Avondale" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes…" }));
    expect(screen.getByText(/Customers will see the new name straight away/)).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "The owner asked by phone" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() =>
      expect(saveMerchantShopFront).toHaveBeenCalledWith("m-1", { name: "Mama's Kitchen Avondale" }, expect.any(FormData), "The owner asked by phone", ""),
    );
    await vi.waitFor(() => expect(screen.getByRole("button", { name: "Edit shop front" })).toBeTruthy());
  });

  it("removes the logo", async () => {
    vi.mocked(saveMerchantShopFront).mockResolvedValue({ ok: true });
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Edit shop front" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Remove logo" }));
    expect(screen.queryByRole("checkbox", { name: "Remove cover photo" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save changes…" }));
    fireEvent.click(screen.getByRole("radio", { name: "Fixing a mistake or a photo that breaks the rules" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() => expect(saveMerchantShopFront).toHaveBeenCalledWith("m-1", { removeLogo: true }, expect.any(FormData), expect.any(String), ""));
  });

  it("keeps the form open and shows the API's message when the save fails", async () => {
    vi.mocked(saveMerchantShopFront).mockResolvedValue({ ok: false, message: "Invalid photo key" });
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Edit shop front" }));
    fireEvent.change(screen.getByLabelText("About"), { target: { value: "New about" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes…" }));
    fireEvent.click(screen.getByRole("radio", { name: "The owner asked by phone" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() => expect(screen.getByText("Invalid photo key")).toBeTruthy());
    expect(screen.getByRole("group", { name: "Edit shop front" })).toBeTruthy();
  });

  it("is inert while the console is offline", () => {
    renderEditor(false);
    expect(screen.getByRole("button", { name: "Edit shop front" })).toHaveProperty("disabled", true);
  });
});
