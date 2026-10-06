import * as Application from "expo-application";
import * as Notifications from "expo-notifications";
import { Linking, Platform } from "react-native";
import { openPhoneSettings, type PermLike } from "./location";

/**
 * Notification permission + the rider's job-alert channel, as First Run v2 reads them (handoff
 * `first-run-v2` README §3–§4, ledger D-82). Every read is best-effort and never throws.
 */

export type NotifState = "undetermined" | "granted" | "denied" | "blocked";

/** The job-alert channel (P9's test ping, P12's muted check, the settings "Job alerts" row). */
export const JOB_ALERTS_CHANNEL = "job-alerts";
/** The app's default channel (`src/push/push.ts`). Builds before D-82 had no `job-alerts` channel, and FCM
 *  then posts job pushes here — so P12 treats a rider as muted when either channel is. */
export const DEFAULT_CHANNEL = "default";

/** A notification permission answer → the four states. Pure. */
export function classifyNotif(p: PermLike): NotifState {
  if (!p) return "denied";
  if (p.granted || p.status === "granted") return "granted";
  if (p.status === "undetermined") return "undetermined";
  return p.canAskAgain === false ? "blocked" : "denied";
}

/** A channel is "muted" for a job alarm when it no longer pops with sound (importance below HIGH). Pure. */
export function channelIsMuted(ch: { importance?: number | null } | null | undefined): boolean {
  if (!ch || ch.importance == null) return false;
  return ch.importance < Notifications.AndroidImportance.HIGH;
}

export async function readNotif(): Promise<NotifState> {
  try {
    return classifyNotif(await Notifications.getPermissionsAsync());
  } catch {
    return "denied";
  }
}

/**
 * Android 8+ only: create (idempotently) the job-alert channel — HIGH importance (pops on screen) with
 * sound. The API posts rider job pings and food-offer alarms here (`android.notification.channelId`); a
 * rider can later lower it in the phone's settings, which P12 detects. Created by the rider tab shell,
 * the rider flow and Settings.
 */
export async function ensureJobAlertChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    await Notifications.setNotificationChannelAsync(JOB_ALERTS_CHANNEL, {
      name: "Job alerts",
      importance: Notifications.AndroidImportance.HIGH,
      sound: "default",
      vibrationPattern: [0, 250, 150, 250],
      lightColor: "#00B14F",
    });
  } catch {
    /* best-effort */
  }
}

/** Which channel, if any, is silencing a rider's job alerts (P12). Null when both pop with sound. */
export async function mutedJobChannel(): Promise<string | null> {
  if (Platform.OS !== "android") return null;
  for (const id of [JOB_ALERTS_CHANNEL, DEFAULT_CHANNEL]) {
    try {
      if (channelIsMuted(await Notifications.getNotificationChannelAsync(id))) return id;
    } catch {
      /* unreadable → not muted */
    }
  }
  return null;
}

/** The Android 13+ POST_NOTIFICATIONS dialog (PC9/P10). */
export async function requestNotif(): Promise<NotifState> {
  try {
    return classifyNotif(await Notifications.requestPermissionsAsync());
  } catch {
    return readNotif();
  }
}

/** P12: the job-alert channel's own settings page (falls back to the app's settings). */
export function openChannelSettings(channelId: string = JOB_ALERTS_CHANNEL): void {
  const pkg = Application.applicationId;
  if (Platform.OS !== "android" || !pkg) return openPhoneSettings();
  void Linking.sendIntent("android.settings.CHANNEL_NOTIFICATION_SETTINGS", [
    { key: "android.provider.extra.APP_PACKAGE", value: pkg },
    { key: "android.provider.extra.CHANNEL_ID", value: channelId },
  ]).catch(openPhoneSettings);
}

/**
 * P16: the phone's battery-optimisation list. The direct per-app ask (`ACTION_REQUEST_IGNORE_BATTERY_
 * OPTIMIZATIONS`) needs a manifest permission Play restricts — NEEDS NATIVE (ledger D-82 §4); this list
 * needs none.
 */
export function openBatterySettings(): void {
  if (Platform.OS !== "android") return openPhoneSettings();
  void Linking.sendIntent("android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS").catch(openPhoneSettings);
}

/** P9 / Settings: a local notification on the job-alert channel, so the rider hears what a job sounds like. */
export async function playTestAlert(title: string, body: string): Promise<void> {
  await ensureJobAlertChannel();
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: true },
      trigger: Platform.OS === "android" ? { channelId: JOB_ALERTS_CHANNEL } : null,
    });
  } catch {
    /* best-effort */
  }
}

