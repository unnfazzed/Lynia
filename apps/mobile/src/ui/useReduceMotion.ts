import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/** Live-auction: OS reduce-motion preference, so the bid entrance animation degrades to instant. */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((r) => {
      if (alive) setReduce(r);
    });
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduce);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduce;
}
