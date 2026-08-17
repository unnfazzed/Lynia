import { tokens } from "@lynia/shared/tokens";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { SafeAreaView } from "react-native";
import { requestOtp } from "../src/api/auth";
import { ApiError } from "../src/api/client";
import { LoginView } from "./phone.view";

/**
 * Phone sign-in (customer/rider 0·3) — the CONTAINER half of the codegen seam. The presentational
 * tree lives in `./phone.view.tsx`, GENERATED from the mock (screens.jsx `Login`) and locked to it by
 * the structural-snapshot guardrail. This file owns everything the mock can't: the OTP request, the
 * busy/disabled state and routing onward to /verify. The send-failure error rides the phone Field's
 * own caption (the view wires it via the data seam) so it stays in-flow within the mock's tree.
 */
export default function PhoneScreen(): React.ReactElement {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  // Stays `useState`, deliberately: this screen's failure rides the phone Field's OWN caption (see the
  // header note + phone.view.tsx's data seam), i.e. inline field validation, which the owner's
  // 2026-08-12 rule explicitly keeps in place — the message must stay readable while you fix the number.
  const [error, setError] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    setError(null);
    setBusy(true);
    try {
      const res = await requestOtp(phone.trim());
      // devCode is present only on the console channel outside production — prefill it for local dev.
      router.push({ pathname: "/verify", params: { phone: phone.trim(), devCode: res.devCode ?? "" } });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't send the code. Check your connection.");
    } finally {
      setBusy(false);
    }
  };

  return (
    // The phone frame / safe area — the mock's AppScreen shell; the mock's own screen padding lives
    // inside LoginView (from its `Pad` wrapper).
    <SafeAreaView style={{ flex: 1, backgroundColor: tokens.color.bg }}>
      <LoginView
        phone={phone}
        onChangePhone={setPhone}
        onSubmit={submit}
        loading={busy}
        submitDisabled={phone.trim().length < 6}
        error={error ?? undefined}
      />
    </SafeAreaView>
  );
}
