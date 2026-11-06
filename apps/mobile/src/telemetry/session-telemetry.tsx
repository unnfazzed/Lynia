import { useSegments } from "expo-router";
import { useEffect } from "react";
import { useDeviceTelemetry } from "./device-props";
import { noteScreen, startRestartWatch } from "./restart-watch";
import { noteStallScreen, startStallWatch } from "./stall-watch";

/**
 * The root's always-on telemetry leaf (renders nothing): the device facts every event carries
 * (device-props.ts), the unclean-restart marker (restart-watch.ts) and the JS-stall watch
 * (stall-watch.ts). Separate from ScreenTracker, which mounts only once PostHog has loaded; these must
 * run without a key too, so their reports wait in the event queue. Its own leaf, so its updates
 * re-render nothing else.
 */
export function SessionTelemetry(): null {
  useDeviceTelemetry();
  const segments = useSegments();
  const screen = `/${segments.join("/")}`;
  useEffect(() => {
    void startRestartWatch();
    startStallWatch();
  }, []);
  useEffect(() => {
    noteScreen(screen);
    noteStallScreen(screen);
  }, [screen]);
  return null;
}
