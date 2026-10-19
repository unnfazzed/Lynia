import { COUNTRY_PICKER_ORDER, countryFlag, countryMatches, PINNED_COUNTRY_COUNT, type Country } from "@lynia/shared";
import { tokens } from "@lynia/shared/tokens";
import React, { useMemo, useState } from "react";
import { FlatList, KeyboardAvoidingView, Modal, Platform, Text, TextInput, View } from "react-native";
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
 */
export function CountrySegment({ country, locked, onPress }: { country: Country; locked?: boolean; onPress: () => void }): React.ReactElement {
  const body = (
    <>
      <Text style={{ fontSize: 20, lineHeight: 24 }} accessibilityElementsHidden importantForAccessibility="no">
        {countryFlag(country.iso)}
      </Text>
      <Text style={{ fontSize: 17, fontWeight: tokens.font.weight.semibold, color: tokens.color.ink, fontVariant: ["tabular-nums"] }}>+{country.dial}</Text>
      {locked ? null : <Icon name="chevron-down" size={16} color={tokens.color.muted} />}
    </>
  );
  const style = { height: 28, paddingRight: 12, borderRightWidth: 1, borderRightColor: tokens.color.line, flexDirection: "row" as const, alignItems: "center" as const, gap: 6 };
  if (locked) return <View style={style}>{body}</View>;
  return (
    <Tappable
      accessibilityRole="button"
      accessibilityLabel={OB.countryButton(country.name, country.dial)}
      onPress={onPress}
      hitSlop={{ top: 12, bottom: 12, left: 14, right: 0 }}
      style={style}
    >
      {body}
    </Tappable>
  );
}

const ROW_HEIGHT = 52;

/**
 * Choose a country (D-116): Zimbabwe, the ten countries with the most Zimbabweans, then the rest A–Z,
 * with a search on name or code. The First Run v2 sheet's frame (radius 24, grab, `.45` dim), at a fixed
 * height so the list scrolls under the search instead of the whole sheet.
 */
export function CountrySheet({
  visible,
  selected,
  onSelect,
  onClose,
}: {
  visible: boolean;
  selected: Country;
  onSelect: (c: Country) => void;
  onClose: () => void;
}): React.ReactElement {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const rows = useMemo(() => COUNTRY_PICKER_ORDER.filter((c) => countryMatches(c, query)), [query]);
  const searching = query.trim().length > 0;
  // Open on the current choice when it sits below the pinned group (the sheet mounts on each open).
  const [startIndex] = useState(() => {
    const at = COUNTRY_PICKER_ORDER.findIndex((c) => c.iso === selected.iso);
    return at >= PINNED_COUNTRY_COUNT ? at - 3 : 0;
  });
  const close = (): void => {
    setQuery("");
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={close}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, justifyContent: "flex-end" }}>
        <Tappable
          accessibilityRole="button"
          accessibilityLabel={OB.countryClose}
          onPress={close}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: SHEET_DIM }}
        />
        <View
          testID="country-sheet"
          style={{ height: "85%", backgroundColor: tokens.color.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 8, paddingBottom: insets.bottom }}
        >
          <View style={{ alignSelf: "center", width: 36, height: 4, borderRadius: 2, backgroundColor: tokens.color.line, marginBottom: 16 }} />
          <View style={{ paddingHorizontal: tokens.space.screen }}>
            <Text accessibilityRole="header" style={{ fontSize: 20, lineHeight: 26, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>
              {OB.countryTitle}
            </Text>
            <View
              style={{
                marginTop: 14,
                marginBottom: 8,
                height: 44,
                borderRadius: tokens.radius.input,
                backgroundColor: tokens.color.surface,
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 12,
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
                style={{ flex: 1, height: "100%", fontSize: 16, color: tokens.color.ink }}
              />
              {searching ? (
                <Tappable accessibilityRole="button" accessibilityLabel={OB.countryClear} onPress={() => setQuery("")} hitSlop={14}>
                  <Icon name="x" size={18} color={tokens.color.muted} />
                </Tappable>
              ) : null}
            </View>
          </View>
          <FlatList
            data={rows}
            keyExtractor={(c) => c.iso}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            initialNumToRender={16}
            initialScrollIndex={startIndex}
            getItemLayout={(_, index) => ({ length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index })}
            ListEmptyComponent={<EmptyRow icon="search" text={OB.countryNoMatch(query.trim())} centred style={{ paddingTop: 24 }} />}
            renderItem={({ item, index }) => {
              const isSelected = item.iso === selected.iso;
              // A hairline under the pinned group (Zimbabwe + the diaspora ten), only on the full list.
              const endOfPinned = !searching && index === PINNED_COUNTRY_COUNT - 1;
              return (
                <Tappable
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={`${item.name}, +${item.dial}`}
                  onPress={() => {
                    setQuery("");
                    onSelect(item);
                  }}
                  style={{
                    height: ROW_HEIGHT,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    paddingHorizontal: tokens.space.screen,
                    borderBottomWidth: endOfPinned ? 1 : 0,
                    borderBottomColor: tokens.color.line,
                    backgroundColor: isSelected ? tokens.color.accentWash : undefined,
                  }}
                >
                  <Text style={{ fontSize: 22, lineHeight: 28, width: 30, textAlign: "center" }} accessibilityElementsHidden importantForAccessibility="no">
                    {countryFlag(item.iso)}
                  </Text>
                  <Text numberOfLines={1} style={{ flex: 1, fontSize: 16, fontWeight: isSelected ? tokens.font.weight.semibold : tokens.font.weight.regular, color: tokens.color.ink }}>
                    {item.name}
                  </Text>
                  <Text style={{ fontSize: 15, color: tokens.color.muted, fontVariant: ["tabular-nums"] }}>+{item.dial}</Text>
                  {isSelected ? <Icon name="check" size={18} color={tokens.color.accentText} /> : <View style={{ width: 18 }} />}
                </Tappable>
              );
            }}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
