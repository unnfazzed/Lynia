// react-native-maps for the customer web build (redirected by ./web-runtime.js; web only). Phase 1
// placeholder: react-native-maps has no web version, so the map is an empty grey panel with the same
// exports and imperative ref methods the screens call (fitToCoordinates, animateToRegion, animateCamera …),
// and `onMapReady` fires once so nothing waits on it. Phase 2 replaces this with Google's Maps JavaScript
// API (docs/plans/2026-10-06-customer-web-app-plan.md, B2; owner decision D-80).
const React = require("react");
const { View } = require("react-native");

const MapView = React.forwardRef(function MapView(props, ref) {
  React.useImperativeHandle(ref, () => ({
    fitToCoordinates() {},
    fitToSuppliedMarkers() {},
    fitToElements() {},
    animateToRegion() {},
    animateCamera() {},
    setCamera() {},
    getCamera: () => Promise.resolve({}),
    getMapBoundaries: () => Promise.resolve({}),
  }));
  const onMapReady = props.onMapReady;
  React.useEffect(() => {
    if (onMapReady) onMapReady();
  }, [onMapReady]);
  return React.createElement(View, { style: [{ backgroundColor: "#e5e7eb" }, props.style] }, props.children);
});

const Nothing = () => null;

class AnimatedRegion {
  constructor(value) {
    Object.assign(this, value);
  }
  timing() {
    return { start: (cb) => cb && cb({ finished: true }) };
  }
  spring() {
    return this.timing();
  }
  setValue(value) {
    Object.assign(this, value);
  }
  stopAnimation() {}
}

module.exports = {
  __esModule: true,
  default: MapView,
  MapView,
  Marker: Nothing,
  MarkerAnimated: Nothing,
  Callout: Nothing,
  Polyline: Nothing,
  Circle: Nothing,
  Polygon: Nothing,
  Overlay: Nothing,
  AnimatedRegion,
  PROVIDER_GOOGLE: "google",
  PROVIDER_DEFAULT: undefined,
};
