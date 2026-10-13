/** Admin console v2 §6: how the money pages name rails, top-up states and anomalies. Short and plain. */

/** Mirrors the API's REVERSAL_CAP_USD: the most one reversal may take off a biker's balance. */
export const REVERSAL_CAP = 50;

export const RAIL_LABEL: Record<string, string> = {
  ecocash: "EcoCash",
  innbucks: "InnBucks",
  omari: "O'mari",
  manual: "Manual",
};

export function railLabel(rail: string | null | undefined): string {
  if (!rail) return "—";
  return RAIL_LABEL[rail] ?? rail;
}

/** `TopUp.declineReason` codes (api: TOPUP_DECLINE_*). */
export const DECLINE_LABEL: Record<string, string> = {
  rail_failed: "Refused by Paynow",
  expired: "Not paid in time",
};

export function declineLabel(code: string | null | undefined): string {
  if (!code) return "—";
  return DECLINE_LABEL[code] ?? code;
}

export const ANOMALY_LABEL: Record<"short_paid" | "paid_on_declined", string> = {
  short_paid: "short-paid",
  paid_on_declined: "paid on declined",
};
