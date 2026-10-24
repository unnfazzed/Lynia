// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CallButton } from "./CallButton";
import { revealPhone } from "../actions/phone";

vi.mock("../actions/phone", () => ({ revealPhone: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("CallButton (owner 2026-10-18) and its WhatsApp twin (owner 2026-10-24)", () => {
  it("a full number is a plain tel: link", () => {
    render(<CallButton profileId="p-1" phone="+263 77 245 1180" label="Call customer" connected />);
    expect(screen.getByRole("link", { name: "Call customer" }).getAttribute("href")).toBe("tel:+263772451180");
  });

  it("a full number on WhatsApp is a wa.me link in a new tab", () => {
    render(<CallButton profileId="p-1" phone="+263 77 245 1180" label="WhatsApp customer" connected via="whatsapp" />);
    const link = screen.getByRole("link", { name: "WhatsApp customer" });
    expect(link.getAttribute("href")).toBe("https://wa.me/263772451180");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("a masked number is revealed on tap, then opened in WhatsApp in the tab the click opened", async () => {
    vi.mocked(revealPhone).mockResolvedValue({ phone: "+263772451180" });
    const tab = { opener: {} as unknown, location: { href: "" }, close: vi.fn() };
    const open = vi.spyOn(window, "open").mockReturnValue(tab as unknown as Window);
    render(<CallButton profileId="p-1" phone="+263 77 ••• ••80" label="WhatsApp customer" connected via="whatsapp" />);
    fireEvent.click(screen.getByRole("button", { name: "WhatsApp customer" }));
    expect(open).toHaveBeenCalledWith("", "_blank");
    await vi.waitFor(() => expect(tab.location.href).toBe("https://wa.me/263772451180"));
    expect(tab.opener).toBeNull();
    expect(revealPhone).toHaveBeenCalledWith("p-1");
    expect(screen.getByRole("link", { name: "WhatsApp customer" }).getAttribute("href")).toBe("https://wa.me/263772451180");
  });

  it("closes the opened tab and shows the API's refusal", async () => {
    vi.mocked(revealPhone).mockResolvedValue({ error: "Too many numbers this hour — try again later." });
    const tab = { opener: {}, location: { href: "" }, close: vi.fn() };
    vi.spyOn(window, "open").mockReturnValue(tab as unknown as Window);
    render(<CallButton profileId="p-1" phone="+263 77 ••• ••80" label="WhatsApp biker" connected via="whatsapp" />);
    fireEvent.click(screen.getByRole("button", { name: "WhatsApp biker" }));
    await vi.waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Too many numbers this hour — try again later."));
    expect(tab.close).toHaveBeenCalled();
    expect(tab.location.href).toBe("");
  });

  it("is inert offline", () => {
    render(<CallButton profileId="p-1" phone="+263 77 ••• ••80" label="WhatsApp customer" connected={false} via="whatsapp" />);
    expect((screen.getByRole("button", { name: "WhatsApp customer" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
