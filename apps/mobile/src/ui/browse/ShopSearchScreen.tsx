import type { ShopService } from "@lynia/shared";
import { tokens } from "@lynia/shared/tokens";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { shopVenue, type VenueView } from "../../logic/browse";
import { useHomeLocation } from "../../logic/home-location";
import { formatMoney } from "../../logic/money";
import { useNow } from "../../logic/use-now";
import { useReachable } from "../../net/use-reachable";
import { useShopSearch } from "../../query/use-shops";
import { Icon } from "../Icon";
import { Tappable } from "../Tappable";
import { B } from "./copy";
import { EmptyState } from "../EmptyState";
import { emptyCopy, fillEmpty } from "../emptyCopy";
import { IconButton, OfflineRow, TABULAR, VenueImage } from "./kit";

/** The match in green-text (README §4 "Search"). */
function Marked({ text, q }: { text: string; q: string }): React.ReactElement {
  const at = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <Text style={{ color: tokens.color.accentText }}>{text.slice(at, at + q.length)}</Text>
      {text.slice(at + q.length)}
    </>
  );
}

function GroupLabel({ text }: { text: string }): React.ReactElement {
  return <Text style={{ paddingTop: 20, paddingHorizontal: 16, paddingBottom: 4, fontSize: 11.5, letterSpacing: 0.6, fontWeight: tokens.font.weight.bold, color: tokens.color.muted }}>{text}</Text>;
}

/** "30–40 min · $2.00 delivery · 2.4 km" — only the parts a location makes honest (README §3). */
function venueMeta(v: VenueView): string {
  const parts: string[] = [];
  if (v.etaLow != null && v.etaHigh != null) parts.push(`${v.etaLow}–${v.etaHigh} min`);
  if (v.feeUsd != null) parts.push(`${formatMoney(v.feeUsd)} delivery`);
  if (v.km != null) parts.push(`${v.km.toFixed(1)} km`);
  return parts.length > 0 ? parts.join(" · ") : v.sub;
}

/**
 * Search inside Shops or Pharmacy — Browse v2 X3 (`packages/design/handoff/browse-v2`, ledgers D-57 /
 * D-58) scoped to one section: PLACES (shop names) then ITEMS (catalogue items across its shops),
 * served by `GET /shops/search`. A place opens its storefront; an item opens the storefront it's in.
 * X4a no results, X4b offline.
 */
export function ShopSearchScreen({ service }: { service: ShopService }): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reachable = useReachable();
  const location = useHomeLocation();
  const now = useNow();
  const [query, setQuery] = useState("");
  const q = query.trim();
  const { data, isFetching } = useShopSearch(service, q, true);
  const s = B.svc[service];

  const places = useMemo(() => (data?.shops ?? []).map((x) => shopVenue(x, location.point, now)), [data, location.point, now]);
  const items = data?.items ?? [];
  const searched = q.length >= 2 && data != null;
  const idle = service === "pharmacy" ? emptyCopy.search.idlePharmacy : emptyCopy.search.idleShops;

  return (
    <View style={{ flex: 1, backgroundColor: tokens.color.bg, paddingTop: insets.top }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingTop: 4, paddingRight: 16, paddingBottom: 8, paddingLeft: 6 }}>
        <IconButton icon="chevron-left" size={22} label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace(`/${service}`))} />
        <View style={{ flex: 1, minWidth: 0, minHeight: 48, borderRadius: 12, borderWidth: 1.5, borderColor: tokens.color.accent, flexDirection: "row", alignItems: "center", gap: 10, paddingLeft: 14, paddingRight: 4 }}>
          <Icon name="search" size={18} color={tokens.color.muted} />
          <TextInput
            autoFocus
            value={query}
            onChangeText={setQuery}
            placeholder={s.search}
            placeholderTextColor={tokens.color.muted}
            accessibilityLabel={s.search}
            style={{ flex: 1, minWidth: 0, fontSize: 15, color: tokens.color.ink, paddingVertical: 0 }}
          />
          {query ? <IconButton icon="x" size={18} label="Clear" onPress={() => setQuery("")} /> : null}
        </View>
      </View>
      {!reachable ? <OfflineRow text={emptyCopy.search.offlineRow} /> : null}
      {q.length < 2 ? (
        // Nothing typed yet: say what this search finds (empty-states v2; it was a blank screen).
        <EmptyState icon="search" tone="info" title={idle.title} body={idle.body} />
      ) : !reachable && data == null ? null : searched && places.length === 0 && items.length === 0 && !isFetching ? (
        <EmptyState icon="search" tone="info" title={fillEmpty(emptyCopy.search.noMatch.title, { q })} body={emptyCopy.search.noMatch.body} />
      ) : (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 24 + insets.bottom }}>
          {places.length > 0 ? <GroupLabel text={B.search.places} /> : null}
          {places.map((v) => (
            <Tappable
              key={v.id}
              onPress={() => router.push(`/${service}/${v.id}`)}
              accessibilityRole="button"
              accessibilityLabel={`${v.name}, ${venueMeta(v)}`}
              style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8, paddingHorizontal: 16, minHeight: 64 }}
            >
              <VenueImage photoUrl={v.photoUrl} name={v.name} kind={null} dim={!v.open} initialSize={20} style={{ width: 48, height: 48, borderRadius: 12 }} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>
                  <Marked text={v.name} q={q} />
                </Text>
                <Text numberOfLines={1} style={{ marginTop: 2, fontSize: 13, color: tokens.color.muted, ...TABULAR }}>
                  {venueMeta(v)}
                </Text>
              </View>
              <Icon name="chevron-right" size={20} color={tokens.color.ink} />
            </Tappable>
          ))}
          {items.length > 0 ? <GroupLabel text={s.itemsCap} /> : null}
          {items.map((it) => (
            <Tappable
              key={it.dishId}
              onPress={() => router.push(`/${service}/${it.merchantId}`)}
              accessibilityRole="button"
              accessibilityLabel={`${it.name}, ${it.merchantName}, ${formatMoney(it.priceUsd)}`}
              style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8, paddingHorizontal: 16, minHeight: 64 }}
            >
              <VenueImage photoUrl={it.photoUrl} name={it.name} kind={null} initialSize={20} style={{ width: 48, height: 48, borderRadius: 12 }} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>
                  <Marked text={it.name} q={q} />
                </Text>
                <Text numberOfLines={1} style={{ marginTop: 2, fontSize: 13, color: tokens.color.muted }}>
                  {it.merchantName}
                </Text>
              </View>
              <Text style={{ fontSize: 15, fontWeight: tokens.font.weight.bold, color: tokens.color.ink, ...TABULAR }}>{formatMoney(it.priceUsd)}</Text>
            </Tappable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
