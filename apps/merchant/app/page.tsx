/**
 * P0 scaffold placeholder (docs/plans/2026-07-26-merchant-verticals-plan.md, P0 row).
 *
 * The real login (phone + OTP, reusing the Auth module) and the live order queue land with P3,
 * gated on the approved design-track output. This page exists so the workspace/build/CI
 * integration is proven long before the product surface — the scaffold is in every
 * typecheck/lint/build from today.
 *
 * No auth middleware yet BY DESIGN: this app serves only this static placeholder and holds no
 * token, no data, and no API access. The fail-closed access model (admin-console precedent,
 * docs/SECURITY.md P0-2) is a P3 requirement that must arrive WITH the first authenticated
 * surface, not after it.
 */
export default function Placeholder() {
  return (
    <main style={{ display: "grid", placeItems: "center", minHeight: "100vh" }}>
      <div style={{ textAlign: "center" }}>
        <h1>LyniaGo Merchant</h1>
        <p>The merchant dashboard is not yet live.</p>
      </div>
    </main>
  );
}
