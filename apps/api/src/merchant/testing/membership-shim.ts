/**
 * Test-only compatibility shim for merchant web upgrade L1 (plan 2026-09-29 D2).
 *
 * The pre-L1 merchant service specs model "this caller runs merchant X" by faking
 * `prisma.merchant.findUnique` — what the old `owner_profile_id` lookup called. Access now resolves
 * from `merchant_members` first (`resolveMerchantAccess`), so this derives an OWNER membership from
 * that same fake: a caller whose `merchant.findUnique` fake returns a row is that row's owner, and one
 * whose fake returns null is on no business. Each spec's intent is unchanged.
 *
 * Specs that fake `merchantMember` themselves are left alone. The resolver's legacy-owner lookup (a
 * `merchant.findFirst` over `members`) is answered with null, since unit specs have no pre-0053 owners,
 * so a spec's own `merchant.findFirst` fake (the customer-side restaurant read) is never mistaken for one.
 */
export function withMembershipShim<T extends Record<string, unknown>>(prisma: T): T {
  const p = prisma as Record<string, unknown>;
  if (p.merchantMember) return prisma;
  const merchant = (p.merchant ?? {}) as {
    findUnique?: (args: unknown) => Promise<{ id: string; businessType?: string } | null>;
    findFirst?: (args: unknown) => Promise<unknown>;
  };
  p.merchant = merchant;
  const ownFindFirst = merchant.findFirst;
  merchant.findFirst = async (args: unknown) => {
    const where = (args as { where?: { members?: unknown } } | undefined)?.where;
    if (where?.members) return null; // the resolver's legacy-owner lookup
    return ownFindFirst ? ownFindFirst(args) : null;
  };
  // The resolver reads the caller's active row with `findFirst` (multi-branch owners); the fake owns one.
  const ownRow = async () => {
    const row = merchant.findUnique ? await merchant.findUnique({ where: { ownerProfileId: "membership-shim" } }) : null;
    return row ? { merchantId: row.id, role: "owner", merchant: { businessType: row.businessType ?? "restaurant" } } : null;
  };
  p.merchantMember = {
    findFirst: ownRow,
    findUnique: ownRow,
    findMany: async () => {
      const row = await ownRow();
      return row ? [row] : [];
    },
    create: async () => ({}),
  };
  return prisma;
}
