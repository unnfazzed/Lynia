import type { Prisma } from "@prisma/client";

/**
 * The ONE block-pair predicate, server-enforced. A Block is directional in the row (blocker → blocked),
 * but a block must prevent a *rematch* either way round — a customer who blocked a rider and a rider
 * who blocked a customer both mean "never pair these two again". This builds the symmetric `where`
 * (both directions) used at the enforcement point in matching (selectOffer) and anywhere else that
 * needs to ask "are these two blocked from re-matching?". Kept as a pure builder so it composes with a
 * transaction client (`tx.block.findFirst(blockedPairWhere(a, b))`) inside the assignment CAS.
 */
export function blockedPairWhere(profileA: string, profileB: string): Prisma.BlockWhereInput {
  return {
    OR: [
      { blockerProfileId: profileA, blockedProfileId: profileB },
      { blockerProfileId: profileB, blockedProfileId: profileA },
    ],
  };
}
