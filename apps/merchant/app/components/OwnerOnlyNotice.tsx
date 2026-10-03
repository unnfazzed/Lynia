/**
 * What Staff see on a screen that is the owner's (merchant web upgrade L4, the design doc's permission
 * table), if they reach it by an old link or bookmark: one plain line in place of controls the API would
 * refuse. Their own nav never links here. It is the muted line Team and Taking orders already show Staff
 * ("Only the owner can see and change the team."), not a card of its own: merchant-mobile cards are for
 * content, and the handoff draws no Staff screen.
 */
export function OwnerOnlyNotice({ children }: { children: React.ReactNode }) {
  return (
    <p role="status" className="m-sub">
      {children}
    </p>
  );
}
