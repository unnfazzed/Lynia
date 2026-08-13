import { tokens } from "@lynia/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { deleteAccount } from "../../src/api/auth";
import { getActiveCustomerOrder } from "../../src/api/orders";
import { useAuth } from "../../src/auth/auth-context";
import { pendingOrQueued } from "../../src/query/client";
import { AppBar, Button, Card, Icon, Screen, useActionErrorEffect } from "../../src/ui";

/**
 * Account deletion — the two screens the design draws (screens-shipped.jsx, SH7):
 *
 *   LJ.delete_account  the explainer + the live "is anything running?" check + "Continue to delete"
 *   LJ.delete_final    the final step: the 30-day grace copy, an acknowledgement tick, and the
 *                      danger-filled "Delete my account"
 *
 * Two SCREENS, not one card with a hidden branch: deletion is irreversible, so the mocks put a whole
 * screen between the intent and the act, and the acknowledgement tick is the gate on the last one.
 * (Play policy requires in-app deletion; CDPA requires erasure — docs/PLAY-STORE-SUBMISSION.md §4.)
 *
 * The mock's mint strip is the STATIC drawing of a LIVE check: a running delivery blocks deletion
 * server-side (the API answers 409 with user-facing copy), so the same strip carries the live answer
 * — mint + the mock's wording when nothing is running, danger-toned with the reason when something
 * is, with "Continue to delete" disabled behind it. The structure is the mock's; the value is live.
 */
type Step = "explain" | "final";

export type DeleteAccountScreenProps = {
  /** The step the screen opens on — "explain" in the app. The parity lane stages LJ.delete_final. */
  initialStep?: Step;
  /** Seeds the acknowledgement tick (the mock draws LJ.delete_final with it already ticked). */
  initialAcknowledged?: boolean;
};

export default function DeleteAccountScreen({
  initialStep = "explain",
  initialAcknowledged = false,
}: DeleteAccountScreenProps = {}): React.ReactElement {
  const router = useRouter();
  const { signOut } = useAuth();
  const [step, setStep] = React.useState<Step>(initialStep);
  const [acknowledged, setAcknowledged] = React.useState(initialAcknowledged);

  // The live half of the mock's "No delivery is running" strip.
  const activeQ = useQuery({ queryKey: ["activeCustomerOrder"], queryFn: getActiveCustomerOrder });
  const running = !!activeQ.data;

  const deleteM = useMutation({
    mutationFn: deleteAccount,
    // The account is gone; the local session is now a token for an anonymised profile. Sign out
    // rather than leaving the app to discover it via a 401 on the next poll.
    onSuccess: () => void signOut(),
  });
  // The API's 409s ("finish your active delivery", "account under a standing restriction") are
  // already user-facing copy and surface verbatim — but as an auto-dismissing toast, not a red line
  // camped under the button (owner instruction 2026-08-12). Keyed on the Error object, so a second
  // refused attempt still speaks.
  useActionErrorEffect(deleteM.error);

  const keep = (): void => router.back();

  if (step === "final") {
    return (
      <Screen>
        <AppBar title="Delete account" onBack={() => setStep("explain")} />
        <Card>
          <Text style={{ fontSize: 17, fontWeight: "700", color: tokens.color.dangerInk }}>This is the final step</Text>
          <Text style={{ fontSize: 13, color: tokens.color.muted, lineHeight: 20, marginTop: 4 }}>
            Your account closes now and is permanently deleted after{" "}
            <Text style={{ fontWeight: "700", color: tokens.color.ink }}>30 days</Text>. Sign back in within 30 days and
            the deletion is cancelled — after that, nothing can be recovered.
          </Text>
          <Pressable
            onPress={() => setAcknowledged((v) => !v)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: acknowledged }}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              paddingVertical: 11,
              paddingHorizontal: 12,
              borderRadius: tokens.radius.input,
              borderWidth: 1.5,
              borderColor: acknowledged ? tokens.color.accent : tokens.color.line,
              backgroundColor: acknowledged ? tokens.color.accentWash : tokens.color.bg,
              marginTop: 12,
              minHeight: tokens.touchTargetMin,
            }}
          >
            <View
              style={{
                width: 20,
                height: 20,
                borderRadius: 6,
                backgroundColor: acknowledged ? tokens.color.accent : tokens.color.surface,
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {acknowledged ? <Icon name="check" size={13} color={tokens.color.onAccent} /> : null}
            </View>
            <Text style={{ flex: 1, fontSize: 13, fontWeight: "600", color: tokens.color.ink, lineHeight: 18 }}>
              I understand my history and saved places will be gone
            </Text>
          </Pressable>
        </Card>
        <Button
          label="Delete my account"
          tone="danger"
          disabled={!acknowledged}
          loading={pendingOrQueued(deleteM)}
          onPress={() => deleteM.mutate()}
        />
        <Button label="Keep my account" variant="ghost" onPress={keep} />
      </Screen>
    );
  }

  return (
    <Screen>
      <AppBar title="Delete account" onBack={() => router.back()} />
      <Card>
        <View
          style={{
            width: 52,
            height: 52,
            borderRadius: 26,
            backgroundColor: tokens.color.dangerWash,
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 10,
          }}
        >
          <Icon name="trash" size={22} color={tokens.color.dangerInk} />
        </View>
        <Text style={{ fontSize: 17, fontWeight: "700", color: tokens.color.ink }}>Delete your account?</Text>
        <Text style={{ fontSize: 13, color: tokens.color.muted, lineHeight: 20, marginTop: 4 }}>
          Your profile, saved places, notifications and order history will be permanently deleted. Records the law makes
          us keep (payments) are kept only as long as it requires.
        </Text>
      </Card>
      <View
        style={{
          flexDirection: "row",
          gap: 8,
          paddingVertical: 9,
          paddingHorizontal: 11,
          borderRadius: tokens.radius.input,
          backgroundColor: running ? tokens.color.dangerWash : tokens.color.accentWash,
          marginBottom: 12,
        }}
      >
        <Icon
          name={running ? "triangle-alert" : "check"}
          size={15}
          color={running ? tokens.color.dangerInk : tokens.color.accentText}
        />
        <Text style={{ flex: 1, fontSize: 12.5, color: running ? tokens.color.dangerInk : tokens.color.accentText, lineHeight: 18 }}>
          {running
            ? "A delivery is running — finish or cancel it first, then you can delete your account."
            : "No delivery is running — you're clear to continue. (A live order blocks deletion until it ends.)"}
        </Text>
      </View>
      <Button label="Keep my account" onPress={keep} />
      <Button label="Continue to delete" variant="ghost" tone="danger" disabled={running} onPress={() => setStep("final")} />
    </Screen>
  );
}
