"use server";

import { revalidatePath } from "next/cache";
import { adminPostJson, describeAdminPostFailure } from "../lib/api";
import type { NudgeResult } from "../lib/adminTypes";
import { fmtTime } from "../lib/format";

/**
 * Admin console v2 §4: Nudge one stuck person (push only, owner decision 6). The API writes the audit row and
 * enforces one per person per list per Harare day; this action THROWS on anything but a delivered push, so the
 * dialog stays open and says what happened ("no push", "already nudged today", "not delivered").
 */
export async function nudgePerson(profileId: string, step: string, reasonCode: string | null, note: string): Promise<void> {
  if (!profileId) throw new Error("Nobody to nudge — reload the page.");
  const res = await adminPostJson<NudgeResult>("/admin/nudge", { profileId, step, reason: reasonCode ?? "", note: note || null });
  if (!res.ok) throw new Error(`Couldn't nudge: ${describeAdminPostFailure(res)}`);
  const out = res.data;
  revalidatePath("/people");
  if (out?.result === "sent") return;
  if (out?.result === "no_push") throw new Error("No push: this person has no phone with notifications on. Call or WhatsApp them instead.");
  if (out?.result === "already_sent") throw new Error(`Already nudged for this today, at ${fmtTime(out.at)}. One a day.`);
  if (out?.result === "not_delivered") throw new Error("The push wasn't accepted by their phone. Call or WhatsApp them instead.");
  throw new Error("Couldn't nudge — try again.");
}
