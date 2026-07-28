import React from "react";

/** Faux phone status bar — 09:41 · 3G · 84%. `dark` renders light-on-accent. */
export function StatusBar({ dark = false, time = "09:41", network = "3G", battery = "84%", style, ...rest }) {
  const c = dark ? "rgba(255,255,255,.9)" : "var(--ink)";
  return (
    <div style={{ display: "flex", alignItems: "center", height: 26, padding: "0 14px 0 16px", fontSize: 10.5, fontWeight: 700, color: c, fontVariantNumeric: "tabular-nums", fontFamily: "var(--font-sans)", ...style }} {...rest}>
      {time}<span style={{ flex: 1 }} /><span style={{ opacity: 0.75 }}>{network}</span><span style={{ marginLeft: 6, opacity: 0.75 }}>{battery}</span>
    </div>
  );
}
