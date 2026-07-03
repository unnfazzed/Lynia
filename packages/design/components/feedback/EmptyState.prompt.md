**EmptyState** — Lynia's "a dead-end becomes an action" pattern. Lucide icon in a round mint tile, bold title, short reassuring message, one primary recovery action. Needs `assets/lynia-icons.js` on the page (see Icon).

```jsx
<EmptyState icon="bike" title="No riders took this price yet"
  message="Your window closed with no offers. Nudging the price up usually gets a rider fast.">
  <Button label="Send another request" onClick={rebroadcast} />
</EmptyState>

<EmptyState icon="wifi-off" title="Couldn't load nearby orders" message="Check your connection and try again.">
  <Button label="Retry" onClick={retry} />
</EmptyState>
```

House icons: `bike` no-offers · `inbox` no-orders · `id-card` KYC · `banknote` earnings · `package` no-trips · `wifi-off` network error · `triangle-alert` failed. Keep the message short and end on an action.
