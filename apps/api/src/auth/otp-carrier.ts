import type { OtpCarrier } from "../observability/metrics.service";

/**
 * Zimbabwe MCC/MNC → carrier (ITU E.212; MCC 648 = Zimbabwe). This is GROUND TRUTH, sourced from
 * Bird's delivery-status webhook (`data.mcc_mnc`) once a send has actually reached a handset —
 * confirmed against a live test send in docs/BIRD-SETUP.md (`mcc_mnc: "64804"` → Econet).
 */
const MCC_MNC_CARRIER: Readonly<Record<string, OtpCarrier>> = {
  "64801": "netone",
  "64803": "telecel",
  "64804": "econet",
};

export function carrierFromMccMnc(mccMnc: string | undefined): OtpCarrier {
  if (!mccMnc) return "other";
  return MCC_MNC_CARRIER[mccMnc] ?? "other";
}

/**
 * Best-effort MSISDN-prefix carrier guess for the send-attempt path, where no delivery report (and
 * therefore no MCC/MNC) exists yet. ONLY the prefixes below are unambiguous under current Zimbabwean
 * number-portability; `071`/`073` are shared across carriers post-port and are deliberately left
 * unmapped (→ "other") rather than guessed wrong. This must never be treated as ground truth — it is
 * a rough send-time label, superseded by {@link carrierFromMccMnc} once Bird's webhook reports in.
 */
const PREFIX_CARRIER: Readonly<Record<string, OtpCarrier>> = {
  "77": "econet",
  "78": "econet",
  "86": "netone",
  "88": "telecel",
};

export function carrierFromPhone(e164Phone: string): OtpCarrier {
  const match = /^\+263(\d{2})/.exec(e164Phone);
  if (!match) return "other";
  return PREFIX_CARRIER[match[1]] ?? "other";
}
