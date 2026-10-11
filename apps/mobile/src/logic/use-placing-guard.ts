import { useNavigation } from "expo-router";
import { useCallback, useEffect, useRef } from "react";
import { BackHandler } from "react-native";

/** The slice of the navigation object the guard uses (`beforeRemove` is the native-stack event). */
interface GuardedNavigation {
  setOptions: (o: { gestureEnabled: boolean }) => void;
  addListener: (event: "beforeRemove", cb: (e: { preventDefault: () => void }) => void) => () => void;
}

/**
 * P0-3 (navigation review 2026-08-12): hold the customer on an irreversible in-flight beat.
 *
 * The food-checkout "placing" screen promises "Don't close the app. If this fails, nothing is ordered
 * and nothing is paid." — but nothing enforced it: the screen drew no controls yet Android hardware-
 * back and the iOS swipe-back gesture still popped it, dropping the customer onto the just-cleared cart
 * while the placeFoodOrder mutation was still in flight (and the resolved promise then yanked the now-
 * global router forward). While `active` is true this:
 *   - swallows the Android hardware-back press (the handler returns `true`),
 *   - disables the native-stack swipe-back gesture (`gestureEnabled: false`), and
 *   - U24 (reviewed list 2026-10-07): blocks every other removal of the screen (`beforeRemove`) — the web's
 *     browser Back, which neither of the above sees, popped Review mid-place and the order was never shown.
 * All are lifted the moment `active` goes false, so normal back behaviour resumes once placing ends.
 *
 * Returns `release()`: the screen's own navigation away once the work is done (the order screen replacing
 * the stack) calls it first, so the guard doesn't block the very exit it was holding the customer for.
 *
 * Generic on purpose — any screen with a brief non-abortable mutation can reuse it.
 */
export function usePlacingGuard(active: boolean): () => void {
  const navigation = useNavigation() as unknown as GuardedNavigation;
  const released = useRef(false);
  useEffect(() => {
    navigation.setOptions({ gestureEnabled: !active });
    if (!active) return;
    released.current = false;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => true);
    const off = navigation.addListener("beforeRemove", (e) => {
      if (!released.current) e.preventDefault();
    });
    return () => {
      sub.remove();
      off();
    };
  }, [active, navigation]);
  return useCallback(() => {
    released.current = true;
  }, []);
}
