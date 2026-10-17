import { useSegments } from "expo-router";
import { useEffect } from "react";
import { useDeviceTelemetry } from "./device-props";
import { noteScreen, startRestartWatch } from "./restart-watch";

/**
 * The root's always-on telemetry leaf (renders nothing): the device facts every event carries
 * (device-props.ts) and the unclean-restart marker (restart-watch.ts). Separate from ScreenTracker,
 * which mounts only once PostHog has loaded; the restart marker must run without a key too, so a
 * restart is still recorded for the event queue. Its own leaf, so its updates re-render nothing else.
 */
export function SessionTelemetry(): null {
  useDeviceTelemetry();
  const segments = useSegments();
  const screen = `/${segments.join("/")}`;
  useEffect(() => {
    void startRestartWatch();
  }, []);
  useEffect(() => {
    noteScreen(screen);
  }, [screen]);
  return null;
}
