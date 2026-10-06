// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { StaticMap } from "./StaticMap";

const { places } = vi.hoisted(() => ({ places: { key: "k-123" as string | null } }));
vi.mock("../../lib/places", () => ({
  get GOOGLE_PLACES_KEY() {
    return places.key;
  },
}));

const point = { lat: -17.8292, lng: 31.0522 };
let width = 360;
const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => width });
});
afterAll(() => {
  if (original) Object.defineProperty(HTMLElement.prototype, "clientWidth", original);
});
afterEach(() => {
  cleanup();
  places.key = "k-123";
  width = 360;
});

const img = (c: HTMLElement) => c.querySelector("img");

describe("StaticMap — the tracking band on Google Static Maps (D-80)", () => {
  it("requests one image at the band's own width, so Google's logo is never cropped", () => {
    const { container } = render(<StaticMap center={point} height={250} />);
    const src = new URL(img(container)!.getAttribute("src")!);
    expect(src.hostname).toBe("maps.googleapis.com");
    expect(src.searchParams.get("size")).toBe("360x250");
    expect(img(container)!.getAttribute("width")).toBe("360");
  });

  it("caps a wide band at 640px, centred", () => {
    width = 900;
    const { container } = render(<StaticMap center={point} height={250} />);
    expect(new URL(img(container)!.getAttribute("src")!).searchParams.get("size")).toBe("640x250");
  });

  it("is the grey placeholder with no point, no key, or a refused image — and keeps its children", () => {
    const none = render(<StaticMap center={null} height={250}>back</StaticMap>);
    expect(img(none.container)).toBeNull();
    expect(none.container.textContent).toBe("back");
    cleanup();

    places.key = null;
    expect(img(render(<StaticMap center={point} height={250} />).container)).toBeNull();
    cleanup();

    places.key = "k-123";
    const refused = render(<StaticMap center={point} height={250} />);
    fireEvent.error(img(refused.container)!);
    expect(img(refused.container)).toBeNull();
  });
});
