// Web shim for react-native-maps. The parity lane renders the map as a neutral gray fill (the same
// honesty rule the mock side follows — a stubbed map is never claimed as a matched live map). MapView
// draws a gray View; markers/overlays render nothing. Named exports match the app's imports.
import * as React from "react";
import { View } from "react-native"; // aliased to react-native-web

const MapView = React.forwardRef((props, ref) =>
  React.createElement(View, {
    ref,
    ...props,
    style: [{ backgroundColor: "#e5e7eb" }, props && props.style],
  }, props && props.children),
);
const Nothing = () => null;
export const Marker = Nothing;
export const MarkerAnimated = Nothing;
export const Callout = Nothing;
export const Polyline = Nothing;
export const Circle = Nothing;
export const Polygon = Nothing;
export const Overlay = Nothing;
export const PROVIDER_GOOGLE = "google";
export const PROVIDER_DEFAULT = undefined;
export class AnimatedRegion {
  constructor(v) { Object.assign(this, v); }
  timing() { return { start: () => {} }; }
  setValue() {}
}
export default MapView;
