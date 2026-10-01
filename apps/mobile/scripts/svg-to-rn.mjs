#!/usr/bin/env node
/**
 * Transcribe design-handoff SVG artwork into `react-native-svg` components, node for node.
 *
 *   node scripts/svg-to-rn.mjs            # regenerate src/ui/art/*.tsx
 *   node scripts/svg-to-rn.mjs --check    # fail if the committed files are stale
 *
 * Why a generator and not a hand transcription: Metro here has no SVG transformer (see
 * src/ui/home/ServiceStickers.tsx), so an `.svg` file is not a component. The Calm Mint v2 handoff
 * (packages/design/handoff/calm-mint-v2-2026-10) says to use its stickers and illustrations
 * VERBATIM, and a mechanical transcription is the only honest way to do that for ~100-node
 * drawings: every element, attribute and colour comes straight from the file. The c2pa
 * `<metadata>` block (provenance, not artwork) is dropped. Re-run this when an export ships new art.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../../..");
const HANDOFF = "packages/design/handoff/calm-mint-v2-2026-10/assets";

/**
 * Output file → [component name, source svg]. One file per drawing on purpose: Metro does not
 * tree-shake, so a screen that imports one illustration must not pay for the others in the bundle
 * (docs/APP-SIZE.md — every byte reaches a phone on metered data).
 */
const OUTPUTS = {
  "src/ui/art/stickers.tsx": [
    ["SendStickerV2", `${HANDOFF}/service-icons/v2/send.svg`],
    ["RestaurantsSticker", `${HANDOFF}/service-icons/v2/restaurants.svg`],
    ["ShopsSticker", `${HANDOFF}/service-icons/v2/shops.svg`],
    ["PharmacyStickerV2", `${HANDOFF}/service-icons/v2/pharmacy.svg`],
  ],
  "src/ui/art/HeroRiderArt.tsx": [["HeroRiderArt", `${HANDOFF}/illustrations/hero-rider.svg`]],
  "src/ui/art/ScooterRiderArt.tsx": [["ScooterRiderArt", `${HANDOFF}/illustrations/biz-scooter-rider.svg`]],
  "src/ui/art/TrustTrackingArt.tsx": [["TrustTrackingArt", `${HANDOFF}/illustrations/trust-tracking.svg`]],
  "src/ui/art/TrustVerifiedArt.tsx": [["TrustVerifiedArt", `${HANDOFF}/illustrations/trust-verified.svg`]],
};

const TAGS = {
  g: "G",
  rect: "Rect",
  circle: "Circle",
  ellipse: "Ellipse",
  path: "Path",
  polygon: "Polygon",
  polyline: "Polyline",
  line: "Line",
  defs: "Defs",
  clipPath: "ClipPath",
};

const camel = (k) => k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

/** A tiny tokenizer for the well-formed, attribute-only SVG the design tool exports. */
function parse(svg) {
  const src = svg.replace(/<metadata>[\s\S]*?<\/metadata>/g, "").replace(/<\?xml[^>]*>/g, "");
  const root = { tag: "#root", attrs: {}, children: [] };
  const stack = [root];
  const re = /<(\/?)([a-zA-Z]+)((?:\s+[a-zA-Z0-9:-]+="[^"]*")*)\s*(\/?)>/g;
  let m;
  while ((m = re.exec(src))) {
    const [, close, tag, rawAttrs, selfClose] = m;
    if (close) {
      stack.pop();
      continue;
    }
    const attrs = {};
    for (const a of rawAttrs.matchAll(/([a-zA-Z0-9:-]+)="([^"]*)"/g)) attrs[a[1]] = a[2];
    const node = { tag, attrs, children: [] };
    stack[stack.length - 1].children.push(node);
    if (!selfClose) stack.push(node);
  }
  const svgNode = root.children.find((n) => n.tag === "svg");
  if (!svgNode) throw new Error("no <svg> root");
  return svgNode;
}

function attrsToJsx(attrs) {
  return Object.entries(attrs)
    .filter(([k]) => !k.startsWith("xmlns") && k !== "width" && k !== "height")
    .map(([k, v]) => {
      if (k === "clip-path") return `clipPath="${v}"`;
      return `${camel(k)}="${v}"`;
    })
    .join(" ");
}

function emitNode(node, used, indent) {
  const name = TAGS[node.tag];
  if (!name) throw new Error(`unsupported SVG element <${node.tag}>`);
  used.add(name);
  // Shapes keep their own width/height (a rect needs them); only the root drops its sizing.
  const shapeAttrs = Object.entries(node.attrs)
    .filter(([k]) => !k.startsWith("xmlns"))
    .map(([k, v]) => `${k === "clip-path" ? "clipPath" : camel(k)}="${v}"`)
    .join(" ");
  const open = `${indent}<${name}${shapeAttrs ? " " + shapeAttrs : ""}`;
  if (!node.children.length) return `${open} />`;
  return [`${open}>`, ...node.children.map((c) => emitNode(c, used, indent + "  ")), `${indent}</${name}>`].join("\n");
}

function component(name, file, used) {
  const svg = parse(readFileSync(resolve(REPO, file), "utf8"));
  const [, , vw, vh] = svg.attrs.viewBox.split(/\s+/).map(Number);
  // A root-level presentation attribute (e.g. `fill="none"`) is inherited by every child in SVG;
  // react-native-svg inherits through a <G>, so it moves onto a wrapping group.
  const inherited = attrsToJsx(Object.fromEntries(Object.entries(svg.attrs).filter(([k]) => k !== "viewBox")));
  const body = svg.children.map((c) => emitNode(c, used, inherited ? "        " : "      ")).join("\n");
  if (inherited) used.add("G");
  return `/** \`${file.replace(`${HANDOFF}/`, "")}\` — ${vw}×${vh}. Pass the drawn WIDTH; the height follows the artboard. */
export function ${name}({ width }: { width: number }): React.ReactElement {
  return (
    <Svg width={width} height={(width * ${vh}) / ${vw}} viewBox="0 0 ${vw} ${vh}">
${inherited ? `      <G ${inherited}>\n${body}\n      </G>` : body}
    </Svg>
  );
}`;
}

let stale = false;
for (const [out, items] of Object.entries(OUTPUTS)) {
  const used = new Set();
  const comps = items.map(([name, file]) => component(name, file, used));
  const imports = ["Svg", ...[...used].sort()].join(", ").replace(/^Svg, /, "");
  const text = `// GENERATED by apps/mobile/scripts/svg-to-rn.mjs — do not edit by hand.
// Source: ${HANDOFF} (Calm Mint v2 handoff, docs/DESIGN-DEVIATIONS.md D-55).
// Verbatim transcription of the handoff's artwork; regenerate with \`node scripts/svg-to-rn.mjs\`.
import React from "react";
import Svg, { ${imports} } from "react-native-svg";

${comps.join("\n\n")}
`;
  const path = resolve(HERE, "..", out);
  if (process.argv.includes("--check")) {
    let cur = "";
    try {
      cur = readFileSync(path, "utf8");
    } catch {
      /* missing → stale */
    }
    if (cur !== text) {
      console.error(`stale: ${out} — run node scripts/svg-to-rn.mjs`);
      stale = true;
    }
  } else {
    writeFileSync(path, text);
    console.log(`wrote ${out}`);
  }
}
if (stale) process.exit(1);
