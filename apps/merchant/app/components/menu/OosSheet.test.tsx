// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OosSheet } from "./OosSheet";

afterEach(() => cleanup());

describe("OosSheet (RM.oos_sheet, merchant web upgrade L5)", () => {
  it("offers the drawn three durations, the rest of today chosen to start with", () => {
    const onConfirm = vi.fn();
    render(<OosSheet dishName="Mazondo" disabled={false} submitting={false} onConfirm={onConfirm} onCancel={vi.fn()} />);

    expect(screen.getByText("Mark “Mazondo” out of stock")).toBeTruthy();
    expect(screen.getByText("Customers still see it, greyed out, so they know you normally have it.")).toBeTruthy();
    const options = screen.getAllByRole("radio");
    expect(options.map((o) => o.textContent)).toEqual(["Until I turn it back on", "For the rest of today", "For 1 hour"]);
    expect(screen.getByRole("radio", { name: "For the rest of today" }).getAttribute("aria-checked")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Mark out of stock" }));
    expect(onConfirm).toHaveBeenLastCalledWith("rest_of_today");

    fireEvent.click(screen.getByRole("radio", { name: "For 1 hour" }));
    expect(screen.getByRole("radio", { name: "For 1 hour" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Mark out of stock" }));
    expect(onConfirm).toHaveBeenLastCalledWith("one_hour");

    fireEvent.click(screen.getByRole("radio", { name: "Until I turn it back on" }));
    fireEvent.click(screen.getByRole("button", { name: "Mark out of stock" }));
    expect(onConfirm).toHaveBeenLastCalledWith("until_back");
  });
});
