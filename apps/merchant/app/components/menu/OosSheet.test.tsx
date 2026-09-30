// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OosSheet } from "./OosSheet";

afterEach(() => cleanup());

describe("OosSheet (C2, merchant mobile D-48)", () => {
  it("offers the two drawn choices, Rest of today chosen to start with", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<OosSheet dishName="Mazondo" backOn="Back on automatically at 08:00" disabled={false} submitting={false} onConfirm={onConfirm} onCancel={onCancel} />);

    expect(screen.getByText("Mazondo is off. For how long?")).toBeTruthy();
    expect(screen.getAllByRole("radio").map((o) => o.textContent)).toEqual(["Rest of todayBack on automatically at 08:00", "Until I turn it back on"]);

    fireEvent.click(screen.getByRole("button", { name: "Turn off" }));
    expect(onConfirm).toHaveBeenLastCalledWith("rest_of_today");

    fireEvent.click(screen.getByRole("radio", { name: "Until I turn it back on" }));
    fireEvent.click(screen.getByRole("button", { name: "Turn off" }));
    expect(onConfirm).toHaveBeenLastCalledWith("until_back");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).toHaveBeenCalled();
  });
});
