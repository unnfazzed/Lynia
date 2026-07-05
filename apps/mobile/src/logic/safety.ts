import { ISSUE_TYPE_LABELS, type IssueType, REPORT_REASON_LABELS, type ReportReason } from "@lynia/shared";

/**
 * Pure helpers for the trust & safety surfaces (order-level support, report/block, SOS). The option
 * lists are derived from the shared label maps so the pickers can't drift from the canonical enums, and
 * the small validators + the `tel:` builder keep the screens declarative. Extracted here so the mapping
 * is unit-testable without rendering a form.
 */

export interface Option<T extends string> {
  value: T;
  label: string;
}

/** Turn a `Record<enumValue, label>` into an ordered option list for a chip picker. */
function toOptions<T extends string>(labels: Record<T, string>): Option<T>[] {
  return (Object.entries(labels) as [T, string][]).map(([value, label]) => ({ value, label }));
}

/** Issue-type options for the "get help with this trip" picker (A-05), in enum order. */
export const ISSUE_TYPE_OPTIONS: Option<IssueType>[] = toOptions(ISSUE_TYPE_LABELS);

/** Report-a-user reason options (both roles), in enum order. */
export const REPORT_REASON_OPTIONS: Option<ReportReason>[] = toOptions(REPORT_REASON_LABELS);

/** Max length of an issue description (mirrors RaiseIssueRequest). */
export const ISSUE_DESCRIPTION_MAX = 1000;
/** Max length of a report note (mirrors ReportUserRequest). */
export const REPORT_NOTE_MAX = 500;

/** Whether a "get help" submission is valid: a type picked and a non-empty, in-bounds description. */
export function canSubmitIssue(type: IssueType | null, description: string): boolean {
  const t = description.trim();
  return type !== null && t.length >= 1 && t.length <= ISSUE_DESCRIPTION_MAX;
}

/** Whether a report submission is valid: a reason picked and any note within bounds (note is optional). */
export function canSubmitReport(reason: ReportReason | null, note: string): boolean {
  return reason !== null && note.trim().length <= REPORT_NOTE_MAX;
}

/**
 * Build a dial-safe `tel:` URI from a human number. Emergency + safety-line numbers can arrive with
 * spaces, dashes or brackets (or a leading `+`); strip everything the dialler doesn't want so
 * `Linking.openURL` always gets a clean target. Returns null for an empty/garbage number so the caller
 * can hide the action rather than open a broken dialler.
 */
export function telUri(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const plus = raw.trimStart().startsWith("+") ? "+" : "";
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.length === 0) return null;
  return `tel:${plus}${digits}`;
}
