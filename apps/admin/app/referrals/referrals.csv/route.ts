import { adminFetchResult } from "../../lib/api";
import type { AdminReferrals } from "../../lib/adminTypes";
import { referralsCsv } from "../csv";

/**
 * Biker referrals (D-112) as a CSV download (`/referrals/referrals.csv`): one line per referral, for working
 * out payments in a spreadsheet. Built here from the page's own JSON; the browser never holds the admin token.
 */
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const res = await adminFetchResult<AdminReferrals>("/admin/referrals");
  if (!("data" in res)) {
    return new Response(`Couldn't get the referrals (${res.reason}).\n`, { status: 502, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  return new Response(referralsCsv(res.data), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="lynia-referrals.csv"',
      "Cache-Control": "no-store",
    },
  });
}
