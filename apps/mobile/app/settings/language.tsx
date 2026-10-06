import { useRouter } from "expo-router";
import React from "react";
import { BackHeader, FirstRunScreen, LargeTitle } from "../../src/ui/firstrun";
import { AccountRowList } from "../../src/ui/account/AccountRows";

/**
 * Settings → Language. The detail behind the Settings row's "English".
 *
 * Exists because of the owner's instruction of 2026-08-16 (`docs/DESIGN-DEVIATIONS.md` D-25): *"If u
 * click the tab with name it must open for viewing the details for editing.. Editing is locked for
 * now and no need to display that."* So the row opens, the screen states what the language actually
 * is — and it does NOT apologise for the missing picker. Per-language copy is what's missing, not a
 * screen; when it lands, this screen grows the other languages as selectable rows and nothing about
 * the entry point changes.
 *
 * Undrawn by the kit — the mocks draw the Settings ROW but never a language screen behind it. Covered
 * by D-25 rather than invented freely.
 */
export default function LanguageScreen(): React.ReactElement {
  const router = useRouter();
  return (
    // First Run v2 Settings look (D-82 §2 #1): the round back header + large title; the content is unchanged.
    <FirstRunScreen
      header={
        <>
          <BackHeader onBack={() => router.back()} />
          <LargeTitle>Language</LargeTitle>
        </>
      }
    >
      <AccountRowList rows={[{ icon: "check", label: "English", sub: "Used across the app and in your notifications" }]} style={{ marginTop: 0 }} />
    </FirstRunScreen>
  );
}
