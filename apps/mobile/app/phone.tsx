import { type Country, countryForE164, deviceCountry, HOME_COUNTRY, intlPhoneProblem, nationalDigits, toE164 } from "@lynia/shared";
import { tokens } from "@lynia/shared/tokens";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, BackHandler, Keyboard, Linking, Platform, Text, TextInput, View } from "react-native";
import { requestOtp } from "../src/api/auth";
import { useAuth } from "../src/auth/auth-context";
import { stashDevCode } from "../src/auth/dev-code-handoff";
import { loadSignupIntent } from "../src/auth/device-state";
import { PRIVACY_URL, TERMS_URL } from "../src/config";
import { replaceClearingStack } from "../src/logic/nav";
import { otpErrorMessage } from "../src/logic/otp";
import { formatZwNational, ZW_SIGNIN_DIGITS, zwE164, zwMobileProblem, zwNationalDigits } from "../src/logic/zw-mobile";
import { DismissKeyboardArea, useActionError } from "../src/ui";
import { OB, RO } from "../src/ui/onboarding/copy";
import { CountrySegment, CountrySheet } from "../src/ui/onboarding/CountrySheet";
import { BackButton, Cta, FieldLabel, H2, OnbScreen, Pad, Sub } from "../src/ui/onboarding/kit";

/**
 * C2 / C3 · Phone (Calm Mint v2, `packages/design/handoff/calm-mint-v2-2026-10` README §3; ledger
 * D-55): "What's your number?", a 52px field with the country segment (a fixed "+263" in the handoff; the
 * D-116 flag-and-code picker, starting on the phone's own country) and, under Zimbabwe, the nine national
 * digits grouped "77 245 1180", the "Starts with 71, 73, 77 or 78." help line (C3: a danger border and
 * the too-short line instead), "Send code", and the Terms / Privacy footer.
 *
 * Validation runs on "Send code", not while typing — a half-typed number is not an error yet. A rider
 * intent from C1 ("Ride with LyniaGo") rides along to /verify.
 *
 * Only a problem with the NUMBER paints the field red (C3). A send that fails for any other reason (no
 * network, a server error, the send limit) is not the number's fault, so it is a toast, as on C4/C5.
 * The field has no `maxLength`: a pasted or autofilled "+263 77 245 1180" is longer than the nine digits
 * it holds, and `zwNationalDigits` already strips the prefix. Under Zimbabwe it keeps a tenth digit so a
 * number from abroad reads as too long instead of being cut to nine that pass (D-116). A "+" typed by hand
 * stays in the field until the calling code after it names a country, which the field then switches to.
 *
 * D-116 (owner 2026-10-19): the prefix is the country's flag and code, and a customer can change it
 * (Zimbabwe, the top-10 diaspora countries, then A–Z). Zimbabwe keeps every C2/C3 rule above; another
 * country takes its national digits as typed. A pasted or autofilled "+44 …" switches the country. A
 * rider intent pins the Zimbabwe flag and +263 with no chevron: bikers need a Zimbabwe number (the API refuses others).
 */
export default function PhoneScreen(): React.ReactElement {
  const router = useRouter();
  const navigation = useNavigation();
  const { session } = useAuth();
  const params = useLocalSearchParams<{ intent?: string; phone?: string }>();
  // C1's rider path, from the params or — after an app kill on this screen or C4, which relaunches here
  // with no params — from the device, where C1 kept it until sign-in completes.
  const [storedIntent, setStoredIntent] = useState<"rider" | null>(null);
  useEffect(() => {
    let alive = true;
    void loadSignupIntent().then((v) => {
      if (alive) setStoredIntent(v);
    });
    return () => {
      alive = false;
    };
  }, []);
  const intent = params.intent === "rider" || storedIntent === "rider" ? "rider" : undefined;
  // "Change number" from the code screen hands the number back, so its country comes back with it.
  // Otherwise the picker starts on the phone's own country (D-116 review: a South African "071 234 5678"
  // typed under the Zimbabwe flag passed as a Zimbabwe number), Zimbabwe when it can't tell.
  const [picked, setPicked] = useState<Country>(() => (params.phone?.startsWith("+") && countryForE164(params.phone)) || deviceCountry() || HOME_COUNTRY);
  const [pickerOpen, setPickerOpen] = useState(false);
  const country = intent === "rider" ? HOME_COUNTRY : picked;
  const isHome = country.iso === HOME_COUNTRY.iso;
  const [digits, setDigits] = useState(() => {
    if (!params.phone?.startsWith("+")) return "";
    const c = (intent !== "rider" && countryForE164(params.phone)) || HOME_COUNTRY;
    return c.iso === HOME_COUNTRY.iso ? zwNationalDigits(params.phone, ZW_SIGNIN_DIGITS) : nationalDigits(params.phone, c);
  });
  // "+4" typed by hand, before the code after it names a country (D-116).
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The C3 validation line: only ever a problem with the number itself.
  const [error, setError] = useState<string | null>(null);
  const showFailure = useActionError();
  // Synchronous in-flight guard: "Send code" then the keypad's submit key, a frame apart, both read
  // `busy` as false. That sent two paid codes and pushed two code screens (C-8).
  const inFlight = useRef(false);

  // iOS has no live regions: say the C3 line out loud there (Android's accessibilityLiveRegion does it).
  useEffect(() => {
    if (error && Platform.OS === "ios") AccessibilityInfo.announceForAccessibility(error);
  }, [error]);

  const submit = async (): Promise<void> => {
    if (inFlight.current) return;
    if (isHome) {
      const problem = zwMobileProblem(digits);
      if (problem) {
        // A biker can't change the flag, so a number from abroad gets the biking rule rather than "tap the flag".
        const long = intent === "rider" ? RO.phoneCountry : OB.phoneLongZw;
        setError(problem === "short" ? OB.phoneShort : problem === "long" ? long : OB.phoneNotMobile);
        return;
      }
    } else if (intlPhoneProblem(digits, country)) {
      setError(OB.phoneShortIntl);
      return;
    }
    inFlight.current = true;
    Keyboard.dismiss();
    setError(null);
    setBusy(true);
    try {
      const phone = isHome ? zwE164(digits) : toE164(country, digits);
      const res = await requestOtp(phone);
      // A test code goes to the code screen in memory, never in the URL (src/auth/dev-code-handoff.ts).
      stashDevCode(phone, res.devCode);
      router.push({
        pathname: "/verify",
        params: { phone, deliveryChannel: res.deliveryChannel, ...(intent ? { intent } : {}) },
      });
    } catch (e) {
      showFailure(otpErrorMessage(e, "Couldn't send the code. Check your connection."));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  // Signed out, the only screen that belongs behind this one is C1. Anything else (a signed-in screen
  // left on the stack) must never be one Back away from a signed-out user (C-2), so the stack is cleared.
  const back = (): void => {
    if (session) {
      if (router.canGoBack()) router.back();
      else router.replace("/onboarding");
      return;
    }
    const state = navigation.getState?.();
    const prev = state && state.index > 0 ? state.routes[state.index - 1]?.name : undefined;
    if (prev === "onboarding") router.back();
    else replaceClearingStack(router, "/onboarding");
  };

  // Android Back does what the on-screen arrow does. C1 hands over with a replace, so with nothing behind
  // this screen the system Back used to close the app. Only while this screen is the focused one: the code
  // screen is pushed on top of it and has its own Back.
  const backRef = useRef(back);
  backRef.current = back;
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (navigation.isFocused && !navigation.isFocused()) return false;
      backRef.current();
      return true;
    });
    return () => sub.remove();
  }, [navigation]);

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
              <Text accessibilityRole="link" onPress={() => void Linking.openURL(PRIVACY_URL)} style={{ fontWeight: tokens.font.weight.bold, color: tokens.color.accentText }}>
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
            <CountrySegment country={country} locked={intent === "rider"} onPress={() => setPickerOpen(true)} />
            <TextInput
              value={draft ?? (isHome ? formatZwNational(digits) : digits)}
              onChangeText={(t) => {
                if (error) setError(null);
                // A pasted, autofilled or typed international number names its own country.
                const intl = intent !== "rider" && /^\s*(\+|00)/.test(t);
                const pastedCountry = intl ? countryForE164(t.replace(/^\s*(\+|00)/, "")) : undefined;
                if (intl && !pastedCountry && /^\s*\+\d{0,3}$/.test(t)) {
                  setDraft(t.trim());
                  setDigits("");
                  return;
                }
                setDraft(null);
                const target = pastedCountry ?? country;
                if (pastedCountry && pastedCountry.iso !== country.iso) setPicked(pastedCountry);
                setDigits(target.iso === HOME_COUNTRY.iso ? zwNationalDigits(t, ZW_SIGNIN_DIGITS) : nationalDigits(t, target));
              }}
              onSubmitEditing={() => void submit()}
              placeholder={isHome ? "77 245 1180" : OB.phonePlaceholderIntl}
              placeholderTextColor={tokens.color.muted}
              keyboardType="phone-pad"
              autoComplete="tel"
              textContentType="telephoneNumber"
              accessibilityLabel={`${OB.phoneLabel}, +${country.dial}`}
              style={{ flex: 1, minWidth: 0, height: "100%", fontSize: 17, color: tokens.color.ink, fontVariant: ["tabular-nums"] }}
            />
          </View>
          {error ? (
            <Text accessibilityLiveRegion="polite" style={{ marginTop: 8, fontSize: 13, lineHeight: 18, color: tokens.color.dangerInk }}>
              {error}
            </Text>
          ) : (
            <Text style={{ marginTop: 8, fontSize: 13, color: tokens.color.muted }}>{isHome ? OB.phoneHelp : OB.phoneHelpIntl}</Text>
          )}
        </Pad>
        {/* Mounted only while open: nothing to build for the 200-row list until it is asked for. */}
        {pickerOpen ? (
          <CountrySheet
            selected={country}
            onClose={() => setPickerOpen(false)}
            onSelect={(c) => {
              setPickerOpen(false);
              if (c.iso === country.iso) return;
              setPicked(c);
              setDraft(null);
              setDigits((d) => (c.iso === HOME_COUNTRY.iso ? zwNationalDigits(d, ZW_SIGNIN_DIGITS) : nationalDigits(d, c)));
              if (error) setError(null);
            }}
          />
        ) : null}
      </OnbScreen>
    </DismissKeyboardArea>
  );
}
