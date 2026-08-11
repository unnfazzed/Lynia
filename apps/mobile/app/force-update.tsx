import React from "react";
import { Linking } from "react-native";
import { STORE_URL } from "../src/config";
import { DoveMark } from "../src/ui/Brand";
import { ForceUpdateView } from "./force-update.view";

/**
 * The hard version gate (customer/rider S·3). Brand-green SystemState with the brand mark, mounted by
 * the root layout in place of the whole Stack when isUpdateRequired(current) is true — so there is no
 * route past it.
 *
 * Structure is the codegen-adopted `ForceUpdateView` (≡ the mock's `ForceUpdate` SystemState leaf,
 * guarded by the structural-snapshot spec); this container owns only the data seam.
 *
 * Copy is role-NEUTRAL ("keep using LyniaGo"), not the kit's role-specific line ("keep sending" /
 * "keep riding"): this gate fires from the root layout before the role is resolved (see _layout.tsx —
 * role isn't known at root), so a role-specific line would show the wrong verb to half the users. The
 * kit should carry a neutral variant for this screen for the same reason.
 *
 * The primary hides when no store URL is configured rather than opening a dead link.
 */
export default function ForceUpdateScreen(): React.ReactElement {
  return (
    <ForceUpdateView
      mark={<DoveMark size={56} on="green" />}
      title="Time to update"
      message="A new version of LyniaGo is ready with the latest fixes. Update to keep using LyniaGo."
      primary={STORE_URL ? "Update now" : undefined}
      onPrimary={STORE_URL ? () => void Linking.openURL(STORE_URL as string) : undefined}
    />
  );
}
