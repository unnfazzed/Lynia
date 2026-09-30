import type { Step } from "../../lib/orders-view";

/** The delivery stepper (B6), the merchant variant: numbered circles, ✓ when done, the time inline. */
export function Stepper({ steps }: { steps: readonly Step[] }) {
  return (
    <ol className="m-stp" style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {steps.map((s, i) => (
        <li key={s.label} className="m-sr" data-state={s.state === "todo" ? undefined : s.state}>
          <span className="m-c">{s.state === "done" ? "✓" : i + 1}</span>
          <b>
            {s.label}
            <span>{s.time}</span>
          </b>
        </li>
      ))}
    </ol>
  );
}
