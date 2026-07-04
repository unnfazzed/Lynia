/** Filter chip row — the kit's `.subnav`. Plain links (server navigation via searchParams); the
 *  active chip gets accent-wash + accent-text via `aria-current="page"`. */
export function FilterNav({
  items,
  active,
  hrefFor,
}: {
  items: Array<{ value: string; label: string }>;
  active: string;
  hrefFor: (value: string) => string;
}) {
  return (
    <nav className="subnav">
      {items.map((it) => (
        <a key={it.value} href={hrefFor(it.value)} aria-current={it.value === active ? "page" : undefined}>
          {it.label}
        </a>
      ))}
    </nav>
  );
}
