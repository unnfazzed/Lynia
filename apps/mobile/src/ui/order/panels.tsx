import { SOS_POLICY } from "@lynia/shared";
import { tokens } from "@lynia/shared/tokens";
import React from "react";
import { ActivityIndicator, Modal, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Icon, type IconName } from "../Icon";
import { RemoteImage } from "../RemoteImage";
import { Tappable } from "../Tappable";
import { useDial } from "../useDial";
import { ORDER_COPY as A, orderText } from "./copy";
import { CtaButton, H2, IconDisc, Muted } from "./kit";

/**
 * The order screen's chrome and overlays (After Send handoff, ledger D-53): the Send-flow header with
 * the per-stage title and the red Help pill, the ink "Reconnecting…" banner, the Get help panel and the
 * full-screen pickup-photo viewer.
 */

/** "‹ Back · Title · [Help]" — 52px row on a 1fr auto 1fr grid, 1px line under it. */
export function OrderHeader({ title, help, onBack, onHelp }: { title: string; help: boolean; onBack: () => void; onHelp: () => void }): React.ReactElement {
  return (
    <View style={{ height: 53, flexDirection: "row", alignItems: "center", paddingHorizontal: 8, backgroundColor: tokens.color.bg, borderBottomWidth: 1, borderBottomColor: tokens.color.line, zIndex: 20 }}>
      <View style={{ flex: 1, alignItems: "flex-start" }}>
        <Tappable
          tone="icon"
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel={A.back}
          style={{ height: tokens.touchTargetMin, flexDirection: "row", alignItems: "center", gap: 2, paddingRight: 8 }}
        >
          <View style={{ transform: [{ rotate: "90deg" }] }}>
            <Icon name="chevron-down" size={22} color={tokens.color.accentText} />
          </View>
          <Text style={{ fontSize: 15, fontWeight: tokens.font.weight.semibold, color: tokens.color.accentText }}>{A.back}</Text>
        </Tappable>
      </View>
      <Text accessibilityRole="header" numberOfLines={1} style={{ fontSize: 16, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>
        {title}
      </Text>
      <View style={{ flex: 1, alignItems: "flex-end" }}>
        {help ? (
          <Tappable
            tone="icon"
            onPress={onHelp}
            accessibilityRole="button"
            accessibilityLabel={A.helpT}
            style={{ height: tokens.touchTargetMin, justifyContent: "center" }}
          >
            <View style={{ height: 34, flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, borderRadius: tokens.radius.pill, borderWidth: 1.5, borderColor: tokens.color.danger }}>
              <Icon name="life-buoy" size={15} color={tokens.color.danger} />
              <Text style={{ fontSize: 13, fontWeight: tokens.font.weight.bold, color: tokens.color.danger }}>{A.help}</Text>
            </View>
          </Tappable>
        ) : null}
      </View>
    </View>
  );
}

/** The ink banner directly under the header while offline (state 19). */
export function ReconnectBanner({ lastUpdate }: { lastUpdate: string }): React.ReactElement {
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: tokens.color.ink, paddingVertical: 10, paddingHorizontal: 14, zIndex: 21 }}
    >
      <ActivityIndicator size="small" color={tokens.color.onAccent} style={{ width: 16, height: 16 }} />
      <Text style={{ flex: 1, fontSize: 13, lineHeight: 18, color: tokens.color.onAccent }}>{orderText.offline(lastUpdate)}</Text>
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
          <View style={{ height: 16, alignItems: "center", justifyContent: "center" }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: tokens.color.line }} />
          </View>
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

/** The full-screen pickup-photo viewer opened by "View". */
export function PhotoViewer({ url, visible, onClose }: { url: string | null; visible: boolean; onClose: () => void }): React.ReactElement {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: tokens.color.ink }}>
        <View style={{ flexDirection: "row", justifyContent: "flex-end", padding: 8 }}>
          <Tappable
            tone="onDark"
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={A.close}
            style={{ height: tokens.touchTargetMin, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14 }}
          >
            <Icon name="x" size={18} color={tokens.color.onAccent} />
            <Text style={{ fontSize: 15, fontWeight: tokens.font.weight.semibold, color: tokens.color.onAccent }}>{A.close}</Text>
          </Tappable>
        </View>
        {url ? (
          <RemoteImage
            source={{ uri: url }}
            cachePolicy="memory"
            resizeMode="contain"
            accessibilityLabel={A.photo}
            style={{ flex: 1, width: "100%" }}
          />
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}
