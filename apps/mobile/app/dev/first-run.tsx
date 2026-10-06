import { tokens } from "@lynia/shared/tokens";
import { Redirect, useRouter } from "expo-router";
import React, { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Body,
  BulletList,
  ExitButton,
  FirstRunToast,
  FrBadge,
  FrField,
  FrSheet,
  FrSoftPill,
  HeroDisc,
  HeroPanel,
  InfoBox,
  KycChecklist,
  ListCard,
  ListRow,
  PinnedFooter,
  SampleNotification,
  SplitTitle,
  SystemSettingsSteps,
  TipChips,
  Toggle,
  TriesMeter,
  VerifiedRow,
  type FrTone,
  useToast,
} from "../../src/ui";
import { BD, KY, PC, PD, RP } from "../../src/ui/firstrun/copy";

const TONES: readonly FrTone[] = ["mint", "violet", "danger", "neutral", "green"];

/**
 * DEV ONLY — the First Run v2 parts gallery (CLAUDE-CODE-PROMPT Phase 1, ledger D-80). Every part in every
 * tone, for checking at 360×720, 320×640 and font scale 1.3 on a device. A release build redirects
 * home, so the route ships inert.
 */
export default function FirstRunGallery(): React.ReactElement {
  if (!__DEV__) return <Redirect href="/" />;
  return <Gallery />;
}

function Label({ children }: { children: string }): React.ReactElement {
  return <Text style={{ marginTop: 32, marginBottom: 8, fontSize: 12, fontWeight: tokens.font.weight.bold, color: tokens.color.muted, letterSpacing: 0.6 }}>{children.toUpperCase()}</Text>;
}

function Gallery(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [sheet, setSheet] = useState(false);
  const [on, setOn] = useState(true);
  const [shake, setShake] = useState(0);
  const [id, setId] = useState("63 4829");
  return (
    <View style={{ flex: 1, backgroundColor: tokens.color.bg }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 16, paddingBottom: 48 }}>
        {TONES.map((tone) => (
          <View key={tone}>
            <Label>{`Hero · ${tone}`}</Label>
            <HeroPanel tone={tone} topLeft={tone === "danger" ? <ExitButton onPress={() => router.back()} /> : undefined}>
              <HeroDisc icon={tone === "danger" ? "camera" : tone === "violet" ? "map-pin" : tone === "neutral" ? "bell-off" : "navigation"} spinner={tone === "green"} />
            </HeroPanel>
            <SplitTitle a={tone === "violet" ? RP.locA : PC.locA} b={tone === "violet" ? RP.locB : PC.locB} tone={tone} />
            <Body>{PC.locBody}</Body>
          </View>
        ))}

        <Label>Hero with cards (no dot)</Label>
        <HeroPanel height={250} decor={false}>
          <SampleNotification icon="bike" title={PC.ex1T} body={PC.ex1B} behind />
          <SampleNotification icon="lock" title={PC.ex2T} body={PC.ex2B} />
          <SampleNotification icon="check" title={PC.ex3T} body={PC.ex3B} behind />
        </HeroPanel>

        <Label>Bullets · chips · tries</Label>
        <BulletList
          items={[
            { icon: "map-pin", text: RP.loc1 },
            { icon: "user", text: RP.loc2 },
            { icon: "power", text: RP.loc3 },
          ]}
        />
        <TipChips
          items={[
            { icon: "sun", label: KY.blurryTip1 },
            { icon: "id-card", label: KY.blurryTip2 },
            { icon: "check", label: KY.blurryTip3 },
          ]}
        />
        <TriesMeter left={1} label={KY.triesLeft} />

        <Label>Steps · KYC checklist</Label>
        <SystemSettingsSteps steps={[PC.step1, PC.step2, PC.step3]} shakeKey={shake} />
        <FrSoftPill label="Shake" onPress={() => setShake((n) => n + 1)} style={{ marginTop: 8 }} />
        <KycChecklist step2="active" label="In review" />
        <KycChecklist step2="next" label="~2 min" />
        <KycChecklist step2="done" />

        <Label>List card · toggle · pills</Label>
        <ListCard>
          <ListRow icon="user" iconTone="ok" title={PD.row} sub={PD.rowSub} chevron onPress={() => undefined} />
          <ListRow icon="volume-2" title="Job alerts" sub="Ping and food-offer alarm" right={<Toggle value={on} onPress={() => setOn((v) => !v)} accessibilityLabel="Job alerts" />} />
          <ListRow icon="map-pin" title="Location" sub="Off · You can’t receive jobs" danger right={<Toggle value={false} accessibilityLabel="Location" />} />
          <ListRow icon="id-card" iconTone="ok" title={BD.id} value={BD.verified} valueOk />
          <ListRow icon="bike" title={BD.plate} sub={BD.plateSub} right={<FrSoftPill icon="plus" label={BD.add} onPress={() => undefined} />} />
        </ListCard>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <FrSoftPill icon="volume-2" label={RP.testPing} tone="white" onPress={() => undefined} />
          <FrSoftPill label={PC.setOffCta} tone="dangerWhite" onPress={() => undefined} />
          <FrBadge icon="check" label={PC.placed} />
          <FrBadge icon="clock" label={BD.inReview} tone="checking" />
          <FrBadge label={RP.offerTag} tone="gold" height={26} />
        </View>

        <Label>Info boxes</Label>
        <InfoBox tone="ok" icon="check" text="Saved" />
        <InfoBox tone="bad" icon="circle-alert" title={`${PD.takenA} ${PD.takenB}`} text={PD.takenBody} />
        <InfoBox tone="n" icon="wifi-off" text="Waiting for a connection" />

        <Label>Fields</Label>
        <FrField label={PD.idLabel} labelNote={PD.idOpt} value={id} onChangeText={setId} placeholder={PD.idPh} helper={PD.idWhy} />
        <FrField label={PD.idLabel} value={id} onChangeText={setId} error={PD.invalid} style={{ marginTop: 12 }} />
        <VerifiedRow text="+263 77 245 1180" value={PD.phoneVerified} style={{ marginTop: 12 }} />

        <Label>Toast · sheet</Label>
        <FirstRunToast text={RP.grantedToast} />
        <FrSoftPill label="Raise the app toast" onPress={() => toast.show(PC.grantedToast, "success")} style={{ marginTop: 12 }} />
        <FrSoftPill label="Open the sheet" onPress={() => setSheet(true)} style={{ marginTop: 8 }} />
      </ScrollView>
      <PinnedFooter primary={{ label: RP.goOnline, icon: "power", onPress: () => router.back() }} link={{ label: RP.notNow, onPress: () => router.back() }} />
      <FrSheet visible={sheet} onClose={() => setSheet(false)}>
        <HeroPanel height={150}>
          <HeroDisc icon="navigation" />
        </HeroPanel>
        <SplitTitle a={PC.locA} b={PC.locB} />
        <Body>{PC.locBody}</Body>
        <PinnedFooter inline primary={{ label: PC.locCta, icon: "navigation", onPress: () => setSheet(false) }} link={{ label: PC.locAlt, onPress: () => setSheet(false) }} />
      </FrSheet>
    </View>
  );
}
