import { tokens } from "@lynia/shared/tokens";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Notifications from "expo-notifications";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { AppState, FlatList, Linking, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getMe } from "../../src/api/auth";
import { dismissNotification, getNotificationsFeed, markNotificationsRead, type NotificationRow } from "../../src/api/notifications";
import { getActiveOrder } from "../../src/api/orders";
import { setOnline } from "../../src/api/riders";
import { becomeStateFor } from "../../src/logic/become-state";
import { useNow } from "../../src/logic/use-now";
import { notificationRowDestination } from "../../src/push/push";
import { riderModeAvailable } from "../../src/rider-mode";
import { AppScreen } from "../../src/ui";
import { N, NF } from "../../src/ui/notifications/copy";
import { NCard, Day, NEmpty, NFail, NRow, OffRow, OtherSide, SkelDay, SkelRow, SwipeRow } from "../../src/ui/notifications/kit";
import { buildFeed, clockOf, type NItem, type Side } from "../../src/ui/notifications/model";
import { CtaButton } from "../../src/ui/order/kit";
import { RToast } from "../../src/ui/rider/board";
import { RIDER_COPY as R, RF } from "../../src/ui/rider/copy";
import { MSheet, PushHeader } from "../../src/ui/rider/kit";
import { Notice } from "../../src/ui/send/kit";

/**
 * Notifications (customer + rider, one screen) — Notifications v1, `packages/design/handoff/notifications-v1/`
 * (ledger D-66). Replaces the August screen (gallery `LJ.notifications` / `LJ.notif_empty`, retired).
 *
 * The pushed-screen header, then a surface page of white r16 cards: an optional notifications-off row
 * (N6), the other side's row for dual-role users (N4), danger items in force pinned in a danger card
 * (N1c / N3), and the day groups (N1) — one row per order with its timeline behind the bead line (N2),
 * needs-you buttons (N5), swipe to remove with Undo (N7). Loading (N9), slow (N9b), empty (N8) and
 * couldn't-load / couldn't-refresh (N10 / N10b). The view-model is `src/ui/notifications/model.ts`.
 *
 * The side comes from the route (`?side=rider` from the rider app); account and safety rows show on
 * both sides.
 */

/** README "Network": skeletons for up to 6 s, then "Slow connection. Still loading…". */
const SLOW_MS = 6_000;
/** README "Swipe": the toast stays 5 s; the dismissal is sent only when it expires. */
const UNDO_MS = 5_000;

type ListEntry =
  | { kind: "off" }
  | { kind: "other"; sub: string }
  | { kind: "stale"; text: string }
  | { kind: "pinned"; items: NItem[] }
  | { kind: "day"; key: string; label: string; items: NItem[] };

export default function NotificationsScreen(): React.ReactElement {
  const router = useRouter();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ side?: string }>();
  const side: Side = params.side === "rider" ? "rider" : "customer";
  const rider = side === "rider";
  const now = useNow();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const pad = width < 340 ? 12 : 16;

  const feedQ = useQuery({ queryKey: ["notifications"], queryFn: getNotificationsFeed });
  // Array.isArray, not `?? []`: a malformed 200 body is a truthy non-array (CF-04 sibling).
  const rows: NotificationRow[] = Array.isArray(feedQ.data) ? feedQ.data : [];
  const me = useQuery({ queryKey: ["me"], queryFn: getMe }).data;
  const dualRole = !!me && becomeStateFor(me) === "toggle" && riderModeAvailable();

  // README "Read state": opening the screen marks everything read on the server; the rows that were new
  // keep their dot until the user leaves. The set is collected from every fetch during this visit, so a
  // refetch that comes back `unread: false` (the watermark is already stamped) can't erase a dot early.
  const [visitUnread, setVisitUnread] = React.useState<ReadonlySet<string>>(() => new Set());
  React.useEffect(() => {
    const fresh = rows.filter((r) => r.unread && !visitUnread.has(r.id));
    if (fresh.length) setVisitUnread((prev) => new Set([...prev, ...fresh.map((r) => r.id)]));
  }, [rows, visitUnread]);
  useFocusEffect(
    React.useCallback(() => {
      void markNotificationsRead()
        .then(() => qc.invalidateQueries({ queryKey: ["notifications-unread-count"] }))
        .catch(() => undefined);
      return () => setVisitUnread(new Set());
    }, [qc]),
  );

  // N6: the phone's notification permission. Re-checked on focus and when the app comes back.
  const [notifOff, setNotifOff] = React.useState(false);
  const readPermission = React.useCallback(() => {
    void Notifications.getPermissionsAsync()
      .then((p) => setNotifOff(!p.granted))
      .catch(() => undefined);
  }, []);
  useFocusEffect(readPermission);
  React.useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") readPermission();
    });
    return () => sub.remove();
  }, [readPermission]);

  // N9b: "Slow connection" after 6 s of first load.
  const [slow, setSlow] = React.useState(false);
  React.useEffect(() => {
    if (!feedQ.isLoading) {
      setSlow(false);
      return;
    }
    const t = setTimeout(() => setSlow(true), SLOW_MS);
    return () => clearTimeout(t);
  }, [feedQ.isLoading]);

  // N7: swipe to remove. The rows hide at once; the dismissal is sent when the toast expires (or the
  // user leaves), so Undo never needs a second round trip. A dismissal that fails puts the rows back.
  const [hidden, setHidden] = React.useState<ReadonlySet<string>>(() => new Set());
  const [pending, setPending] = React.useState<string[] | null>(null);
  const pendingRef = React.useRef<string[] | null>(null);
  const commit = React.useCallback(
    (ids: string[]) => {
      void Promise.all(ids.map((id) => dismissNotification(id)))
        .then(() => {
          qc.setQueryData<NotificationRow[]>(["notifications"], (prev) => (Array.isArray(prev) ? prev.filter((r) => !ids.includes(r.id)) : prev));
          return qc.invalidateQueries({ queryKey: ["notifications-unread-count"] });
        })
        .catch(() => undefined)
        .finally(() =>
          setHidden((prev) => {
            const next = new Set(prev);
            ids.forEach((id) => next.delete(id));
            return next;
          }),
        );
    },
    [qc],
  );
  React.useEffect(() => {
    if (!pending) return;
    const t = setTimeout(() => {
      pendingRef.current = null;
      setPending(null);
      commit(pending);
    }, UNDO_MS);
    return () => clearTimeout(t);
  }, [pending, commit]);
  // Leaving the screen with a removal still undoable sends it (the toast is gone with the screen).
  React.useEffect(
    () => () => {
      if (pendingRef.current) commit(pendingRef.current);
    },
    [commit],
  );
  const remove = (item: NItem): void => {
    if (pendingRef.current) commit(pendingRef.current);
    pendingRef.current = item.ids;
    setPending(item.ids);
    setHidden((prev) => new Set([...prev, ...item.ids]));
  };
  const undo = (): void => {
    const ids = pendingRef.current;
    pendingRef.current = null;
    setPending(null);
    if (!ids) return;
    setHidden((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
  };

  const [open, setOpen] = React.useState<Record<string, boolean>>({});
  const [switching, setSwitching] = React.useState(false);

  const feed = buildFeed(rows, { side, now, unreadIds: visitUnread, hidden, dest: notificationRowDestination });

  const entries: ListEntry[] = [];
  if (notifOff) entries.push({ kind: "off" });
  if (feedQ.isError && rows.length > 0) entries.push({ kind: "stale", text: NF.stale(clockOf(new Date(feedQ.dataUpdatedAt).toISOString())) });
  if (dualRole && feed.other) entries.push({ kind: "other", sub: NF.otherSub(feed.other.count, feed.other.what) });
  if (feed.pinned.length) entries.push({ kind: "pinned", items: feed.pinned });
  for (const d of feed.days) entries.push({ kind: "day", ...d });

  const rowsOf = (items: NItem[]): React.ReactElement[] =>
    items.map((item, i) => (
      <SwipeRow key={item.key} first={i === 0} onRemove={() => remove(item)}>
        <NRow
          item={item}
          first
          open={!!open[item.key]}
          onToggle={() => setOpen((o) => ({ ...o, [item.key]: !o[item.key] }))}
          onPress={() => router.push(item.to)}
          onAction={() => (item.action ? router.push(item.action.to) : undefined)}
        />
      </SwipeRow>
    ));

  const renderEntry = ({ item: e }: { item: ListEntry }): React.ReactElement => {
    switch (e.kind) {
      case "off":
        return <OffRow rider={rider} onTurnOn={() => void Linking.openSettings().catch(() => undefined)} />;
      case "stale":
        return <Notice icon="wifi-off" text={e.text} />;
      case "other":
        return <OtherSide rider={rider} sub={e.sub} onPress={() => (rider ? setSwitching(true) : router.replace("/rider"))} />;
      case "pinned":
        return <NCard danger>{rowsOf(e.items)}</NCard>;
      case "day":
        return (
          <View style={{ gap: 10 }}>
            <Day>{e.label}</Day>
            <NCard>{rowsOf(e.items)}</NCard>
          </View>
        );
    }
  };

  const header = <PushHeader title={N.title} onBack={() => router.back()} />;
  const page = { paddingTop: 12, paddingHorizontal: pad, paddingBottom: 88 + insets.bottom, gap: 10 };

  let body: React.ReactElement;
  if (feedQ.isLoading) {
    body = (
      <View style={page} accessibilityLabel={N.slow} accessibilityState={{ busy: true }}>
        <SkelDay w={54} />
        <NCard>
          {(["58%", "44%", "66%", "50%"] as const).map((w, i) => (
            <SkelRow key={i} first={i === 0} w={w} />
          ))}
        </NCard>
        <SkelDay w={72} />
        <NCard>
          {(["52%", "62%"] as const).map((w, i) => (
            <SkelRow key={i} first={i === 0} w={w} />
          ))}
        </NCard>
        {slow ? (
          <Text accessibilityLiveRegion="polite" style={{ textAlign: "center", fontSize: 13, color: tokens.color.muted, marginTop: 4 }}>
            {N.slow}
          </Text>
        ) : null}
      </View>
    );
  } else if (feedQ.isError && rows.length === 0) {
    body = <NFail onRetry={() => void feedQ.refetch()} />;
  } else if (entries.every((e) => e.kind !== "day" && e.kind !== "pinned")) {
    body = (
      <View style={page}>
        {entries.map((e, i) => (
          <React.Fragment key={i}>{renderEntry({ item: e })}</React.Fragment>
        ))}
        <NEmpty rider={rider} onSend={() => router.push("/send")} />
      </View>
    );
  } else {
    // B-O1: a FlatList (one item per day group), so only the groups on screen are mounted.
    body = (
      <FlatList
        data={entries}
        keyExtractor={(e, i) => (e.kind === "day" ? e.key : `${e.kind}-${i}`)}
        renderItem={renderEntry}
        contentContainerStyle={page}
        showsVerticalScrollIndicator={false}
      />
    );
  }

  return (
    <AppScreen banner={header} bg={tokens.color.surface}>
      {body}
      {pending ? (
        <View style={{ position: "absolute", left: 12, right: 12, bottom: 16 + insets.bottom }}>
          <RToast icon="trash" text={N.removed} action={N.undo} actionIcon="undo-2" onAction={undo} />
        </View>
      ) : null}
      {rider ? <SwitchToCustomer visible={switching} onClose={() => setSwitching(false)} /> : null}
    </AppScreen>
  );
}

/**
 * The rider's C4 / C5 switch sheet (Rider v2, as on the rider Account tab): with a job running the job
 * keeps going and the rider stays online for it; otherwise going to the customer side takes them offline.
 */
function SwitchToCustomer({ visible, onClose }: { visible: boolean; onClose: () => void }): React.ReactElement {
  const router = useRouter();
  const activeQ = useQuery({ queryKey: ["activeJob"], queryFn: getActiveOrder, enabled: visible });
  const activeJob = activeQ.data && activeQ.data.status !== "cancelled" ? activeQ.data : null;
  const offlineM = useMutation({ mutationFn: () => setOnline(false) });
  const goCustomer = (): void => {
    if (!activeJob) offlineM.mutate();
    onClose();
    router.replace("/home");
  };
  const backToJob = (): void => {
    onClose();
    router.push(activeJob?.orderType === "merchant" ? "/rider/food-job" : "/rider/job");
  };
  return (
    <MSheet
      visible={visible}
      onClose={onClose}
      icon={activeJob ? "package" : "arrow-left-right"}
      iconTone={activeJob ? "ok" : "calm"}
      title={activeJob ? R.swJobT : R.swT}
      body={activeJob ? RF.swJobB(activeJob.pickup.landmark, activeJob.dropoff.landmark) : R.swB}
      buttons={
        activeJob ? (
          <>
            <CtaButton label={R.swGo} icon="arrow-left-right" onPress={goCustomer} />
            <CtaButton ghost label={R.swJobBack} onPress={backToJob} />
          </>
        ) : (
          <>
            <CtaButton label={R.swGo} onPress={goCustomer} />
            <CtaButton ghost label={R.swStay} onPress={onClose} />
          </>
        )
      }
    />
  );
}
