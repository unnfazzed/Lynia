**StatusPill** — a small pill for an order status, or the rider's online/offline connection chip.

```jsx
<StatusPill status="en_route_pickup" />
<StatusPill status="Online" tone="online" dot />
<StatusPill status="Offline" tone="offline" dot />
```

Tones: `neutral` (dark-green text on grey), `online` (dark-green text on the mint wash + bright-green dot), `offline`/`reconnecting` (muted — a paused connection is transient, never red). `dot` adds the leading status dot. Underscores in `status` become spaces.
