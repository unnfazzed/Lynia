import React from "react";
import { AppBar, EmptyState, emptyCopy, fillEmpty } from "../index";

const RETRY_EVERY_S = 10;

/**
 * Calls `onRetry` every 10 s while mounted and returns the seconds left to the next try, for the
 * "Trying again in {s} s" line. Rider screens retry by themselves rather than offer a button.
 */
export function useAutoRetry(onRetry: () => void, everyS = RETRY_EVERY_S): number {
  const [left, setLeft] = React.useState(everyS);
  const retryRef = React.useRef(onRetry);
  retryRef.current = onRetry;
  React.useEffect(() => {
    const iv = setInterval(() => {
      setLeft((s) => {
        if (s > 1) return s - 1;
        retryRef.current();
        return everyS;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [everyS]);
  return left;
}

/**
 * A rider job screen whose READ failed with nothing cached: "Something went wrong" in the empty-states
 * v2 error tone (handoff `empty-states-v2-2026-10`, D-78). A failed read never touches the order
 * server-side, so the job the rider carries is exactly where they left it.
 *
 * Rider screens never show a Retry button (rider-v2 README: "say what the app is doing"), so the screen
 * retries by itself every 10 s and its one line counts down to the next try. Back lives in the app bar.
 */
export function RiderErrorState({
  onRetry,
  retrying,
  onBack,
  title = "Something went wrong",
}: {
  onRetry: () => void;
  retrying?: boolean;
  onBack: () => void;
  title?: string;
}): React.ReactElement {
  const left = useAutoRetry(onRetry);
  return (
    <>
      <AppBar onBack={onBack} />
      <EmptyState icon="circle-alert" tone="error" title={title} body={retrying ? "Trying again…" : fillEmpty(emptyCopy.rider.retrying, { s: left })} />
    </>
  );
}
