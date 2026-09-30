import type { LatLng } from "@lynia/shared";
import { tileUrl, visibleTiles } from "../../lib/geo";
import { Icon } from "../icons";

const WIDTH = 480;

/**
 * The tracking screens' map band (B6/D5): OpenStreetMap tiles around a point (owner decision D-48:
 * OSM for maps), drawn at a fixed 480px and centred, so any phone width shows the point in the middle.
 * No library and no script. Without a point it is the handoff's own grey placeholder.
 */
export function StaticMap({ center, height, children }: { center: LatLng | null; height: number; children?: React.ReactNode }) {
  return (
    <div style={{ height, flexShrink: 0, position: "relative", overflow: "hidden", background: "var(--surface)" }}>
      {center && (
        <div style={{ position: "absolute", top: 0, left: `calc(50% - ${WIDTH / 2}px)`, width: WIDTH, height }} aria-hidden="true">
          {visibleTiles(center, 15, WIDTH, height).map((t) => (
            // eslint-disable-next-line @next/next/no-img-element -- raw OSM tiles, not a content image
            <img key={t.key} src={tileUrl(t)} alt="" width={256} height={256} style={{ position: "absolute", left: t.left, top: t.top }} />
          ))}
          <span style={{ position: "absolute", left: WIDTH / 2 - 14, top: height / 2 - 28, color: "var(--cta-fill)" }}>
            <Icon name="map-pin" size={28} />
          </span>
        </div>
      )}
      {children}
    </div>
  );
}
