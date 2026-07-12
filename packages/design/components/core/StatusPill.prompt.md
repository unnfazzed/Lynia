**StatusPill** — a small pill for an order status, or the rider's online/offline connection chip.

```jsx
<StatusPill status="en_route_pickup" />
<StatusPill status="Online" tone="online" dot />
<StatusPill status="Offline" tone="offline" dot />
<StatusPill status="delivered" tone="success" />
<StatusPill status="cancelled" tone="offline" />
```

Tones: `neutral` (dark-green text on grey — the default for any in-progress status), `online`/`success` (dark-green text on the mint wash + bright-green dot — a live connection and a positive order outcome read the same calm "good" way), `offline`/`reconnecting` (muted — a paused connection AND a negative order outcome like cancelled/undelivered share this: the pill stays a calm status label, never red; put any red accent on a surrounding icon/headline instead). `dot` adds the leading status dot. Underscores in `status` become spaces.
