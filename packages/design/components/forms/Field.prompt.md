**Field** — labelled text input with inline validation. The label always sits above the field (SR-associated); Lynia never uses placeholder-as-label.

```jsx
<Field label="What are you sending?" value={item} onChange={setItem} placeholder="Documents envelope" />
<Field label="Your price (USD)" value={fare} onChange={setFare} inputMode="decimal"
  hint="Riders on this route usually accept around $2.40." />
<Field label="National ID number" value={id} onChange={setId} inputMode="numeric"
  error="Enter the 8–12 digits on your ID card." />
<Field label="Pickup landmark" value={lm} onChange={setLm} fromMap />
```

Props: `error` (red border + specific message, role=alert), `hint` (muted helper), `inputMode` for numeric/decimal/tel keyboards, `maxLength`, `fromMap`, `disabled`, `multiline` (+ `rows`) for a paragraph textarea (shows a live `n/max` counter when `maxLength` is set). Error copy is honest and tells the user how to fix it — never just "Invalid".

```jsx
<Field label="Note for the rider (optional)" value={note} onChange={setNote}
  multiline rows={3} maxLength={280}
  placeholder="Ask for Rita at the pharmacy counter; parcel is fragile." />
```
