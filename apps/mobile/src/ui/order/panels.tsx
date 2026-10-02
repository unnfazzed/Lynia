import { SOS_POLICY } from "@lynia/shared";
import { tokens } from "@lynia/shared/tokens";
import React from "react";
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Icon, type IconName } from "../Icon";
import { RemoteImage } from "../RemoteImage";
import { Tappable } from "../Tappable";
import { useDial } from "../useDial";
import { ORDER_COPY as A, orderText } from "./copy";
import { CtaButton, H2, IconDisc, Muted, Tags } from "./kit";

/**
 * The order screen's chrome and overlays (After Send handoff, ledger D-53): the Send-flow header with
 * the per-stage title and the red Help pill, the ink "Reconnecting…" banner, the Get help panel and the
 * full-screen pickup-photo viewer.
 */

/**
 * "‹ Back · Title · [Help]" — 52px row, 1px line under it. v2: the title ellipsises before Back or Help
 * would shrink (large font scale); no title while an order is opening or failed to load (2.1–2.3).
 */
export function OrderHeader({
  title,
  help,
  onBack,
  onHelp,
  heavy,
}: {
  title: string;
  help: boolean;
  onBack: () => void;
  onHelp: () => void;
  /** Order flow v2.1: the venue-name title is 16/800 (After Send's is 16/700). */
  heavy?: boolean;
}): React.ReactElement {
  return (
    <View style={{ minHeight: 53, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 8, backgroundColor: tokens.color.bg, borderBottomWidth: 1, borderBottomColor: tokens.color.line, zIndex: 20 }}>
      <View style={{ flexGrow: 1, flexBasis: 0, flexShrink: 0, alignItems: "flex-start" }}>
        <Tappable
          tone="icon"
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel={A.back}
          style={{ minHeight: tokens.touchTargetMin, flexDirection: "row", alignItems: "center", gap: 2, paddingRight: 8 }}
        >
          <View style={{ transform: [{ rotate: "90deg" }] }}>
            <Icon name="chevron-down" size={22} color={tokens.color.accentText} />
          </View>
          <Text style={{ fontSize: 15, fontWeight: tokens.font.weight.semibold, color: tokens.color.accentText }}>{A.back}</Text>
        </Tappable>
      </View>
      <Text accessibilityRole="header" numberOfLines={1} style={{ flexShrink: 1, textAlign: "center", fontSize: 16, fontWeight: heavy ? "800" : tokens.font.weight.bold, letterSpacing: heavy ? -0.2 : 0, color: tokens.color.ink }}>
        {title}
      </Text>
      <View style={{ flexGrow: 1, flexBasis: 0, flexShrink: 0, alignItems: "flex-end" }}>
        {help ? (
          <Tappable
            tone="icon"
            onPress={onHelp}
            accessibilityRole="button"
            accessibilityLabel={A.helpT}
            style={{ minHeight: tokens.touchTargetMin, justifyContent: "center" }}
          >
            <View style={{ minHeight: 34, flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, borderRadius: tokens.radius.pill, borderWidth: 1.5, borderColor: tokens.color.danger }}>
              <Icon name="life-buoy" size={15} color={tokens.color.danger} />
              <Text style={{ fontSize: 13, fontWeight: tokens.font.weight.bold, color: tokens.color.danger }}>{A.help}</Text>
            </View>
          </Tappable>
        ) : null}
      </View>
    </View>
  );
}

/** The ink banner directly under the header: offline (19) or a saved copy on an offline cold start (2.4). */
export function ReconnectBanner({ text }: { text: string }): React.ReactElement {
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: tokens.color.ink, paddingVertical: 10, paddingHorizontal: 14, zIndex: 21 }}
    >
      <ActivityIndicator size="small" color={tokens.color.onAccent} style={{ width: 16, height: 16 }} />
      <Text style={{ flex: 1, fontSize: 13, lineHeight: 18, color: tokens.color.onAccent }}>{text}</Text>
    </View>
  );
}

/** The panel grabber: a 28px row with the 36×4 bar (v2). */
function PanelGrabber(): React.ReactElement {
  return (
    <View style={{ height: 28, alignItems: "center", justifyContent: "center" }}>
      <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: tokens.color.line }} />
    </View>
  );
}

function HelpRow({ icon, title, sub, danger, onPress }: { icon: IconName; title: string; sub: string; danger?: boolean; onPress: () => void }): React.ReactElement {
  return (
    <Tappable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${sub}`}
      style={{ minHeight: 60, flexDirection: "row", alignItems: "center", gap: 12, borderTopWidth: 1, borderTopColor: tokens.color.line }}
    >
      <IconDisc name={icon} size={40} tone={danger ? "danger" : "ok"} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, fontWeight: tokens.font.weight.bold, color: danger ? tokens.color.danger : tokens.color.ink }}>{title}</Text>
        <Muted size={12}>{sub}</Muted>
      </View>
      <Icon name="chevron-right" size={18} color={tokens.color.muted} />
    </Tappable>
  );
}

/**
 * Get help (state 11): over a scrim, a sheet with Emergency (dials 999 and alerts LyniaGo's safety team
 * with the last-known location), Call LyniaGo support, Share my trip and Report a problem. The trip keeps
 * running underneath.
 */
export function HelpPanel({
  visible,
  onClose,
  onEmergency,
  onShareTrip,
  onReport,
}: {
  visible: boolean;
  onClose: () => void;
  /** Dials the emergency number and alerts LyniaGo's safety team (the screen owns the API call). */
  onEmergency: () => void;
  onShareTrip: () => void;
  onReport: () => void;
}): React.ReactElement {
  const dial = useDial();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(20,24,27,0.45)" }}>
        <Tappable style={{ flex: 1 }} onPress={onClose} accessibilityRole="button" accessibilityLabel={A.close} />
        <SafeAreaView edges={["bottom"]} style={{ backgroundColor: tokens.color.bg, borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingHorizontal: 16, paddingBottom: 12 }}>
          <PanelGrabber />
          <H2>{A.helpT}</H2>
          <Muted style={{ marginTop: 2, marginBottom: 8 }}>{A.helpSub}</Muted>
          <HelpRow icon="phone" title={orderText.emergency(SOS_POLICY.emergencyNumber)} sub={A.emergencySub} danger onPress={onEmergency} />
          <HelpRow icon="phone" title={A.support} sub={A.supportSub} onPress={() => dial(SOS_POLICY.safetyLine)} />
          <HelpRow icon="share-2" title={A.shareTrip} sub={A.shareTripSub} onPress={onShareTrip} />
          <HelpRow icon="circle-alert" title={A.report} sub={A.reportSub} onPress={onReport} />
          <View style={{ marginTop: 8 }}>
            <CtaButton ghost label={A.close} onPress={onClose} />
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

/**
 * 2.16 — the full-screen pickup photo: `ink` ground, a 44px "✕ Close" pill, the title, the image (fit to
 * the screen) and the "Taken by Tendai at 09:12 · Eastgate Mall, CBD" caption. Android Back closes it.
 */
export function PhotoViewer({ url, caption, visible, onClose }: { url: string | null; caption: string; visible: boolean; onClose: () => void }): React.ReactElement {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: tokens.color.ink }}>
        <View style={{ minHeight: 52, flexDirection: "row", alignItems: "center", paddingHorizontal: 8, gap: 4 }}>
          <Tappable
            tone="onDark"
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={A.close}
            style={{ minHeight: tokens.touchTargetMin, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, borderRadius: tokens.radius.pill, backgroundColor: "rgba(255,255,255,0.12)" }}
          >
            <Icon name="x" size={18} color={tokens.color.onAccent} />
            <Text style={{ fontSize: 15, fontWeight: tokens.font.weight.bold, color: tokens.color.onAccent }}>{A.close}</Text>
          </Tappable>
          <Text accessibilityRole="header" style={{ flex: 1, textAlign: "center", fontSize: 16, fontWeight: tokens.font.weight.bold, color: tokens.color.onAccent, marginRight: 96 }}>
            {A.photo}
          </Text>
        </View>
        <View style={{ flex: 1, paddingVertical: 12 }}>
          {url ? <RemoteImage source={{ uri: url }} cachePolicy="memory" resizeMode="contain" accessibilityLabel={A.photo} style={{ flex: 1, width: "100%" }} /> : null}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 12, paddingHorizontal: 16, paddingBottom: 20 }}>
          <Icon name="camera" size={18} color={tokens.color.onAccent} />
          <Text style={{ flex: 1, fontSize: 14, lineHeight: 20, color: tokens.color.onAccent }}>{caption}</Text>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

/**
 * 2.17 — Report a problem, a panel over the trip: one type (Wrong item · Damaged · Rider behaviour ·
 * Payment · Other), an optional "Tell us more", "Send to our team" (disabled until a type is picked),
 * then the thanks state. The screen owns the request (`onSend`, resolves true on success).
 */
export function ReportPanel({ visible, onClose, onSend }: { visible: boolean; onClose: () => void; onSend: (typeIndex: number, text: string) => Promise<boolean> }): React.ReactElement {
  const [type, setType] = React.useState<number | null>(null);
  const [text, setText] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  const close = (): void => {
    onClose();
    setTimeout(() => {
      setType(null);
      setText("");
      setDone(false);
    }, 250);
  };
  const send = (): void => {
    if (type == null || sending) return;
    setSending(true);
    void onSend(type, text.trim())
      .then((ok) => {
        if (ok) setDone(true);
      })
      .finally(() => setSending(false));
  };
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(20,24,27,0.45)" }}>
        <Tappable style={{ flex: 1 }} onPress={close} accessibilityRole="button" accessibilityLabel={A.close} />
        <SafeAreaView edges={["bottom"]} style={{ backgroundColor: tokens.color.bg, borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingHorizontal: 16, paddingBottom: 12 }}>
          <PanelGrabber />
          {done ? (
            <View style={{ alignItems: "center", gap: 8, paddingTop: 8, paddingBottom: 16 }}>
              <IconDisc name="circle-check" tone="ok" />
              <H2 style={{ textAlign: "center" }}>{A.reportDone}</H2>
              <Muted size={14} style={{ textAlign: "center" }}>
                {A.reportDoneSub}
              </Muted>
            </View>
          ) : (
            <View style={{ gap: 10, paddingBottom: 12 }}>
              <View>
                <H2>{A.reportT}</H2>
                <Muted style={{ marginTop: 2 }}>{A.reportSub2}</Muted>
              </View>
              <Text style={{ fontSize: 13, fontWeight: tokens.font.weight.semibold, color: tokens.color.ink }}>{A.reportType}</Text>
              <Tags list={A.rp} on={type == null ? [] : [type]} onToggle={(i) => setType((c) => (c === i ? null : i))} />
              <Text style={{ fontSize: 13, fontWeight: tokens.font.weight.semibold, color: tokens.color.ink }}>
                {A.tellMore} <Text style={{ color: tokens.color.muted, fontWeight: tokens.font.weight.regular }}>· {A.optional}</Text>
              </Text>
              <TextInput
                value={text}
                onChangeText={setText}
                multiline
                maxLength={900}
                placeholder={A.tellMorePh}
                placeholderTextColor={tokens.color.muted}
                accessibilityLabel={A.tellMore}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                style={{
                  minHeight: 76,
                  borderWidth: focused ? 2 : 1,
                  borderColor: focused ? tokens.color.accentText : tokens.color.line,
                  borderRadius: tokens.radius.input,
                  paddingVertical: 10,
                  paddingHorizontal: focused ? 11 : 12,
                  fontSize: 15,
                  lineHeight: 21,
                  color: tokens.color.ink,
                  textAlignVertical: "top",
                }}
              />
            </View>
          )}
          {done ? <CtaButton ghost label={A.close} onPress={close} /> : <CtaButton label={A.sendTeam} onPress={send} disabled={type == null} loading={sending} />}
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
