import { haversineKm } from "@lynia/shared";
import { tokens } from "@lynia/shared/tokens";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, Text, TextInput, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ApiError } from "../../../src/api/client";
import { makeOffer } from "../../../src/api/offers";
import type { OpenOrder } from "../../../src/api/orders";
import { fareBand } from "../../../src/api/rider-v2";
import { buildSentOfferEntry } from "../../../src/logic/rider-bid-draft";
import { useSentOffers, useSkippedJobs } from "../../../src/query/use-sent-offers";
import { AppScreen, haptic, Icon, Tappable, useActionError } from "../../../src/ui";
import { CtaBar, CtaButton } from "../../../src/ui/order/kit";
import { OrderHeader } from "../../../src/ui/order/panels";
import { Notice } from "../../../src/ui/send/kit";
import { type BoardJob, RRoute, RToast } from "../../../src/ui/rider/board";
import { RIDER_COPY as R, RF, usd } from "../../../src/ui/rider/copy";

const ETAS = [5, 10, 15, 20] as const;
const STEP_CENTS = 50;
const MIN_CENTS = 50;

/** "A fare well above the band" — the warn notice (O2). Still sendable. */
export function isWellAbove(fareCents: number, hiDollars: number): boolean {
  return fareCents > Math.round(hiDollars * 100 * 1.4);
}

/**
 * Make an offer (Rider v2 O1–O4, ledger D-54) — a pushed screen with the Send v2 price step: the route
 * strip, "Rudo is asking $3.00", a 56/700 tap-to-type fare with − / + $0.50 and the usual-band bar, four
 * ETA chips (10 preselected), the one-offer notice, then "Send offer · $3.20" + "Skip this job".
 * The fare is held in integer cents, minimum $0.50. On success the offer joins "Your offers" on the board.
 */
export default function MakeOfferScreen(): React.ReactElement {
  const router = useRouter();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const narrow = useWindowDimensions().width < 340;
  const { jobId, toKm } = useLocalSearchParams<{ jobId: string; toKm?: string }>();
  const setError = useActionError();
  const { setOffers } = useSentOffers();
  const { skip } = useSkippedJobs();

  const order = useMemo(() => {
    const list = qc.getQueryData<OpenOrder[]>(["openOrders"]);
    return Array.isArray(list) ? (list.find((o) => o.id === jobId) ?? null) : null;
  }, [qc, jobId]);

  const asking = order ? Number(order.proposedFare) : 0;
  const askingCents = Math.round(asking * 100);
  const [fareCents, setFareCents] = useState(Math.max(MIN_CENTS, askingCents));
  const [fareText, setFareText] = useState((Math.max(MIN_CENTS, askingCents) / 100).toFixed(2));
  const [eta, setEta] = useState<number>(10);
  const [failed, setFailed] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const name = order?.customerFirstName || R.theSender;
  const band = fareBand(asking || 3);

  // The job left the board (taken by someone else, or the window closed) while the rider was here.
  useEffect(() => {
    const unsub = qc.getQueryCache().subscribe((e) => {
      if (e.query.queryKey[0] !== "openOrders" || e.type !== "updated") return;
      const list = qc.getQueryData<OpenOrder[]>(["openOrders"]);
      if (Array.isArray(list) && !list.some((o) => o.id === jobId)) {
        setError(R.taken);
        router.back();
      }
    });
    return unsub;
  }, [qc, jobId, router, setError]);

  const setCents = (c: number): void => {
    const v = Math.max(MIN_CENTS, c);
    setFareCents(v);
    setFareText((v / 100).toFixed(2));
  };

  const offerM = useMutation({
    mutationFn: () => makeOffer(order!.id, { type: fareCents === askingCents ? "accept" : "counter", offeredFare: fareCents / 100, etaMinutes: eta }),
    onSuccess: () => {
      haptic("tap");
      setOffers((prev) => [buildSentOfferEntry(order!, (fareCents / 100).toFixed(2), eta), ...prev.filter((p) => p.order.id !== order!.id)]);
      void qc.invalidateQueries({ queryKey: ["openOrders"] });
      router.back();
    },
    onError: (e) => {
      const msg = e instanceof ApiError ? e.message : "";
      // A retry after a timeout can land on an offer the server already took — that's a success.
      if (msg === "You already responded to this order (one round only)") {
        setOffers((prev) => [buildSentOfferEntry(order!, (fareCents / 100).toFixed(2), eta), ...prev.filter((p) => p.order.id !== order!.id)]);
        router.back();
        return;
      }
      if (msg === "This order is not open for offers" || msg.startsWith("The offer window has closed")) {
        setError(R.taken);
        router.back();
        return;
      }
      setFailed(true);
    },
  });

  const job: BoardJob | null = order
    ? {
        id: order.id,
        pickup: { ...order.pickup.point, landmark: order.pickup.landmark },
        dropoff: { ...order.dropoff.point, landmark: order.dropoff.landmark },
        toPickupKm: toKm != null && toKm !== "" && Number.isFinite(Number(toKm)) ? Number(toKm) : null,
        tripKm: order.distanceKm ?? haversineKm(order.pickup.point, order.dropoff.point),
        item: order.itemDesc,
        asking,
      }
    : null;

  const sending = offerM.isPending;
  const header = (
    <View style={{ paddingTop: insets.top, backgroundColor: tokens.color.bg }}>
      <OrderHeader title={R.tOffer} help={false} onBack={() => router.back()} onHelp={() => undefined} />
    </View>
  );

  if (!job) {
    // The job is gone before this screen could read it (a deep link after it closed).
    return (
      <AppScreen banner={header}>
        <View style={{ flex: 1, padding: 16, justifyContent: "center" }}>
          <Notice icon="circle-alert" text={R.taken} />
        </View>
        <CtaBar>
          <CtaButton label={R.backBoard} onPress={() => router.back()} />
        </CtaBar>
      </AppScreen>
    );
  }

  const pos = (d: number): number => Math.min(1, Math.max(0, d / Math.max(band.hi * 2, 1)));
  const fare = fareCents / 100;

  return (
    <AppScreen banner={header}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: 12, paddingHorizontal: 16, paddingBottom: 24 }}>
        <RRoute job={job} />
        <View style={{ alignItems: "center", marginTop: 14 }}>
          <Text style={{ fontSize: 14, color: tokens.color.muted }}>
            {RF.senderAsking(name)} <Text style={{ fontWeight: tokens.font.weight.bold, color: tokens.color.ink, fontVariant: ["tabular-nums"] }}>{usd(asking)}</Text>
          </Text>
          <Text style={{ fontSize: 15, fontWeight: tokens.font.weight.semibold, color: tokens.color.ink, marginTop: 6 }}>{R.yourFare}</Text>
          <Tappable tone="icon" onPress={() => inputRef.current?.focus()} accessibilityRole="button" accessibilityLabel={`${R.yourFare} ${usd(fare)}`}>
            <View style={{ borderBottomWidth: 2, borderStyle: "dashed", borderBottomColor: tokens.color.line }}>
              <Text style={{ fontSize: narrow ? 48 : 56, lineHeight: narrow ? 56 : 64, fontWeight: tokens.font.weight.bold, letterSpacing: -1, color: tokens.color.ink, fontVariant: ["tabular-nums"] }}>${fareText}</Text>
              <TextInput
                ref={inputRef}
                value={fareText}
                onChangeText={(t) => {
                  const clean = t.replace(/[^0-9.]/g, "");
                  setFareText(clean);
                  const n = Math.round(Number(clean) * 100);
                  if (Number.isFinite(n) && n > 0) setFareCents(Math.max(MIN_CENTS, n));
                }}
                onBlur={() => setCents(fareCents)}
                keyboardType="decimal-pad"
                maxLength={6}
                caretHidden
                accessibilityLabel={R.yourFare}
                style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0.011, fontSize: 16 }}
              />
            </View>
          </Tappable>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 }}>
            <Icon name="pencil" size={12} color={tokens.color.muted} />
            <Text style={{ fontSize: 12, color: tokens.color.muted }}>{R.tapType}</Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", gap: 10, marginTop: 12, marginBottom: 16 }}>
          <View style={{ flex: 1 }}>
            <CtaButton ghost label={R.minus} onPress={() => setCents(fareCents - STEP_CENTS)} disabled={fareCents <= MIN_CENTS} />
          </View>
          <View style={{ flex: 1 }}>
            <CtaButton ghost label={R.plus} onPress={() => setCents(fareCents + STEP_CENTS)} />
          </View>
        </View>
        <View style={{ height: 8, backgroundColor: tokens.color.line, borderRadius: 4, marginHorizontal: 6, marginBottom: 10 }}>
          <View style={{ position: "absolute", left: `${pos(band.lo) * 100}%`, width: `${(pos(band.hi) - pos(band.lo)) * 100}%`, top: 0, bottom: 0, backgroundColor: tokens.color.accent, borderRadius: 4 }} />
          <View
            style={{
              position: "absolute",
              left: `${pos(fare) * 100}%`,
              top: -5,
              width: 18,
              height: 18,
              marginLeft: -9,
              borderRadius: 9,
              backgroundColor: tokens.color.ink,
              borderWidth: 3,
              borderColor: tokens.color.bg,
              ...tokens.shadow.card,
            }}
          />
        </View>
        <Text style={{ fontSize: 13, lineHeight: 18, marginBottom: 12, color: tokens.color.ink }}>{RF.band(band.lo, band.hi, job.tripKm ?? 0)}</Text>
        {isWellAbove(fareCents, band.hi) ? <Notice icon="triangle-alert" tone="warn" text={RF.overB(name)} style={{ marginBottom: 12 }} /> : null}
        <Text style={{ fontSize: 13, fontWeight: tokens.font.weight.semibold, color: tokens.color.ink, marginBottom: 6 }}>{R.thereIn}</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {ETAS.map((m) => {
            const on = m === eta;
            return (
              <Tappable
                key={m}
                onPress={() => setEta(m)}
                accessibilityRole="radio"
                accessibilityState={{ selected: on, checked: on }}
                accessibilityLabel={RF.etaChip(m)}
                style={{
                  flex: 1,
                  minHeight: tokens.touchTargetMin,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: tokens.radius.pill,
                  borderWidth: on ? 1.5 : 1,
                  borderColor: on ? tokens.color.accentText : tokens.color.line,
                  backgroundColor: on ? tokens.color.accentWash : tokens.color.bg,
                }}
              >
                <Text style={{ fontSize: 15, fontWeight: tokens.font.weight.bold, color: on ? tokens.color.accentText : tokens.color.ink, fontVariant: ["tabular-nums"] }}>{RF.etaChip(m)}</Text>
              </Tappable>
            );
          })}
        </View>
        <Text style={{ fontSize: 12, lineHeight: 16, color: tokens.color.muted, marginTop: 8 }}>{R.etaHint}</Text>
        <Notice icon="circle-alert" text={RF.oneOffer(name)} style={{ marginTop: 14 }} />
      </ScrollView>
      {failed && !sending ? (
        <View style={{ position: "absolute", left: 12, right: 12, bottom: 146 + insets.bottom }}>
          <RToast
            text={R.sendFail}
            action={R.tryAgain}
            actionIcon="refresh-cw"
            onAction={() => {
              setFailed(false);
              offerM.mutate();
            }}
          />
        </View>
      ) : null}
      <CtaBar>
        <CtaButton
          label={sending ? R.sending : RF.sendOffer(fare)}
          loading={sending}
          onPress={() => {
            setFailed(false);
            offerM.mutate();
          }}
        />
        <CtaButton
          ghost
          label={R.skip}
          disabled={sending}
          onPress={() => {
            skip(job.id);
            router.back();
          }}
        />
      </CtaBar>
    </AppScreen>
  );
}
