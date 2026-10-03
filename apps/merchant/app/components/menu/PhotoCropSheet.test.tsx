// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PhotoCropSheet } from "./PhotoCropSheet";

const realCreate = URL.createObjectURL;
const realRevoke = URL.revokeObjectURL;

afterEach(() => {
  cleanup();
  URL.createObjectURL = realCreate;
  URL.revokeObjectURL = realRevoke;
});

describe("PhotoCropSheet", () => {
  // The merchant app is phone-first (ledger D-48): the help names the phone the file comes from.
  it("an unreadable file asks for a JPEG or PNG from this phone", () => {
    URL.createObjectURL = vi.fn(() => "blob:unreadable");
    URL.revokeObjectURL = vi.fn();
    const { container } = render(
      <PhotoCropSheet kind="dish" aspect={1} file={new File(["not a photo"], "x.jpg", { type: "image/jpeg" })} onCancel={() => {}} onConfirm={() => {}} />,
    );
    fireEvent.error(container.querySelector("img")!);
    expect(screen.getByText("That file couldn't be opened as a photo. Pick a JPEG or PNG from this phone.")).toBeTruthy();
    expect(container.textContent).not.toMatch(/tablet/i);
  });
});
