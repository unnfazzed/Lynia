**Skeleton / SkeletonList** — content-shaped loading placeholders. The skeleton must mirror the real layout so nothing reflows when data lands; pick the variant that matches the screen.

```jsx
<Skeleton width="55%" height={16} />

<SkeletonList count={3} />                {/* list / board cards */}
<SkeletonList count={4} variant="row" />  {/* row-with-value: history, earnings rows */}
<SkeletonList variant="stepper" />        {/* the §5c tracking timeline */}
<SkeletonList variant="summary" />        {/* the tall earnings-total block */}
```

Never use a bare spinner for a screen body — spinners give no layout, skeletons do.
