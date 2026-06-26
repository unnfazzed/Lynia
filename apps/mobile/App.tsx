import { StatusBar } from "expo-status-bar";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { tokens } from "@lynia/shared";

const { color, space, radius } = tokens;

/**
 * Customer map-home shell (DESIGN.md D-b: map-anchored home + "Send a parcel" sheet).
 * Static shell for lane A — live pins, pricing and broadcast wire up in lanes C/D.
 */
export default function App() {
  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />

      <View style={styles.appbar}>
        <View style={styles.brand}>
          <View style={styles.logo}>
            <Text style={styles.logoText}>L</Text>
          </View>
          <Text style={styles.brandText}>Lynia</Text>
        </View>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>T</Text>
        </View>
      </View>

      <View style={styles.map}>
        <Text style={styles.mapHint}>Map</Text>
      </View>

      <View style={styles.sheet}>
        <View style={styles.grab} />
        <Text style={styles.title}>Send a parcel</Text>

        <Text style={styles.label}>Pickup</Text>
        <View style={styles.field}>
          <Text style={styles.fieldText}>Eastgate Mall, CBD</Text>
        </View>

        <Text style={styles.label}>Drop-off</Text>
        <View style={styles.field}>
          <Text style={styles.fieldText}>14 Glenara Ave, Avenues</Text>
        </View>

        <Pressable style={styles.cta} accessibilityRole="button">
          <Text style={styles.ctaText}>Broadcast request</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  appbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.lg,
    paddingTop: space.xxl,
    paddingBottom: space.sm,
  },
  brand: { flexDirection: "row", alignItems: "center", gap: space.sm },
  logo: { width: 24, height: 24, borderRadius: 7, backgroundColor: color.accent, alignItems: "center", justifyContent: "center" },
  logoText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  brandText: { fontSize: 18, fontWeight: "800", color: color.ink },
  avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: "#D7E5DC", alignItems: "center", justifyContent: "center" },
  avatarText: { color: color.accent700, fontWeight: "700" },
  map: { flex: 1, backgroundColor: color.surface, alignItems: "center", justifyContent: "center" },
  mapHint: { color: color.muted, fontSize: 12 },
  sheet: {
    backgroundColor: color.bg,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: space.lg,
    gap: space.md,
    shadowColor: color.ink,
    shadowOpacity: 0.1,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -8 },
    elevation: 12,
  },
  grab: { width: 40, height: 4, borderRadius: 99, backgroundColor: color.line, alignSelf: "center" },
  title: { fontSize: 17, fontWeight: "800", color: color.ink },
  label: { fontSize: 12, fontWeight: "600", color: color.muted },
  field: {
    height: 48,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.input,
    justifyContent: "center",
    paddingHorizontal: space.md,
  },
  fieldText: { fontSize: 14, fontWeight: "500", color: color.ink },
  cta: {
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: color.accent,
    alignItems: "center",
    justifyContent: "center",
    marginTop: space.xs,
  },
  ctaText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
