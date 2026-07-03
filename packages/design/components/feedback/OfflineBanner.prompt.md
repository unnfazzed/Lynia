**OfflineBanner** — the global connectivity affordance. Mount it once at the top of every screen; it renders nothing while online.

```jsx
<OfflineBanner state={netState} />  {/* "online" | "offline" | "reconnecting" */}
```

Offline = calm ink bar ("You're offline — some things may be out of date."); reconnecting = muted strip. A dropped connection is a **state, not an alarm** — never danger-red. Pairs with per-feature fallbacks (frozen auction timer, "Live paused" map hint, poll fallback).
