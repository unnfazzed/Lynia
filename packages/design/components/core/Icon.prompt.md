**Icon** — Lucide line icon (rounded 2px outlines, the Grab-style icon language). Always pair with a visible text label.

```html
<!-- self-hosted 22-icon subset, ~5KB (never the full CDN library — data budget) -->
<script src="assets/lynia-icons.js"></script>
```

```jsx
<Icon name="bike" size={24} color="var(--accent-text)" />
<Icon name="map-pin" />
<Icon name="star" fill="var(--highlight)" color="var(--highlight)" />
```

House set: `bike` rider/no-offers · `inbox` no-orders · `id-card` KYC · `banknote` earnings · `package` parcels · `wifi-off` network error · `triangle-alert` failed · `map-pin` pins · `phone` call · `clock` ETA · `chevron-right`/`chevron-down` disclosure · `star` rating (fill gold). Green icons use `var(--accent-text)`, never bright `--accent`.
