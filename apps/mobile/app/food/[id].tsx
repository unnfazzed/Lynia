import type { RestaurantMenuDish } from "@lynia/shared";
import { tokens } from "@lynia/shared";
import { isMerchantOpenNow, nextOpenDescription } from "@lynia/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import { useFoodCart } from "../../src/food/cart-context";
import { useReopenReminder, useRestaurantMenu } from "../../src/query/use-restaurants";
import { AppBar, Button, Card, EmptyState, haptic, Icon, Money, Screen, SkeletonList, useToast } from "../../src/ui";
import { ItemSheet } from "../../src/ui/food/ItemSheet";
import { MenuRow } from "../../src/ui/food/MenuRow";
import { RemindWhenOpen } from "../../src/ui/food/RemindWhenOpen";

/** R2·1/R2·2 menu — category tabs mirror D-29's merchant-owned category order; the kitchen's own
 *  closed/open state is derived from `hours` (D1 does not yet know the customer's own address, so no
 *  distance/ETA line here — that lands with D2's checkout, which needs a dropoff anyway). */
export default function RestaurantMenuScreen(): React.ReactElement {
  const router = useRouter();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { menu, isLoading, isError, refetch } = useRestaurantMenu(id, true);
  const cart = useFoodCart();

  const [categoryIdx, setCategoryIdx] = useState(0);
  const [openItem, setOpenItem] = useState<RestaurantMenuDish | null>(null);

  // D1 `menu_closed`: "remind me when they open". The toast lives here rather than in the control,
  // which stays presentational — and `alreadyOpen` gets its own line: the kitchen opened between this
  // screen rendering and the tap, so nothing was banked and "we'll remind you" would be a small lie.
  const reminder = useReopenReminder(
    id,
    (res) => {
      if (res.alreadyOpen) {
        toast.show(`${menu?.restaurant.name ?? "They"} are open now — pull to refresh the menu.`, "info");
        return;
      }
      haptic("tap");
      toast.show(res.set ? `We'll tell you when ${menu?.restaurant.name ?? "they"} open.` : "Reminder off.", "success");
    },
    () => toast.show("Couldn't save that just now — try again.", "info"),
  );

  // R2·b1: recompute open/closed as time passes (hours are static data, no live push needed) so a
  // kitchen that closes mid-browse interrupts once instead of silently going stale.
  const [now, setNow] = useState(() => new Date());
  const [justClosed, setJustClosed] = useState(false);
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  // Only interrupt on a genuine open→closed transition, not on first load of an already-closed shop.
  const prevOpenRef = React.useRef<boolean | null>(null);
  useEffect(() => {
    if (!menu) return;
    const open = isMerchantOpenNow(menu.restaurant.hours, now);
    if (prevOpenRef.current === true && !open) setJustClosed(true);
    prevOpenRef.current = open;
  }, [menu, now]);

  if (isLoading) {
    return (
      <Screen>
        <SkeletonList />
      </Screen>
    );
  }

  if (isError || !menu) {
    return (
      <Screen>
        <AppBar onBack={() => router.back()} />
        <EmptyState icon="wifi-off" title="Couldn't load this menu" message="Check your connection and try again.">
          <Button label="Retry" onPress={refetch} />
        </EmptyState>
      </Screen>
    );
  }

  const restaurant = menu.restaurant;
  const open = isMerchantOpenNow(restaurant.hours, now);
  const closedReason = open ? null : "This kitchen is closed";
  const category = menu.categories[categoryIdx];
  const qtyInCartFor = (dishId: string): number => cart.cart.lines.filter((l) => l.dishId === dishId).reduce((s, l) => s + l.quantity, 0);

  const addToCart = (dish: RestaurantMenuDish, quantity: number, note: string): void => {
    const switched = cart.addItem(restaurant.id, restaurant.name, { dishId: dish.id, name: dish.name, priceUsd: dish.priceUsd, quantity, note });
    setOpenItem(null);
    if (switched) toast.show(`Started a new cart for ${restaurant.name} — your other cart was cleared`, "info");
    else toast.show(`Added ${dish.name}`, "success");
  };

  const logoInitial = (restaurant.name[0] ?? "•").toUpperCase();

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Kit RC.menu (r-customer-a.jsx:191-200): a full-bleed cover band with the back button
            floating on it and the round shop logo overhanging its bottom-left corner. The cover
            breaks out of Screen's 16px padding; photo/logo fall back to a tinted band + monogram
            (the customer read API's coverPhotoUrl/logoUrl are an upgrade, not a dependency). */}
        <View style={{ marginTop: -tokens.space.screen, marginHorizontal: -tokens.space.screen }}>
          <View style={{ height: 92 }}>
            {restaurant.coverPhotoUrl ? (
              <Image
                source={{ uri: restaurant.coverPhotoUrl }}
                accessibilityElementsHidden
                importantForAccessibility="no"
                style={{ width: "100%", height: "100%", backgroundColor: tokens.color.surface }}
              />
            ) : (
              <View
                accessibilityElementsHidden
                importantForAccessibility="no"
                style={{ flex: 1, backgroundColor: tokens.color.accentWash, alignItems: "center", justifyContent: "center" }}
              >
                <Text style={{ fontSize: 28, fontWeight: "700", color: tokens.color.accentText, opacity: 0.45 }}>{restaurant.name}</Text>
              </View>
            )}
          </View>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={{ position: "absolute", left: 12, top: 10, width: 40, height: 40, borderRadius: 20, backgroundColor: tokens.color.bg, alignItems: "center", justifyContent: "center", ...tokens.shadow.card }}
          >
            <View style={{ transform: [{ rotate: "180deg" }] }}>
              <Icon name="chevron-right" size={18} color={tokens.color.ink} />
            </View>
          </Pressable>
          <View style={{ position: "absolute", left: 14, bottom: -22, width: 52, height: 52, borderRadius: 26, borderWidth: 3, borderColor: tokens.color.bg, overflow: "hidden", ...tokens.shadow.card }}>
            {restaurant.logoUrl ? (
              <Image source={{ uri: restaurant.logoUrl }} accessibilityElementsHidden importantForAccessibility="no" style={{ width: "100%", height: "100%" }} />
            ) : (
              <View style={{ flex: 1, backgroundColor: tokens.color.accent, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontSize: 22, fontWeight: "700", color: tokens.color.onAccent }}>{logoInitial}</Text>
              </View>
            )}
          </View>
        </View>

        <View style={{ marginTop: 26, marginBottom: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
            <Text style={{ fontSize: 18, fontWeight: "700", color: tokens.color.ink }}>{restaurant.name}</Text>
            {restaurant.priceLevel ? (
              <Text style={{ fontSize: 13, fontWeight: "700", color: tokens.color.muted }}>{"$".repeat(restaurant.priceLevel)}</Text>
            ) : null}
          </View>
          {restaurant.cuisineTags.length > 0 ? (
            <Text style={{ fontSize: 12.5, color: tokens.color.muted, marginTop: 2 }}>{restaurant.cuisineTags.join(" · ")}</Text>
          ) : null}
        </View>

        {!open ? (
          <Card style={{ backgroundColor: tokens.color.surface, borderColor: "transparent" }}>
            <View style={{ flexDirection: "row", gap: 9 }}>
              <Icon name="clock" size={16} color={tokens.color.muted} />
              <Text style={{ flex: 1, fontSize: 13, color: tokens.color.ink, lineHeight: 18 }}>
                {restaurant.name} is closed. {nextOpenDescription(restaurant.hours, now) ?? "You can look, but you can't order yet."}
              </Text>
            </View>
            {/* The kit's `menu_closed` gives the closed state a way forward instead of a dead end. */}
            <RemindWhenOpen
              restaurantName={restaurant.name}
              isSet={reminder.isSet}
              isPending={reminder.isPending}
              disabled={reminder.isLoading}
              onToggle={reminder.toggle}
            />
          </Card>
        ) : null}

        {menu.categories.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
            {menu.categories.map((c, i) => (
              <Pressable
                key={c.id}
                onPress={() => setCategoryIdx(i)}
                accessibilityRole="button"
                accessibilityState={{ selected: i === categoryIdx }}
                style={{
                  paddingHorizontal: 13,
                  paddingVertical: 8,
                  borderRadius: 999,
                  marginRight: 6,
                  borderWidth: 1,
                  borderColor: i === categoryIdx ? tokens.color.accent : tokens.color.line,
                  backgroundColor: i === categoryIdx ? tokens.color.accentWash : tokens.color.bg,
                }}
              >
                <Text style={{ fontSize: 12.5, fontWeight: "700", color: i === categoryIdx ? tokens.color.accentText : tokens.color.muted }}>{c.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        {category ? (
          category.dishes.length > 0 ? (
            <>
              {/* Kit R2·1 (r-customer-a.jsx:218): the selected category is restated as a section
                  header over the dish list, so a long scroll never loses its heading. */}
              <Text style={{ fontSize: 13, fontWeight: "700", color: tokens.color.muted, letterSpacing: 0.5, marginTop: 8, marginBottom: 2 }}>
                {category.name.toUpperCase()}
              </Text>
              {category.dishes.map((dish) => (
                <MenuRow
                  key={dish.id}
                  dish={dish}
                  qtyInCart={qtyInCartFor(dish.id)}
                  disabledReason={closedReason}
                  onPress={() => setOpenItem(dish)}
                />
              ))}
            </>
          ) : (
            <Text style={{ fontSize: 13, color: tokens.color.muted, textAlign: "center", marginTop: 20 }}>Nothing in this category yet.</Text>
          )
        ) : (
          <EmptyState icon="utensils" title="No menu yet" message="This kitchen hasn't added any dishes." />
        )}
        <View style={{ height: tokens.space.xxl }} />
      </ScrollView>

      {cart.itemCount > 0 && cart.cart.restaurantId === restaurant.id ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            paddingTop: 10,
            borderTopWidth: 1,
            borderTopColor: tokens.color.line,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12.5, color: tokens.color.muted }}>{cart.itemCount} item{cart.itemCount === 1 ? "" : "s"}</Text>
            <Money v={cart.subtotal} size={16} />
          </View>
          <Button label="View cart" onPress={() => router.push("/food/cart")} />
        </View>
      ) : null}

      {justClosed ? (
        <Pressable
          onPress={() => setJustClosed(false)}
          style={{ position: "absolute", inset: 0, backgroundColor: "rgba(20,24,27,0.45)", justifyContent: "center", padding: 18 }}
        >
          {/* Kit R2·b1 `closed_interrupt` (r-customer-a.jsx:280-288): a highlight icon tile above the
              headline, and two named ways forward rather than a generic dismiss. */}
          <Card>
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                backgroundColor: tokens.color.highlightWash,
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 10,
              }}
            >
              <Icon name="clock" size={21} color={tokens.color.highlightInk} />
            </View>
            <Text style={{ fontSize: 16.5, fontWeight: "700", color: tokens.color.ink }}>{restaurant.name} just closed</Text>
            <Text style={{ fontSize: 13, color: tokens.color.muted, lineHeight: 19, marginTop: 5 }}>
              They stopped taking orders. Your cart is saved — nothing was ordered.
            </Text>
            <Button label="See places still open" onPress={() => router.push("/food")} />
            <Button label="Keep my cart for tomorrow" variant="ghost" onPress={() => setJustClosed(false)} />
          </Card>
        </Pressable>
      ) : null}

      {openItem ? (
        <ItemSheet dish={openItem} disabledReason={closedReason} onAdd={(qty, note) => addToCart(openItem, qty, note)} onClose={() => setOpenItem(null)} />
      ) : null}
    </Screen>
  );
}
