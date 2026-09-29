import { cardStyle } from "./queue/styles";

/**
 * What Staff see on a screen that is the owner's (merchant web upgrade L4, the design doc's permission
 * table), if they reach it by an old link or bookmark: one plain line in place of controls the API would
 * refuse. Their own nav never links here.
 */
export function OwnerOnlyNotice({ children }: { children: React.ReactNode }) {
  return (
    <div role="status" style={{ ...cardStyle, fontSize: 14, lineHeight: 1.5, maxWidth: 520 }}>
      {children}
    </div>
  );
}
