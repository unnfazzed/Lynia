import type { FleetBikerRow, FleetInviteRow, FleetInviteState, OwnerFleetResponse } from "@lynia/shared";
import { OBM } from "./own-bikers-copy";
import { whatsAppLink } from "./whatsapp";

/** OB-M2 invite row: what the invitee has done so far. `expired` has its own row ("Link expired · New link"). */
export const INVITE_STATE_LABEL: Record<Exclude<FleetInviteState, "expired">, string> = {
  not_opened: OBM.invNotOpened,
  signing_up: OBM.invSigningUp,
  waiting_id_check: OBM.invWaitingId,
};

/** OB-M2 `sentAgo`: "2d", "5h", "1h" (at least an hour, so a fresh link reads "Shared 1h ago" like the drawing). */
export function sharedAgo(sharedAt: string, now: number): string {
  const mins = Math.max(0, (now - Date.parse(sharedAt)) / 60_000);
  if (mins >= 24 * 60) return `${Math.floor(mins / (24 * 60))}d`;
  return `${Math.max(1, Math.floor(mins / 60))}h`;
}

/** The roster order: on a job, then online, then offline; by name within each (the drawing's order). */
const STATE_RANK: Record<FleetBikerRow["state"], number> = { on_a_job: 0, online: 1, offline: 2 };
export function sortBikers(bikers: readonly FleetBikerRow[]): FleetBikerRow[] {
  return [...bikers].sort((a, b) => STATE_RANK[a.state] - STATE_RANK[b.state] || a.name.localeCompare(b.name));
}

/** Live invites in the order they were shared (the drawing's Kuda 2d, Rufaro 5h, then 1h), expired ones last. */
export function sortInvites(invites: readonly FleetInviteRow[]): FleetInviteRow[] {
  return [...invites].sort((a, b) => Number(a.state === "expired") - Number(b.state === "expired") || Date.parse(a.sharedAt) - Date.parse(b.sharedAt));
}

/** The invitee's number as the sheet shows it: "+263 77 555 0192" for a Zimbabwe mobile, else "+" and the digits. */
export function invitePhone(digits: string): string {
  const d = digits.replace(/\D/g, "");
  const zw = /^263(\d{2})(\d{3})(\d{4})$/.exec(d);
  return zw ? `+263 ${zw[1]} ${zw[2]} ${zw[3]}` : `+${d}`;
}

/**
 * OB-M1: the Account row's value. Owner "4 bikers · 1 invite open", staff "4 bikers", and a paused fleet the gold
 * "Paused" chip instead. Null = this business has no Own bikers (the row isn't drawn).
 */
export type OwnBikersRow = null | { kind: "value"; text: string } | { kind: "paused" };
export function ownBikersRow(fleet: Pick<OwnerFleetResponse, "enabled" | "paused" | "role" | "bikers" | "invites"> | null): OwnBikersRow {
  if (!fleet?.enabled) return null;
  if (fleet.paused) return { kind: "paused" };
  const live = fleet.invites.filter((i) => i.state !== "expired").length;
  return { kind: "value", text: fleet.role === "owner" ? OBM.ownBikersV(fleet.bikers.length, live) : OBM.ownBikersStaffV(fleet.bikers.length) };
}

/** "Share on WhatsApp": the invitee's own chat, the handoff's `waText` with the link after it. */
export function inviteWhatsApp(phoneDigits: string, name: string, branch: string, link: string): string {
  return whatsAppLink(phoneDigits, `${OBM.waText(name, branch)} ${link}`);
}

