import { tokens } from "@lynia/shared/tokens";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import { Linking, Text, TextInput, View } from "react-native";
import { requestOtp } from "../src/api/auth";
import { ApiError } from "../src/api/client";
import { TERMS_URL } from "../src/config";
import { formatZwNational, zwE164, zwMobileProblem, zwNationalDigits } from "../src/logic/zw-mobile";
import { DismissKeyboardArea } from "../src/ui";
import { OB } from "../src/ui/onboarding/copy";
import { BackButton, Cta, FieldLabel, H2, OnbScreen, Pad, Sub } from "../src/ui/onboarding/kit";

/**
 * C2 / C3 · Phone (Calm Mint v2, `packages/design/handoff/calm-mint-v2-2026-10` README §3; ledger
 * D-55): "What's your number?", a 52px field with a fixed "+263" prefix segment and the nine national
 * digits grouped "77 245 1180", the "Starts with 71, 73, 77 or 78." help line (C3: a danger border and
 * the too-short line instead), "Send code", and the Terms / Privacy footer.
 *
 * Validation runs on "Send code", not while typing — a half-typed number is not an error yet. A rider
 * intent from C1 ("Ride with LyniaGo") rides along to /verify.
 */
export default function PhoneScreen(): React.ReactElement {
  const router = useRouter();
  const params = useLocalSearchParams<{ intent?: string }>();
  const intent = params.intent === "rider" ? "rider" : undefined;
  const [digits, setDigits] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    const problem = zwMobileProblem(digits);
    if (problem) {
      setError(problem === "short" ? OB.phoneShort : OB.phoneNotMobile);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const phone = zwE164(digits);
      const res = await requestOtp(phone);
      router.push({
        pathname: "/verify",
        params: { phone, devCode: res.devCode ?? "", deliveryChannel: res.deliveryChannel, ...(intent ? { intent } : {}) },
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't send the code. Check your connection.");
    } finally {
      setBusy(false);
    }
  };

  const back = (): void => {
    if (router.canGoBack()) router.back();
    else router.replace("/onboarding");
  };

  return (
    // The phone pad has no return key on iOS: a tap outside the field is the way to put it away.
    <DismissKeyboardArea>
      <OnbScreen
        footer={
          <>
            <Cta label={OB.sendCode} onPress={() => void submit()} busy={busy} disabled={digits.length === 0} />
            <Text style={{ textAlign: "center", fontSize: 12, lineHeight: 18, color: tokens.color.muted }}>
              {OB.agreePrefix}
              <Text accessibilityRole="link" onPress={() => void Linking.openURL(TERMS_URL)} style={{ fontWeight: tokens.font.weight.bold, color: tokens.color.accentText }}>
                {OB.terms}
              </Text>
              {OB.and}
              <Text accessibilityRole="link" onPress={() => router.push("/settings/privacy")} style={{ fontWeight: tokens.font.weight.bold, color: tokens.color.accentText }}>
                {OB.privacy}
              </Text>
              .
            </Text>
          </>
        }
      >
        <Pad>
          <BackButton onPress={back} />
          <H2>{OB.phoneTitle}</H2>
          <Sub>{OB.phoneSub}</Sub>
          <FieldLabel>{OB.phoneLabel}</FieldLabel>
          <View
            style={{
              height: tokens.touchTargetPrimary,
              borderWidth: 1,
              borderColor: error ? tokens.color.danger : tokens.color.line,
              borderRadius: tokens.radius.input,
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 14,
              gap: 12,
            }}
          >
            <View style={{ height: 28, paddingRight: 12, borderRightWidth: 1, borderRightColor: tokens.color.line, justifyContent: "center" }}>
              <Text style={{ fontSize: 17, fontWeight: tokens.font.weight.semibold, color: tokens.color.ink }}>{OB.phonePrefix}</Text>
            </View>
            <TextInput
              value={formatZwNational(digits)}
              onChangeText={(t) => {
                setDigits(zwNationalDigits(t));
                if (error) setError(null);
              }}
              onSubmitEditing={() => void submit()}
              placeholder="77 245 1180"
              placeholderTextColor={tokens.color.muted}
              keyboardType="phone-pad"
              autoComplete="tel"
              textContentType="telephoneNumber"
              accessibilityLabel={`${OB.phoneLabel}, ${OB.phonePrefix}`}
              maxLength={12}
              style={{ flex: 1, height: "100%", fontSize: 17, color: tokens.color.ink, fontVariant: ["tabular-nums"] }}
            />
          </View>
          {error ? (
            <Text accessibilityLiveRegion="polite" style={{ marginTop: 8, fontSize: 13, lineHeight: 18, color: tokens.color.dangerInk }}>
              {error}
            </Text>
          ) : (
            <Text style={{ marginTop: 8, fontSize: 13, color: tokens.color.muted }}>{OB.phoneHelp}</Text>
          )}
        </Pad>
      </OnbScreen>
    </DismissKeyboardArea>
  );
}
