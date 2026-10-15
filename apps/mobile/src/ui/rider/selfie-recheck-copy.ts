/**
 * The selfie re-check reminder (owner 2026-10-15, ledger D-110). No handoff draws it: ops ask a verified biker for
 * a new selfie check, and Bike & documents' National ID row carries the reminder and its Redo. It is a reminder,
 * never a gate, so nothing here says the biker must stop. The push itself is the API's `KYC_PUSH_COPY.selfie_recheck`.
 */
export const SR = {
  /** The National ID row's sub-line while a re-check is asked for. */
  rowSub: "Please redo your selfie check",
  /** The row's action (the same trailing-value slot as Bike & documents' "Edit" / "Change"). */
  redo: "Redo",
} as const;
