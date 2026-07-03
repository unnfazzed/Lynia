**Stepper** — the §5c delivery journey timeline. One timeline, two paired views: the customer and rider see the same 7 steps labelled from their own side.

```jsx
<Stepper
  view="customer"
  currentStatus="en_route_pickup"
  events={[
    { status: "assigned", createdAt: "2026-07-02T09:10:00Z" },
    { status: "confirmed", createdAt: "2026-07-02T09:12:00Z" },
    { status: "en_route_pickup", createdAt: "2026-07-02T09:14:00Z" },
  ]}
/>
```

Steps: assigned → confirmed → en_route_pickup → picked_up → en_route_dropoff → delivered → completed. Done steps show ✓ + time in accent; the current step is accent + "· live"; future steps are muted. Pass `view="rider"` for the rider-side labels.
