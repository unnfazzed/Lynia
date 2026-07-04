/* LyniaGo ops console — shared shell: nav, connection states, tweaks, modal, helpers.
   Plain JS, no dependencies beyond assets/lynia-icons.js (loaded by each page). */
(function () {
  const NAV = [
    { id: "overview", label: "Overview", icon: "navigation", href: "index.html" },
    { id: "orders", label: "Orders", icon: "package", href: "orders.html" },
    { id: "riders", label: "Riders", icon: "bike", href: "riders.html" },
    { id: "kyc", label: "KYC review", icon: "id-card", href: "kyc.html", badge: 3 },
    { id: "customers", label: "Customers", icon: "user", href: "customers.html" },
    { id: "issues", label: "Issues", icon: "triangle-alert", href: "issues.html", badge: 2 },
    { id: "cash", label: "Cash", icon: "banknote", href: "cash.html" },
  ];

  const LS_KEY = "lyniaAdminTweaks";
  const DEFAULTS = { density: "comfortable", nav: "sidebar", volume: "pilot", state: "live" };

  let tweaks = { ...DEFAULTS, ...(window.TWEAK_DEFAULTS || {}) };
  try { Object.assign(tweaks, JSON.parse(localStorage.getItem(LS_KEY) || "{}")); } catch (e) {}

  let onRenderCb = null;
  let currentPage = "";

  /* ── Tweaks host protocol (listener BEFORE announce) ── */
  window.addEventListener("message", (e) => {
    const t = e.data && e.data.type;
    if (t === "__activate_edit_mode") document.getElementById("tweaks-panel").classList.add("open");
    if (t === "__deactivate_edit_mode") document.getElementById("tweaks-panel").classList.remove("open");
  });

  function setTweak(key, val) {
    tweaks[key] = val;
    try { localStorage.setItem(LS_KEY, JSON.stringify(tweaks)); } catch (e) {}
    try { window.parent.postMessage({ type: "__edit_mode_set_keys", edits: { [key]: val } }, "*"); } catch (e) {}
    apply();
  }

  function apply() {
    const b = document.body;
    b.classList.toggle("density-compact", tweaks.density === "compact");
    b.classList.toggle("nav-top", tweaks.nav === "top tabs");
    ["live", "empty", "loading", "offline"].forEach((s) => b.classList.toggle("state-" + s, tweaks.state === s));
    const conn = document.getElementById("conn");
    if (conn) {
      if (tweaks.state === "offline") { conn.textContent = "○ reconnecting…"; conn.className = "conn off"; }
      else if (tweaks.state === "loading") { conn.textContent = "○ connecting"; conn.className = "conn off"; }
      else { conn.textContent = "● live"; conn.className = "conn"; }
    }
    document.querySelectorAll(".tw-seg button").forEach((btn) =>
      btn.setAttribute("aria-pressed", tweaks[btn.dataset.key] === btn.dataset.val ? "true" : "false"));
    if (onRenderCb) onRenderCb({ state: tweaks.state, volume: tweaks.volume });
    if (window.lucide) lucide.createIcons();
  }

  /* ── Shell chrome ── */
  function navLinks(cls) {
    return NAV.map((n) =>
      `<a class="${cls}" href="${n.href}" ${n.id === currentPage ? 'aria-current="true"' : ""}>` +
      (cls === "nav-item" ? `<i data-lucide="${n.icon}"></i>` : "") +
      `${n.label}${n.badge ? `<span class="nav-badge">${n.badge}</span>` : ""}</a>`).join("");
  }

  const TW = [
    { key: "density", label: "Density", vals: ["comfortable", "compact"] },
    { key: "nav", label: "Navigation", vals: ["sidebar", "top tabs"] },
    { key: "volume", label: "Data volume", vals: ["pilot", "growth"] },
    { key: "state", label: "Screen state", vals: ["live", "empty", "loading", "offline"] },
  ];

  function init(opts) {
    currentPage = opts.page;
    onRenderCb = opts.onRender || null;

    const side = document.getElementById("sidenav");
    if (side) side.innerHTML =
      `<div class="brand">
        <svg width="28" height="28" viewBox="0 0 96 96" aria-hidden="true"><polygon points="28,6 58,32 38,42" fill="var(--accent)"></polygon><polygon points="90,26 14,52 48,60" fill="var(--accent)"></polygon><polygon points="90,26 48,60 42,84" fill="var(--accent-700)"></polygon></svg>
        <div><b>LyniaGo</b><span>operations</span></div>
      </div>` + navLinks("nav-item") +
      `<div class="foot"><b>Rufaro C.</b>ops admin · Harare pilot</div>`;

    const top = document.getElementById("topnav");
    if (top) top.innerHTML = navLinks("");

    const ob = document.getElementById("offline-banner");
    if (ob) ob.innerHTML =
      `<i data-lucide="wifi-off"></i><span><b style="color:var(--ink)">Live paused — reconnecting…</b> Showing data from 6 min ago. Actions are disabled until the connection returns.</span>`;

    /* Tweaks panel */
    const tp = document.createElement("div");
    tp.className = "tweaks"; tp.id = "tweaks-panel";
    tp.innerHTML = `<h4>Tweaks<button aria-label="Close" onclick="AdminShell.closeTweaks()">✕</button></h4>` +
      TW.map((t) =>
        `<div class="tw-label">${t.label}</div><div class="tw-seg">` +
        t.vals.map((v) => `<button data-key="${t.key}" data-val="${v}" onclick="AdminShell.setTweak('${t.key}','${v}')">${v}</button>`).join("") +
        `</div>`).join("");
    document.body.appendChild(tp);

    /* Modal + toast containers */
    const mw = document.createElement("div");
    mw.className = "modal-wrap"; mw.id = "modal-wrap";
    mw.addEventListener("click", (e) => { if (e.target === mw) closeModal(); });
    document.body.appendChild(mw);
    const toastEl = document.createElement("div");
    toastEl.className = "toast"; toastEl.id = "toast";
    document.body.appendChild(toastEl);

    try { window.parent.postMessage({ type: "__edit_mode_available" }, "*"); } catch (e) {}
    apply();
  }

  function closeTweaks() {
    document.getElementById("tweaks-panel").classList.remove("open");
    try { window.parent.postMessage({ type: "__edit_mode_dismissed" }, "*"); } catch (e) {}
  }

  /* ── Confirm modal (reason code required — audit-friendly) ── */
  let modalConfirmCb = null;
  function confirmAction(cfg) {
    const mw = document.getElementById("modal-wrap");
    modalConfirmCb = cfg.onConfirm || null;
    const reasons = cfg.reasons || [];
    mw.innerHTML =
      `<div class="modal" role="dialog" aria-modal="true">
        <h3>${cfg.title}</h3>
        <div class="body">${cfg.body || ""}</div>
        ${reasons.length ? `<span class="field-label">Reason — required</span>
        <div class="reason-list">` + reasons.map((r, i) =>
          `<label><input type="radio" name="modal-reason" value="${r}" onchange="AdminShell._reasonPicked()">${r}</label>`).join("") + `</div>` : ""}
        <span class="field-label">Note ${cfg.noteRequired ? "— required" : "(optional)"}</span>
        <textarea id="modal-note" placeholder="${cfg.notePlaceholder || "Add context for the audit log"}"></textarea>
        <div class="actions">
          <button class="btn quiet" onclick="AdminShell.closeModal()">Cancel</button>
          <button class="btn ${cfg.danger ? "danger-solid" : "solid"}" id="modal-confirm" ${reasons.length ? "disabled" : ""}>${cfg.confirmLabel || "Confirm"}</button>
        </div>
        <div class="audit">Recorded in the audit log as Rufaro C. · ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</div>
      </div>`;
    mw.classList.add("open");
    document.getElementById("modal-confirm").addEventListener("click", () => {
      const picked = mw.querySelector('input[name="modal-reason"]:checked');
      const note = document.getElementById("modal-note").value;
      closeModal();
      if (modalConfirmCb) modalConfirmCb(picked ? picked.value : null, note);
    });
  }
  function _reasonPicked() { document.getElementById("modal-confirm").disabled = false; }
  function closeModal() { const mw = document.getElementById("modal-wrap"); mw.classList.remove("open"); mw.innerHTML = ""; }

  function toast(msg) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.remove("show"), 2600);
  }

  /* ── Render helpers ── */
  function pill(text, kind) { return `<span class="kpill ${kind || ""}">${text}</span>`; }
  function statusPill(s) {
    const map = {
      open_for_offers: "good", offer_selected: "good", en_route_pickup: "good", at_pickup: "good",
      picked_up: "good", en_route_dropoff: "good", delivered: "good",
      completed: "mut", expired: "bad", cancelled: "mut", stuck: "bad",
    };
    return pill(s.replace(/_/g, " "), map[s] || "mut");
  }
  function skelRows(cols, n) {
    let out = "";
    for (let i = 0; i < n; i++)
      out += `<tr>${Array.from({ length: cols }, (_, c) =>
        `<td><span class="skel">${"—".repeat(c === 1 ? 8 : 4)}</span></td>`).join("")}</tr>`;
    return out;
  }
  function emptyState(icon, title, line) {
    return `<div class="empty"><i data-lucide="${icon}"></i><b>${title}</b>${line}</div>`;
  }
  /* volume helper: pilot rows, or pilot+extra under growth */
  function vol(env, pilotArr, growthExtra) {
    return env.volume === "growth" ? pilotArr.concat(growthExtra || []) : pilotArr;
  }

  window.AdminShell = { init, setTweak, closeTweaks, confirmAction, closeModal, _reasonPicked, toast, pill, statusPill, skelRows, emptyState, vol };
})();
