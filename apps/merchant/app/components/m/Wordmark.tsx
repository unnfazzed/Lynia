/** "LyniaGo Merchant" (merchant-mobile README, global change 1): the 34px mark, the Fredoka wordmark with
 *  "Go" in --accent, and the mint "Merchant" pill. */
export function MerchantLockup() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- a static brand SVG from /public */}
      <img src="/brand/lyniago-mark.svg" alt="" width={34} height={34} />
      <span className="m-wm">
        Lynia<span style={{ color: "var(--accent)" }}>Go</span>
      </span>
      <span className="m-pl m-wal">Merchant</span>
    </div>
  );
}
