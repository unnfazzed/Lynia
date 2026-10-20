// Own bikers v1 (2026-10-19, ledger D-117) · the console's strings, verbatim from
// packages/design/handoff/own-bikers-v1/copy.ts (`OB.admin`). The handoff writes its sample data into some strings
// ("Chicken Inn", "4 bikers", "3 fleets"); here those are parameters, the words around them unchanged.

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const OBA = {
  nav: "Own bikers",
  title: "Own bikers",
  /** `sub`, owner 2026-10-20 (D-117): every business pays the commission rate on its rides, not a fee per ride. */
  sub: (fleets: number) => `${plural(fleets, "fleet", "fleets")} · commission billed weekly`,
  cols: ["Owner", "Branches", "Bikers", "This week", "Unpaid", "Days overdue", "Status"] as const,
  stOverdue: "Overdue",
  stUnpaid: "Unpaid",
  stPaid: "Paid",
  stPaused: "Paused",
  /** `overdueN` "9 days overdue". */
  overdueN: (n: number) => (n === 1 ? "1 day overdue" : `${n} days overdue`),
  /** Owner 2026-10-20 (D-117): the flat fee per ride is retired; a ride is billed at the commission rate. */
  fee: "Fee",
  /** "10% of each ride". */
  feeLine: (pct: number) => `${pct}% of each ride`,
  /** Turns a disabled business back on (Own bikers is on for every business by default). */
  turnOn: "Turn on",
  turnOnT: (brand: string) => `Turn ${brand}'s Own bikers back on?`,
  pause: "Pause",
  unpause: "Unpause",
  disable: "Disable",
  bills: "Weekly bills",
  markPaid: "Mark paid",
  adjust: "Adjust",
  adjAmount: "Amount",
  adjReason: "Reason (required)",
  adjRide: "Which ride",
  /** `pauseT` "Pause Chicken Inn's Own bikers?". */
  pauseT: (brand: string) => `Pause ${brand}'s Own bikers?`,
  /** `pauseB` "Chicken Inn's 4 bikers stop getting jobs. Their 'Book a biker' falls back to Any biker." */
  pauseB: (brand: string, n: number) => `${brand}'s ${plural(n, "biker", "bikers")} stop getting jobs. Their 'Book a biker' falls back to Any biker.`,
  /** `disableT` "Disable Chicken Inn's Own bikers?". */
  disableT: (brand: string) => `Disable ${brand}'s Own bikers?`,
  /** `disableB` "Chicken Inn's 4 bikers become public bikers. …". */
  disableB: (brand: string, n: number) =>
    `${brand}'s ${plural(n, "biker", "bikers")} become public bikers. Their 'Book a biker' falls back to Any biker. Unpaid bills stay open.`,
  reasonCode: "Reason code",
  note: "Note for the audit log",
  audit: "Recorded in the audit log with your name.",
  cancel: "Cancel",
  /** `tile` "Own bikers live: 3 fleets · 14 bikers online · 2 overdue" — `overdue` is the part drawn as a pill. */
  tile: (fleets: number, online: number, overdue: number) => ({
    lead: `Own bikers live: ${plural(fleets, "fleet", "fleets")} · ${plural(online, "biker", "bikers")} online`,
    overdue: overdue > 0 ? `${overdue} overdue` : null,
  }),
  emptyT: "No fleets yet",
  emptyB: "Merchants who invite their own bikers show here.",
  errT: "Couldn't load fleets.",
  tryAgain: "Try again",
} as const;

/** Strings the frames draw that `copy.ts` doesn't list (the handoff's sample data and buttons, kept word for word). */
export const OBA_FRAME = {
  /** The tile's button: "Open Own bikers". */
  open: `Open ${OBA.nav}`,
  /** The adjust form's button. */
  saveAdjustment: "Save adjustment",
  /** The adjust form's title: "Adjust · 28 Sep–4 Oct · $34.50". */
  adjustT: (week: string, amount: string) => `${OBA.adjust} · ${week} · ${amount}`,
  /** The bills table's head. */
  billCols: ["Week", "Rides", "Amount", "Status"] as const,
  /** An unpaid bill's pill: "Due Fri 9 Oct". */
  due: (day: string) => `Due ${day}`,
  /** The side panel's line: "Owner Rumbi Chari · Avondale, Borrowdale · 4 bikers · 2 online · $36.00 unpaid". */
  panelSub: (owner: string, branches: string, bikers: number, online: number, unpaid: string) =>
    `Owner ${owner} · ${branches} · ${plural(bikers, "biker", "bikers")} · ${online} online · ${unpaid} unpaid`,
  /** The subnav chips: "All · 3". */
  chip: (label: string, n: number) => `${label} · ${n}`,
  all: "All",
} as const;
