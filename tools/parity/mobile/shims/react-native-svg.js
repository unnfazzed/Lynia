// Web shim for react-native-svg: map each RN-SVG component to its DOM SVG element. RN-SVG's prop
// names (fill, stroke, strokeWidth, d, points, viewBox, cx/cy/r …) are the same names React DOM
// accepts on SVG elements, so a thin forwardRef passthrough renders correctly. This also transparently
// powers lucide-react-native icons, which draw through react-native-svg. Non-DOM props RN passes
// (accessibilityRole etc.) are dropped to avoid React unknown-attribute warnings.
import * as React from "react";

const RN_ONLY = new Set(["accessibilityRole", "accessibilityLabel", "collapsable", "focusable"]);

function make(tag) {
  const C = React.forwardRef((props, ref) => {
    const clean = {};
    for (const k in props) if (!RN_ONLY.has(k)) clean[k] = props[k];
    return React.createElement(tag, { ref, ...clean });
  });
  C.displayName = tag;
  return C;
}

export const Svg = make("svg");
export const Path = make("path");
export const Circle = make("circle");
export const Ellipse = make("ellipse");
export const Rect = make("rect");
export const Line = make("line");
export const Polyline = make("polyline");
export const Polygon = make("polygon");
export const G = make("g");
export const Text = make("text");
export const TSpan = make("tspan");
export const TextPath = make("textPath");
export const Use = make("use");
export const Defs = make("defs");
export const Stop = make("stop");
export const LinearGradient = make("linearGradient");
export const RadialGradient = make("radialGradient");
export const ClipPath = make("clipPath");
export const Mask = make("mask");
export const Pattern = make("pattern");
export const Symbol = make("symbol");
export const Marker = make("marker");
export const ForeignObject = make("foreignObject");
export const Image = make("image");

export default Svg;
