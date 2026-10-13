import { IconSearch } from "./icons";

/**
 * The console's one search box (admin console v2 §4). A plain GET form to `/search` — no client JS — so Enter
 * submits it and the results page jumps straight to the record when there is exactly one hit. Rendered twice by
 * the shell: above the page on desktop (`.console-search`) and inside the phone menu panel (`.sidenav-search`,
 * D-105); CSS shows one or the other.
 */
export function SearchBox({ id, defaultValue }: { id: string; defaultValue?: string }) {
  return (
    <form className="search-form" action="/search" method="get" role="search">
      <label htmlFor={id} className="sr-only">
        Search phone, name, order or top-up
      </label>
      <input
        id={id}
        name="q"
        type="search"
        defaultValue={defaultValue}
        placeholder="Search phone, name, #order or Paynow ref"
        autoComplete="off"
        minLength={3}
        maxLength={80}
        required
      />
      <button type="submit" className="btn ghost" aria-label="Search">
        <IconSearch />
      </button>
    </form>
  );
}
