/**
 * "Rider" → "Biker", app-wide (owner, 2026-10-12; ledger D-98). The design handoffs still say "rider";
 * the app shows "biker". Tests that compare app copy to a handoff verbatim compare it to
 * `bikerWording(handoff)`, so the handoff stays the authority for every other word.
 */
const BIKER: Record<string, string> = { rider: "biker", riders: "bikers", Rider: "Biker", Riders: "Bikers", RIDER: "BIKER", RIDERS: "BIKERS" };

export function bikerWording(text: string): string {
  return text.replace(/\b(rider|riders|Rider|Riders|RIDER|RIDERS)\b/g, (w) => BIKER[w] ?? w);
}
