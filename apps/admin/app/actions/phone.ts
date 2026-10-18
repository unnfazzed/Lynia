"use server";

import { adminFetch, adminPostJson, describeAdminPostFailure } from "../lib/api";

/**
 * Owner 2026-10-18: a person's full phone number, on demand, for the operators named in the API's
 * `ADMIN_PHONE_REVEAL_OPERATORS`. The API decides who may (from the signed-in operator this console forwards)
 * and writes the audit row; this only carries the answer back to the button.
 */
export async function revealPhone(profileId: string): Promise<{ phone: string } | { error: string }> {
  if (!profileId) return { error: "No person — reload the page." };
  const res = await adminPostJson<{ phone: string }>(`/admin/people/${profileId}/reveal-phone`, {});
  if (res.ok) return { phone: res.data.phone };
  if (res.reason === "http" && res.status === 403) return { error: "You can't see full phone numbers." };
  if (res.reason === "http" && res.status === 429) return { error: "Too many numbers this hour — try again later." };
  return { error: describeAdminPostFailure(res) };
}

/** Whether the signed-in operator may reveal numbers. False on any failure, so the button stays hidden. */
export async function canRevealPhones(): Promise<boolean> {
  const res = await adminFetch<{ allowed?: boolean }>("/admin/phone-reveal");
  return res?.allowed === true;
}
