import { FilterNav } from "../components/FilterNav";

/** Admin console v2 §6: the money pages under the one Commission nav item, as the kit's `.subnav` chips. */
const CASH_PAGES = [
  { value: "/cash", label: "commission" },
  { value: "/cash/topups", label: "top-ups" },
  { value: "/cash/owed", label: "money owed" },
];

export function CashNav({ active }: { active: "/cash" | "/cash/topups" | "/cash/owed" }) {
  return <FilterNav items={CASH_PAGES} active={active} hrefFor={(v) => v} />;
}
