import { tokens } from "@lynia/shared/tokens";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect, useRouter } from "expo-router";
import React from "react";
import { SafeAreaView, View } from "react-native";
import {
  dismissNotification,
  getNotificationsFeed,
  markNotificationsRead,
  type NotificationRow,
} from "../../src/api/notifications";
import { notificationRowDestination } from "../../src/push/push";
import { AppBar, Button, EmptyState, SkeletonList } from "../../src/ui";
import { NotificationsView, type NotificationItem } from "./notifications.view";

/**
 * Notifications centre (customer A·3) — the CONTAINER half of the codegen seam.
 *
 * The presentational tree lives in `./notifications.view.tsx`, GENERATED from the mock
 * (packages/design/explorations/journey/screens.jsx :: Notifications) and locked to it by the
 * structural-snapshot guardrail. The mock's `Notifications({ empty })` draws BOTH the populated feed
 * and the empty state under one shared header, forked by `empty` — so this container drives that one
 * `empty` prop (the empty branch is the LJ.notif_empty gallery screen). The mock lays the feed out as
 * `{items.map(row)}`; the generated view keeps the FlatList (B-O1) via the `FlatList ≡ map`
 * equivalence, so virtualization survives without reverting to a literal `.map`.
 *
 * The two live transient states the static mock never drew — a first-load skeleton and a fetch-error
 * retry — stay here as the container's own early-returns (they have no mock key to gate against),
 * exactly as the Help container keeps its un-mocked chrome outside the gated view.
 */

/**
 * A compact relative-time label for the feed (mockup A·3: "now", "2 min", "1 hr", "Yesterday").
 * Deterministic off the row's ISO time — no locale surprises. Falls back to a short date past a week.
 */
function fmtRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = Date.now() - then;
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return "now";
  if (min < 60) return `${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr`;
  const days = Math.floor(hr / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** The mock's header treatment (`Pad minHeight:0 paddingBottom:0` around the Top) reused for the two
 *  transient states the container renders itself, so the bar sits identically to the gated view. */
function TransientHeader({ onBack }: { onBack: () => void }): React.ReactElement {
  return (
    <View style={{ padding: tokens.space.screen, paddingBottom: 0 }}>
      <AppBar title="Notifications" onBack={onBack} />
    </View>
  );
}

export default function NotificationsScreen(): React.ReactElement {
  const router = useRouter();
  const qc = useQueryClient();
  const feedQ = useQuery({ queryKey: ["notifications"], queryFn: getNotificationsFeed });
  const feed = feedQ.data ?? [];
  const onBack = (): void => router.back();

  // STREAMLINE-01: stamp the read watermark when the screen gains focus. `unread` is now real per-user
  // read state on the server (Profile.notificationsReadAt), not the old "younger than 24h" recency
  // proxy — so this call is the ONLY thing that clears the dots, and opening the screen is the only
  // honest moment to claim the list was seen. Best-effort: a failed stamp just leaves the rows unread,
  // which is the safe direction to fail in.
  //
  // Only the unread-COUNT query is invalidated, deliberately. The `["notifications"]` rows keep the
  // `unread: true` they were fetched with for the rest of this visit, because those dots are the whole
  // point of the visit — they are what tells you WHICH rows are new, and re-fetching them to `false`
  // under the reader's eyes would erase that the instant it became useful. The watermark is already
  // stamped server-side, so the next mount fetches them read and the dots are gone then. The Account
  // row's "N new" hint means "unseen since your last visit", and you are visiting — so clearing it now
  // while the dots persist is coherent, not contradictory.
  useFocusEffect(
    React.useCallback(() => {
      void markNotificationsRead()
        .then(() => qc.invalidateQueries({ queryKey: ["notifications-unread-count"] }))
        .catch(() => undefined);
    }, [qc]),
  );

  // STREAMLINE-01: swipe-to-dismiss. The feed is derived server-side, so there is no row to delete —
  // the API records the dismissal against the row's synthetic id and filters it out of later reads.
  // Applied optimistically (the row must leave under the finger, not after a round-trip) and rolled
  // back if the write fails, so a dismissal that didn't stick reappears rather than silently hiding a
  // notification the server will keep sending.
  const onItemDismiss = React.useCallback(
    (index: number): void => {
      const row = feed[index];
      if (!row) return;
      qc.setQueryData<NotificationRow[]>(["notifications"], (prev) => (prev ?? []).filter((r) => r.id !== row.id));
      void dismissNotification(row.id)
        .then(() => qc.invalidateQueries({ queryKey: ["notifications-unread-count"] }))
        .catch(() => {
          // Put the row back BEFORE the refetch, not instead of it. The refetch is the real recovery,
          // but it usually fails for the same reason the dismissal did (no connectivity) — and a
          // refetch that also fails would leave the cache filtered, hiding a notification the server
          // never dismissed for the rest of the session. Re-inserted by time so it lands back where it
          // was, and only when absent, so a concurrent dismissal of a different row survives and an
          // in-flight refetch that already restored it can't produce a duplicate.
          qc.setQueryData<NotificationRow[]>(["notifications"], (prev) => {
            const rows = prev ?? [];
            if (rows.some((r) => r.id === row.id)) return rows;
            return [...rows, row].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
          });
          void feedQ.refetch();
        });
    },
    [feed, qc, feedQ],
  );

  if (feedQ.isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: tokens.color.bg }}>
        <TransientHeader onBack={onBack} />
        <View style={{ padding: tokens.space.screen, paddingTop: 4 }}>
          <SkeletonList />
        </View>
      </SafeAreaView>
    );
  }

  if (feedQ.isError) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: tokens.color.bg }}>
        <TransientHeader onBack={onBack} />
        <View style={{ padding: tokens.space.screen, paddingTop: 4 }}>
          <EmptyState icon="wifi-off" title="Couldn't load notifications" message="Check your connection and try again.">
            <Button label="Retry" onPress={() => void feedQ.refetch()} />
          </EmptyState>
        </View>
      </SafeAreaView>
    );
  }

  // The data seam: map the live feed onto the mock's `{ icon, t, m, w, unread }` row shape, keeping
  // the `id` the FlatList keys by. onItemPress resolves the row index back to the live feed row so a
  // tap opens the order it's about (KB-FEED-SYNTH / BH-18: notificationRowDestination owns the rules).
  const items: NotificationItem[] = feed.map((r) => ({
    id: r.id,
    icon: r.icon,
    t: r.title,
    m: r.message,
    w: fmtRelative(r.at),
    unread: r.unread,
  }));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: tokens.color.bg }}>
      <NotificationsView
        items={items}
        empty={feed.length === 0}
        onBack={onBack}
        onItemPress={(i) => {
          const row = feed[i];
          if (row) router.push(notificationRowDestination(row));
        }}
        onItemDismiss={onItemDismiss}
      />
    </SafeAreaView>
  );
}
