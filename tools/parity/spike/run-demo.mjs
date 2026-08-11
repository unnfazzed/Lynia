import { transpile } from "./transpile.mjs";

// A REAL mock component, verbatim from packages/design/explorations/journey/screens-shipped.jsx (AddrRows).
const MOCK = `
function AddrRows({ pickup, drop, dropStyle }) {
  const Row = ({ role, value, ph }) => {
    const color = role === "pickup" ? "var(--accent)" : "var(--danger)";
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 11, minHeight: 48, padding: "6px 12px" }}>
        <span style={{ width: 12, height: 12, borderRadius: role === "pickup" ? "50%" : 3, background: value ? color : "var(--bg)", border: "2px solid var(--accent)", flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".05em", color: "var(--muted)" }}>{role === "pickup" ? "PICKUP" : "DROP-OFF"}</div>
          <div style={{ fontSize: 14.5, fontWeight: 600, color: value ? "var(--ink)" : "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value || ph}</div>
        </div>
        <Icon name={value ? "pencil" : "search"} size={16} color="var(--muted)" />
      </div>
    );
  };
  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: "var(--radius-input)", background: "var(--bg)", marginBottom: 10, overflow: "hidden" }}>
      <Row role="pickup" value={pickup} ph="Set pickup location" />
      <div style={{ height: 1, background: "var(--line)", marginLeft: 35 }} />
      <Row role="drop" value={drop} ph="Where to?" />
    </div>
  );
}
`;
const report = { clean:0, transform:0, flagged:[] };
const out = transpile(MOCK, report);
console.log("======== GENERATED RN (structure-preserving) ========\n");
console.log(out);
console.log("\n======== FIDELITY REPORT ========");
console.log(`style decls mapped clean:      ${report.clean}`);
console.log(`style decls value-transformed: ${report.transform}`);
console.log(`FLAGGED for human review:      ${report.flagged.length}`);
report.flagged.forEach(f => console.log("   ⚠ " + f));
