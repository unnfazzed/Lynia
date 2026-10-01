(function () {
  const S = {};
  document.querySelectorAll('#phone .scr').forEach(s => { S[s.dataset.screenLabel.split(' ')[0]] = s; });
  document.querySelectorAll('[data-lucide="minus"],[data-lucide="plus"],[data-lucide="phone"]').forEach(i => { const g = i.closest('.gh'); if (g) g.dataset.act = i.dataset.lucide; });
  document.querySelectorAll('.gh').forEach(g => { if ((g.getAttribute('style') || '').includes('rotate')) g.classList.add('back'); });
  const find = (scr, sel, txt) => [...scr.querySelectorAll(sel)].find(e => e.textContent.trim() === txt);
  const stepInit = {}; ['B6', 'D5'].forEach(k => { stepInit[k] = S[k].querySelector('.stp').innerHTML; });
  const timers = { B2: find(S.B2, '.num', '1:14'), D6: find(S.D6, '.num', '1:14'), D4: find(S.D4, '.pl', '1:01') };
  lucide.createIcons();

  let cur = null, hist = [], mode = localStorage.getItem('lgm-mode') || 'rest', timer = null, fare = 3.5;
  const phone = document.getElementById('phone'), toastEl = document.getElementById('toast');
  const BR = {
    rest: [{ n: 'Sadza Republic', l: '5th Street, Mbare', live: true }, { n: 'Sadza Republic · Avondale', l: 'Fife Ave, Avondale', live: false }],
    shop: [{ n: 'Mbare Auto Spares', l: 'Mbare Musika, Mbare', live: true }, { n: 'Mbare Auto Spares · Graniteside', l: 'Willowvale Rd, Graniteside', live: false }],
  };
  let branch = 0, c7loc = null, saving = false;
  const curB = () => BR[mode][branch] || BR[mode][0];
  const home = () => (!curB().live ? 'B1n' : mode === 'shop' ? 'D1' : 'B1');
  function renderBranches() {
    const list = BR[mode], b = curB(), many = list.length > 1;
    (mode === 'shop' ? ['D1'] : ['B1', 'B5']).concat('B1n').forEach(k => { const el = S[k].querySelector('.bsw b'); if (el) el.textContent = b.n; });
    document.querySelectorAll('#phone .bsw .ic').forEach(i => { i.style.display = many ? '' : 'none'; });
    S.C4.querySelector('.biz b').textContent = b.n;
    const brc = S.C4.querySelector('.brc'); brc.textContent = list.length; brc.style.display = many ? '' : 'none';
    S.B1n.querySelector('.nlm').textContent = mode === 'shop' ? 'Check your items' : 'Check your menu';
    const brl = S.C6.querySelector('.brl'); brl.innerHTML = '';
    [branch].concat(list.map((_, i) => i).filter(i => i !== branch)).forEach(i => {
      const x = list[i], r = document.createElement('div'); r.className = 'brow'; r.dataset.i = i;
      r.innerHTML = '<div class="t"><b></b><span></span></div>' + (x.live ? '' : '<span class="pl grey">Not live yet</span>') + (i === branch ? '<span class="ic" style="color:var(--accent-text);width:20px;height:20px"><i data-lucide="check"></i></span>' : '');
      r.querySelector('b').textContent = x.n; r.querySelector('.t span').textContent = x.l; brl.appendChild(r);
    });
    lucide.createIcons();
  }
  function pickBranch(i) { if (i === branch) return go(home(), false); branch = i; renderBranches(); reset(home()); toast('Now at ' + curB().n); }
  const c7 = sel => S.C7.querySelector(sel);
  function updC7() {
    c7('.c7card').style.display = c7loc ? 'flex' : 'none';
    if (c7loc) { c7('.c7st').textContent = c7loc.st; c7('.c7src').textContent = c7loc.src; }
    c7('.c7go').classList.toggle('dis', !(c7('.c7name').value.trim() && c7loc));
  }
  function nameHint(err) { const h = c7('.c7name').nextElementSibling; h.textContent = err ? 'You already have a branch with that name. Add the area, like “Mama’s Kitchen · Avondale”.' : 'How customers will see it, like Mama’s Kitchen · Avondale'; h.style.color = err ? 'var(--danger-ink)' : ''; c7('.c7name').classList.toggle('bad', !!err); }
  function resetC7() {
    if (saving) return;
    c7('.c7name').value = ''; c7loc = null; nameHint(false); c7('.c7f').style.opacity = ''; c7('.c7f').style.pointerEvents = '';
    c7('.c7go').innerHTML = 'Create branch';
    c7('.c7ct').textContent = mode === 'shop' ? 'Copy my items' : 'Copy my menu';
    c7('.c7cm').textContent = mode === 'shop' ? '40 items in 5 categories' : '12 dishes in 3 categories';
    updC7();
  }
  const demoLoc = src => ({ st: mode === 'shop' ? 'Willowvale Rd, Graniteside' : 'Fife Ave, Avondale', src });
  function createBranch() {
    if (c7('.c7go').classList.contains('dis') || saving) return;
    const n = c7('.c7name').value.trim();
    if (BR[mode].some(x => x.n.toLowerCase() === n.toLowerCase())) return nameHint(true);
    saving = true; c7('.c7go').innerHTML = '<span class="spin"></span>Creating branch…'; c7('.c7f').style.opacity = '.5'; c7('.c7f').style.pointerEvents = 'none';
    setTimeout(() => { saving = false; BR[mode].push({ n, l: c7loc.st, live: false }); branch = BR[mode].length - 1; renderBranches(); reset('B1n'); toast(n + ' is ready'); }, 1200);
  }

  function toast(m) { toastEl.textContent = m; toastEl.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => toastEl.classList.remove('on'), 2200); }
  function setMode(m) {
    mode = m; localStorage.setItem('lgm-mode', m);
    document.body.classList.toggle('shop', m === 'shop');
    S.C4.querySelector('.biz b').textContent = m === 'shop' ? 'Mbare Auto Spares' : 'Sadza Republic';
    const av = S.C4.querySelector('.hdt .th'); av.textContent = m === 'shop' ? 'MA' : 'SR';
    av.style.background = m === 'shop' ? '#dff4ee' : '#fdeadd'; av.style.color = m === 'shop' ? 'var(--accent-text)' : '#9a4a12';
    document.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
    S.A3.querySelectorAll('.opt').forEach((o, i) => o.classList.toggle('on', (i === 1) === (m === 'shop')));
    branch = 0; renderBranches();
  }
  function countdown(el, secs, onEnd) {
    clearInterval(timer); let t = secs;
    const fmt = () => { el.textContent = Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };
    fmt(); timer = setInterval(() => { t--; if (t < 0) { clearInterval(timer); onEnd && onEnd(); return; } fmt(); }, 1000);
  }
  function go(id, push = true) {
    if (!S[id]) return;
    if (id === 'C7' && saving) return;
    if (id === 'B1n' && curB().live) { const j = BR[mode].findIndex(x => !x.live); if (j >= 0) { branch = j; renderBranches(); } }
    if ((id === 'B1' || id === 'D1' || id === 'B5') && !curB().live) { branch = Math.max(0, BR[mode].findIndex(x => x.live)); renderBranches(); }
    if (id === 'C6') S.C6.querySelector('.c6bg').innerHTML = S[cur === 'B5' ? 'B5' : home()].innerHTML;
    if (id === 'C7') resetC7();
    if (typeof cfEl !== 'undefined') cfEl.style.display = 'none';
    if (cur && push && cur !== id) hist.push(cur);
    Object.values(S).forEach(s => s.classList.toggle('cur', s === S[id]));
    cur = id; localStorage.setItem('lgm-screen', id);
    clearInterval(timer);
    if (id === 'B2' || id === 'D6') countdown(timers[id], 74, () => { reset(home()); toast('Missed · the customer was told'); });
    if (id === 'B6') track('B6', 'B7');
    if (id === 'D5') track('D5', 'D7');
    if (id === 'D4') countdown(timers.D4, 61, () => toast('Time up · pick a rider or book again'));
    document.querySelectorAll('#list button').forEach(b => b.classList.toggle('on', b.dataset.id === id));
    const m = META.find(x => x.id === id);
    document.getElementById('why').innerHTML = '<b>' + id + ' · ' + m.name + '</b><br>' + m.cap;
  }
  function track(id, end) {
    const st = S[id].querySelector('.stp'); st.innerHTML = stepInit[id];
    timer = setInterval(() => {
      const n = st.querySelector('.sr.n'); if (!n) return clearInterval(timer);
      const d = new Date(), hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
      const wasDelivered = n.querySelector('b').firstChild.textContent.trim() === 'Delivered';
      n.classList.remove('n'); n.classList.add('d'); n.querySelector('.c').textContent = '✓'; n.querySelector('b span').textContent = hm;
      if (wasDelivered) { clearInterval(timer); setTimeout(() => { if (cur === id) { go(end); toast('Delivered · buyer gave the code'); } }, 900); return; }
      const nx = n.nextElementSibling; if (nx) { nx.classList.add('n'); nx.querySelector('b span').textContent = 'live'; }
    }, 2200);
  }
  const PARENT = { A2: 'A1', A3: 'A2', A4: 'A3', A5: 'A1', B3: 'B1', B4: 'B1', B5: 'B1', B6: 'B1', B7: 'B1', C2: 'C1', C5: 'C4', C7: 'C4', D2: 'D1', D3: 'D2', D4: 'D1', D5: 'D1', D7: 'D1', E2: 'C4', E3: 'E2', E4: 'C4' };
  const ROOTS = ['A1', 'B1', 'B1n', 'C1', 'C3', 'C4', 'D1', 'E1'];
  function back() {
    if (cfEl.style.display === 'flex') return closeCf();
    if (cur === 'C6') return go(home(), false);
    if (cur === 'C7' && saving) return;
    if (cur === 'B2' || cur === 'D6') return toast('Accept or decline to stop the alarm');
    if (ROOTS.includes(cur)) return;
    const p = PARENT[cur] === 'C4' || PARENT[cur] === 'C1' || PARENT[cur] === 'B1' || PARENT[cur] === 'D1' ? PARENT[cur] : (PARENT[cur] || hist.pop() || home());
    hist = hist.filter(h => h !== cur); go(p, false);
  }
  const cfEl = document.getElementById('cf');
  function confirmSheet(title, body, ok, fn, danger = true) {
    document.getElementById('cft').textContent = title; document.getElementById('cfb').textContent = body;
    const b = document.getElementById('cfok'); b.textContent = ok; b.style.background = danger ? 'var(--danger)' : 'var(--cta-fill)';
    b.onclick = () => { closeCf(); fn(); }; cfEl.style.display = 'flex';
  }
  function closeCf() { cfEl.style.display = 'none'; }
  document.getElementById('cfno').onclick = closeCf; document.getElementById('cfs').onclick = closeCf;
  document.addEventListener('keydown', e => { if (e.key === 'Escape' || e.key === 'Backspace' && e.target === document.body) { e.preventDefault(); back(); } });
  function reset(id) { hist = []; go(id, false); }
  function selectIn(el, sel) { el.parentElement.querySelectorAll(sel).forEach(x => x.classList.toggle('on', x === el)); }

  const ringRules = scr => ({
    '$.chips .chip': el => { selectIn(el, '.chip'); S[scr].querySelector('.btn').textContent = 'Accept · ready in ' + el.textContent.trim() + ' min'; },
    'Accept': () => { const t = S[scr].querySelector('.btn').textContent.match(/\d+/)[0]; reset(home()); toast('Accepted · customer told ' + t + ' min'); },
    'Can’t take it': () => confirmSheet('Decline this order?', 'The customer is told straight away.', 'Decline order', () => { reset(home()); toast('Declined · the customer was told'); }),
    'Edit items': () => toast('Tap an item to remove it'),
    '$.li': el => { const off = el.style.opacity === '0.4'; el.style.opacity = off ? '' : '0.4'; el.style.textDecoration = off ? '' : 'line-through'; toast(off ? 'Item back on the order' : 'Removed · the customer approves'); },
  });
  const R = {
    A1: { 'Send code': 'A2' },
    A2: { 'Sign in': 'A3', 'Wrong number': 'A1' },
    A3: { 'Restaurant': () => setMode('rest'), 'Shop': () => setMode('shop'), 'Next': 'A4', 'Joining': 'A5' },
    A4: {
      'Use my current location': () => toast('Location found · 5th Street, Mbare'),
      'Or search': () => toast('Type a street or area'), 'Change': () => toast('Search for a different address'),
      'Create my business': () => { reset(home()); toast('You’re live'); },
    },
    A5: { 'Join Siyaso': () => { setMode('shop'); reset('D1'); toast('Welcome to Siyaso Spares'); }, 'Not me': 'A1', 'Start my own': 'A3' },
    B1: { '$.bsw': 'C6', '$.hdt .sw': () => go('B5'), 'View & accept': 'B2', '$.stat:nth-child(3)': () => reset('C3'), '#A111': 'B6', '#A444': 'B4', 'Cooking': 'B3', 'Ready': 'B4', 'New': null },
    B2: ringRules('B2'),
    B3: { 'Food is ready': 'B4', 'Can’t finish': () => confirmSheet('Cancel this order?', 'The customer is refunded and told why.', 'Cancel order', () => { reset('B1'); toast('Order cancelled · customer refunded'); }) },
    B4: { '$[data-act=phone]': () => toast('Calling Blessing M.'), 'Hand over': () => { go('B6'); toast('Handed over · tracking the delivery'); } },
    B5: { '$.bsw': 'C6', '$.hdt .sw': () => reset('B1'), 'Open now': () => { reset('B1'); toast('You’re open'); }, 'Open in busy': () => { reset('B1'); toast('Open · busy mode +10 min'); } },
    B6: { '$[data-act=phone]': () => toast('Calling Blessing M.'), 'Mark ride completed': () => confirmSheet('Mark this ride completed?', 'This closes the order now, even if steps are left.', 'Mark completed', () => { reset('B1'); toast('Ride marked completed · order closed'); }, false) },
    B7: { 'No cash on this one': () => confirmSheet('Close without cash?', 'Nothing will show as owed for this order.', 'Close order', () => { reset('B1'); toast('Completed · no cash expected'); }, false), 'I got': () => { reset('B1'); toast('Cash confirmed · order closed'); }, 'Not returned': () => toast('Support will call you and the rider'), '7 of 8': () => toast('Full timeline') },
    C1: {
      '$.li:first-child .sw': el => { if (el.classList.contains('off')) { el.classList.remove('off'); toast('Mazondo is back on'); } else go('C2'); },
      'Add a dish': () => toast('Add dish: photo, name, price'), '$.li': () => toast('Opens the dish editor'),
    },
    C2: {
      'Turn off': () => { const r = S.C1.querySelector('.li'); r.querySelector('.sw').classList.add('off'); const s = r.querySelector('.t span'); s.textContent = 'Off until tomorrow'; s.style.cssText = 'color:var(--highlight-ink);font-weight:600'; back(); toast('Mazondo off until 08:00'); },
      'Keep it on': back, '$.scrim': back, '$.opt': el => selectIn(el, '.opt'),
    },
    C3: { '$.bd > div:first-child': () => toast('Calling Tino about $9.50'), '$.li': () => toast('Opens the order details') },
    C4: {
      'Shop front': () => toast('Banner, logo and tags'), 'Opening hours': 'C5', 'Branches': 'C7', 'Preferred riders': 'E4', 'Team': 'E2',
      'Help': () => toast('Opening WhatsApp support'), 'Sign out': () => confirmSheet('Sign out?', 'New orders won’t ring on this phone.', 'Sign out', () => reset('A1')),
    },
    B1n: { '$.bsw': 'C6', '$.nlmenu': () => reset(mode === 'shop' ? 'E1' : 'C1'), 'Set opening hours': 'C5' },
    C6: { '$.brow': el => pickBranch(+el.dataset.i), '$.c6add': 'C7', '$.scrim': () => go(home(), false) },
    C7: {
      '$.c7name': () => {}, '$.c7gps': () => { c7loc = demoLoc('From your phone’s location'); updC7(); toast('Location found · ' + c7loc.st); },
      '$.c7search': () => { c7loc = demoLoc('From search'); updC7(); }, '$.c7chg': () => { c7loc = null; updC7(); }, '$.c7go': createBranch,
    },
    C5: { 'Save hours': () => { back(); toast('Hours saved'); } },
    D1: { '$.bsw': 'C6', '$.hdt .sw': () => { const s = S.D1.querySelector('.hdt .sw'); s.classList.toggle('off'); toast(s.classList.contains('off') ? 'Closed' : 'Open'); }, '$.stat:nth-child(3)': () => reset('C3'), 'Book a rider': 'D2', 'View & accept': 'D6', 'Car battery': 'D4', 'Brake pads ·': 'D5', 'Packing': () => toast('1 order being packed'), 'New': null },
    D2: { 'Next': 'D3', 'Paste': () => toast('Location pasted from WhatsApp'), '$.li': el => { selectIn(el, '.li'); } },
    D3: { '$[data-act=minus]': () => setFare(-0.5), '$[data-act=plus]': () => setFare(0.5), '$.rm': el => { const li = el.closest('.li'); li.remove(); toast('Item removed'); }, 'From your items': () => toast('Pick from your items list'), 'Type one': () => toast('Type an item name and quantity'), 'Find a rider': 'D4', 'Booking terms': () => toast('Opens the booking terms') },
    D4: {
      'Pick Farai': () => { go('D5'); toast('Farai is on the way'); }, 'Pick Kuda': () => { go('D5'); toast('Kuda is on the way'); },
      'Cancel booking': () => confirmSheet('Cancel this booking?', 'The rider is told. You can book again any time.', 'Cancel booking', () => { reset('D1'); toast('Booking cancelled'); }),
    },
    D5: {
      'Mark ride completed': () => confirmSheet('Mark this ride completed?', 'This closes the delivery now, even if steps are left.', 'Mark completed', () => { reset('D1'); toast('Ride marked completed'); }, false),
      '$[data-act=phone]': () => toast('Calling Blessing M.'),
      'Send to buyer': () => toast('Code sent to the buyer on WhatsApp'),
      'Get a new code': () => { const c = [...S.D5.querySelectorAll('b.num')].find(b => /\d{3} \d{3}/.test(b.textContent)); if (c) c.textContent = (100 + Math.floor(Math.random() * 900)) + ' ' + (100 + Math.floor(Math.random() * 900)); toast('New code · the old one stops working'); },
      'Cancel booking': () => confirmSheet('Cancel this booking?', 'The rider is told. You can book again any time.', 'Cancel booking', () => { reset('D1'); toast('Booking cancelled'); }),
    },
    D6: ringRules('D6'),
    D7: { 'No cash on this one': () => confirmSheet('Close without cash?', 'Nothing will show as owed for this delivery.', 'Close delivery', () => { reset('D1'); toast('Completed · no cash expected'); }, false), 'I got': () => { reset('D1'); toast('Cash confirmed · delivery closed'); }, 'Book again': 'D2', '6 of 7': () => toast('Full timeline') },
    E1: { 'Add an item': () => toast('Add item: photo, name, price'), '$.li': () => toast('Opens the item editor') },
    E2: { 'Resend': () => toast('Invite resent on WhatsApp'), '$.li:nth-child(2)': 'E3', '$.li:nth-child(3)': () => toast('Invite pending'), 'Add someone': () => toast('Add by phone number') },
    E3: { 'Remove Tendai': () => { S.E2.querySelector('.li:nth-child(2)').style.display = 'none'; back(); toast('Tendai removed'); }, 'Keep': back, '$.scrim': back },
    E4: { 'Add a rider': () => toast('Add a rider by phone number'), 'Send sign-up': () => toast('Sign-up link sent on WhatsApp') },
  };
  function setFare(d) {
    fare = Math.max(1.5, Math.round((fare + d) * 2) / 2);
    const f = '$' + fare.toFixed(2);
    const n = [...S.D3.querySelectorAll('b.num')].find(b => b.style.fontSize === '24px'); if (n) n.textContent = f;
    S.D3.querySelector('.btn').textContent = 'Find a rider · ' + f;
  }
  function run(a, el) { if (a === null) return true; if (typeof a === 'string') go(a); else a(el); return true; }
  function tryRules(el, scr) {
    const rules = R[cur] || {};
    for (let n = el; n && n !== scr.parentElement; n = n.parentElement) {
      const txt = (n.innerText || '').trim();
      for (const k in rules) {
        if (k[0] === '$') { if (n.matches(k.slice(1))) return run(rules[k], n); }
        else if (txt && (txt.startsWith(k) || (n.matches('.li,.card,.opt') && txt.includes(k) && txt.length < 60))) return run(rules[k], n);
      }
      if (n.matches('.btn,.gh,.lnk,.li,.chip,.tab,.opt,.sw,.card,.seg span,a,.back')) break;
    }
    return false;
  }
  phone.addEventListener('click', e => {
    const scr = e.target.closest('.scr'); if (!scr) return;
    if (e.target.closest('a')) e.preventDefault();
    if (e.target.closest('.back')) return back();
    const tab = e.target.closest('.tab');
    if (tab) {
      const t = tab.innerText.trim().split('\n')[0];
      const map = { Orders: home(), Menu: 'C1', Items: 'E1', Money: 'C3', Account: 'C4' };
      if (map[t]) reset(map[t]);
      return;
    }
    if (tryRules(e.target, scr)) return;
    const sw = e.target.closest('.sw'); if (sw) { sw.classList.toggle('off'); return toast(sw.classList.contains('off') ? 'Turned off' : 'Turned on'); }
    const seg = e.target.closest('.seg span'); if (seg) return selectIn(seg, 'span');
    const chip = e.target.closest('.chip');
    if (chip && !chip.classList.contains('g')) { if (chip.parentElement.classList.contains('chips')) selectIn(chip, '.chip'); else chip.classList.toggle('on'); return; }
    if (chip) return toast('New category');
    const opt = e.target.closest('.opt'); if (opt) return selectIn(opt, '.opt');
  });

  c7('.c7name').addEventListener('input', () => { nameHint(false); updC7(); });
  const groups = { A: 'Get in', B: 'Restaurant · orders', C: 'Menu, money, account', D: 'Shop · orders & riders', E: 'Shop · items & team' };
  const shopOnly = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'E1'], restOnly = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'C1', 'C2'];
  const list = document.getElementById('list');
  Object.keys(groups).forEach(g => {
    const h = document.createElement('b'); h.textContent = groups[g].toUpperCase(); list.appendChild(h);
    META.filter(m => m.id[0] === g).forEach(m => {
      const b = document.createElement('button'); b.dataset.id = m.id;
      b.textContent = m.id + ' · ' + m.name.toLowerCase().replace(/^./, c => c.toUpperCase());
      b.onclick = () => { if (shopOnly.includes(m.id)) setMode('shop'); if (restOnly.includes(m.id)) setMode('rest'); go(m.id); };
      list.appendChild(b);
    });
  });
  document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { setMode(b.dataset.mode); reset(home()); });
  document.getElementById('ring').onclick = () => go(mode === 'shop' ? 'D6' : 'B2');
  document.getElementById('restart').onclick = () => reset('A1');

  function fit() { const s = Math.min(1, (window.innerHeight - 48) / 720); phone.style.transform = window.innerWidth > 760 ? 'scale(' + s + ')' : ''; phone.style.marginBottom = window.innerWidth > 760 ? (720 * (s - 1)) + 'px' : ''; }
  window.addEventListener('resize', fit); fit();
  setMode(mode);
  const saved = localStorage.getItem('lgm-screen');
  go(S[saved] ? saved : 'A1', false);
})();
