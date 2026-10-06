// LyniaGo empty states v2 — every string, verbatim. Placeholders: {area} {q} {time} {place} {km} {service} {store}
// "was:" = current copy, for approval. Strings without "was:" are new.

export const emptyCopy = {
  orders: {
    none:          { title: 'No orders yet', body: 'Your orders will show here.' },              // O16 was: "Parcels, food and shop orders all land here. Follow the one on its way, and look back at what you paid." [Send a parcel] [Find food or shops]
    noneParcels:   { title: 'No parcels yet', body: 'Parcels you send show here.' },             // O17 was: "No orders yet" / "Parcels you send land here. Follow the one on its way…" [Send a parcel]
    noneService:   { title: 'No {service} orders yet', body: 'Orders you place show here.', primary: 'Show all orders' }, // O9d was body: "Orders you place show here. Pick All to see everything."
    noMatch:       { title: 'No orders match “{q}”', body: 'Try a place or rider name.', secondary: 'Clear search' },     // O10c was: "Try a restaurant or shop name, an area like Belgravia, or your rider's name."
    offline:       { title: 'You’re offline', body: 'Orders show when you’re back.' },          // O20 was: "Your orders will show as soon as you're back online. There's nothing you need to do."
    error:         { title: 'Couldn’t load orders', body: 'Your orders are safe.', primary: 'Try again' }, // O21 was: "Couldn't load your orders" / "Something went wrong on our side. Your orders are safe."
    noHistoryNote: 'Past orders show here.',                                                     // O18 was: "Past orders show here once this one's done."
    notFound:      { title: 'Order not found', body: 'The link may be old.', primary: 'Back to home' }, // was: "We can't find this order" / "It may be on another account, or the link is old."
  },
  home: {
    noLocation:    { title: 'Where should we deliver?', body: 'See who delivers to you.', primary: 'Use my location', secondary: 'Type an address' }, // H6 was body: "Set your area to see restaurants and shops that deliver to you."
    comingSoon:    { title: 'Coming soon near you', body: 'We’re adding places in your area.' }, // was: "We're bringing local restaurants and shops on board. Need something moved now? Send a parcel." [Send a parcel]
  },
  notifications: {
    customer:      { title: 'No notifications', body: 'Order updates show here.' },             // N8a was: "Nothing here yet" / "Updates about your orders and your account show up here." [Send a parcel]
    rider:         { title: 'No notifications', body: 'Job and money updates show here.' },     // N8b was: "No updates yet" / "Updates about your jobs, money and account show up here."
    error:         { title: 'Couldn’t load notifications', body: 'Check your data and try again.', primary: 'Try again' }, // N10 was body: "Check your data, then try again. Your orders aren't affected."
  },
  browse: {
    noneInArea:    { title: 'No restaurants in {area} yet', body: 'We’re adding kitchens near you.', primary: 'Change address' }, // B9 was: "No restaurants deliver to Belgravia yet" / "We're bringing kitchens to your area. Try another address, or send a parcel today." [Send a parcel]
    noFilterMatch: { title: 'No places match', body: 'Try fewer filters.', secondary: 'Clear filters' }, // B6 was body: "Nothing in Pizza + Free delivery delivers to Belgravia right now."
    noCategory:    { title: 'No {service} shops yet', body: 'We’re adding them in Harare.', secondary: 'See all shops' }, // B3b was body: "We're signing up butchery shops in Harare. Try All shops in the meantime."
    offline:       { title: 'You’re offline', body: 'Places load when you’re back.', secondary: 'Try again' }, // B10b was body: "Connect to see places near you. We'll load them as soon as you're back."
    error:         { title: 'Couldn’t load restaurants', body: 'Nothing was lost.', primary: 'Try again' }, // B11 was body: "Check your data connection. Nothing was lost."
    noAddressRow:  { text: 'Add an address for fees and times', action: 'Set' },               // B7 was: "Where should we deliver?" / "Set your address to see delivery fees, times and distance." [Use my location]
  },
  store: {
    noItems:       { title: 'No items yet', body: 'Check back soon.' },                          // S13c was body: "Gava's Kitchen is still adding items. Check back soon."
    noMatch:       { title: 'No “{q}” here', body: 'Try all restaurants instead.', secondary: 'Search all restaurants' }, // S12b was: "Nothing called "fufu" at Gava's Kitchen" / "Check the spelling, or search all restaurants."
    closedRow:     { text: 'Closed · opens {time}', action: 'Remind me', actionOn: 'Reminder on' }, // S8 was: strip "Closed · opens 10:08" + toggle row "Remind me when they open"
  },
  search: {
    noMatch:       { title: 'No results for “{q}”', body: 'Try a shorter word.' },              // X4a was: "No matches for "fufu"" / "Try a shorter word, or a dish or shop name."
    offlineRow:    'Offline · recent searches only',                                              // X4b was: "Search needs a connection. Your recent searches still work."
    idleShops:     { title: 'Search shops', body: 'Find items or shop names.' },                // NEW (blank today)
    idlePharmacy:  { title: 'Search pharmacies', body: 'Find medicines or pharmacy names.' },   // NEW (blank today)
  },
  cart: {
    empty:         { title: 'Your cart is empty', primary: 'Browse places' },                    // R9a was body: "Add dishes or items from a restaurant, shop or pharmacy."
  },
  rider: {
    noJobs:        { title: 'No jobs nearby', body: 'New jobs appear here on their own.' },     // J4 was: "Nothing in range yet" / long paragraph + "Why no jobs?" box
    demandRow:     'Busier near {place} · {km} km',                                               // J4 was: "Busier near Avondale Shops · 1.2 km from you"
    noJobsToday:   'No jobs yet today',                                                            // M9 (body removed)
    historyEmpty:  { title: 'No jobs this week', body: 'Finished jobs show here.' },            // NEW (renders nothing today)
    historySummary:'This week · {count} jobs · {amount}',                                         // was: "This week · 0 jobs · $0.00 earned"
    noActiveJob:   { title: 'No active job', body: 'Accept a job to start a delivery.' },       // was: "Accept an order…" / "Accept an offer…" — unified
    retrying:      'Trying again in {s} s',                                                       // rider offline/error line; no Retry button
  },
} as const;
