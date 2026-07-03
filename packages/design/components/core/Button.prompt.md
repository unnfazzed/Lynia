**Button** — the tap action, Grab shape language: full pills. Use exactly one `primary` per screen (the 52px bright-green CTA); everything else is `ghost` (pill outline, green text).

```jsx
<Button label="Broadcast request" onClick={submit} />
<Button label="Add details" variant="ghost" onClick={open} />
<Button label="Sending…" loading />
<Button label="Choose this rider" disabled />
```

Variants: `primary` (Grab-green #00B14F fill, white 600 text, 52px, presses to #009D3B) · `ghost` (transparent pill, hairline border, dark-green text, 44px). Props: `loading` (spinner + blocked), `disabled` (0.5 opacity), `block` (full-width, default true).
