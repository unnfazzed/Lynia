import type { AdminReferrals } from "../lib/adminTypes";
import { FLAG_LABEL } from "./labels";

/** Biker referrals (D-112): the CSV behind /referrals/referrals.csv, one line per referral. */
const HEADER = [
  "referral_id",
  "joined_at",
  "referrer_id",
  "referrer_name",
  "code",
  "new_biker_id",
  "new_biker_name",
  "stage",
  "id_check",
  "verified_at",
  "jobs",
  "warnings",
  "paid_at",
  "paid_amount",
];

/** RFC 4180 quoting, and a leading ' on anything a spreadsheet would run as a formula. */
export function csvCell(v: string | number | null | undefined): string {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function referralsCsv(data: AdminReferrals): string {
  const lines = [HEADER.join(",")];
  for (const r of data.rows) {
    lines.push(
      [
        r.id,
        r.createdAt,
        r.referrer.id,
        r.referrer.name,
        r.referrer.code,
        r.friend.id,
        r.friend.name,
        r.stage,
        r.friend.kycStatus,
        r.friend.verifiedAt,
        r.friend.trips,
        r.flags.map((f) => FLAG_LABEL[f]).join("; "),
        r.paid?.at,
        r.paid?.amount,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}
