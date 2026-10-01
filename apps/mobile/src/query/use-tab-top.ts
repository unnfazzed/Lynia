import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useWindowDimensions } from "react-native";
import { getMe } from "../api/auth";
import { greetingFor } from "../logic/greeting";
import { useNow } from "../logic/use-now";
import { useReachability } from "../net/use-reachability";
import { useNotificationsUnreadCount } from "./use-notifications-unread";
import { RF } from "../ui/rider/copy";

/** Under 340dp the greeting drops to 18 and the sun/moon sticker hides (Rider v2 MintTop). */
export const NARROW_DP = 340;

/**
 * The shared inputs of the Rider v2 mint top card on a tab root (Jobs, Money, Account on both sides):
 * one-line time-aware greeting with the first name, sun/moon, unread dot, bell route, narrow flag and
 * the honest connection state (reachability; the Jobs board passes its own socket state instead).
 */
export function useTabTop(): {
  greeting: string;
  evening: boolean;
  unread: boolean;
  onBell: () => void;
  narrow: boolean;
  online: boolean;
} {
  const router = useRouter();
  const clock = useNow();
  const { width } = useWindowDimensions();
  const reachable = useReachability();
  const unreadCount = useNotificationsUnreadCount();
  const me = useQuery({ queryKey: ["me"], queryFn: getMe }).data;
  const g = greetingFor(clock);
  const first = (me?.firstName ?? "").trim().split(/\s+/)[0] || null;
  return {
    greeting: RF.greeting(g.phrase, first),
    evening: g.evening,
    unread: unreadCount > 0,
    onBell: () => router.push("/notifications"),
    narrow: width < NARROW_DP,
    online: reachable,
  };
}
