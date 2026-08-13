/**
 * Display-name short form the design mocks draw on identity rows — "Chipo M." (settings profile),
 * "Tendai M." (rider cards): first name + surname initial + period. Mock copy is verbatim authority
 * (CLAUDE.md Pixel parity), so surfaces whose mock draws this form render it rather than the full
 * stored name. Single-word names and empty input pass through unchanged — display never drops text.
 */
export function formatNameShort(fullName: string): string {
  if (typeof fullName !== "string") return "";
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const first = parts[0] ?? "";
  const last = parts.length >= 2 ? parts[parts.length - 1] : undefined;
  const initial = last?.charAt(0)?.toUpperCase();
  return initial ? `${first} ${initial}.` : first;
}
