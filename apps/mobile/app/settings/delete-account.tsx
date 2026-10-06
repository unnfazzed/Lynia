import { tokens } from "@lynia/shared/tokens";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { Text, View } from "react-native";
import { deleteAccount } from "../../src/api/auth";
import { getActiveCustomerOrder } from "../../src/api/orders";
import { useAuth } from "../../src/auth/auth-context";
import { pendingOrQueued } from "../../src/query/client";
import { Icon, Tappable, useActionErrorEffect } from "../../src/ui";
import { BackHeader, Body, FirstRunScreen, HeroDisc, HeroPanel, InfoBox, PinnedFooter, SplitTitle } from "../../src/ui/firstrun";

/**
 * The words First Run v2 I draws (`fr-states.js` `add('I', …)`), verbatim, plus the shipped strings for the
 * states it doesn't draw: a running delivery (the live check) and the final step (owner D-80 §2 #6 keeps the
 * two-step confirm; D-79's immediate-deletion sentence stands).
 */
const DEL = {
  titleA: "Delete",
  titleB: "your account?",
  body: "Profile, places and order history go for good. Payment records stay as the law needs.",
  clear: "No delivery running",
  running: "A delivery is running — finish or cancel it first, then you can delete your account.",
  keep: "Keep my account",
  next: "Delete account",
  finalA: "This is",
  finalB: "the final step",
  ack: "I understand my history and saved places will be gone",
  confirm: "Delete my account",
} as const;

/**
 * Account deletion — First Run v2 I (`packages/design/handoff/first-run-v2/`, ledger D-80 §2 #6): the new back
 * header (44 round `surface` button), a danger hero 180 with the trash disc, "Delete **your account?**", one
 * sentence, the live "No delivery running" box, then "Keep my account" (the 52 CTA) over the danger text link
 * "Delete account".
 *
 * Two steps, as before (owner #6): the link opens the final step — D-79's sentence (the API erases at once,
 * `PrivacyService.eraseAccount`), the acknowledgement tick, and "Delete my account" as the same danger link,
 * armed only by the tick. "Keep my account" stays the primary on both steps. (Play policy requires in-app
 * deletion; CDPA requires erasure — docs/PLAY-STORE-SUBMISSION.md §4.)
 *
 * The box is the drawing of a LIVE check: a running delivery blocks deletion server-side (409 with
 * user-facing copy), so when one is running the box turns danger with the reason and the link is disabled.
 */
type Step = "explain" | "final";

export type DeleteAccountScreenProps = {
  /** The step the screen opens on — "explain" in the app. The parity lane stages LJ.delete_final. */
  initialStep?: Step;
  /** Seeds the acknowledgement tick (the parity lane draws the final step ticked). */
  initialAcknowledged?: boolean;
};

export default function DeleteAccountScreen({ initialStep = "explain", initialAcknowledged = false }: DeleteAccountScreenProps = {}): React.ReactElement {
  const router = useRouter();
  const { signOut } = useAuth();
  const [step, setStep] = React.useState<Step>(initialStep);
  const [acknowledged, setAcknowledged] = React.useState(initialAcknowledged);

  // The live half of the drawn "No delivery running" box.
  const activeQ = useQuery({ queryKey: ["activeCustomerOrder"], queryFn: getActiveCustomerOrder });
  const running = !!activeQ.data;

  const deleteM = useMutation({
    mutationFn: deleteAccount,
    // The account is gone; the local session is now a token for an anonymised profile. Sign out
    // rather than leaving the app to discover it via a 401 on the next poll.
    onSuccess: () => void signOut(),
  });
  // The API's 409s ("finish your active delivery", "account under a standing restriction") are
  // already user-facing copy and surface verbatim as an auto-dismissing toast (owner 2026-08-12).
  useActionErrorEffect(deleteM.error);
  const deleting = !!pendingOrQueued(deleteM);

  const keep = (): void => router.back();
  const final = step === "final";

  return (
    <FirstRunScreen
      testID={final ? "delete-final" : "delete-explain"}
      header={<BackHeader onBack={final ? () => setStep("explain") : keep} />}
      footer={
        <PinnedFooter
          primary={{ label: DEL.keep, onPress: keep, testID: "delete-keep" }}
          link={
            final
              ? { label: DEL.confirm, onPress: () => deleteM.mutate(), disabled: !acknowledged || deleting, color: tokens.color.dangerInk, testID: "delete-confirm" }
              : { label: DEL.next, onPress: () => setStep("final"), disabled: running, color: tokens.color.dangerInk, testID: "delete-next" }
          }
        />
      }
    >
      {/* `margin-top:-24px`: the hero sits 12 under the back header, not the body's 36. */}
      <View style={{ marginTop: -24 }}>
        <HeroPanel tone="danger" height={180}>
          <HeroDisc icon="trash" />
        </HeroPanel>
      </View>
      {final ? (
        <>
          <SplitTitle a={DEL.finalA} b={DEL.finalB} tone="danger" />
          {/* D-79 (owner 2026-10-06): the API erases at once, so the gallery's 30-day grace copy was false. */}
          <Body>
            Your account is deleted <Text style={{ fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>straight away</Text>
            {" and can't be recovered. Order records we must keep by law are anonymised."}
          </Body>
          <Tappable
            testID="delete-ack"
            onPress={() => setAcknowledged((v) => !v)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: acknowledged }}
            style={{
              marginTop: 16,
              minHeight: tokens.touchTargetMin,
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              paddingVertical: 12,
              paddingHorizontal: 14,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: acknowledged ? tokens.color.accent : tokens.color.line,
              backgroundColor: acknowledged ? tokens.color.accentWash : tokens.color.bg,
            }}
          >
            <View
              style={{
                width: 24,
                height: 24,
                borderRadius: 6,
                borderWidth: acknowledged ? 0 : 1.5,
                borderColor: tokens.color.line,
                backgroundColor: acknowledged ? tokens.color.accent : tokens.color.bg,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {acknowledged ? <Icon name="check" size={16} color={tokens.color.onAccent} /> : null}
            </View>
            <Text style={{ flex: 1, fontSize: 14, lineHeight: 19.6, fontWeight: tokens.font.weight.semibold, color: tokens.color.ink }}>{DEL.ack}</Text>
          </Tappable>
        </>
      ) : (
        <>
          <SplitTitle a={DEL.titleA} b={DEL.titleB} tone="danger" />
          <Body>{DEL.body}</Body>
          {running ? <InfoBox tone="bad" icon="triangle-alert" text={DEL.running} testID="delete-running" /> : <InfoBox tone="ok" icon="check" text={DEL.clear} testID="delete-clear" />}
        </>
      )}
    </FirstRunScreen>
  );
}
