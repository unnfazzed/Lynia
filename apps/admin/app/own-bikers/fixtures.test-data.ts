import type { AdminFleetDetail, AdminFleetRow } from "@lynia/shared";

/** The handoff's one data set (own-bikers-v1 README): Pizza Inn, Chicken Inn and Mama's Kitchen. */
export const PIZZA = "11111111-1111-4111-8111-111111111111";
export const CHICKEN = "22222222-2222-4222-8222-222222222222";
export const MAMAS = "33333333-3333-4333-8333-333333333333";
export const AVONDALE = "44444444-4444-4444-8444-444444444444";
export const BORROWDALE = "55555555-5555-4555-8555-555555555555";
export const RIDE = "66666666-6666-4666-8666-666666666666";

export const ROWS: AdminFleetRow[] = [
  {
    ownerProfileId: PIZZA,
    owner: "Tafadzwa Moyo",
    branches: 3,
    branchNames: ["Pizza Inn Belgravia", "Pizza Inn Eastgate", "Pizza Inn Mt Pleasant"],
    bikers: 9,
    online: 6,
    thisWeek: "42.00",
    unpaid: "81.00",
    daysOverdue: 9,
    status: "overdue",
    rideFee: "1.50",
  },
  {
    ownerProfileId: CHICKEN,
    owner: "Rumbi Chari",
    branches: 2,
    branchNames: ["Chicken Inn Avondale", "Chicken Inn Borrowdale"],
    bikers: 4,
    online: 2,
    thisWeek: "34.50",
    unpaid: "36.00",
    daysOverdue: 2,
    status: "overdue",
    rideFee: "1.50",
  },
  {
    ownerProfileId: MAMAS,
    owner: "Nyasha Dube",
    branches: 1,
    branchNames: ["Mama's Kitchen"],
    bikers: 6,
    online: 6,
    thisWeek: "21.00",
    unpaid: "0.00",
    daysOverdue: 0,
    status: "paid",
    rideFee: "1.50",
  },
];

export const DETAIL: AdminFleetDetail = {
  ownerProfileId: CHICKEN,
  owner: "Rumbi Chari",
  phone: "+263772000111",
  enabled: true,
  paused: false,
  rideFee: null,
  feePct: 10,
  branches: [
    { merchantId: AVONDALE, name: "Chicken Inn Avondale" },
    { merchantId: BORROWDALE, name: "Chicken Inn Borrowdale" },
  ],
  bikers: [
    { riderId: "77777777-7777-4777-8777-777777777771", name: "Tendai Moyo", homeBranch: "Chicken Inn Avondale", state: "on_a_job" },
    { riderId: "77777777-7777-4777-8777-777777777772", name: "Farai N", homeBranch: "Chicken Inn Avondale", state: "online" },
    { riderId: "77777777-7777-4777-8777-777777777773", name: "Nyasha K", homeBranch: "Chicken Inn Borrowdale", state: "offline" },
    { riderId: "77777777-7777-4777-8777-777777777774", name: "Blessing T", homeBranch: "Chicken Inn Borrowdale", state: "offline" },
  ],
  thisWeek: { rides: 4, total: "6.00" },
  bills: [
    {
      id: "88888888-8888-4888-8888-888888888881",
      periodStart: "2026-09-28",
      periodEnd: "2026-10-04",
      dueOn: "2026-10-09",
      total: "34.50",
      state: "unpaid",
      daysOverdue: 0,
      paidAt: null,
      branches: [
        { merchantId: AVONDALE, name: "Chicken Inn Avondale", rides: 15, total: "22.50" },
        { merchantId: BORROWDALE, name: "Chicken Inn Borrowdale", rides: 8, total: "12.00" },
      ],
    },
    {
      id: "88888888-8888-4888-8888-888888888882",
      periodStart: "2026-09-21",
      periodEnd: "2026-09-27",
      dueOn: "2026-10-02",
      total: "36.00",
      state: "overdue",
      daysOverdue: 2,
      paidAt: null,
      branches: [{ merchantId: AVONDALE, name: "Chicken Inn Avondale", rides: 24, total: "36.00" }],
    },
    {
      id: "88888888-8888-4888-8888-888888888883",
      periodStart: "2026-09-14",
      periodEnd: "2026-09-20",
      dueOn: "2026-09-25",
      total: "33.00",
      state: "paid",
      daysOverdue: 0,
      paidAt: "2026-09-24T10:00:00.000Z",
      branches: [{ merchantId: AVONDALE, name: "Chicken Inn Avondale", rides: 22, total: "33.00" }],
    },
  ],
  recentRides: [{ orderId: RIDE, ref: "#B190", merchantId: BORROWDALE, biker: "Tendai", at: "2026-10-04T08:05:00.000Z", fee: "1.50" }],
};
