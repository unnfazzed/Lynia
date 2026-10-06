// react-native-maps for the customer web build (redirected by ./web-runtime.js; web only), drawn with
// Google's Maps JavaScript API (owner decision D-80; docs/plans/2026-10-06-customer-web-app-plan.md P2).
//
// It speaks the subset of react-native-maps the customer screens use, so no screen changes:
// - MapView: initialRegion, onPress, onRegionChangeComplete, onMapReady, onMapLoaded, scrollEnabled /
//   zoomEnabled; ref methods fitToCoordinates, animateToRegion, animateCamera, setCamera, getCamera,
//   getMapBoundaries (calls made before the map has loaded are replayed once it has).
// - Marker / MarkerAnimated: coordinate (a LatLng or an AnimatedRegion), anchor, zIndex, onPress, draggable
//   + onDragEnd, pinColor; children are the screens' own RN pin views, rendered into a Google overlay.
// - Polyline (strokeColor, strokeWidth, lineDashPattern) and Circle (center, radius, fill/stroke).
// - AnimatedRegion: setValue, timing(...).start(), stopAnimation.
// Geometry and colour maths live in ../src/web/map-geometry.ts (unit-tested). Without a key, or if Google
// refuses it, the map is the same grey panel as before and onMapReady still fires so no screen waits.
const React = require("react");
const { createPortal } = require("react-dom");
const { View, Easing } = require("react-native");
const { anchorOffset, dashSpec, regionFromBounds, toGoogleColour, zoomForRegion } = require("../src/web/map-geometry");

const KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY || null;
const GREY = "#e5e7eb";

// --- Loading Google's script (once per page) -------------------------------------------------------------

let loading = null;
// Google calls gm_authFailure when it refuses the key (wrong address, API not enabled), AFTER the script
// has loaded and maps exist, and paints its own "Oops! Something went wrong" panel over them. Every
// mounted map listens and drops back to the plain grey panel instead.
let authFailed = false;
const authListeners = new Set();
function onAuthFailure(fn) {
  authListeners.add(fn);
  return () => authListeners.delete(fn);
}
function loadGoogle() {
  if (!KEY || typeof document === "undefined") return Promise.reject(new Error("maps-unavailable"));
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    if (globalThis.google && globalThis.google.maps && globalThis.google.maps.Map) return resolve(globalThis.google);
    const cb = "__lyniaMapsReady";
    globalThis[cb] = () => resolve(globalThis.google);
    globalThis.gm_authFailure = () => {
      authFailed = true;
      for (const fn of authListeners) fn();
      reject(new Error("maps-auth-failed"));
    };
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(KEY)}&v=weekly&language=en&region=ZW&callback=${cb}`;
    s.async = true;
    s.onerror = () => {
      loading = null;
      reject(new Error("maps-script-failed"));
    };
    document.head.appendChild(s);
  });
  return loading;
}

const MapContext = React.createContext(null);
const toLatLng = (c) => ({ lat: c.latitude, lng: c.longitude });
const fromLatLng = (ll) => ({ latitude: ll.lat(), longitude: ll.lng() });

// --- AnimatedRegion -------------------------------------------------------------------------------------

class AnimatedRegion {
  constructor(value = {}) {
    this.latitude = value.latitude ?? 0;
    this.longitude = value.longitude ?? 0;
    this.latitudeDelta = value.latitudeDelta ?? 0;
    this.longitudeDelta = value.longitudeDelta ?? 0;
    this._listeners = new Set();
    this._frame = null;
  }
  addListener(fn) {
    this._listeners.add(fn);
    return fn;
  }
  removeListener(fn) {
    this._listeners.delete(fn);
  }
  _emit() {
    for (const fn of this._listeners) fn({ latitude: this.latitude, longitude: this.longitude });
  }
  setValue(value) {
    this.stopAnimation();
    Object.assign(this, pickRegion(value));
    this._emit();
  }
  stopAnimation(cb) {
    if (this._frame != null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(this._frame);
    this._frame = null;
    if (cb) cb({ latitude: this.latitude, longitude: this.longitude });
  }
  timing(config = {}) {
    const self = this;
    return {
      start(done) {
        self.stopAnimation();
        const from = { latitude: self.latitude, longitude: self.longitude };
        const to = { latitude: config.latitude ?? from.latitude, longitude: config.longitude ?? from.longitude };
        const duration = Math.max(0, config.duration ?? 500);
        const ease = typeof config.easing === "function" ? config.easing : Easing.inOut(Easing.ease);
        if (typeof requestAnimationFrame !== "function" || duration === 0) {
          Object.assign(self, to);
          self._emit();
          if (done) done({ finished: true });
          return;
        }
        const t0 = Date.now();
        const step = () => {
          const t = Math.min(1, (Date.now() - t0) / duration);
          const k = ease(t);
          self.latitude = from.latitude + (to.latitude - from.latitude) * k;
          self.longitude = from.longitude + (to.longitude - from.longitude) * k;
          self._emit();
          if (t < 1) self._frame = requestAnimationFrame(step);
          else {
            self._frame = null;
            if (done) done({ finished: true });
          }
        };
        self._frame = requestAnimationFrame(step);
      },
      stop: () => self.stopAnimation(),
    };
  }
  spring(config) {
    return this.timing(config);
  }
}

function pickRegion(v = {}) {
  const out = {};
  for (const k of ["latitude", "longitude", "latitudeDelta", "longitudeDelta"]) if (typeof v[k] === "number") out[k] = v[k];
  return out;
}

// --- MapView --------------------------------------------------------------------------------------------

const MapView = React.forwardRef(function MapView(props, ref) {
  const host = React.useRef(null);
  const [ctx, setCtx] = React.useState(null);
  const [refused, setRefused] = React.useState(authFailed);
  const latest = React.useRef(props);
  latest.current = props;
  const pending = React.useRef(null);
  const readyFired = React.useRef(false);

  const fireReady = () => {
    if (readyFired.current) return;
    readyFired.current = true;
    if (latest.current.onMapReady) latest.current.onMapReady();
  };

  React.useEffect(() => onAuthFailure(() => setRefused(true)), []);

  React.useEffect(() => {
    let alive = true;
    const listeners = [];
    loadGoogle().then(
      (google) => {
        const el = host.current;
        if (!alive || !el) return;
        const p = latest.current;
        const region = p.initialRegion || p.region || { latitude: -17.8292, longitude: 31.0522, latitudeDelta: 0.12, longitudeDelta: 0.12 };
        const locked = p.scrollEnabled === false || p.zoomEnabled === false;
        const map = new google.maps.Map(el, {
          center: toLatLng(region),
          zoom: zoomForRegion(region, el.clientWidth, el.clientHeight),
          disableDefaultUI: true,
          clickableIcons: false,
          keyboardShortcuts: false,
          gestureHandling: locked ? "none" : "greedy",
        });
        listeners.push(
          map.addListener("click", (e) => {
            if (e.latLng && latest.current.onPress) latest.current.onPress({ nativeEvent: { coordinate: fromLatLng(e.latLng) } });
          }),
          map.addListener("idle", () => {
            fireReady();
            const b = map.getBounds();
            if (b && latest.current.onRegionChangeComplete) latest.current.onRegionChangeComplete(regionFromBounds(fromLatLng(b.getSouthWest()), fromLatLng(b.getNorthEast())), { isGesture: true });
          }),
          google.maps.event.addListenerOnce(map, "tilesloaded", () => {
            if (latest.current.onMapLoaded) latest.current.onMapLoaded();
          }),
        );
        setCtx({ google, map });
      },
      () => {
        // No key or a refused key: stay the grey panel, but never leave a screen waiting on the map.
        if (alive) fireReady();
      },
    );
    return () => {
      alive = false;
      for (const l of listeners) l.remove();
    };
  }, []);

  const camera = React.useMemo(() => {
    const run = (op) => {
      if (ctx) op(ctx);
      else pending.current = op; // only the latest framing matters
    };
    return {
      fitToCoordinates(coords = [], opts = {}) {
        run(({ google, map }) => {
          if (coords.length === 0) return;
          if (coords.length === 1) {
            map.panTo(toLatLng(coords[0]));
            map.setZoom(16);
            return;
          }
          const bounds = new google.maps.LatLngBounds();
          for (const c of coords) bounds.extend(toLatLng(c));
          map.fitBounds(bounds, opts.edgePadding || 40);
        });
      },
      fitToSuppliedMarkers() {},
      fitToElements() {},
      animateToRegion(region) {
        run(({ map }) => {
          const el = host.current;
          map.panTo(toLatLng(region));
          if (region.latitudeDelta && region.longitudeDelta) map.setZoom(Math.round(zoomForRegion(region, el ? el.clientWidth : 0, el ? el.clientHeight : 0)));
        });
      },
      animateCamera(cam = {}) {
        run(({ map }) => {
          if (cam.center) map.panTo(toLatLng(cam.center));
          if (typeof cam.zoom === "number") map.setZoom(cam.zoom);
        });
      },
      setCamera(cam = {}) {
        run(({ map }) => {
          if (cam.center) map.setCenter(toLatLng(cam.center));
          if (typeof cam.zoom === "number") map.setZoom(cam.zoom);
        });
      },
      getCamera: () =>
        Promise.resolve(
          ctx ? { center: fromLatLng(ctx.map.getCenter()), zoom: ctx.map.getZoom(), heading: 0, pitch: 0 } : { center: { latitude: 0, longitude: 0 }, zoom: 0, heading: 0, pitch: 0 },
        ),
      getMapBoundaries: () => {
        const b = ctx && ctx.map.getBounds();
        return Promise.resolve(b ? { northEast: fromLatLng(b.getNorthEast()), southWest: fromLatLng(b.getSouthWest()) } : { northEast: { latitude: 0, longitude: 0 }, southWest: { latitude: 0, longitude: 0 } });
      },
    };
  }, [ctx]);

  React.useImperativeHandle(ref, () => camera, [camera]);

  React.useEffect(() => {
    if (ctx && pending.current) {
      const op = pending.current;
      pending.current = null;
      op(ctx);
    }
  }, [ctx]);

  return React.createElement(
    View,
    { style: [{ backgroundColor: GREY, overflow: "hidden" }, props.style], accessibilityLabel: props.accessibilityLabel },
    // Google owns this node's children; React renders nothing into it.
    React.createElement(View, { ref: host, style: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, opacity: refused ? 0 : 1 } }),
    React.createElement(MapContext.Provider, { value: refused ? null : ctx }, props.children),
  );
});

// --- Markers --------------------------------------------------------------------------------------------

/** A Google overlay that places one DOM node on the map, anchored like a react-native-maps marker. */
function createOverlay(google, el, getState) {
  class MarkerOverlay extends google.maps.OverlayView {
    onAdd() {
      this.getPanes().overlayMouseTarget.appendChild(el);
    }
    draw() {
      const projection = this.getProjection();
      const { coordinate, anchor } = getState();
      if (!projection || !coordinate) return;
      const p = projection.fromLatLngToDivPixel(new google.maps.LatLng(coordinate.latitude, coordinate.longitude));
      if (!p) return;
      const { left, top } = anchorOffset(p.x, p.y, el.offsetWidth, el.offsetHeight, anchor);
      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
    }
    onRemove() {
      if (el.parentNode) el.parentNode.removeChild(el);
    }
  }
  return new MarkerOverlay();
}

function DefaultPin({ color }) {
  return React.createElement(
    View,
    { style: { alignItems: "center" } },
    React.createElement(View, { style: { width: 22, height: 22, borderRadius: 11, backgroundColor: color || "#E53935", borderWidth: 3, borderColor: "#FFFFFF" } }),
    React.createElement(View, { style: { width: 3, height: 8, backgroundColor: color || "#E53935" } }),
  );
}

function Marker(props) {
  const ctx = React.useContext(MapContext);
  const [el] = React.useState(() => (typeof document !== "undefined" ? document.createElement("div") : null));
  const state = React.useRef({});
  const overlay = React.useRef(null);
  const animated = props.coordinate && typeof props.coordinate.addListener === "function" ? props.coordinate : null;
  state.current.coordinate = animated ? { latitude: animated.latitude, longitude: animated.longitude } : props.coordinate;
  state.current.anchor = props.anchor || (props.children ? { x: 0.5, y: 0.5 } : { x: 0.5, y: 1 });
  const latest = React.useRef(props);
  latest.current = props;

  React.useEffect(() => {
    if (!ctx || !el) return undefined;
    el.style.position = "absolute";
    el.style.cursor = "pointer";
    // A finger on a pin drags the pin (or taps it); it must not scroll the page or pan the map.
    el.style.touchAction = "none";
    const o = createOverlay(ctx.google, el, () => state.current);
    o.setMap(ctx.map);
    overlay.current = o;
    const redraw = () => o.draw();
    const resize = typeof ResizeObserver === "function" ? new ResizeObserver(redraw) : null;
    if (resize) resize.observe(el);
    return () => {
      if (resize) resize.disconnect();
      o.setMap(null);
      overlay.current = null;
    };
  }, [ctx, el]);

  // Follow an AnimatedRegion frame by frame, a plain coordinate on every change.
  React.useEffect(() => {
    if (!animated) return undefined;
    const fn = animated.addListener((c) => {
      state.current.coordinate = c;
      if (overlay.current) overlay.current.draw();
    });
    return () => animated.removeListener(fn);
  }, [animated]);
  React.useEffect(() => {
    if (overlay.current) overlay.current.draw();
  });

  // Tap and drag.
  React.useEffect(() => {
    if (!ctx || !el) return undefined;
    el.style.zIndex = String(props.zIndex ?? 1);
    let drag = null;
    const toCoordinate = (ev) => {
      const projection = overlay.current && overlay.current.getProjection();
      const rect = ctx.map.getDiv().getBoundingClientRect();
      const ll = projection && projection.fromContainerPixelToLatLng(new ctx.google.maps.Point(ev.clientX - rect.left, ev.clientY - rect.top));
      return ll ? fromLatLng(ll) : null;
    };
    const down = (ev) => {
      ev.stopPropagation();
      if (!latest.current.draggable) return;
      drag = { moved: false };
      ctx.map.setOptions({ gestureHandling: "none" });
      if (el.setPointerCapture) el.setPointerCapture(ev.pointerId);
    };
    const move = (ev) => {
      if (!drag) return;
      const c = toCoordinate(ev);
      if (!c) return;
      drag.moved = true;
      state.current.coordinate = c;
      overlay.current.draw();
    };
    const up = (ev) => {
      ev.stopPropagation();
      if (drag) {
        ctx.map.setOptions({ gestureHandling: "greedy" });
        const moved = drag.moved;
        drag = null;
        if (moved && latest.current.onDragEnd) {
          latest.current.onDragEnd({ nativeEvent: { coordinate: state.current.coordinate } });
          return;
        }
      }
      if (latest.current.onPress) latest.current.onPress({ nativeEvent: { coordinate: state.current.coordinate } });
    };
    const swallow = (ev) => ev.stopPropagation();
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("click", swallow);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("click", swallow);
    };
  }, [ctx, el, props.zIndex]);

  if (!ctx || !el) return null;
  return createPortal(props.children || React.createElement(DefaultPin, { color: props.pinColor }), el);
}

// --- Shapes ---------------------------------------------------------------------------------------------

function useShape(make, deps) {
  const ctx = React.useContext(MapContext);
  React.useEffect(() => {
    if (!ctx) return undefined;
    const shape = make(ctx.google, ctx.map);
    return () => shape.setMap(null);
  }, [ctx, ...deps]);
}

function Polyline(props) {
  const path = (props.coordinates || []).map(toLatLng);
  const key = JSON.stringify([path, props.strokeColor, props.strokeWidth, props.lineDashPattern, props.zIndex]);
  useShape((google, map) => {
    const { color, opacity } = toGoogleColour(props.strokeColor);
    const weight = props.strokeWidth ?? 1;
    const dash = dashSpec(props.lineDashPattern);
    const options = { map, path, strokeColor: color, strokeOpacity: dash ? 0 : opacity, strokeWeight: weight, zIndex: props.zIndex, clickable: false };
    if (dash) {
      options.icons = [
        {
          icon: { path: "M 0,-1 0,1", strokeColor: color, strokeOpacity: opacity, strokeWeight: weight, scale: Math.max(1, dash.dashPx / 2) },
          offset: "0",
          repeat: `${dash.repeatPx}px`,
        },
      ];
    }
    return new google.maps.Polyline(options);
  }, [key]);
  return null;
}

function Circle(props) {
  const key = JSON.stringify([props.center, props.radius, props.fillColor, props.strokeColor, props.strokeWidth, props.zIndex]);
  useShape((google, map) => {
    const fill = toGoogleColour(props.fillColor, "#000000");
    const stroke = toGoogleColour(props.strokeColor);
    return new google.maps.Circle({
      map,
      center: toLatLng(props.center),
      radius: props.radius,
      fillColor: fill.color,
      fillOpacity: props.fillColor ? fill.opacity : 0,
      strokeColor: stroke.color,
      strokeOpacity: stroke.opacity,
      strokeWeight: props.strokeWidth ?? 1,
      zIndex: props.zIndex,
      clickable: false,
    });
  }, [key]);
  return null;
}

const Nothing = () => null;

module.exports = {
  __esModule: true,
  default: MapView,
  MapView,
  Marker,
  MarkerAnimated: Marker,
  Polyline,
  Circle,
  Callout: Nothing,
  Polygon: Nothing,
  Overlay: Nothing,
  AnimatedRegion,
  PROVIDER_GOOGLE: "google",
  PROVIDER_DEFAULT: undefined,
};
