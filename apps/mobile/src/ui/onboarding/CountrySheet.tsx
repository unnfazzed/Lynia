import { COUNTRY_PICKER_ORDER, countryFlag, countryMatches, PINNED_COUNTRY_COUNT, type Country } from "@lynia/shared";
import { tokens } from "@lynia/shared/tokens";
import React, { useCallback, useMemo, useState } from "react";
import { FlatList, KeyboardAvoidingView, type ListRenderItem, Modal, Platform, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EmptyRow } from "../EmptyState";
import { SHEET_DIM } from "../firstrun/sheet";
import { Icon } from "../Icon";
import { Tappable } from "../Tappable";
import { OB } from "./copy";

/**
 * The C2 country segment (ledger D-116, owner 2026-10-19: diaspora customers sign up on their own
 * numbers): the flag and calling code in the field's prefix slot, with a chevron when it can be changed.
 * Bikers keep a fixed Zimbabwe flag and +263 (`locked`), so the segment is plain text for them, as drawn.
 * The control fills the field's height, so its target is real geometry rather than hitSlop (which the
 * web build doesn't honour); the drawn 28px divider sits inside it.
 */
export function CountrySegment({ country, locked, onPress }: { country: Country; locked?: boolean; onPress: () => void }): React.ReactElement {
  const body = (
    <View style={{ height: 28, paddingRight: 12, borderRightWidth: 1, borderRightColor: tokens.color.line, flexDirection: "row", alignItems: "center", gap: 6 }}>
      <Text style={{ fontSize: tokens.font.size.h2, lineHeight: 24 }} accessibilityElementsHidden importantForAccessibility="no">
        {countryFlag(country.iso)}
      </Text>
      <Text style={{ fontSize: 17, fontWeight: tokens.font.weight.semibold, color: tokens.color.ink, fontVariant: ["tabular-nums"] }}>+{country.dial}</Text>
      {locked ? null : <Icon name="chevron-down" size={16} color={tokens.color.muted} />}
    </View>
  );
  if (locked) return body;
  return (
    <Tappable
      accessibilityRole="button"
      accessibilityLabel={OB.countryButton(country.name, country.dial)}
      onPress={onPress}
      hitSlop={{ left: 14 }}
      style={{ alignSelf: "stretch", justifyContent: "center", minHeight: tokens.touchTargetMin }}
    >
      {body}
    </Tappable>
  );
}

const ROW_HEIGHT = tokens.touchTargetPrimary;
const keyOf = (c: Country): string => c.iso;
const rowLayout = (_: ArrayLike<Country> | null | undefined, index: number): { length: number; offset: number; index: number } => ({
  length: ROW_HEIGHT,
  offset: ROW_HEIGHT * index,
  index,
});

/** One country row; memoized so a keystroke in the search re-renders only rows whose props changed. */
const CountryRow = React.memo(function CountryRow({
  country,
  selected,
  endOfPinned,
  onSelect,
}: {
  country: Country;
  selected: boolean;
  endOfPinned: boolean;
  onSelect: (c: Country) => void;
}): React.ReactElement {
  return (
    <Tappable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${country.name}, +${country.dial}`}
      onPress={() => onSelect(country)}
      style={{
        height: ROW_HEIGHT,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingHorizontal: tokens.space.screen,
        borderBottomWidth: endOfPinned ? 1 : 0,
        borderBottomColor: tokens.color.line,
        backgroundColor: selected ? tokens.color.accentWash : undefined,
      }}
    >
      <Text style={{ fontSize: 22, lineHeight: 28, width: 30, textAlign: "center" }} accessibilityElementsHidden importantForAccessibility="no">
        {countryFlag(country.iso)}
      </Text>
      <Text
        numberOfLines={1}
        style={{ flex: 1, fontSize: tokens.font.size.bodyLg, fontWeight: selected ? tokens.font.weight.semibold : tokens.font.weight.regular, color: tokens.color.ink }}
      >
        {country.name}
      </Text>
      <Text style={{ fontSize: tokens.font.size.body, color: tokens.color.muted, fontVariant: ["tabular-nums"] }}>+{country.dial}</Text>
      {selected ? <Icon name="check" size={18} color={tokens.color.accentText} /> : <View style={{ width: 18 }} />}
    </Tappable>
  );
});

/**
 * Choose a country (D-116): Zimbabwe, the ten countries with the most Zimbabweans, then the rest A–Z,
 * with a search on name or code. The First Run v2 sheet's frame (radius 24, grab, `.45` dim), at a fixed
 * height so the list scrolls under the search instead of the whole sheet. Mounted only while open, so it
 * starts fresh (empty search, scrolled to the current choice) each time.
 */
export function CountrySheet({ selected, onSelect, onClose }: { selected: Country; onSelect: (c: Country) => void; onClose: () => void }): React.ReactElement {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const rows = useMemo(() => COUNTRY_PICKER_ORDER.filter((c) => countryMatches(c, query)), [query]);
  const searching = query.trim().length > 0;
  // Open on the current choice when it sits below the pinned group.
  const [startIndex] = useState(() => {
    const at = COUNTRY_PICKER_ORDER.findIndex((c) => c.iso === selected.iso);
    return at >= PINNED_COUNTRY_COUNT ? at - 3 : 0;
  });
  const renderItem = useCallback<ListRenderItem<Country>>(
    // A hairline under the pinned group (Zimbabwe + the diaspora ten), only on the full list.
    ({ item, index }) => <CountryRow country={item} selected={item.iso === selected.iso} endOfPinned={!searching && index === PINNED_COUNTRY_COUNT - 1} onSelect={onSelect} />,
    [selected.iso, searching, onSelect],
  );

  return (
    <Modal visible transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, justifyContent: "flex-end" }}>
        <Tappable
          accessibilityRole="button"
          accessibilityLabel={OB.countryClose}
          onPress={onClose}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: SHEET_DIM }}
        />
        <View
          testID="country-sheet"
          style={{ height: "85%", backgroundColor: tokens.color.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 8, paddingBottom: insets.bottom }}
        >
          <View style={{ alignSelf: "center", width: 36, height: 4, borderRadius: 2, backgroundColor: tokens.color.line, marginBottom: 16 }} />
          <View style={{ paddingHorizontal: tokens.space.screen }}>
            <Text accessibilityRole="header" style={{ fontSize: tokens.font.size.h2, lineHeight: 26, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>
              {OB.countryTitle}
            </Text>
            <View
              style={{
                marginTop: 14,
                marginBottom: 8,
                height: tokens.touchTargetMin,
                borderRadius: tokens.radius.input,
                backgroundColor: tokens.color.surface,
                flexDirection: "row",
                alignItems: "center",
                paddingLeft: 12,
                gap: 8,
              }}
            >
              <Icon name="search" size={18} color={tokens.color.muted} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder={OB.countrySearch}
                placeholderTextColor={tokens.color.muted}
                autoCorrect={false}
                autoCapitalize="none"
                accessibilityLabel={OB.countrySearch}
                style={{ flex: 1, height: "100%", fontSize: tokens.font.size.bodyLg, color: tokens.color.ink }}
              />
              {searching ? (
                <Tappable
                  tone="icon"
                  accessibilityRole="button"
                  accessibilityLabel={OB.countryClear}
                  onPress={() => setQuery("")}
                  style={{ width: tokens.touchTargetMin, height: tokens.touchTargetMin, alignItems: "center", justifyContent: "center" }}
                >
                  <Icon name="x" size={18} color={tokens.color.muted} />
                </Tappable>
              ) : null}
            </View>
          </View>
          <FlatList
            data={rows}
            keyExtractor={keyOf}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            initialNumToRender={16}
            maxToRenderPerBatch={12}
            windowSize={7}
            initialScrollIndex={startIndex}
            getItemLayout={rowLayout}
            ListEmptyComponent={<EmptyRow icon="search" text={OB.countryNoMatch(query.trim())} centred style={{ paddingTop: 24 }} />}
            renderItem={renderItem}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
