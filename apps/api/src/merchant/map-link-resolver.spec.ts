import { describe, expect, it, vi } from "vitest";
import { type MapLinkFetch, resolveMapLink } from "./map-link-resolver";

/** A fake network: each URL answers with a status and an optional Location. */
function net(routes: Record<string, { status: number; location?: string }>) {
  const cancel = vi.fn(async () => {});
  const fetchImpl = vi.fn<MapLinkFetch>(async (url) => {
    const r = routes[url];
    if (!r) throw new Error(`unexpected fetch ${url}`);
    return { status: r.status, headers: { get: (name: string) => (name.toLowerCase() === "location" ? (r.location ?? null) : null) }, body: { cancel } };
  });
  return { fetchImpl, cancel };
}

const UNREADABLE = { status: 422, response: { reason: "unreadable_link" } };

describe("resolveMapLink (merchant web upgrade L2, OV-6 / T15)", () => {
  it("reads coordinates already in the text without any request", async () => {
    const { fetchImpl } = net({});
    await expect(resolveMapLink("https://maps.google.com/maps?q=-17.8613%2C31.0362", fetchImpl)).resolves.toEqual({ lat: -17.8613, lng: 31.0362 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("follows a phone's share link one hop, reading only the Location header, and never the body", async () => {
    const { fetchImpl, cancel } = net({
      "https://maps.app.goo.gl/AbC123": { status: 302, location: "https://www.google.com/maps/place/Mbare/@-17.86,31.03,17z/data=!3d-17.8613!4d31.0362" },
    });
    await expect(resolveMapLink("https://maps.app.goo.gl/AbC123", fetchImpl)).resolves.toEqual({ lat: -17.8613, lng: 31.0362 });
    const [, init] = fetchImpl.mock.calls[0]!;
    expect(init).toMatchObject({ method: "GET", redirect: "manual" });
    expect(cancel).toHaveBeenCalled();
  });

  it("follows a short link to a short link, but no further than two hops", async () => {
    const two = net({
      "https://goo.gl/maps/one": { status: 301, location: "https://maps.app.goo.gl/two" },
      "https://maps.app.goo.gl/two": { status: 302, location: "https://maps.google.com/?q=-17.83,31.05" },
    });
    await expect(resolveMapLink("https://goo.gl/maps/one", two.fetchImpl)).resolves.toEqual({ lat: -17.83, lng: 31.05 });

    const three = net({
      "https://goo.gl/maps/one": { status: 301, location: "https://maps.app.goo.gl/two" },
      "https://maps.app.goo.gl/two": { status: 302, location: "https://maps.app.goo.gl/three" },
      "https://maps.app.goo.gl/three": { status: 302, location: "https://maps.google.com/?q=-17.83,31.05" },
    });
    await expect(resolveMapLink("https://goo.gl/maps/one", three.fetchImpl)).rejects.toMatchObject(UNREADABLE);
    expect(three.fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("never fetches anything off the allow-list: another host, http, or a look-alike", async () => {
    const { fetchImpl } = net({});
    for (const text of ["https://example.com/maps", "http://maps.app.goo.gl/AbC123", "https://maps.app.goo.gl.evil.example/x", "https://goo.gl/AbC123"]) {
      await expect(resolveMapLink(text, fetchImpl)).rejects.toMatchObject(UNREADABLE);
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("won't follow a redirect that leaves the allow-list without coordinates", async () => {
    const { fetchImpl } = net({ "https://maps.app.goo.gl/AbC123": { status: 302, location: "https://evil.example/steal" } });
    await expect(resolveMapLink("https://maps.app.goo.gl/AbC123", fetchImpl)).rejects.toMatchObject(UNREADABLE);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("a place with no coordinates, a non-redirect, or a network failure asks for a pin instead", async () => {
    const place = net({ "https://maps.app.goo.gl/AbC123": { status: 302, location: "https://www.google.com/maps/place/Mbare+Musika" } });
    await expect(resolveMapLink("https://maps.app.goo.gl/AbC123", place.fetchImpl)).rejects.toMatchObject(UNREADABLE);
    const ok = net({ "https://maps.app.goo.gl/AbC123": { status: 200 } });
    await expect(resolveMapLink("https://maps.app.goo.gl/AbC123", ok.fetchImpl)).rejects.toMatchObject(UNREADABLE);
    const down = vi.fn<MapLinkFetch>(async () => {
      throw new Error("timeout");
    });
    await expect(resolveMapLink("https://maps.app.goo.gl/AbC123", down)).rejects.toMatchObject({
      response: { message: "We couldn't read a location from that link. Drop a pin instead." },
    });
  });
});
