import { useNavigation } from "expo-router";
import { useEffect } from "react";
import { BackHandler } from "react-native";

/**
 * P0-3 (navigation review 2026-08-12): hold the customer on an irreversible in-flight beat.
 *
 * The food-checkout "placing" screen promises "Don't close the app. If this fails, nothing is ordered
 * and nothing is paid." — but nothing enforced it: the screen drew no controls yet Android hardware-
 * back and the iOS swipe-back gesture still popped it, dropping the customer onto the just-cleared cart
 * while the placeFoodOrder mutation was still in flight (and the resolved promise then yanked the now-
 * global router forward). While `active` is true this:
 *   - swallows the Android hardware-back press (the handler returns `true`), and
 *   - disables the native-stack swipe-back gesture (`gestureEnabled: false`).
 * Both are lifted the moment `active` goes false, so normal back behaviour resumes once placing ends.
 *
 * Generic on purpose — any screen with a brief non-abortable mutation can reuse it.
 */
export function usePlacingGuard(active: boolean): void {
  const navigation = useNavigation();
  useEffect(() => {
    navigation.setOptions({ gestureEnabled: !active });
    if (!active) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => sub.remove();
  }, [active, navigation]);
}
