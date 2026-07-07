/**
 * Pure helpers for the rider/sender avatar — the face (or its monogram stand-in) that anchors trust on
 * the bid cards, the way inDrive/Uber lead selection with a person, not a row of text. Kept
 * framework-free so the initials + colour logic unit-tests off-device.
 */

/**
 * Up to two initials from a first/last name, upper-cased. Falls back to the first two letters of a
 * single name, then to a neutral dot so the monogram is never blank. Tolerant of empty/whitespace and
 * accented scripts (takes the first code point of each part).
 */
export function initials(firstName?: string | null, lastName?: string | null): string {
  const first = (firstName ?? "").trim();
  const last = (lastName ?? "").trim();
  const a = [...first][0];
  const b = [...last][0];
  if (a && b) return (a + b).toUpperCase();
  if (a) {
    // Single name → first two letters (so "Tinashe" → "TI", not just "T").
    const two = [...first].slice(0, 2).join("");
    return two.toUpperCase();
  }
  return "•";
}

/**
 * A stable, legible background tint for a monogram, chosen deterministically from a seed (the rider's
 * profileId or name) so the same person always gets the same colour. All entries are muted washes that
 * carry dark ink at ≥4.5:1 — no bright fill that would fight the accent green or fail contrast.
 */
export const AVATAR_TINTS = ["#E9F8EF", "#E7F0FB", "#FBEEF3", "#FBF4E6", "#EDEBFB", "#E6F6F6"] as const;

export function avatarTint(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  const idx = Math.abs(hash) % AVATAR_TINTS.length;
  return AVATAR_TINTS[idx] as string;
}
