"use server";

import { adminPostJson, describeAdminPostFailure } from "../lib/api";

/**
 * Owner 2026-10-18: a person's full phone number, on demand, for any admin. The API writes the audit row (naming the
 * signed-in operator this console forwards); this only carries the answer back to the button.
 */
export async function revealPhone(profileId: string): Promise<{ phone: string } | { error: string }> {
  if (!profileId) return { error: "No person — reload the page." };
  const res = await adminPostJson<{ phone: string }>(`/admin/people/${profileId}/reveal-phone`, {});
  if (res.ok) return { phone: res.data.phone };
  if (res.reason === "http" && res.status === 429) return { error: "Too many numbers this hour — try again later." };
  return { error: describeAdminPostFailure(res) };
}
