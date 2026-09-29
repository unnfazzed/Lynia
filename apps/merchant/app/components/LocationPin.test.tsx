// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocationPin } from "./LocationPin";
import { HARARE_CBD } from "../lib/geo";

afterEach(() => {
  cleanup();
});

const map = () => screen.getByRole("button", { name: "Your business on the map" });

describe("LocationPin", () => {
  it("the arrow keys move the pin's point (the keyboard path for dragging the map)", () => {
    const onMove = vi.fn();
    render(<LocationPin value={HARARE_CBD} onMove={onMove} label="Your business on the map" />);

    fireEvent.keyDown(map(), { key: "ArrowRight" });
    expect(onMove.mock.calls[0]![0].lng).toBeGreaterThan(HARARE_CBD.lng);
    fireEvent.keyDown(map(), { key: "ArrowUp" });
    expect(onMove.mock.calls[1]![0].lat).toBeGreaterThan(HARARE_CBD.lat);
  });

  it("dragging the map moves the point under the fixed centre pin", () => {
    const onMove = vi.fn();
    render(<LocationPin value={HARARE_CBD} onMove={onMove} label="Your business on the map" />);

    fireEvent.pointerDown(map(), { pointerId: 1, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(map(), { pointerId: 1, clientX: 160, clientY: 100 });
    fireEvent.pointerUp(map(), { pointerId: 1, clientX: 160, clientY: 100 });
    fireEvent.pointerMove(map(), { pointerId: 1, clientX: 400, clientY: 100 });

    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove.mock.calls[0]![0].lng).toBeLessThan(HARARE_CBD.lng);
  });

  it("zooming never moves the point, and stops at the tile server's limits", () => {
    const onMove = vi.fn();
    render(<LocationPin value={HARARE_CBD} onMove={onMove} label="Your business on the map" />);

    const zoomIn = screen.getByRole("button", { name: "Zoom in" });
    for (let i = 0; i < 5; i++) fireEvent.click(zoomIn);
    expect(zoomIn).toHaveProperty("disabled", true);
    expect(onMove).not.toHaveBeenCalled();
  });

  it("credits OpenStreetMap, as its tile licence requires", () => {
    render(<LocationPin value={HARARE_CBD} onMove={vi.fn()} label="Your business on the map" />);
    expect(screen.getByRole("link", { name: "© OpenStreetMap" }).getAttribute("href")).toBe("https://www.openstreetmap.org/copyright");
  });
});
