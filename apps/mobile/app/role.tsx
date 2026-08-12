import { tokens } from "@lynia/shared";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { SafeAreaView } from "react-native";
import { saveRolePreference, type StartRole } from "../src/auth/session";
import { useFeatureFlags } from "../src/net/use-feature-flags";
import { RoleSelectView } from "./role.view";
import { RoleSelectFlagOffView } from "./role-flag-off.view";

/**
 * Post-OTP role fork (RIDER-JOURNEY-AUDIT R0-4): sign-in is identical to the customer up to here, so
 * this is where a freshly-verified account says how they want to start — one account, two roles,
 * switchable later. Picking "rider" routes into the existing rider/KYC entry; "customer" goes home.
 * The choice is persisted (saveRolePreference), so verify.tsx sends existing users straight home
 * instead of re-prompting every launch.
 *
 * The presentational tree is the codegen-adopted `RoleSelectView` (mock screens.jsx `RoleSelect`) with
 * its food-off twin `RoleSelectFlagOffView` (mock screens-shipped.jsx `RoleSelectFlagOff`). The mocks
 * draw two different screens per the food flag — a `Lockup` brand mark + joint-launch copy when food is
 * on, a `Dove`+`Wordmark` mark + parcels-only copy when it is off (journey 0·5) — so the container picks
 * the view by `restaurantsEnabled` rather than swapping copy inside one tree. The flag-off wording keeps
 * food hidden: the §1 escape hatch hides the whole vertical, and an unflagged mention of food here would
 * leak it (same fail-safe-off contract as the home Food tile). This screen owns all logic (the live role
 * selection, saveRolePreference, the permission-priming route); the views take only leaf props.
 */
export default function RoleScreen(): React.ReactElement {
  const router = useRouter();
  const { restaurantsEnabled } = useFeatureFlags();
  const [role, setRole] = useState<StartRole>("customer");

  const go = (choice: StartRole): void => {
    setRole(choice);
    void saveRolePreference(choice);
    // First-run permission priming (0·7/0·8) sits between the role fork and the destination. It self-
    // skips once primed, so routing through it every time is safe. Rider → /rider (which gates into
    // /rider/become KYC when unset); customer → /home.
    const dest = choice === "rider" ? "/rider" : "/home";
    router.replace(`/permissions?next=${dest}`);
  };

  const viewProps = {
    customerSelected: role === "customer",
    riderSelected: role === "rider",
    onSelectCustomer: () => setRole("customer"),
    onSelectRider: () => setRole("rider"),
    continueLabel: role === "rider" ? "Continue as a rider" : "Continue as a customer",
    onContinue: () => go(role),
  };

  return (
    // The phone frame / safe area — the mock's AppScreen shell; the mock's own screen padding lives
    // inside the view (from its `Pad` wrapper), mirroring phone.tsx.
    <SafeAreaView style={{ flex: 1, backgroundColor: tokens.color.bg }}>
      {restaurantsEnabled ? <RoleSelectView {...viewProps} /> : <RoleSelectFlagOffView {...viewProps} />}
    </SafeAreaView>
  );
}
