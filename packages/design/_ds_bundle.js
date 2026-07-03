/* @ds-bundle: {"format":4,"namespace":"LyniaDesignSystem_94c56a","components":[{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Card","sourcePath":"components/core/Card.jsx"},{"name":"Icon","sourcePath":"components/core/Icon.jsx"},{"name":"StatusPill","sourcePath":"components/core/StatusPill.jsx"},{"name":"EmptyState","sourcePath":"components/feedback/EmptyState.jsx"},{"name":"OfflineBanner","sourcePath":"components/feedback/OfflineBanner.jsx"},{"name":"Skeleton","sourcePath":"components/feedback/Skeleton.jsx"},{"name":"SkeletonCard","sourcePath":"components/feedback/SkeletonList.jsx"},{"name":"SkeletonList","sourcePath":"components/feedback/SkeletonList.jsx"},{"name":"Field","sourcePath":"components/forms/Field.jsx"},{"name":"Stepper","sourcePath":"components/journey/Stepper.jsx"},{"name":"Heading","sourcePath":"components/typography/Heading.jsx"},{"name":"Label","sourcePath":"components/typography/Label.jsx"},{"name":"Sub","sourcePath":"components/typography/Sub.jsx"}],"sourceHashes":{"assets/brand/doc-page.js":"7feb7a4009b0","assets/lynia-icons.js":"80c7bf883566","components/core/Button.jsx":"9e208204ffc3","components/core/Card.jsx":"66a8dcfefd5a","components/core/Icon.jsx":"8dbdfbb2d1ae","components/core/StatusPill.jsx":"01dada6a8e01","components/feedback/EmptyState.jsx":"d45ffee74d6a","components/feedback/OfflineBanner.jsx":"a043da4e36dd","components/feedback/Skeleton.jsx":"93e10984efec","components/feedback/SkeletonList.jsx":"e4d7860ab93c","components/forms/Field.jsx":"4f36ea86faab","components/journey/Stepper.jsx":"4fb3ddcff939","components/typography/Heading.jsx":"1ea3a190680c","components/typography/Label.jsx":"abe06bcbafa6","components/typography/Sub.jsx":"2212189f67d3","ui_kits/mobile/app.js":"1e2df537a180","ui_kits/mobile/kit-parts.js":"47d540c723d8","ui_kits/support/parts.js":"098eb41eb3df","ui_kits/support/screens.js":"27d0112fe061"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.LyniaDesignSystem_94c56a = window.LyniaDesignSystem_94c56a || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// assets/brand/doc-page.js
try { (() => {
// @ds-adherence-ignore -- omelette starter scaffold (raw elements/hex/px by design)
/* BEGIN USAGE */
/**
 * <doc-page> — paged-document shell for printable HTML.
 *
 * On screen the document renders as a single continuous sheet on a desk
 * background (Google Docs' pageless view): you scroll one tall page card.
 * There is no manual page-splitting — write the whole document as normal
 * flow inside <doc-page> and the browser's print engine paginates it at
 * export.
 *
 * At print the component injects `@page { size: …; margin: 0 }` (which
 * leaves Chrome no margin box to draw its date/URL/page-count header in)
 * and moves the visual margin onto the sheet's own padding, so the printed
 * page has the same inset you see on screen. Standard break-hygiene rules
 * (`break-inside: avoid` on figures, code blocks, images and table rows;
 * `orphans/widows: 3`) are applied so paragraphs and groups split cleanly.
 *
 * Usage:
 *   <style>doc-page:not(:defined){visibility:hidden}</style>
 *   <doc-page size="letter" margin="0.75in">
 *     <h1>Title</h1>
 *     <p>…body…</p>
 *   </doc-page>
 *   <script src="doc-page.js"></script>
 *
 * Attributes:
 *   size    — letter | a4 | legal (default letter)
 *   width / height — explicit CSS lengths, override `size`
 *   margin  — printable inset on every page (default 0.75in)
 *
 * Running header/footer (optional): give an element `slot="header"` or
 * `slot="footer"` and it repeats on every printed page via
 * `position: fixed`. To keep body text from sliding under it, the
 * component prints inside a single-cell table whose <thead>/<tfoot> are
 * spacers sized to the header/footer height — browsers repeat thead/tfoot
 * on every page, so each sheet's content starts below the header and ends
 * above the footer. On screen the header/footer render once at the
 * top/bottom of the sheet.
 *
 * Author content as static HTML so the user can click-to-edit any text
 * directly. Do not set width/padding/background on the document body —
 * the component owns the sheet box.
 */
/* END USAGE */

(() => {
  const PAPER = {
    letter: ['8.5in', '11in'],
    a4: ['210mm', '297mm'],
    legal: ['8.5in', '14in']
  };
  const CSS_LENGTH = /^\d+(\.\d+)?(px|in|mm|cm|pt|pc)$/;
  const safeLen = (v, fb) => CSS_LENGTH.test((v || '').trim()) ? v.trim() : fb;
  const stylesheet = `
    :host {
      position: relative;
      display: block;
      min-height: 100vh;
      background: #ece8dd;
      padding: 48px 24px;
      box-sizing: border-box;
      font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif;
      --doc-page-w: 8.5in;
      --doc-page-h: 11in;
      --doc-page-margin: 0.75in;
      --doc-hdr-h: 0px;
      --doc-ftr-h: 0px;
    }
    .sheet {
      width: var(--doc-page-w);
      margin: 0 auto;
      background: #fff;
      box-shadow: 0 2px 14px rgba(20, 20, 19, 0.12);
      border-radius: 2px;
      box-sizing: border-box;
      padding: var(--doc-page-margin);
    }
    .frame { width: 100%; border-collapse: collapse; }
    .frame td, .frame th { padding: 0; text-align: left; font-weight: inherit; }
    .hdr-space { height: var(--doc-hdr-h); }
    .ftr-space { height: var(--doc-ftr-h); }
    ::slotted([slot="header"]),
    ::slotted([slot="footer"]) { display: block; box-sizing: border-box; }
    @media print {
      :host { background: none; padding: 0; min-height: 0; }
      .sheet {
        width: auto; margin: 0; box-shadow: none; border-radius: 0;
        padding: 0 var(--doc-page-margin);
      }
      /* The thead/tfoot spacers repeat on every page, so they carry the
       * vertical page margin (which the sheet's own padding cannot, since
       * that padding is consumed once on the first/last page). The running
       * header/footer are fixed inside that band. */
      .hdr-space { height: max(var(--doc-page-margin), calc(var(--doc-hdr-h) + 0.35in)); }
      .ftr-space { height: max(var(--doc-page-margin), calc(var(--doc-ftr-h) + 0.35in)); }
      ::slotted([slot="header"]) {
        position: fixed; top: 0; left: 0; right: 0; margin: 0;
        padding: calc(var(--doc-page-margin) * 0.45) var(--doc-page-margin) 0;
      }
      ::slotted([slot="footer"]) {
        position: fixed; bottom: 0; left: 0; right: 0; margin: 0;
        padding: 0 var(--doc-page-margin) calc(var(--doc-page-margin) * 0.45);
      }
    }
  `;
  class DocPage extends HTMLElement {
    static get observedAttributes() {
      return ['size', 'width', 'height', 'margin'];
    }
    constructor() {
      super();
      this._root = this.attachShadow({
        mode: 'open'
      });
      this._mo = typeof MutationObserver === 'function' ? new MutationObserver(() => this._scheduleMeasure()) : null;
    }
    get pageWidth() {
      const named = PAPER[(this.getAttribute('size') || '').toLowerCase()];
      return safeLen(this.getAttribute('width'), named ? named[0] : PAPER.letter[0]);
    }
    get pageHeight() {
      const named = PAPER[(this.getAttribute('size') || '').toLowerCase()];
      return safeLen(this.getAttribute('height'), named ? named[1] : PAPER.letter[1]);
    }
    get pageMargin() {
      return safeLen(this.getAttribute('margin'), '0.75in');
    }
    connectedCallback() {
      if (!this._sheet) this._render();
      this._syncSize();
      this._syncPrintPageRule();
      if (this._mo) this._mo.observe(this, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true
      });
      this._onResize = () => this._scheduleMeasure();
      window.addEventListener('resize', this._onResize);
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(() => this._scheduleMeasure());
      }
      this._scheduleMeasure();
    }
    disconnectedCallback() {
      window.removeEventListener('resize', this._onResize);
      if (this._mo) this._mo.disconnect();
      if (this._raf) {
        cancelAnimationFrame(this._raf);
        this._raf = null;
      }
      // Drop the head rule when the last doc-page leaves, so a deleted
      // document's @page geometry can't apply to whatever replaces it.
      if (!document.querySelector('doc-page')) {
        const tag = document.getElementById('doc-page-print');
        if (tag) tag.remove();
      }
    }
    attributeChangedCallback() {
      if (!this._sheet) return;
      this._syncSize();
      this._syncPrintPageRule();
      this._scheduleMeasure();
    }
    _render() {
      this._root.innerHTML = `
        <style>${stylesheet}</style>
        <style id="vars"></style>
        <div class="sheet" data-screen-label="Document">
          <table class="frame" role="presentation">
            <thead><tr><th><div class="hdr-space"><slot name="header"></slot></div></th></tr></thead>
            <tbody><tr><td class="body"><slot></slot></td></tr></tbody>
            <tfoot><tr><td><div class="ftr-space"><slot name="footer"></slot></div></td></tr></tfoot>
          </table>
        </div>`;
      this._sheet = this._root.querySelector('.sheet');
      this._vars = this._root.getElementById('vars');
    }

    /** Runtime sizing lives in a shadow <style> :host rule, never on the
     *  light-DOM host element, so serialize-persist can't write it back. */
    _syncSize(hdrH, ftrH) {
      this._vars.textContent = ':host{' + '--doc-page-w:' + this.pageWidth + ';' + '--doc-page-h:' + this.pageHeight + ';' + '--doc-page-margin:' + this.pageMargin + ';' + '--doc-hdr-h:' + (hdrH || 0) + 'px;' + '--doc-ftr-h:' + (ftrH || 0) + 'px}';
    }

    /** @page is a no-op inside shadow DOM, so the rule lives in <head>.
     *  Re-appended on every sync so it stays last in source order — the
     *  @page cascade is source-order per descriptor, so this rule wins
     *  over any other @page rule in the document. */
    _syncPrintPageRule() {
      const id = 'doc-page-print';
      let tag = document.getElementById(id);
      if (!tag) {
        tag = document.createElement('style');
        tag.id = id;
      }
      document.head.appendChild(tag);
      tag.textContent = '@page { size: ' + this.pageWidth + ' ' + this.pageHeight + '; margin: 0; } ' + '@media print { html, body { margin: 0 !important; padding: 0 !important; background: none !important; height: auto !important; overflow: visible !important; } ' + 'h1,h2,h3,h4,h5,h6 { break-after: avoid; } ' + 'figure,pre,blockquote,img,svg,tr { break-inside: avoid; } ' + 'p,li { orphans: 3; widows: 3; } ' + '* { -webkit-print-color-adjust: exact; print-color-adjust: exact; } ' + '*, *::before, *::after { animation-delay: -99s !important; animation-duration: .001s !important; ' + 'animation-iteration-count: 1 !important; animation-fill-mode: both !important; ' + 'animation-play-state: running !important; transition-duration: 0s !important; } }';
    }
    _scheduleMeasure() {
      if (this._raf) return;
      this._raf = requestAnimationFrame(() => {
        this._raf = null;
        this._measure();
      });
    }

    /** Slot heights feed the print spacers (--doc-hdr-h / --doc-ftr-h), so
     *  they re-measure on content mutation, resize, and font load. */
    _measure() {
      const hdr = this.querySelector(':scope > [slot="header"]');
      const ftr = this.querySelector(':scope > [slot="footer"]');
      this._syncSize(hdr ? hdr.offsetHeight : 0, ftr ? ftr.offsetHeight : 0);
    }
  }
  if (!customElements.get('doc-page')) {
    customElements.define('doc-page', DocPage);
  }
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "assets/brand/doc-page.js", error: String((e && e.message) || e) }); }

// assets/lynia-icons.js
try { (() => {
/* Lynia icon subset — 22 Lucide icons (ISC license, lucide.dev), self-hosted for
   low-bandwidth networks (~4KB vs ~300KB for the full CDN library). Exposes a minimal
   window.lucide shim ({ icons, createIcons }) compatible with the design-system Icon component
   and <i data-lucide="name"> usage. Regenerate by re-importing icons/*.svg and re-running the build. */
(function () {
  var ICONS = {
    "Bike": [["circle", {
      "cx": "18.5",
      "cy": "17.5",
      "r": "3.5"
    }], ["circle", {
      "cx": "5.5",
      "cy": "17.5",
      "r": "3.5"
    }], ["circle", {
      "cx": "15",
      "cy": "5",
      "r": "1"
    }], ["path", {
      "d": "M12 17.5V14l-3-3 4-3 2 3h2"
    }]],
    "Inbox": [["polyline", {
      "points": "22 12 16 12 14 15 10 15 8 12 2 12"
    }], ["path", {
      "d": "M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"
    }]],
    "IdCard": [["path", {
      "d": "M16 10h2"
    }], ["path", {
      "d": "M16 14h2"
    }], ["path", {
      "d": "M6.17 15a3 3 0 0 1 5.66 0"
    }], ["circle", {
      "cx": "9",
      "cy": "11",
      "r": "2"
    }], ["rect", {
      "x": "2",
      "y": "5",
      "width": "20",
      "height": "14",
      "rx": "2"
    }]],
    "Banknote": [["rect", {
      "width": "20",
      "height": "12",
      "x": "2",
      "y": "6",
      "rx": "2"
    }], ["circle", {
      "cx": "12",
      "cy": "12",
      "r": "2"
    }], ["path", {
      "d": "M6 12h.01M18 12h.01"
    }]],
    "Package": [["path", {
      "d": "M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"
    }], ["path", {
      "d": "M12 22V12"
    }], ["polyline", {
      "points": "3.29 7 12 12 20.71 7"
    }], ["path", {
      "d": "m7.5 4.27 9 5.15"
    }]],
    "WifiOff": [["path", {
      "d": "M12 20h.01"
    }], ["path", {
      "d": "M8.5 16.429a5 5 0 0 1 7 0"
    }], ["path", {
      "d": "M5 12.859a10 10 0 0 1 5.17-2.69"
    }], ["path", {
      "d": "M19 12.859a10 10 0 0 0-2.007-1.523"
    }], ["path", {
      "d": "M2 8.82a15 15 0 0 1 4.177-2.643"
    }], ["path", {
      "d": "M22 8.82a15 15 0 0 0-11.288-3.764"
    }], ["path", {
      "d": "m2 2 20 20"
    }]],
    "TriangleAlert": [["path", {
      "d": "m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"
    }], ["path", {
      "d": "M12 9v4"
    }], ["path", {
      "d": "M12 17h.01"
    }]],
    "MapPin": [["path", {
      "d": "M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"
    }], ["circle", {
      "cx": "12",
      "cy": "10",
      "r": "3"
    }]],
    "Phone": [["path", {
      "d": "M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384"
    }]],
    "Clock": [["circle", {
      "cx": "12",
      "cy": "12",
      "r": "10"
    }], ["path", {
      "d": "M12 6v6l4 2"
    }]],
    "ChevronRight": [["path", {
      "d": "m9 18 6-6-6-6"
    }]],
    "ChevronDown": [["path", {
      "d": "m6 9 6 6 6-6"
    }]],
    "ChevronUp": [["path", {
      "d": "m18 15-6-6-6 6"
    }]],
    "Star": [["path", {
      "d": "M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"
    }]],
    "Check": [["path", {
      "d": "M20 6 9 17l-5-5"
    }]],
    "ArrowRight": [["path", {
      "d": "M5 12h14"
    }], ["path", {
      "d": "m12 5 7 7-7 7"
    }]],
    "Navigation": [["polygon", {
      "points": "3 11 22 2 13 21 11 13 3 11"
    }]],
    "User": [["path", {
      "d": "M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"
    }], ["circle", {
      "cx": "12",
      "cy": "7",
      "r": "4"
    }]],
    "History": [["path", {
      "d": "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"
    }], ["path", {
      "d": "M3 3v5h5"
    }], ["path", {
      "d": "M12 7v5l4 2"
    }]],
    "Search": [["path", {
      "d": "m21 21-4.34-4.34"
    }], ["circle", {
      "cx": "11",
      "cy": "11",
      "r": "8"
    }]],
    "X": [["path", {
      "d": "M18 6 6 18"
    }], ["path", {
      "d": "m6 6 12 12"
    }]],
    "CircleAlert": [["circle", {
      "cx": "12",
      "cy": "12",
      "r": "10"
    }], ["line", {}], ["line", {}]]
  };
  var SVG_NS = "http://www.w3.org/2000/svg";
  function pascal(name) {
    return String(name || "").split(/[-_ ]+/).filter(Boolean).map(function (s) {
      return s[0].toUpperCase() + s.slice(1);
    }).join("");
  }
  function createIcons(opts) {
    var root = opts && opts.root || document;
    var els = root.querySelectorAll("[data-lucide]");
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var node = ICONS[pascal(el.getAttribute("data-lucide"))];
      if (!node) continue;
      var svg = document.createElementNS(SVG_NS, "svg");
      svg.setAttribute("width", el.getAttribute("width") || 24);
      svg.setAttribute("height", el.getAttribute("height") || 24);
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("fill", "none");
      svg.setAttribute("stroke", "currentColor");
      svg.setAttribute("stroke-width", "2");
      svg.setAttribute("stroke-linecap", "round");
      svg.setAttribute("stroke-linejoin", "round");
      if (el.className) svg.setAttribute("class", el.className);
      for (var j = 0; j < node.length; j++) {
        var child = document.createElementNS(SVG_NS, node[j][0]);
        var attrs = node[j][1];
        for (var k in attrs) child.setAttribute(k, attrs[k]);
        svg.appendChild(child);
      }
      el.parentNode.replaceChild(svg, el);
    }
  }
  window.lucide = {
    icons: ICONS,
    createIcons: createIcons
  };
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "assets/lynia-icons.js", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
// Spinner keyframes — injected once into <head>, never inside the button (keeps textContent clean).
if (typeof document !== "undefined" && !document.getElementById("lynia-btn-kf")) {
  const kf = document.createElement("style");
  kf.id = "lynia-btn-kf";
  kf.textContent = "@keyframes lynia-spin { to { transform: rotate(360deg); } }";
  document.head.appendChild(kf);
}

/**
 * Lynia action — Grab shape language: full-pill buttons. One primary CTA per screen (52px, bright
 * Grab-green fill, presses to the darker green); ghost is the 44px pill outline with green text.
 * Full-width block by default — the shape it takes in every Lynia screen.
 */
function Button({
  label,
  children,
  onClick,
  variant = "primary",
  disabled = false,
  loading = false,
  block = true,
  style,
  ...rest
}) {
  const primary = variant === "primary";
  const isDisabled = disabled || loading;
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    onClick: isDisabled ? undefined : onClick,
    disabled: isDisabled,
    "aria-busy": loading || undefined,
    className: "lynia-btn",
    "data-variant": variant,
    style: {
      display: block ? "flex" : "inline-flex",
      width: block ? "100%" : undefined,
      alignItems: "center",
      justifyContent: "center",
      gap: "var(--space-sm)",
      minHeight: primary ? "var(--target-primary)" : "var(--target-min)",
      padding: "14px 22px",
      marginTop: "var(--space-sm)",
      borderRadius: "var(--radius-button)",
      border: primary ? "none" : "1px solid var(--line)",
      background: primary ? "var(--cta-fill)" : "transparent",
      color: primary ? "var(--on-accent)" : "var(--accent-text)",
      fontFamily: "var(--font-sans)",
      fontSize: "var(--text-body-lg)",
      fontWeight: "var(--weight-semibold)",
      lineHeight: 1,
      cursor: isDisabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.5 : 1,
      WebkitTapHighlightColor: "transparent",
      ...style
    },
    onMouseDown: e => {
      if (isDisabled) return;
      if (primary) e.currentTarget.style.background = "var(--cta-fill-pressed)";else e.currentTarget.style.background = "var(--surface)";
    },
    onMouseUp: e => {
      if (isDisabled) return;
      e.currentTarget.style.background = primary ? "var(--cta-fill)" : "transparent";
    },
    onMouseLeave: e => {
      if (isDisabled) return;
      e.currentTarget.style.background = primary ? "var(--cta-fill)" : "transparent";
    }
  }, rest), loading ? /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    className: "lynia-btn-spinner",
    style: {
      width: 18,
      height: 18,
      borderRadius: "50%",
      border: `2px solid ${primary ? "rgba(255,255,255,0.4)" : "var(--line)"}`,
      borderTopColor: primary ? "var(--on-accent)" : "var(--accent-text)",
      animation: "lynia-spin 700ms linear infinite"
    }
  }) : label ?? children);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Lynia container — Grab-style card: white surface, soft 16px radius, floating on a soft ambient
 * shadow (no visible border). The one card shape across the whole system (offers, tracking, rows,
 * disclaimers). Pass `accent` to draw a green border for emphasis (active job / delivery code).
 */
function Card({
  children,
  accent = false,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    className: "lynia-card",
    style: {
      background: "var(--bg)",
      border: accent ? "1.5px solid var(--accent)" : "1px solid transparent",
      boxShadow: "var(--shadow-card)",
      borderRadius: "var(--radius-card)",
      padding: "var(--space-lg)",
      marginBottom: "var(--space-md)",
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Card.jsx", error: String((e && e.message) || e) }); }

// components/core/Icon.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Lynia icon — renders a Lucide icon (open-source, rounded 2px line icons matching Grab's in-app
 * icon style). Requires the SELF-HOSTED icon subset on the page (~5KB, data-light):
 *   <script src="assets/lynia-icons.js"></script>  (adjust the relative path)
 * Icons are ALWAYS paired with a visible text label elsewhere in the UI (low-literacy + SR rule).
 * Falls back to a neutral dot if the library or icon name is missing.
 */
function Icon({
  name,
  size,
  color = "currentColor",
  strokeWidth = 2,
  fill = "none",
  style,
  ...rest
}) {
  const px = size ?? 20;
  const lib = typeof window !== "undefined" ? window.lucide : null;
  const pascal = String(name || "").split(/[-_ ]+/).filter(Boolean).map(s => s[0].toUpperCase() + s.slice(1)).join("");
  let node = null;
  if (lib && lib.icons) node = lib.icons[pascal] || lib.icons[name] || null;
  // iconNode formats seen across lucide versions: [[tag, attrs], …] or [tag, attrs, children]
  let children = null;
  if (Array.isArray(node)) {
    const pairs = Array.isArray(node[0]) ? node : node[2] || [];
    children = pairs.map(([tag, attrs], i) => React.createElement(tag, {
      key: i,
      ...attrs
    }));
  }
  return /*#__PURE__*/React.createElement("svg", _extends({
    "aria-hidden": "true",
    width: px,
    height: px,
    viewBox: "0 0 24 24",
    fill: fill,
    stroke: color,
    strokeWidth: strokeWidth,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    style: {
      display: "inline-block",
      verticalAlign: "middle",
      flexShrink: 0,
      ...style
    }
  }, rest), children || /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "3",
    fill: color,
    stroke: "none"
  }));
}
Object.assign(__ds_scope, { Icon });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Icon.jsx", error: String((e && e.message) || e) }); }

// components/core/StatusPill.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const TONE = {
  neutral: {
    color: "var(--accent-text)",
    bg: "var(--surface)",
    dot: "var(--accent)"
  },
  online: {
    color: "var(--accent-text)",
    bg: "var(--accent-wash)",
    dot: "var(--accent)"
  },
  offline: {
    color: "var(--muted)",
    bg: "var(--surface)",
    dot: "var(--muted)"
  },
  reconnecting: {
    color: "var(--muted)",
    bg: "var(--surface)",
    dot: "var(--muted)"
  } // transient, never red
};

/**
 * Lynia status chip — pill with 12px/600 text in the tone colour. Green text uses the dark
 * text-green (sunlight-legible); the online tone sits on the mint wash, Grab-style. Renders an
 * order status (neutral) or the rider connection chip (online/offline/reconnecting + dot).
 * Underscored statuses render spaced ("en_route_pickup" → "en route pickup").
 */
function StatusPill({
  status,
  tone = "neutral",
  dot = false,
  style,
  ...rest
}) {
  const t = TONE[tone] ?? TONE.neutral;
  return /*#__PURE__*/React.createElement("span", _extends({
    role: "text",
    className: "lynia-status-pill",
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      background: t.bg,
      border: "1px solid var(--line)",
      borderRadius: "var(--radius-pill)",
      padding: "4px 10px",
      fontFamily: "var(--font-sans)",
      fontSize: "var(--text-label)",
      fontWeight: "var(--weight-semibold)",
      color: t.color,
      whiteSpace: "nowrap",
      ...style
    }
  }, rest), dot ? /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      width: 8,
      height: 8,
      borderRadius: "50%",
      background: t.dot,
      flexShrink: 0
    }
  }) : null, String(status).replace(/_/g, " "));
}
Object.assign(__ds_scope, { StatusPill });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/StatusPill.jsx", error: String((e && e.message) || e) }); }

// components/feedback/EmptyState.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Lynia empty/dead-end state — a calm card that turns a dead-end into an action. A round mint-wash
 * tile holds a Lucide line icon (dark text-green), then a bold title, a short reassuring message,
 * and one primary action passed as children. Used for no-offers / no-orders / not-verified /
 * error-retry states. `icon` is a Lucide name; a legacy emoji string still renders as text.
 */
function EmptyState({
  icon,
  title,
  message,
  children,
  style,
  ...rest
}) {
  const isEmoji = typeof icon === "string" && /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(icon);
  return /*#__PURE__*/React.createElement("div", _extends({
    className: "lynia-empty",
    style: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      textAlign: "center",
      padding: "var(--space-xl) 0",
      ...style
    }
  }, rest), icon != null ? /*#__PURE__*/React.createElement("div", {
    "aria-hidden": "true",
    style: {
      width: 88,
      height: 88,
      borderRadius: "50%",
      background: "var(--accent-wash)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: "var(--space-md)"
    }
  }, isEmoji ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 36
    }
  }, icon) : /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: 36,
    color: "var(--accent-text)"
  })) : null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-sans)",
      fontSize: "var(--text-title)",
      fontWeight: "var(--weight-bold)",
      color: "var(--ink)"
    }
  }, title), message != null ? /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 6,
      maxWidth: 260,
      fontFamily: "var(--font-sans)",
      fontSize: "var(--text-caption)",
      lineHeight: "var(--leading-body)",
      color: "var(--muted)"
    }
  }, message) : null, children ? /*#__PURE__*/React.createElement("div", {
    style: {
      alignSelf: "stretch",
      marginTop: "var(--space-md)"
    }
  }, children) : null);
}
Object.assign(__ds_scope, { EmptyState });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/EmptyState.jsx", error: String((e && e.message) || e) }); }

// components/feedback/OfflineBanner.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Lynia connectivity banner — the global offline/reconnecting affordance the ship review asked for
 * (pre-auth loading discipline). Sits at the very top of the screen, full-width, above everything.
 * Offline is a calm ink bar (a state, not an alarm — never danger-red); reconnecting is a muted
 * surface strip. Renders nothing when state is "online", so it can stay mounted permanently.
 */
function OfflineBanner({
  state = "online",
  style,
  ...rest
}) {
  if (state !== "offline" && state !== "reconnecting") return null;
  const offline = state === "offline";
  return /*#__PURE__*/React.createElement("div", _extends({
    role: "status",
    "aria-live": "polite",
    className: "lynia-offline-banner",
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      padding: "8px 12px",
      background: offline ? "var(--ink)" : "var(--surface)",
      color: offline ? "var(--on-accent)" : "var(--muted)",
      borderBottom: offline ? "none" : "1px solid var(--line)",
      fontFamily: "var(--font-sans)",
      fontSize: "var(--text-caption)",
      fontWeight: "var(--weight-semibold)",
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: offline ? "wifi-off" : "clock",
    size: 14
  }), offline ? "You're offline — some things may be out of date." : "Reconnecting… your data may be a moment behind.");
}
Object.assign(__ds_scope, { OfflineBanner });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/OfflineBanner.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Skeleton.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Lynia skeleton — a calm opacity-pulse placeholder in the line colour, shown over spinners while
 * list/board/stepper screens load (data-light: the layout doesn't jump when data lands).
 */
function Skeleton({
  width = "100%",
  height = 14,
  radius = 6,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    "aria-hidden": "true",
    className: "lynia-skeleton",
    style: {
      width,
      height,
      borderRadius: radius,
      background: "var(--line)",
      animation: "lynia-pulse 1400ms ease-in-out infinite",
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("style", null, `@keyframes lynia-pulse { 0%,100% { opacity: 0.5 } 50% { opacity: 1 } }`));
}
Object.assign(__ds_scope, { Skeleton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Skeleton.jsx", error: String((e && e.message) || e) }); }

// components/feedback/SkeletonList.jsx
try { (() => {
/** A Card-shaped placeholder mirroring a list/board row (title + two meta lines). */
function SkeletonCard() {
  return /*#__PURE__*/React.createElement(__ds_scope.Card, null, /*#__PURE__*/React.createElement(__ds_scope.Skeleton, {
    width: "55%",
    height: 16
  }), /*#__PURE__*/React.createElement(__ds_scope.Skeleton, {
    width: "80%",
    height: 12,
    style: {
      marginTop: "var(--space-sm)"
    }
  }), /*#__PURE__*/React.createElement(__ds_scope.Skeleton, {
    width: "35%",
    height: 12,
    style: {
      marginTop: "var(--space-sm)"
    }
  }));
}

/* Content-shaped loading states — the skeleton must mirror the real layout so nothing reflows
   when data lands (ship-review P1: generic card skeletons caused reflow on history, earnings
   and the §5c stepper screens). */
function StepperSkeleton({
  steps = 7
}) {
  return /*#__PURE__*/React.createElement(__ds_scope.Card, null, Array.from({
    length: steps
  }, (_, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: "flex",
      alignItems: "flex-start"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      width: 26
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Skeleton, {
    width: 22,
    height: 22,
    radius: 11
  }), i < steps - 1 ? /*#__PURE__*/React.createElement("div", {
    style: {
      width: 2,
      height: 16,
      background: "var(--surface)"
    }
  }) : null), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      paddingLeft: "var(--space-sm)",
      paddingBottom: i < steps - 1 ? "var(--space-md)" : 0
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Skeleton, {
    width: `${45 + i * 13 % 30}%`,
    height: 13
  })))));
}
function SummarySkeleton() {
  return /*#__PURE__*/React.createElement(__ds_scope.Card, {
    style: {
      background: "var(--accent-wash)",
      border: "1px solid transparent"
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Skeleton, {
    width: "40%",
    height: 12,
    style: {
      background: "#cfeeda"
    }
  }), /*#__PURE__*/React.createElement(__ds_scope.Skeleton, {
    width: "55%",
    height: 28,
    style: {
      marginTop: "var(--space-sm)",
      background: "#cfeeda"
    }
  }), /*#__PURE__*/React.createElement(__ds_scope.Skeleton, {
    width: "30%",
    height: 12,
    style: {
      marginTop: "var(--space-sm)",
      background: "#cfeeda"
    }
  }));
}

/**
 * Content-shaped loading placeholders.
 * variant="card"    — N list/board cards (default)
 * variant="row"     — N row-with-value rows (trip history, earnings rows)
 * variant="stepper" — the §5c journey timeline shape (count = steps, default 7)
 * variant="summary" — one tall accent summary block (earnings total)
 */
function SkeletonList({
  count,
  variant = "card"
}) {
  if (variant === "stepper") {
    return /*#__PURE__*/React.createElement("div", {
      "aria-label": "Loading",
      "aria-busy": "true"
    }, /*#__PURE__*/React.createElement(StepperSkeleton, {
      steps: count ?? 7
    }));
  }
  if (variant === "summary") {
    return /*#__PURE__*/React.createElement("div", {
      "aria-label": "Loading",
      "aria-busy": "true"
    }, /*#__PURE__*/React.createElement(SummarySkeleton, null));
  }
  const n = count ?? (variant === "row" ? 4 : 3);
  return /*#__PURE__*/React.createElement("div", {
    "aria-label": "Loading",
    "aria-busy": "true"
  }, Array.from({
    length: n
  }, (_, i) => variant === "row" ? /*#__PURE__*/React.createElement(__ds_scope.Card, {
    key: i
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      paddingRight: "var(--space-sm)"
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Skeleton, {
    width: "70%",
    height: 14
  }), /*#__PURE__*/React.createElement(__ds_scope.Skeleton, {
    width: "90%",
    height: 12,
    style: {
      marginTop: "var(--space-sm)"
    }
  })), /*#__PURE__*/React.createElement(__ds_scope.Skeleton, {
    width: 48,
    height: 16
  }))) : /*#__PURE__*/React.createElement(SkeletonCard, {
    key: i
  })));
}
Object.assign(__ds_scope, { SkeletonCard, SkeletonList });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/SkeletonList.jsx", error: String((e && e.message) || e) }); }

// components/forms/Field.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Lynia text field — a VISIBLE label above the field (never placeholder-as-label), 12px radius,
 * 16px input text. Has an inline error slot (honest, specific, right under the field) and an
 * optional hint line. `fromMap` appends the "• from map" auto-fill note to the label.
 * The label is associated with the input for screen readers.
 * `multiline` renders a resizable textarea (for paragraph notes/instructions); with `maxLength`
 * it shows a live character counter next to the hint.
 */
let lyniaFieldId = 0;
function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  inputMode,
  maxLength,
  fromMap = false,
  disabled = false,
  error,
  hint,
  multiline = false,
  rows = 3,
  style,
  ...rest
}) {
  const idRef = React.useRef(null);
  if (idRef.current == null) idRef.current = `lynia-field-${++lyniaFieldId}`;
  const id = idRef.current;
  const hasError = error != null && error !== "";
  const showCount = multiline && maxLength != null;
  const controlStyle = {
    width: "100%",
    boxSizing: "border-box",
    border: `1px solid ${hasError ? "var(--danger)" : "var(--line)"}`,
    borderRadius: "var(--radius-input)",
    padding: "var(--space-md)",
    fontFamily: "var(--font-sans)",
    fontSize: "var(--text-body-lg)",
    color: "var(--ink)",
    background: "var(--bg)",
    outline: "none"
  };
  const focusOn = e => e.currentTarget.style.borderColor = hasError ? "var(--danger)" : "var(--accent-700)";
  const focusOff = e => e.currentTarget.style.borderColor = hasError ? "var(--danger)" : "var(--line)";
  const common = {
    id,
    value,
    onChange: onChange ? e => onChange(e.target.value) : undefined,
    placeholder,
    maxLength,
    disabled,
    "aria-invalid": hasError || undefined,
    "aria-describedby": hasError ? `${id}-err` : hint ? `${id}-hint` : undefined,
    onFocus: focusOn,
    onBlur: focusOff
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "lynia-field",
    style: {
      marginBottom: "var(--space-md)",
      ...style
    }
  }, label != null ? /*#__PURE__*/React.createElement("label", {
    htmlFor: id,
    style: {
      display: "block",
      marginBottom: 4,
      fontFamily: "var(--font-sans)",
      fontSize: "var(--text-label)",
      fontWeight: "var(--weight-semibold)",
      color: "var(--muted)"
    }
  }, label, fromMap ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: "var(--weight-regular)"
    }
  }, "  • from map") : null) : null, multiline ? /*#__PURE__*/React.createElement("textarea", _extends({}, common, {
    rows: rows,
    style: {
      ...controlStyle,
      resize: "vertical",
      minHeight: 44,
      lineHeight: "var(--leading-body)"
    }
  }, rest)) : /*#__PURE__*/React.createElement("input", _extends({}, common, {
    type: type,
    inputMode: inputMode,
    style: controlStyle
  }, rest)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "flex-start",
      gap: 8,
      marginTop: 4
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, hasError ? /*#__PURE__*/React.createElement("div", {
    id: `${id}-err`,
    role: "alert",
    style: {
      fontFamily: "var(--font-sans)",
      fontSize: "var(--text-caption)",
      color: "var(--danger)"
    }
  }, error) : hint ? /*#__PURE__*/React.createElement("div", {
    id: `${id}-hint`,
    style: {
      fontFamily: "var(--font-sans)",
      fontSize: "var(--text-caption)",
      color: "var(--muted)"
    }
  }, hint) : null), showCount ? /*#__PURE__*/React.createElement("div", {
    style: {
      flexShrink: 0,
      fontFamily: "var(--font-sans)",
      fontSize: "var(--text-caption)",
      color: "var(--muted)",
      fontVariantNumeric: "tabular-nums"
    }
  }, String(value ?? "").length, "/", maxLength) : null));
}
Object.assign(__ds_scope, { Field });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Field.jsx", error: String((e && e.message) || e) }); }

// components/journey/Stepper.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
// One timeline seen from two sides (CONCEPT §5c): customer and rider labels are paired so a step
// reads as the same event from either screen.
const STEP_ORDER = ["assigned", "confirmed", "en_route_pickup", "picked_up", "en_route_dropoff", "delivered", "completed"];
const STEP_LABELS = {
  customer: {
    assigned: "Ride accepted",
    confirmed: "Items & note confirmed",
    en_route_pickup: "Rider on the way to pickup",
    picked_up: "Items collected",
    en_route_dropoff: "On the way to drop-off",
    delivered: "Delivered (OTP)",
    completed: "Rate your rider"
  },
  rider: {
    assigned: "You're assigned",
    confirmed: "Details confirmed",
    en_route_pickup: "Heading to pickup",
    picked_up: "Parcel collected",
    en_route_dropoff: "Heading to drop-off",
    delivered: "Delivered",
    completed: "Completed — you're free"
  }
};
function fmtTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * Lynia §5c journey stepper — the 7-step delivery timeline, rendered from an order's append-only
 * events + current status. Steps before the current one are done (✓ + time), the current one is
 * "now" (accent, live), later ones are muted. Pass view="customer" or view="rider" for the paired labels.
 */
function Stepper({
  events = [],
  currentStatus,
  view = "customer",
  style,
  ...rest
}) {
  const labels = STEP_LABELS[view] ?? STEP_LABELS.customer;
  const currentIdx = STEP_ORDER.indexOf(currentStatus);
  const times = {};
  for (const e of events) if (!(e.status in times)) times[e.status] = e.createdAt;
  return /*#__PURE__*/React.createElement("div", _extends({
    className: "lynia-stepper",
    style: style
  }, rest), STEP_ORDER.map((s, i) => {
    const state = currentIdx < 0 ? "todo" : i < currentIdx ? "done" : i === currentIdx ? "now" : "todo";
    const last = i === STEP_ORDER.length - 1;
    const onTrack = state !== "todo";
    const ts = times[s];
    return /*#__PURE__*/React.createElement("div", {
      key: s,
      style: {
        display: "flex"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        width: 26
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: 22,
        height: 22,
        borderRadius: 11,
        border: `2px solid ${onTrack ? "var(--accent)" : "var(--line)"}`,
        background: state === "done" ? "var(--accent)" : "var(--bg)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxSizing: "border-box",
        flexShrink: 0
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-sans)",
        fontSize: 11,
        fontWeight: "var(--weight-extrabold)",
        color: state === "done" ? "var(--on-accent)" : state === "now" ? "var(--accent-text)" : "var(--muted)"
      }
    }, state === "done" ? "✓" : String(i + 1))), !last ? /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        width: 2,
        minHeight: 16,
        background: i < currentIdx ? "var(--accent)" : "var(--line)"
      }
    }) : null), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        paddingLeft: "var(--space-sm)",
        paddingBottom: last ? 0 : "var(--space-md)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: "var(--font-sans)",
        fontSize: "var(--text-body)",
        fontWeight: state === "todo" ? "var(--weight-semibold)" : "var(--weight-bold)",
        color: state === "now" ? "var(--accent-text)" : state === "todo" ? "var(--muted)" : "var(--ink)"
      }
    }, labels[s]), ts && onTrack ? /*#__PURE__*/React.createElement("div", {
      style: {
        marginTop: 1,
        fontFamily: "var(--font-sans)",
        fontSize: 11,
        color: "var(--muted)"
      }
    }, fmtTime(ts), state === "now" ? " · live" : "") : null));
  }));
}
Object.assign(__ds_scope, { Stepper });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/journey/Stepper.jsx", error: String((e && e.message) || e) }); }

// components/typography/Heading.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Screen heading — 24px/700 ink (Inter bold). The one H1 per Lynia screen ("Send a parcel", "Your job"). */
function Heading({
  children,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("h1", _extends({
    className: "lynia-heading",
    style: {
      margin: 0,
      marginBottom: "var(--space-sm)",
      fontFamily: "var(--font-sans)",
      fontSize: "var(--text-h1)",
      fontWeight: "var(--weight-bold)",
      letterSpacing: "-0.02em",
      lineHeight: "var(--leading-tight)",
      color: "var(--ink)",
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Heading });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/typography/Heading.jsx", error: String((e && e.message) || e) }); }

// components/typography/Label.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Field/section label — 12px/600 muted uppercase-free caption. Used above inputs and small groups. */
function Label({
  children,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("span", _extends({
    className: "lynia-label",
    style: {
      display: "block",
      marginBottom: 4,
      fontFamily: "var(--font-sans)",
      fontSize: "var(--text-label)",
      fontWeight: "var(--weight-semibold)",
      color: "var(--muted)",
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Label });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/typography/Label.jsx", error: String((e && e.message) || e) }); }

// components/typography/Sub.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Sub-heading / lede — 14px muted, sits under a Heading to explain the screen in one calm sentence. */
function Sub({
  children,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("p", _extends({
    className: "lynia-sub",
    style: {
      margin: 0,
      marginBottom: "var(--space-lg)",
      fontFamily: "var(--font-sans)",
      fontSize: "var(--text-body)",
      fontWeight: "var(--weight-regular)",
      lineHeight: "var(--leading-body)",
      color: "var(--muted)",
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Sub });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/typography/Sub.jsx", error: String((e && e.message) || e) }); }

// ui_kits/mobile/app.js
try { (() => {
/* Lynia mobile app — interactive screen flow. Customer journey (login → OTP → send → auction →
   track → rate) with a role toggle into the rider side (online → board → offer → job). Fake data;
   recreation of the real Expo screens. */

const K = window.LyniaKit;
const D = window.LyniaDesignSystem_94c56a;
const {
  Button,
  Card,
  Field,
  StatusPill,
  Stepper,
  EmptyState,
  Heading,
  Sub,
  Label,
  SkeletonList,
  Icon,
  OfflineBanner
} = D;
const RIDERS = [{
  id: "r1",
  name: "Tendai M.",
  rating: "4.8",
  trips: 132,
  eta: 6,
  fare: "2.50"
}, {
  id: "r2",
  name: "Kudzai N.",
  rating: "4.9",
  trips: 88,
  eta: 9,
  fare: "2.20"
}, {
  id: "r3",
  name: "Farai R.",
  rating: "new",
  trips: 3,
  eta: 5,
  fare: "3.00"
}];
const STEP_FLOW = ["assigned", "confirmed", "en_route_pickup", "picked_up", "en_route_dropoff", "delivered", "completed"];
const TRIPS = [{
  id: "t1",
  from: "Eastgate",
  to: "Avenues",
  date: "2 Jul",
  role: "Sent",
  fare: "3.36",
  status: "completed",
  rating: 5
}, {
  id: "t2",
  from: "Avondale",
  to: "CBD",
  date: "1 Jul",
  role: "Delivered",
  fare: "2.50",
  status: "completed",
  rating: 5
}, {
  id: "t3",
  from: "Borrowdale",
  to: "Msasa",
  date: "30 Jun",
  role: "Delivered",
  fare: "4.00",
  status: "completed",
  rating: 4
}, {
  id: "t4",
  from: "CBD",
  to: "Belvedere",
  date: "29 Jun",
  role: "Sent",
  fare: "1.50",
  status: "expired",
  rating: 0
}];
const now = () => new Date().toISOString();
function App() {
  const [role, setRole] = React.useState("customer");
  const [small, setSmall] = React.useState(false); // 320px entry-phone preview
  const [ridersOnline, setRidersOnline] = React.useState(true); // demo supply switch (D3)
  const [net, setNet] = React.useState("online"); // demo connectivity for OfflineBanner (E3)
  const [deliveryCode, setDeliveryCode] = React.useState("418207"); // shared code (E5)
  const [notifyArmed, setNotifyArmed] = React.useState(false); // D3 "notify me"
  // customer
  const [view, setView] = React.useState("splash");
  const [phone, setPhone] = React.useState("");
  const [code, setCode] = React.useState("");
  const [items, setItems] = React.useState([{
    desc: "",
    qty: 1
  }]);
  const updateItem = (i, patch) => setItems(arr => arr.map((it, j) => j === i ? {
    ...it,
    ...patch
  } : it));
  const addItem = () => setItems(arr => arr.length >= 8 ? arr : [...arr, {
    desc: "",
    qty: 1
  }]);
  const removeItem = i => setItems(arr => arr.length <= 1 ? arr : arr.filter((_, j) => j !== i));
  const filledItems = items.filter(it => it.desc.trim().length > 0);
  const [note, setNote] = React.useState("");
  const [fare, setFare] = React.useState("");
  const [pickup, setPickup] = React.useState("");
  const [drop, setDrop] = React.useState("");
  const [rcptPhone, setRcptPhone] = React.useState("");
  const [senderPhone, setSenderPhone] = React.useState("");
  const [declared, setDeclared] = React.useState("");
  // DT5 map-anchored home: full-bleed map + pin target + bottom sheet snap state
  const [pickupPt, setPickupPt] = React.useState(null);
  const [dropPt, setDropPt] = React.useState(null);
  const [target, setTarget] = React.useState("pickup");
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [offers, setOffers] = React.useState([]);
  const [sort, setSort] = React.useState("best");
  const [order, setOrder] = React.useState(null); // {status, events, rider, fare}
  const [score, setScore] = React.useState(0);
  const [cancelOpen, setCancelOpen] = React.useState(false);
  const [cancelReason, setCancelReason] = React.useState("");
  const timers = React.useRef([]);
  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  React.useEffect(() => clearTimers, []);

  /* Fake reverse geocode — a landmark per map quadrant (the real app reverse-geocodes). */
  function geocode(pt) {
    if (pt.x < 50 && pt.y < 50) return "Eastgate Mall, CBD";
    if (pt.x >= 50 && pt.y < 50) return "Avondale Shops";
    if (pt.x < 50 && pt.y >= 50) return "Mbare Musika";
    return "14 Glenara Ave, Avenues";
  }
  /* Tap-to-pin (DT5): place the active pin, auto-fill its landmark, auto-advance pickup → drop. */
  function placePin(pt) {
    if (target === "pickup") {
      setPickupPt(pt);
      setPickup(geocode(pt));
      if (dropPt == null) setTarget("drop");
    } else {
      setDropPt(pt);
      setDrop(geocode(pt));
    }
  }
  function useMyLocation() {
    const pt = {
      x: 24,
      y: 30
    };
    setPickupPt(pt);
    setPickup("Your location · CBD");
    if (dropPt == null) setTarget("drop");
  }

  /* ── Customer: broadcast → stream offers ── */
  const OFFER_WINDOW_MS = 90_000; // contract: contracts.ts OFFER_WINDOW_MS
  const URGENT_MS = 20_000; // last-20s amber urgency (order/[id].tsx)
  const [selectNotice, setSelectNotice] = React.useState(null); // E4 rolled-back select
  const [auctionEnd, setAuctionEnd] = React.useState(null);
  const [remainingMs, setRemainingMs] = React.useState(null);
  function broadcast() {
    setSelectNotice(null);
    // D3: no supply → the no-riders-online state, not a dead auction. Price won't help here.
    if (!ridersOnline) {
      setNotifyArmed(false);
      setView("noriders");
      return;
    }
    setOffers([]);
    setOrder({
      status: "open_for_offers",
      events: [],
      rider: null,
      fare
    });
    setView("auction");
    const end = Date.now() + OFFER_WINDOW_MS;
    setAuctionEnd(end);
    setRemainingMs(OFFER_WINDOW_MS);
    clearTimers();
    [[900, RIDERS[0]], [2100, RIDERS[1]], [3400, RIDERS[2]]].forEach(([ms, r]) => {
      timers.current.push(setTimeout(() => setOffers(prev => [...prev, r]), ms));
    });
  }
  // Tick the auction clock down from the 90s window while it's live (open, not yet chosen/expired).
  React.useEffect(() => {
    if (view !== "auction" || auctionEnd == null) return;
    const tick = () => setRemainingMs(Math.max(0, auctionEnd - Date.now()));
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [view, auctionEnd]);
  function chooseRider(r) {
    // E4: a race — the recommended rider (r1) may have just been taken by another customer.
    // Roll back with a MUTED notice (not error-red) and drop them from the list; the retry succeeds.
    if (r.id === "r1" && selectNotice == null) {
      setSelectNotice("That rider was just taken — choose another.");
      setOffers(prev => prev.filter(o => o.id !== "r1"));
      return;
    }
    clearTimers();
    setSelectNotice(null);
    setDeliveryCode(String(Math.floor(100000 + Math.random() * 900000)));
    const events = [{
      status: "assigned",
      createdAt: now()
    }];
    setOrder({
      status: "assigned",
      events,
      rider: r,
      fare: r.fare
    });
    setScore(0);
    setView("tracking");
  }
  function advanceCustomer() {
    setOrder(o => {
      const idx = STEP_FLOW.indexOf(o.status);
      if (idx >= STEP_FLOW.length - 2) return o;
      const next = STEP_FLOW[idx + 1];
      return {
        ...o,
        status: next,
        events: [...o.events, {
          status: next,
          createdAt: now()
        }]
      };
    });
  }
  function submitRating(n) {
    setScore(n);
    timers.current.push(setTimeout(() => setOrder(o => ({
      ...o,
      status: "completed",
      events: [...o.events, {
        status: "completed",
        createdAt: now()
      }]
    })), 700));
  }
  const rankedOffers = React.useMemo(() => {
    const arr = [...offers];
    if (sort === "cheapest") arr.sort((a, b) => +a.fare - +b.fare);else if (sort === "fastest") arr.sort((a, b) => a.eta - b.eta);else if (sort === "rated") arr.sort((a, b) => (b.rating === "new" ? -1 : +b.rating) - (a.rating === "new" ? -1 : +a.rating));else {
      // best-match: real blended rank (D4) from the shared model.
      const order = K.rankOffers(arr.map(o => ({
        offeredFare: +o.fare,
        ratingAvg: o.rating === "new" ? 0 : +o.rating,
        ratingCount: o.rating === "new" ? 0 : o.trips,
        etaMinutes: o.eta
      })));
      return order.map(i => arr[i]);
    }
    return arr;
  }, [offers, sort]);

  // Splash → login after a beat (tap skips). Reduce-motion users see it static via CSS.
  React.useEffect(() => {
    if (view !== "splash") return;
    const t = setTimeout(() => setView("login"), 2000);
    return () => clearTimeout(t);
  }, [view]);

  /* ── Rider state ── */
  const [online, setOnline] = React.useState(false);
  const [job, setJob] = React.useState(null);
  const [selected, setSelected] = React.useState(null);
  const [bidIds, setBidIds] = React.useState(() => new Set()); // E6: orders this rider already bid on
  const [boardNotice, setBoardNotice] = React.useState(null); // E6: "offer sent" confirmation
  const [pendingJob, setPendingJob] = React.useState(null); // E6: selected-by-customer active job banner
  const [rFare, setRFare] = React.useState("");
  const [rEta, setREta] = React.useState("");
  const [rCode, setRCode] = React.useState("");
  const [otpAttempts, setOtpAttempts] = React.useState(0);
  const [otpError, setOtpError] = React.useState(null);
  const otpLocked = otpAttempts >= 5;
  // KYC gate: 'none' | 'form' | 'pending' | 'verified' | 'failed'
  const [kyc, setKyc] = React.useState("none");
  const [kFirst, setKFirst] = React.useState("");
  const [kLast, setKLast] = React.useState("");
  const [kId, setKId] = React.useState("");
  const [kBike, setKBike] = React.useState("");
  const [kPhoto, setKPhoto] = React.useState(false);
  const [kTouched, setKTouched] = React.useState(false);
  const idValid = /^\d{8,12}$/.test(kId.trim());
  const idError = kTouched && kId.trim().length > 0 && !idValid ? "Enter the 8\u201312 digits on your ID card." : undefined;
  const kycCanSubmit = kFirst.trim() && kLast.trim() && idValid && kBike.trim().length >= 3 && kPhoto;
  function submitKyc() {
    setKTouched(true);
    if (!(kFirst.trim() && kLast.trim() && idValid && kBike.trim().length >= 3 && kPhoto)) return;
    setKyc("pending");
    timers.current.push(setTimeout(() => setKyc("verified"), 1500));
  }
  const BOARD = [{
    id: "o1",
    from: "Avondale",
    to: "CBD",
    items: [{
      desc: "Small package",
      qty: 1
    }],
    km: "2.4",
    fare: "2.50",
    note: "Ask for Rita at reception; parcel is fragile."
  }, {
    id: "o2",
    from: "Borrowdale",
    to: "Msasa",
    items: [{
      desc: "Documents",
      qty: 3
    }, {
      desc: "USB drive",
      qty: 1
    }],
    km: "6.1",
    fare: "4.00",
    note: ""
  }];
  const itemSummary = its => {
    if (!its || its.length === 0) return "Parcel";
    if (its.length === 1) return `${its[0].qty > 1 ? its[0].qty + " \u00d7 " : ""}${its[0].desc}`;
    const n = its.reduce((s, i) => s + i.qty, 0);
    return `${its.length} kinds \u00b7 ${n} items`;
  };
  function takeJob() {
    // E6 one round per rider: send the offer, hide the order from the board, and wait. The rider
    // does NOT go straight into a job — a job only starts if the customer selects them (simulated
    // here as an active-job banner after a beat).
    const o = selected;
    setBidIds(prev => new Set(prev).add(o.id));
    setBoardNotice("Offer sent — you'll be notified if the customer picks you.");
    setSelected(null);
    setRFare("");
    setREta("");
    timers.current.push(setTimeout(() => {
      setBoardNotice(null);
      setPendingJob({
        status: "assigned",
        events: [{
          status: "assigned",
          createdAt: now()
        }],
        fare: rFare || o.fare,
        order: o
      });
    }, 2600));
  }
  function advanceRider(to) {
    setJob(j => ({
      ...j,
      status: to,
      events: [...j.events, {
        status: to,
        createdAt: now()
      }]
    }));
  }
  function confirmDelivery() {
    if (otpLocked) return;
    // E5: validate against the shared code; wrong → 401-style retry; 5 wrong → 403 lockout.
    if (rCode.trim() !== deliveryCode) {
      const n = otpAttempts + 1;
      setOtpAttempts(n);
      setOtpError(n >= 5 ? "Too many attempts — ask the customer to re-issue the delivery code." : `Wrong code — ${5 - n} ${5 - n === 1 ? "try" : "tries"} left. Ask the recipient to read it again.`);
      setRCode("");
      return;
    }
    setOtpError(null);
    setOtpAttempts(0);
    setJob(j => ({
      ...j,
      status: "delivered",
      events: [...j.events, {
        status: "delivered",
        createdAt: now()
      }]
    }));
    setRCode("");
  }

  /* ── Role switcher (header ghost) ── */
  const RoleSwitch = /*#__PURE__*/React.createElement("button", {
    onClick: () => setRole(role === "customer" ? "rider" : "customer"),
    style: {
      border: "1px solid var(--line)",
      background: "var(--bg)",
      borderRadius: "var(--radius-pill)",
      padding: "6px 12px",
      fontFamily: "var(--font-sans)",
      fontSize: 12,
      fontWeight: 700,
      color: "var(--muted)",
      cursor: "pointer"
    }
  }, role === "customer" ? "Rider →" : "← Customer");

  /* ================= CUSTOMER ================= */
  function renderCustomer() {
    if (view === "splash") return /*#__PURE__*/React.createElement("div", {
      onClick: () => setView("login"),
      style: {
        height: "100%",
        background: "var(--accent)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 18,
        cursor: "pointer"
      }
    }, /*#__PURE__*/React.createElement("svg", {
      width: "112",
      height: "112",
      viewBox: "0 0 96 96",
      "aria-hidden": "true"
    }, /*#__PURE__*/React.createElement("polygon", {
      points: "28,6 58,32 38,42",
      fill: "#fff"
    }), /*#__PURE__*/React.createElement("polygon", {
      points: "90,26 14,52 48,60",
      fill: "#fff"
    }), /*#__PURE__*/React.createElement("polygon", {
      points: "90,26 48,60 42,84",
      fill: "#fff",
      opacity: ".62"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M90 26 L48 60 M70.5 30.2 L81.5 43.8",
      stroke: "var(--accent)",
      strokeWidth: "2.4",
      fill: "none"
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: "var(--font-wordmark)",
        fontWeight: 600,
        fontSize: 32,
        color: "#fff"
      }
    }, "LyniaGo"));
    if (view === "login") return /*#__PURE__*/React.createElement(ScreenPad, null, /*#__PURE__*/React.createElement(Lockup, null), /*#__PURE__*/React.createElement(Heading, null, "Welcome to Lynia"), /*#__PURE__*/React.createElement(Sub, null, "We'll WhatsApp a one-time code to this number."), /*#__PURE__*/React.createElement(Field, {
      label: "Phone number",
      value: phone,
      onChange: setPhone,
      inputMode: "tel",
      placeholder: "+263 77 000 0000"
    }), /*#__PURE__*/React.createElement(Button, {
      label: "Send code",
      onClick: () => setView("otp"),
      disabled: phone.trim().length < 6
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        marginTop: 8
      }
    }, RoleSwitch));
    if (view === "otp") return /*#__PURE__*/React.createElement(ScreenPad, null, /*#__PURE__*/React.createElement(Heading, null, "Check your WhatsApp"), /*#__PURE__*/React.createElement(Sub, null, "We sent a 6-digit code to ", phone || "your phone", " on WhatsApp."), /*#__PURE__*/React.createElement(Field, {
      label: "6-digit code",
      value: code,
      onChange: setCode,
      inputMode: "numeric",
      placeholder: "000000",
      hint: "No WhatsApp on this number? Contact support to sign up."
    }), /*#__PURE__*/React.createElement(Button, {
      label: "Verify",
      onClick: () => setView("home"),
      disabled: code.trim().length !== 6
    }), /*#__PURE__*/React.createElement(Button, {
      label: "Back",
      variant: "ghost",
      onClick: () => setView("login")
    }));
    if (view === "home") {
      // Suggested fare = base $1.50 + $0.60/km (pricing.ts). Demo route ≈ 3.1 km ⇒ $3.36.
      const routeKm = pickupPt && dropPt ? 3.1 : null;
      const suggested = routeKm != null ? 1.5 + 0.6 * routeKm : null;
      const phoneOk = p => p.trim().replace(/[^\d+]/g, "").length >= 6;
      const canSubmit = pickupPt != null && dropPt != null && filledItems.length > 0 && +fare > 0 && phoneOk(senderPhone) && phoneOk(rcptPhone);
      const missing = [pickupPt == null || dropPt == null ? "pickup & drop-off pins" : null, filledItems.length === 0 ? "an item" : null, !(+fare > 0) ? "a price" : null, !phoneOk(senderPhone) || !phoneOk(rcptPhone) ? "both phone numbers" : null].filter(Boolean).join(", ");
      return /*#__PURE__*/React.createElement("div", {
        style: {
          position: "relative",
          height: "100%",
          overflow: "hidden"
        }
      }, /*#__PURE__*/React.createElement(K.FauxMap, {
        fill: true,
        pins: {
          a: pickupPt,
          b: dropPt
        },
        onTap: placePin
      }), /*#__PURE__*/React.createElement("div", {
        style: {
          position: "absolute",
          top: 34,
          left: 12,
          right: 12,
          display: "flex",
          alignItems: "center",
          gap: 8,
          zIndex: 5
        }
      }, /*#__PURE__*/React.createElement("span", {
        style: {
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          background: "var(--bg)",
          borderRadius: "var(--radius-pill)",
          padding: "6px 12px 6px 6px",
          boxShadow: "var(--shadow-card)",
          fontWeight: 700,
          fontSize: 14,
          color: "var(--accent-text)"
        }
      }, /*#__PURE__*/React.createElement(DoveMark, {
        size: 22,
        creases: false
      }), /*#__PURE__*/React.createElement("span", {
        style: {
          fontFamily: "var(--font-wordmark)",
          fontWeight: 600
        }
      }, "Lynia", /*#__PURE__*/React.createElement("span", {
        style: {
          color: "var(--accent-700)"
        }
      }, "Go"))), /*#__PURE__*/React.createElement("div", {
        style: {
          flex: 1
        }
      }), /*#__PURE__*/React.createElement("button", {
        onClick: () => setView("profile"),
        "aria-label": "Account",
        style: {
          width: 40,
          height: 40,
          borderRadius: "50%",
          background: "var(--bg)",
          border: "none",
          boxShadow: "var(--shadow-card)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          flexShrink: 0
        }
      }, /*#__PURE__*/React.createElement(Icon, {
        name: "user",
        size: 18,
        color: "var(--accent-text)"
      })), RoleSwitch), /*#__PURE__*/React.createElement("button", {
        onClick: useMyLocation,
        style: {
          position: "absolute",
          top: 78,
          right: 12,
          zIndex: 5,
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          background: "var(--bg)",
          border: "none",
          borderRadius: "var(--radius-pill)",
          padding: "9px 14px",
          boxShadow: "var(--shadow-card)",
          fontFamily: "var(--font-sans)",
          fontSize: 12,
          fontWeight: 600,
          color: "var(--accent-text)",
          cursor: "pointer",
          minHeight: 36
        }
      }, /*#__PURE__*/React.createElement(Icon, {
        name: "navigation",
        size: 14,
        color: "var(--accent-text)"
      }), " Use my location"), pickupPt == null || dropPt == null ? /*#__PURE__*/React.createElement("div", {
        style: {
          position: "absolute",
          top: 124,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 5,
          background: "var(--ink)",
          color: "#fff",
          borderRadius: "var(--radius-pill)",
          padding: "7px 14px",
          fontSize: 12,
          fontWeight: 600,
          whiteSpace: "nowrap"
        }
      }, "Tap the map to drop your ", target === "pickup" ? "pickup" : "drop-off", " pin") : null, /*#__PURE__*/React.createElement(K.MapSheet, {
        expanded: sheetOpen,
        onToggle: () => setSheetOpen(v => !v),
        footer: /*#__PURE__*/React.createElement("div", null, !canSubmit ? /*#__PURE__*/React.createElement("div", {
          style: {
            fontSize: 12,
            color: "var(--muted)",
            marginBottom: 2
          }
        }, "Add ", missing, " to broadcast.") : null, /*#__PURE__*/React.createElement(Button, {
          label: "Broadcast request",
          onClick: broadcast,
          disabled: !canSubmit
        }))
      }, /*#__PURE__*/React.createElement(K.PinToggle, {
        target: target,
        onChange: setTarget,
        hasPickup: pickupPt != null,
        hasDrop: dropPt != null
      }), /*#__PURE__*/React.createElement("div", {
        style: {
          display: "flex",
          alignItems: "center",
          gap: 6,
          margin: "10px 0 12px",
          fontSize: 13,
          color: "var(--muted)",
          minHeight: 18
        }
      }, pickupPt || dropPt ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("span", {
        style: {
          fontWeight: 600,
          color: pickupPt ? "var(--ink)" : "var(--muted)"
        }
      }, pickupPt ? pickup : "Pickup?"), /*#__PURE__*/React.createElement(Icon, {
        name: "arrow-right",
        size: 14,
        color: "var(--muted)"
      }), /*#__PURE__*/React.createElement("span", {
        style: {
          fontWeight: 600,
          color: dropPt ? "var(--ink)" : "var(--muted)"
        }
      }, dropPt ? drop : "Drop-off?")) : /*#__PURE__*/React.createElement("span", null, "Pick two points on the map \u2014 riders offer on the route.")), /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: "var(--text-label)",
          fontWeight: 600,
          color: "var(--muted)",
          marginBottom: 4
        }
      }, "What are you sending?"), items.map((it, i) => /*#__PURE__*/React.createElement("div", {
        key: i,
        style: {
          border: "1px solid var(--line)",
          borderRadius: "var(--radius-input)",
          padding: "10px 10px 4px",
          marginBottom: 8
        }
      }, /*#__PURE__*/React.createElement(Field, {
        value: it.desc,
        onChange: d => updateItem(i, {
          desc: d
        }),
        placeholder: i === 0 ? "Documents envelope" : "Another item",
        maxLength: 280,
        style: {
          marginBottom: 8
        }
      }), /*#__PURE__*/React.createElement("div", {
        style: {
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 8
        }
      }, /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: "var(--text-label)",
          fontWeight: 600,
          color: "var(--muted)"
        }
      }, "Qty"), /*#__PURE__*/React.createElement(QtyStepper, {
        value: it.qty,
        onChange: q => updateItem(i, {
          qty: q
        })
      }), /*#__PURE__*/React.createElement("div", {
        style: {
          flex: 1
        }
      }), items.length > 1 ? /*#__PURE__*/React.createElement("button", {
        onClick: () => removeItem(i),
        "aria-label": "Remove item " + (i + 1),
        style: {
          background: "none",
          border: "none",
          padding: "6px 8px",
          minHeight: 36,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 4,
          color: "var(--muted)",
          fontFamily: "var(--font-sans)",
          fontSize: 13,
          fontWeight: 600
        }
      }, /*#__PURE__*/React.createElement(Icon, {
        name: "x",
        size: 14,
        color: "var(--muted)"
      }), " Remove") : null))), items.length < 8 ? /*#__PURE__*/React.createElement("button", {
        onClick: addItem,
        style: {
          ...collapseBtn,
          justifyContent: "flex-start",
          gap: 6,
          minHeight: 40,
          marginBottom: 8,
          color: "var(--accent-text)"
        }
      }, /*#__PURE__*/React.createElement(Icon, {
        name: "package",
        size: 16,
        color: "var(--accent-text)"
      }), /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 13,
          fontWeight: 600,
          color: "var(--accent-text)"
        }
      }, "Add another item")) : null, /*#__PURE__*/React.createElement(Field, {
        label: "Note for the rider (optional)",
        value: note,
        onChange: setNote,
        multiline: true,
        rows: 3,
        maxLength: 280,
        placeholder: "Ask for Rita at the pharmacy counter; parcel is fragile, keep it upright.",
        hint: "Pickup or handling instructions \u2014 the rider confirms these before collecting."
      }), /*#__PURE__*/React.createElement(Field, {
        label: "Your price (USD)",
        value: fare,
        onChange: setFare,
        inputMode: "decimal",
        hint: suggested != null ? `Suggested $${suggested.toFixed(2)} · ${routeKm} km · riders here usually accept around $${(suggested - 0.4).toFixed(2)}.` : "We'll suggest a fair price once your pins are set."
      }), /*#__PURE__*/React.createElement(Field, {
        label: "Your phone (sender)",
        value: senderPhone,
        onChange: setSenderPhone,
        inputMode: "tel",
        placeholder: "+263 77 000 0000",
        hint: "Shared with your rider only during the delivery."
      }), /*#__PURE__*/React.createElement(Field, {
        label: "Recipient phone",
        value: rcptPhone,
        onChange: setRcptPhone,
        inputMode: "tel",
        placeholder: "+263 77 000 0000",
        hint: "So the rider can reach them at drop-off."
      }), sheetOpen ? /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Field, {
        label: "Pickup landmark",
        value: pickup,
        onChange: setPickup,
        fromMap: pickupPt != null
      }), /*#__PURE__*/React.createElement(Field, {
        label: "Drop-off landmark",
        value: drop,
        onChange: setDrop,
        fromMap: dropPt != null
      }), /*#__PURE__*/React.createElement(Field, {
        label: "Declared value (USD, max 150)",
        value: declared,
        onChange: setDeclared,
        inputMode: "decimal",
        placeholder: "10"
      })) : /*#__PURE__*/React.createElement("button", {
        onClick: () => setSheetOpen(true),
        style: collapseBtn
      }, /*#__PURE__*/React.createElement("span", {
        style: {
          flex: 1,
          fontSize: 13,
          fontWeight: 600,
          color: "var(--accent-text)"
        }
      }, "Add landmarks & declared value (optional)"), /*#__PURE__*/React.createElement(Icon, {
        name: "chevron-up",
        size: 16,
        color: "var(--accent-text)"
      }))));
    }
    if (view === "auction") {
      const expired = remainingMs != null && remainingMs <= 0;
      const urgent = remainingMs != null && remainingMs > 0 && remainingMs <= URGENT_MS;
      const mm = Math.floor((remainingMs ?? 0) / 60000);
      const ss = Math.floor((remainingMs ?? 0) % 60000 / 1000);
      const clock = `${mm}:${String(ss).padStart(2, "0")}`;
      if (expired) {
        return /*#__PURE__*/React.createElement(ScreenPad, null, /*#__PURE__*/React.createElement(TopRow, null, /*#__PURE__*/React.createElement(Heading, {
          style: {
            marginBottom: 0
          }
        }, "Order 8f3a91c2"), /*#__PURE__*/React.createElement("div", {
          style: {
            flex: 1
          }
        }), /*#__PURE__*/React.createElement(StatusPill, {
          status: "expired",
          tone: "offline"
        })), /*#__PURE__*/React.createElement(EmptyState, {
          icon: "bike",
          title: "No riders took this price yet",
          message: "Your 90-second window closed with no offer. Nudging the price up usually gets a rider fast."
        }, /*#__PURE__*/React.createElement(Button, {
          label: "Nudge price & re-broadcast",
          onClick: () => {
            setFare(f => +f > 0 ? (+f + 0.5).toFixed(2) : f);
            broadcast();
          }
        }), /*#__PURE__*/React.createElement(Button, {
          label: "Edit order",
          variant: "ghost",
          onClick: () => {
            clearTimers();
            setView("home");
          }
        })));
      }
      return /*#__PURE__*/React.createElement(ScreenPad, null, /*#__PURE__*/React.createElement(TopRow, null, /*#__PURE__*/React.createElement(Heading, {
        style: {
          marginBottom: 0
        }
      }, "Order 8f3a91c2"), /*#__PURE__*/React.createElement("div", {
        style: {
          flex: 1
        }
      }), /*#__PURE__*/React.createElement(StatusPill, {
        status: order.status
      })), /*#__PURE__*/React.createElement("div", {
        style: {
          display: "flex",
          alignItems: "baseline",
          marginBottom: 6
        }
      }, /*#__PURE__*/React.createElement("span", {
        style: {
          flex: 1,
          fontSize: 14,
          color: "var(--muted)"
        }
      }, offers.length > 0 ? `${offers.length} ${offers.length === 1 ? "rider" : "riders"} bidding` : "Finding riders near you…"), /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 14,
          fontWeight: urgent ? 700 : 400,
          color: urgent ? "var(--danger)" : "var(--muted)"
        },
        className: "lynia-tabular",
        "aria-label": `Offer window: ${mm ? mm + " minute " : ""}${ss} seconds left`
      }, clock)), urgent ? /*#__PURE__*/React.createElement(Button, {
        label: "Nudge price & re-broadcast",
        variant: "ghost",
        onClick: () => {
          setFare(f => +f > 0 ? (+f + 0.5).toFixed(2) : f);
          broadcast();
        }
      }) : null, /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 12,
          color: "var(--muted)",
          marginBottom: 14
        }
      }, "Asking $", fare, " \xB7 riders here usually accept around $2.40."), offers.length > 1 ? /*#__PURE__*/React.createElement(K.SortChips, {
        value: sort,
        onChange: setSort
      }) : null, rankedOffers.map((o, i) => /*#__PURE__*/React.createElement(K.OfferCard, {
        key: o.id,
        o: o,
        recommended: sort === "best" && i === 0 && rankedOffers.length >= 2,
        onChoose: () => chooseRider(o)
      })), selectNotice ? /*#__PURE__*/React.createElement("div", {
        role: "status",
        style: {
          fontSize: 13,
          color: "var(--muted)",
          marginTop: 4,
          marginBottom: 4
        }
      }, selectNotice) : null, offers.length === 0 ? /*#__PURE__*/React.createElement("div", {
        style: {
          marginTop: 8
        }
      }, /*#__PURE__*/React.createElement(SkeletonList, {
        count: 1
      }), /*#__PURE__*/React.createElement(Sub, null, "No offers yet \u2014 riders nearby have been pinged. Hang tight.")) : null, /*#__PURE__*/React.createElement(Button, {
        label: "Cancel order",
        variant: "ghost",
        onClick: () => {
          clearTimers();
          setView("home");
        }
      }));
    }
    if (view === "noriders") {
      return /*#__PURE__*/React.createElement(ScreenPad, null, /*#__PURE__*/React.createElement(TopRow, null, /*#__PURE__*/React.createElement(Heading, {
        style: {
          marginBottom: 0
        }
      }, "Send a parcel"), /*#__PURE__*/React.createElement("div", {
        style: {
          flex: 1
        }
      })), /*#__PURE__*/React.createElement(EmptyState, {
        icon: "inbox",
        title: "No riders online right now",
        message: "There are no riders in the CBD corridor at the moment \u2014 a higher price won't help until one comes online. Most riders are on 7\u20139am & 5\u20137pm."
      }, notifyArmed ? /*#__PURE__*/React.createElement("div", {
        role: "status",
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          padding: "12px",
          color: "var(--accent-text)",
          fontWeight: 600,
          fontSize: 14
        }
      }, /*#__PURE__*/React.createElement(Icon, {
        name: "check",
        size: 16,
        color: "var(--accent-text)"
      }), " We'll notify you when a rider's available.") : /*#__PURE__*/React.createElement(Button, {
        label: "Notify me when one's available",
        onClick: () => setNotifyArmed(true)
      }), /*#__PURE__*/React.createElement(Button, {
        label: "Back",
        variant: "ghost",
        onClick: () => setView("home")
      })));
    }
    if (view === "profile") {
      return /*#__PURE__*/React.createElement(ScreenPad, null, /*#__PURE__*/React.createElement(TopRow, null, /*#__PURE__*/React.createElement(Heading, {
        style: {
          marginBottom: 0
        }
      }, "Account"), /*#__PURE__*/React.createElement("div", {
        style: {
          flex: 1
        }
      })), /*#__PURE__*/React.createElement(Sub, null, "Your details and session."), /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 18,
          fontWeight: 700,
          color: "var(--ink)"
        }
      }, "Chipo M."), /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 13,
          color: "var(--muted)",
          marginTop: 2
        },
        className: "lynia-tabular"
      }, phone || "+263 77 000 0000"), /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 13,
          color: "var(--muted)",
          marginTop: 2
        }
      }, "Customer"), /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 12,
          color: "var(--muted)",
          marginTop: 8
        }
      }, "Editing your details is coming soon.")), /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement(Button, {
        label: "Trip history",
        onClick: () => setView("history")
      }), /*#__PURE__*/React.createElement(Button, {
        label: "Earnings",
        variant: "ghost",
        onClick: () => setView("earnings")
      }), /*#__PURE__*/React.createElement(Button, {
        label: "Send a parcel",
        variant: "ghost",
        onClick: () => setView("home")
      })), /*#__PURE__*/React.createElement(Button, {
        label: "Sign out",
        variant: "ghost",
        onClick: () => {
          setView("login");
          setPhone("");
          setCode("");
        }
      }), /*#__PURE__*/React.createElement(Button, {
        label: "Back",
        variant: "ghost",
        onClick: () => setView("home")
      }));
    }
    if (view === "history") {
      return /*#__PURE__*/React.createElement(ScreenPad, null, /*#__PURE__*/React.createElement(TopRow, null, /*#__PURE__*/React.createElement(Heading, {
        style: {
          marginBottom: 0
        }
      }, "Your trips"), /*#__PURE__*/React.createElement("div", {
        style: {
          flex: 1
        }
      })), /*#__PURE__*/React.createElement(Sub, null, "Every parcel you've sent or delivered."), TRIPS.map(t => /*#__PURE__*/React.createElement(Card, {
        key: t.id
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          display: "flex",
          alignItems: "center"
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          flex: 1,
          paddingRight: "var(--space-sm)",
          minWidth: 0
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 14,
          fontWeight: 600,
          color: "var(--ink)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis"
        }
      }, t.from, " \u2192 ", t.to), /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 12,
          color: "var(--muted)",
          marginTop: 2
        },
        className: "lynia-tabular"
      }, t.date, " \xB7 ", t.role, t.rating ? ` · ★ ${t.rating}` : "")), /*#__PURE__*/React.createElement("div", {
        style: {
          textAlign: "right",
          flexShrink: 0
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 15,
          fontWeight: 700,
          color: "var(--ink)"
        },
        className: "lynia-tabular"
      }, "$", t.fare), /*#__PURE__*/React.createElement("div", {
        style: {
          height: 4
        }
      }), /*#__PURE__*/React.createElement(StatusPill, {
        status: t.status,
        tone: t.status === "expired" || t.status === "cancelled" ? "offline" : "neutral"
      }))))), /*#__PURE__*/React.createElement(Button, {
        label: "Back",
        variant: "ghost",
        onClick: () => setView("profile")
      }));
    }
    if (view === "earnings") {
      const done = TRIPS.filter(t => t.role === "Delivered" && t.status === "completed");
      const total = done.reduce((s, t) => s + +t.fare, 0);
      return /*#__PURE__*/React.createElement(ScreenPad, null, /*#__PURE__*/React.createElement(TopRow, null, /*#__PURE__*/React.createElement(Heading, {
        style: {
          marginBottom: 0
        }
      }, "Earnings"), /*#__PURE__*/React.createElement("div", {
        style: {
          flex: 1
        }
      })), /*#__PURE__*/React.createElement(Sub, null, "What you've agreed and delivered."), /*#__PURE__*/React.createElement(Card, {
        style: {
          background: "var(--accent)",
          border: "1px solid transparent",
          boxShadow: "var(--shadow-card)"
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          color: "var(--on-accent)",
          fontSize: 12,
          fontWeight: 600,
          opacity: 0.9
        }
      }, "Agreed & delivered \xB7 total"), /*#__PURE__*/React.createElement("div", {
        style: {
          color: "var(--on-accent)",
          fontSize: 28,
          fontWeight: 700,
          marginTop: 2
        },
        className: "lynia-tabular"
      }, "$", total.toFixed(2)), /*#__PURE__*/React.createElement("div", {
        style: {
          color: "var(--on-accent)",
          fontSize: 12,
          opacity: 0.9,
          marginTop: 2
        }
      }, done.length, " completed ", done.length === 1 ? "trip" : "trips")), done.map(t => /*#__PURE__*/React.createElement(Card, {
        key: t.id
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          display: "flex",
          alignItems: "center"
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          flex: 1,
          paddingRight: "var(--space-sm)",
          minWidth: 0
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 14,
          fontWeight: 600,
          color: "var(--ink)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis"
        }
      }, t.from, " \u2192 ", t.to), /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 12,
          color: "var(--muted)",
          marginTop: 2
        }
      }, t.date)), /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 15,
          fontWeight: 700,
          color: "var(--ink)"
        },
        className: "lynia-tabular"
      }, "$", t.fare)))), /*#__PURE__*/React.createElement(Card, {
        style: {
          background: "var(--highlight-wash)",
          border: "1px solid var(--highlight-border)",
          boxShadow: "none"
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 12,
          color: "var(--highlight-ink)",
          lineHeight: 1.5
        }
      }, "A record of work done \u2014 not a payout balance. You keep the full agreed fare during the launch period (no commission for the first few months); payment is cash, outside the app.")), /*#__PURE__*/React.createElement(Button, {
        label: "Back",
        variant: "ghost",
        onClick: () => setView("profile")
      }));
    }
    if (view === "tracking") {
      const s = order.status;
      const activeMap = ["assigned", "confirmed", "en_route_pickup", "picked_up", "en_route_dropoff", "delivered"].includes(s);
      const riderPos = Math.min(1, STEP_FLOW.indexOf(s) / 5);
      const cancellable = ["assigned", "confirmed", "en_route_pickup"].includes(s);
      if (s === "cancelled") {
        return /*#__PURE__*/React.createElement(ScreenPad, null, /*#__PURE__*/React.createElement(TopRow, null, /*#__PURE__*/React.createElement(Heading, {
          style: {
            marginBottom: 0
          }
        }, "Order 8f3a91c2"), /*#__PURE__*/React.createElement("div", {
          style: {
            flex: 1
          }
        }), /*#__PURE__*/React.createElement(StatusPill, {
          status: "cancelled",
          tone: "offline"
        })), /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement("div", {
          style: {
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 6
          }
        }, /*#__PURE__*/React.createElement(Icon, {
          name: "circle-alert",
          size: 18,
          color: "var(--danger)"
        }), /*#__PURE__*/React.createElement("div", {
          style: {
            fontSize: 16,
            fontWeight: 700,
            color: "var(--danger)"
          }
        }, "This order was cancelled.")), order.cancelReason ? /*#__PURE__*/React.createElement("div", {
          style: {
            fontSize: 13,
            color: "var(--muted)"
          }
        }, "Reason: ", order.cancelReason) : null), /*#__PURE__*/React.createElement(Button, {
          label: "Send a new request",
          onClick: () => {
            setOrder(null);
            setView("home");
          }
        }));
      }
      return /*#__PURE__*/React.createElement(ScreenPad, null, /*#__PURE__*/React.createElement(TopRow, null, /*#__PURE__*/React.createElement(Heading, {
        style: {
          marginBottom: 0
        }
      }, "Order 8f3a91c2"), /*#__PURE__*/React.createElement("div", {
        style: {
          flex: 1
        }
      }), /*#__PURE__*/React.createElement(StatusPill, {
        status: s
      })), /*#__PURE__*/React.createElement(Card, {
        accent: true
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 13,
          color: "var(--muted)"
        },
        className: "lynia-tabular"
      }, "Give this code to the recipient \u2014 the rider enters it at hand-off:"), /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 28,
          fontWeight: 700,
          letterSpacing: 6,
          color: "var(--accent-text)"
        },
        className: "lynia-tabular"
      }, deliveryCode.slice(0, 3), " ", deliveryCode.slice(3)), /*#__PURE__*/React.createElement(Button, {
        label: "Re-issue delivery code",
        variant: "ghost",
        onClick: () => {
          setDeliveryCode(String(Math.floor(100000 + Math.random() * 900000)));
          setOtpAttempts(0);
          setOtpError(null);
        }
      })), /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 13,
          color: "var(--muted)",
          marginBottom: 8
        },
        className: "lynia-tabular"
      }, "Agreed fare $", order.fare, " \xB7 ", order.rider.name), activeMap ? /*#__PURE__*/React.createElement("div", {
        style: {
          marginBottom: 10
        }
      }, /*#__PURE__*/React.createElement(CallRow, {
        label: "Your rider",
        name: order.rider.name,
        phone: "+263 78 202 1180"
      })) : null, activeMap ? /*#__PURE__*/React.createElement(K.FauxMap, {
        rider: true,
        riderPos: riderPos,
        paused: net === "reconnecting",
        pins: pickupPt && dropPt ? {
          a: pickupPt,
          b: dropPt
        } : undefined
      }) : null, /*#__PURE__*/React.createElement("div", {
        style: {
          height: 12
        }
      }), /*#__PURE__*/React.createElement(Stepper, {
        events: order.events,
        currentStatus: s,
        view: "customer"
      })), s === "delivered" ? /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement("div", {
        style: {
          fontWeight: 700,
          marginBottom: 8
        }
      }, "Rate your rider"), /*#__PURE__*/React.createElement("div", {
        style: {
          display: "flex",
          gap: 4
        }
      }, [1, 2, 3, 4, 5].map(n => /*#__PURE__*/React.createElement("button", {
        key: n,
        onClick: () => submitRating(n),
        style: {
          background: "none",
          border: "none",
          cursor: "pointer",
          fontSize: 30,
          color: n <= score ? "var(--highlight)" : "var(--line)",
          padding: 2
        }
      }, "\u2605")))) : s === "completed" ? /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 16,
          fontWeight: 700,
          color: "var(--accent-text)"
        }
      }, "Delivered & completed. Thank you!")) : /*#__PURE__*/React.createElement(Button, {
        label: "\u25B6 Simulate next step",
        onClick: advanceCustomer
      }), /*#__PURE__*/React.createElement(Button, {
        label: "Back home",
        variant: "ghost",
        onClick: () => {
          setOrder(null);
          setView("home");
        }
      }), cancellable ? cancelOpen ? /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement("div", {
        style: {
          fontWeight: 700,
          marginBottom: 6
        }
      }, "Cancel this order?"), /*#__PURE__*/React.createElement(Field, {
        label: "Reason (optional)",
        value: cancelReason,
        onChange: setCancelReason,
        placeholder: "Changed my mind / sent another way",
        maxLength: 280
      }), /*#__PURE__*/React.createElement(Button, {
        label: "Confirm cancellation",
        onClick: () => {
          setOrder(o => ({
            ...o,
            status: "cancelled",
            cancelReason: cancelReason.trim()
          }));
          setCancelOpen(false);
        }
      }), /*#__PURE__*/React.createElement(Button, {
        label: "Keep order",
        variant: "ghost",
        onClick: () => setCancelOpen(false)
      })) : /*#__PURE__*/React.createElement(Button, {
        label: "Cancel order",
        variant: "ghost",
        onClick: () => setCancelOpen(true)
      }) : null);
    }
  }

  /* ================= RIDER ================= */
  function renderRider() {
    if (job) {
      const NEXT = {
        assigned: ["confirmed", "Confirm the job"],
        confirmed: ["en_route_pickup", "Head to pickup"],
        en_route_pickup: ["picked_up", "Mark parcel collected"],
        picked_up: ["en_route_dropoff", "Head to drop-off"]
      };
      const nx = NEXT[job.status];
      const riderPos = Math.min(1, STEP_FLOW.indexOf(job.status) / 5);
      return /*#__PURE__*/React.createElement(ScreenPad, null, /*#__PURE__*/React.createElement(TopRow, null, /*#__PURE__*/React.createElement(Heading, {
        style: {
          marginBottom: 0
        }
      }, "Your job"), /*#__PURE__*/React.createElement("div", {
        style: {
          flex: 1
        }
      }), /*#__PURE__*/React.createElement(StatusPill, {
        status: job.status
      })), /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 13,
          color: "var(--muted)",
          marginBottom: 8
        },
        className: "lynia-tabular"
      }, "Agreed fare $", job.fare), /*#__PURE__*/React.createElement("div", {
        style: {
          display: "flex",
          flexDirection: "column",
          gap: 6,
          marginBottom: 10
        }
      }, /*#__PURE__*/React.createElement(CallRow, {
        label: "Sender",
        name: pickup || "Pickup contact",
        phone: senderPhone || "+263 77 123 4567"
      }), /*#__PURE__*/React.createElement(CallRow, {
        label: "Recipient",
        name: drop || "Drop-off contact",
        phone: rcptPhone || "+263 71 555 0090"
      })), /*#__PURE__*/React.createElement("div", {
        style: {
          padding: "10px 12px",
          background: "var(--surface)",
          borderRadius: "var(--radius-input)",
          marginBottom: 10
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 11,
          fontWeight: 600,
          color: "var(--muted)",
          marginBottom: 2
        }
      }, "Items"), (job.order && job.order.items ? job.order.items : [{
        desc: "Parcel",
        qty: 1
      }]).map((it, i) => /*#__PURE__*/React.createElement("div", {
        key: i,
        style: {
          fontSize: 14,
          fontWeight: 600,
          color: "var(--ink)",
          display: "flex",
          gap: 8
        }
      }, /*#__PURE__*/React.createElement("span", {
        style: {
          color: "var(--muted)",
          fontWeight: 700,
          minWidth: 22
        },
        className: "lynia-tabular"
      }, it.qty, "\xD7"), /*#__PURE__*/React.createElement("span", null, it.desc))), job.order && job.order.note ? /*#__PURE__*/React.createElement("div", {
        style: {
          marginTop: 6
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 11,
          fontWeight: 600,
          color: "var(--muted)"
        }
      }, "Sender's note"), /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 13,
          color: "var(--ink)",
          lineHeight: "var(--leading-body)"
        }
      }, job.order.note)) : null), /*#__PURE__*/React.createElement(K.FauxMap, {
        rider: true,
        riderPos: riderPos,
        paused: net === "reconnecting",
        pins: pickupPt && dropPt ? {
          a: pickupPt,
          b: dropPt
        } : undefined
      }), /*#__PURE__*/React.createElement("div", {
        style: {
          height: 12
        }
      }), /*#__PURE__*/React.createElement(Stepper, {
        events: job.events,
        currentStatus: job.status,
        view: "rider"
      })), nx ? /*#__PURE__*/React.createElement(Button, {
        label: nx[1],
        onClick: () => advanceRider(nx[0])
      }) : null, job.status === "en_route_dropoff" ? /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement("div", {
        style: {
          fontWeight: 700,
          marginBottom: 8
        }
      }, "Confirm hand-off"), /*#__PURE__*/React.createElement(Sub, null, "Ask the recipient for the 6-digit delivery code."), /*#__PURE__*/React.createElement(Field, {
        label: "Delivery code",
        value: rCode,
        onChange: v => {
          setRCode(v);
          if (otpError && !otpLocked) setOtpError(null);
        },
        inputMode: "numeric",
        placeholder: "000000",
        maxLength: 6,
        error: otpError,
        disabled: otpLocked
      }), otpLocked ? /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 12,
          color: "var(--muted)",
          marginBottom: 4
        }
      }, "Locked after 5 attempts. The customer can re-issue a fresh code from their order screen.") : null, /*#__PURE__*/React.createElement(Button, {
        label: "Confirm delivery",
        onClick: confirmDelivery,
        disabled: rCode.trim().length !== 6 || otpLocked
      })) : null, job.status === "delivered" ? /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement("div", {
        style: {
          fontWeight: 700,
          color: "var(--accent-text)"
        }
      }, "Delivered. You're free for the next job.")) : null, /*#__PURE__*/React.createElement(Button, {
        label: "Back to board",
        variant: "ghost",
        onClick: () => setJob(null)
      }));
    }
    // ── KYC gate + become flow (rider self-onboarding, review §4/§5) ──
    if (kyc !== "verified") {
      if (kyc === "form") {
        return /*#__PURE__*/React.createElement(ScreenPad, null, /*#__PURE__*/React.createElement(TopRow, null, /*#__PURE__*/React.createElement(Heading, {
          style: {
            marginBottom: 0
          }
        }, "Become a rider"), /*#__PURE__*/React.createElement("div", {
          style: {
            flex: 1
          }
        })), /*#__PURE__*/React.createElement(Sub, null, "Verify your ID and register your bike to start accepting deliveries."), /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement(Field, {
          label: "First name",
          value: kFirst,
          onChange: setKFirst,
          placeholder: "Tendai"
        }), /*#__PURE__*/React.createElement(Field, {
          label: "Last name",
          value: kLast,
          onChange: setKLast,
          placeholder: "Moyo"
        }), /*#__PURE__*/React.createElement(Field, {
          label: "National ID number",
          value: kId,
          onChange: setKId,
          inputMode: "numeric",
          placeholder: "631234567",
          error: idError,
          hint: idError ? undefined : "The 8–12 digits on your national ID card."
        })), /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement(Field, {
          label: "Bike registration",
          value: kBike,
          onChange: setKBike,
          placeholder: "ABZ 1234"
        }), /*#__PURE__*/React.createElement(Label, null, "Your photo"), /*#__PURE__*/React.createElement("button", {
          onClick: () => setKPhoto(true),
          style: {
            ...collapseBtn,
            justifyContent: "center",
            gap: 8,
            minHeight: 52,
            border: "1px solid var(--line)",
            borderRadius: "var(--radius-input)",
            background: kPhoto ? "var(--accent-wash)" : "var(--bg)",
            marginTop: 4
          }
        }, /*#__PURE__*/React.createElement(Icon, {
          name: kPhoto ? "check" : "user",
          size: 18,
          color: "var(--accent-text)"
        }), /*#__PURE__*/React.createElement("span", {
          style: {
            fontSize: 14,
            fontWeight: 600,
            color: "var(--accent-text)"
          }
        }, kPhoto ? "Photo added — retake" : "Take photo"))), /*#__PURE__*/React.createElement(Card, {
          style: {
            background: "var(--surface)",
            border: "1px solid transparent",
            boxShadow: "none"
          }
        }, /*#__PURE__*/React.createElement("div", {
          style: {
            display: "flex",
            gap: 8
          }
        }, /*#__PURE__*/React.createElement(Icon, {
          name: "id-card",
          size: 18,
          color: "var(--accent-text)",
          style: {
            marginTop: 1
          }
        }), /*#__PURE__*/React.createElement("div", {
          style: {
            fontSize: 14,
            color: "var(--muted)",
            lineHeight: 1.5
          }
        }, "Your national ID is checked by our verification partner ", /*#__PURE__*/React.createElement("b", {
          style: {
            color: "var(--ink)",
            fontWeight: 600
          }
        }, "Didit"), " \u2014 an ID photo plus a quick selfie liveness check. We store your ID number, bike reg and photo to keep deliveries safe; we don't share them with customers. You'll finish in your browser, then come back to go online.", " ", /*#__PURE__*/React.createElement("span", {
          style: {
            color: "var(--accent-text)",
            fontWeight: 600,
            textDecoration: "underline"
          }
        }, "Privacy policy")))), /*#__PURE__*/React.createElement(Button, {
          label: "Submit for verification",
          onClick: submitKyc,
          disabled: !kycCanSubmit
        }), /*#__PURE__*/React.createElement(Button, {
          label: "Back",
          variant: "ghost",
          onClick: () => setKyc("none")
        }));
      }
      return /*#__PURE__*/React.createElement(ScreenPad, null, /*#__PURE__*/React.createElement(TopRow, null, /*#__PURE__*/React.createElement(Heading, {
        style: {
          marginBottom: 0
        }
      }, "Rider"), /*#__PURE__*/React.createElement("div", {
        style: {
          flex: 1
        }
      }), RoleSwitch), kyc === "pending" ? /*#__PURE__*/React.createElement(EmptyState, {
        icon: "id-card",
        title: "Finishing verification\u2026",
        message: "Your ID check is with Didit \u2014 riders go online once it's verified. This usually takes under a minute."
      }, /*#__PURE__*/React.createElement(Button, {
        label: "Continue in browser",
        variant: "ghost",
        onClick: () => {}
      })) : kyc === "failed" ? /*#__PURE__*/React.createElement(EmptyState, {
        icon: "triangle-alert",
        title: "We couldn't verify your ID",
        message: "Often a blurry photo or glare on the ID. Try again, or contact support if it keeps failing."
      }, /*#__PURE__*/React.createElement(Button, {
        label: "Try again",
        onClick: () => setKyc("form")
      })) : /*#__PURE__*/React.createElement(EmptyState, {
        icon: "id-card",
        title: "Set up as a rider",
        message: "Verify your ID and register your bike to start accepting deliveries. Riders go online once verified."
      }, /*#__PURE__*/React.createElement(Button, {
        label: "Become a rider",
        onClick: () => {
          setKTouched(false);
          setKyc("form");
        }
      })));
    }
    return /*#__PURE__*/React.createElement(ScreenPad, null, /*#__PURE__*/React.createElement(TopRow, null, /*#__PURE__*/React.createElement(Heading, {
      style: {
        marginBottom: 0
      }
    }, "Rider"), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1
      }
    }), RoleSwitch), pendingJob ? /*#__PURE__*/React.createElement(Card, {
      accent: true
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginBottom: 6
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "check",
      size: 18,
      color: "var(--accent-text)"
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        fontWeight: 700,
        color: "var(--ink)"
      }
    }, "A customer picked you!")), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 13,
        color: "var(--muted)",
        marginBottom: 4
      }
    }, pendingJob.order.from, " \u2192 ", pendingJob.order.to, " \xB7 $", pendingJob.fare), /*#__PURE__*/React.createElement(Button, {
      label: "Open job",
      onClick: () => {
        setJob(pendingJob);
        setPendingJob(null);
      }
    })) : null, /*#__PURE__*/React.createElement(Card, {
      accent: online
    }, /*#__PURE__*/React.createElement("button", {
      onClick: () => {
        if (!online) setOnline(true);
      },
      disabled: online,
      style: {
        background: "none",
        border: "none",
        padding: 0,
        marginBottom: 6,
        cursor: online ? "default" : "pointer"
      }
    }, /*#__PURE__*/React.createElement(StatusPill, {
      status: online ? net === "reconnecting" ? "Reconnecting" : "Online" : "Offline",
      tone: online ? net === "reconnecting" ? "reconnecting" : "online" : "offline",
      dot: true
    })), /*#__PURE__*/React.createElement(Button, {
      label: online ? "Go offline" : "Go online",
      variant: online ? "ghost" : "primary",
      onClick: () => setOnline(v => !v)
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 12,
        color: "var(--muted)",
        marginTop: 4
      }
    }, online ? net === "reconnecting" ? "You're online — reconnecting to the live board…" : "You're online — new orders arrive live." : "Go online to see and bid on nearby orders.")), online ? selected ? /*#__PURE__*/React.createElement(Card, {
      accent: true
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontWeight: 700,
        marginBottom: 8
      }
    }, "Offer on ", selected.from, " \u2192 ", selected.to), /*#__PURE__*/React.createElement(Field, {
      label: "Your fare (USD)",
      value: rFare,
      onChange: setRFare,
      inputMode: "decimal",
      placeholder: selected.fare
    }), /*#__PURE__*/React.createElement(Field, {
      label: "ETA to pickup (min)",
      value: rEta,
      onChange: setREta,
      inputMode: "numeric",
      placeholder: "8"
    }), /*#__PURE__*/React.createElement(Button, {
      label: "Send offer",
      onClick: takeJob
    }), /*#__PURE__*/React.createElement(Button, {
      label: "Cancel",
      variant: "ghost",
      onClick: () => setSelected(null)
    })) : /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Sub, null, "Open orders"), boardNotice ? /*#__PURE__*/React.createElement("div", {
      role: "status",
      style: {
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "10px 12px",
        background: "var(--accent-wash)",
        borderRadius: "var(--radius-input)",
        marginBottom: 10,
        color: "var(--accent-text)",
        fontSize: 13,
        fontWeight: 600
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "check",
      size: 16,
      color: "var(--accent-text)"
    }), " ", boardNotice) : null, BOARD.filter(o => !bidIds.has(o.id)).map(o => /*#__PURE__*/React.createElement(Card, {
      key: o.id
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontWeight: 700,
        color: "var(--ink)"
      }
    }, o.from, " \u2192 ", o.to), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 13,
        color: "var(--muted)"
      },
      className: "lynia-tabular"
    }, itemSummary(o.items), " \xB7 ", o.km, " km away \xB7 asking $", o.fare), /*#__PURE__*/React.createElement(Button, {
      label: "Make an offer",
      variant: "ghost",
      onClick: () => {
        setSelected(o);
        setRFare(o.fare);
        setREta("8");
      }
    }))), BOARD.filter(o => !bidIds.has(o.id)).length === 0 ? /*#__PURE__*/React.createElement(EmptyState, {
      icon: "inbox",
      title: "No open orders near you right now",
      message: "You're online and first in line \u2014 stay put, requests come through fast. Busiest 7\u20139am & 5\u20137pm."
    }) : null) : /*#__PURE__*/React.createElement(EmptyState, {
      icon: "inbox",
      title: "You're offline",
      message: "Go online to see nearby orders \u2014 you'll be first in line."
    }));
  }
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 6,
      background: "var(--bg)",
      borderRadius: 999,
      padding: 4,
      boxShadow: "var(--shadow-card)"
    }
  }, [[false, "360 · typical"], [true, "320 · entry phone"]].map(([v, lbl]) => /*#__PURE__*/React.createElement("button", {
    key: lbl,
    onClick: () => setSmall(v),
    style: {
      border: "none",
      borderRadius: 999,
      padding: "7px 14px",
      fontFamily: "var(--font-sans)",
      fontSize: 12,
      fontWeight: 600,
      cursor: "pointer",
      background: small === v ? "var(--accent)" : "transparent",
      color: small === v ? "var(--on-accent)" : "var(--muted)"
    }
  }, lbl))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 6,
      flexWrap: "wrap",
      justifyContent: "center",
      fontFamily: "var(--font-sans)"
    }
  }, /*#__PURE__*/React.createElement(DemoChip, {
    label: ridersOnline ? "Riders: available" : "Riders: none (D3)",
    on: !ridersOnline,
    onClick: () => setRidersOnline(v => !v)
  }), /*#__PURE__*/React.createElement(DemoChip, {
    label: net === "online" ? "Network: online" : net === "offline" ? "Network: offline" : "Network: reconnecting",
    on: net !== "online",
    onClick: () => setNet(n => n === "online" ? "offline" : n === "offline" ? "reconnecting" : "online")
  })), /*#__PURE__*/React.createElement(Phone, {
    width: small ? 320 : 360,
    height: small ? 640 : 720
  }, /*#__PURE__*/React.createElement(OfflineBanner, {
    state: net
  }), role === "customer" ? renderCustomer() : renderRider()));
}
function DemoChip({
  label,
  on,
  onClick
}) {
  return /*#__PURE__*/React.createElement("button", {
    onClick: onClick,
    style: {
      border: `1px solid ${on ? "var(--accent)" : "var(--line)"}`,
      background: on ? "var(--accent-wash)" : "var(--bg)",
      color: on ? "var(--accent-text)" : "var(--muted)",
      borderRadius: 999,
      padding: "5px 12px",
      fontFamily: "var(--font-sans)",
      fontSize: 11,
      fontWeight: 600,
      cursor: "pointer"
    }
  }, label);
}

/* ── Layout helpers ── */
const collapseBtn = {
  display: "flex",
  alignItems: "center",
  width: "100%",
  minHeight: "var(--target-min)",
  background: "none",
  border: "none",
  padding: 0,
  cursor: "pointer",
  fontFamily: "var(--font-sans)"
};
function TopRow({
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      marginBottom: "var(--space-md)",
      gap: 8
    }
  }, children);
}
function QtyStepper({
  value,
  onChange,
  min = 1,
  max = 99
}) {
  const btn = (dir, label) => /*#__PURE__*/React.createElement("button", {
    onClick: () => onChange(Math.max(min, Math.min(max, value + dir))),
    disabled: dir < 0 ? value <= min : value >= max,
    "aria-label": label,
    style: {
      width: 40,
      height: 40,
      borderRadius: "50%",
      border: "1px solid var(--line)",
      background: "var(--bg)",
      color: "var(--accent-text)",
      fontSize: 20,
      fontWeight: 700,
      lineHeight: 1,
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0
    }
  }, dir < 0 ? "−" : "+");
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10
    }
  }, btn(-1, "Fewer"), /*#__PURE__*/React.createElement("span", {
    style: {
      minWidth: 24,
      textAlign: "center",
      fontSize: 18,
      fontWeight: 700,
      color: "var(--ink)",
      fontVariantNumeric: "tabular-nums"
    }
  }, value), btn(1, "More"));
}
function CallRow({
  label,
  name,
  phone
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "8px 10px",
      background: "var(--surface)",
      borderRadius: "var(--radius-input)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      fontWeight: 600,
      color: "var(--muted)"
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      fontWeight: 600,
      color: "var(--ink)",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis"
    }
  }, name), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: "var(--muted)"
    },
    className: "lynia-tabular"
  }, phone)), /*#__PURE__*/React.createElement("a", {
    href: "tel:" + String(phone).replace(/[^\d+]/g, ""),
    "aria-label": "Call " + label,
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: 44,
      height: 44,
      borderRadius: "50%",
      background: "var(--accent)",
      flexShrink: 0,
      textDecoration: "none"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "phone",
    size: 18,
    color: "#fff"
  })));
}
function ScreenPad({
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "var(--space-screen)",
      minHeight: "100%",
      boxSizing: "border-box"
    }
  }, children);
}
/* LyniaGo mark — "the Paper Dove". Creases (the hidden cross) show only ≥ ~32px per the brand rule. */
function DoveMark({
  size = 34,
  creases = true,
  crease = "var(--surface)"
}) {
  return /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 96 96",
    "aria-hidden": "true",
    style: {
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("polygon", {
    points: "28,6 58,32 38,42",
    fill: "var(--accent)"
  }), /*#__PURE__*/React.createElement("polygon", {
    points: "90,26 14,52 48,60",
    fill: "var(--accent)"
  }), /*#__PURE__*/React.createElement("polygon", {
    points: "90,26 48,60 42,84",
    fill: "var(--accent-700)"
  }), creases && size >= 32 ? /*#__PURE__*/React.createElement("path", {
    d: "M90 26 L48 60 M70.5 30.2 L81.5 43.8",
    stroke: crease,
    strokeWidth: "2.4",
    fill: "none"
  }) : null);
}
function Lockup() {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      marginBottom: 20
    }
  }, /*#__PURE__*/React.createElement(DoveMark, {
    size: 40
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-wordmark)",
      fontSize: 24,
      fontWeight: 600,
      color: "var(--ink)"
    }
  }, "Lynia", /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--accent-700)"
    }
  }, "Go")));
}
function Phone({
  children,
  width = 360,
  height = 720
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width,
      height,
      background: "var(--surface)",
      borderRadius: 34,
      border: "10px solid #14181b",
      overflow: "hidden",
      position: "relative",
      boxShadow: "0 20px 60px rgba(20,24,27,.28)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      top: 0,
      left: "50%",
      transform: "translateX(-50%)",
      width: 110,
      height: 22,
      background: "#14181b",
      borderRadius: "0 0 14px 14px",
      zIndex: 20
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      height: "100%",
      overflowY: "auto",
      background: "var(--surface)"
    }
  }, children));
}

// Mount ONLY on the kit page (index.html sets the flag). The DS compiler also bundles this file
// into _ds_bundle.js; without this guard the demo app would execute (and could hijack a #root)
// on every page that loads the bundle.
if (window.__LYNIA_KIT_PAGE) {
  ReactDOM.createRoot(document.getElementById("root")).render(/*#__PURE__*/React.createElement(App, null));
}
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/mobile/app.js", error: String((e && e.message) || e) }); }

// ui_kits/mobile/kit-parts.js
try { (() => {
/* Lynia mobile UI kit — composites over the design-system bundle (window.LyniaDesignSystem_94c56a).
   FauxMap is a stylised placeholder (not real tiles): percent-coordinate pins, tap-to-pin, and a
   route line that follows the pins — the DT5 map-anchored home is built on it. Recreation, not
   production code. */

const DS = window.LyniaDesignSystem_94c56a;
const {
  Button,
  Card,
  Field,
  StatusPill,
  Stepper,
  EmptyState,
  Heading,
  Sub,
  Label,
  SkeletonList,
  Icon
} = DS;

/* ── Pin — percent coords ── */
function Pin({
  x,
  y,
  color,
  label
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      left: `${x}%`,
      top: `${y}%`,
      transform: "translate(-50%,-100%)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      pointerEvents: "none"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 26,
      height: 26,
      borderRadius: "50%",
      background: color,
      color: "#fff",
      display: "grid",
      placeItems: "center",
      fontSize: 12,
      fontWeight: 700,
      border: "2px solid #fff",
      boxShadow: "0 1px 3px rgba(0,0,0,.25)"
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 2,
      height: 8,
      background: color
    }
  }));
}

/* ── Faux map ──
   pins: { a: {x,y}|null, b: {x,y}|null } in PERCENT. onTap(pt) fires with percent coords.
   rider: show the bike marker interpolated a→b by riderPos (0..1). fill: stretch to parent. */
const DEFAULT_PINS = {
  a: {
    x: 20,
    y: 24
  },
  b: {
    x: 78,
    y: 74
  }
};
function FauxMap({
  height = 190,
  fill = false,
  pins = DEFAULT_PINS,
  rider = false,
  riderPos = 0.5,
  onTap,
  paused = false
}) {
  const a = pins.a,
    b = pins.b;
  const rx = a && b ? a.x + (b.x - a.x) * riderPos : 50;
  const ry = a && b ? a.y + (b.y - a.y) * riderPos : 50;
  return /*#__PURE__*/React.createElement("div", {
    onClick: onTap ? e => {
      const r = e.currentTarget.getBoundingClientRect();
      onTap({
        x: Math.round((e.clientX - r.left) / r.width * 100),
        y: Math.round((e.clientY - r.top) / r.height * 100)
      });
    } : undefined,
    style: {
      position: "relative",
      height: fill ? "100%" : height,
      borderRadius: fill ? 0 : "var(--radius-input)",
      overflow: "hidden",
      cursor: onTap ? "crosshair" : "default",
      background: "repeating-linear-gradient(0deg,#eef1f3 0 1px,transparent 1px 34px)," + "repeating-linear-gradient(90deg,#eef1f3 0 1px,transparent 1px 40px)," + "linear-gradient(135deg,#f2f5f6,#e9edf0)",
      border: fill ? "none" : "1px solid var(--line)"
    }
  }, a && b ? /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 100 100",
    preserveAspectRatio: "none",
    style: {
      position: "absolute",
      inset: 0,
      width: "100%",
      height: "100%",
      pointerEvents: "none"
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: `M ${a.x} ${a.y} C ${a.x + (b.x - a.x) * 0.55} ${a.y}, ${a.x + (b.x - a.x) * 0.45} ${b.y}, ${b.x} ${b.y}`,
    fill: "none",
    stroke: "var(--accent)",
    strokeWidth: "1.2",
    strokeDasharray: "0.8 2.6",
    strokeLinecap: "round",
    opacity: "0.75",
    vectorEffect: "non-scaling-stroke",
    style: {
      strokeWidth: 3
    }
  })) : null, a ? /*#__PURE__*/React.createElement(Pin, {
    x: a.x,
    y: a.y,
    color: "var(--accent)",
    label: "A"
  }) : null, b ? /*#__PURE__*/React.createElement(Pin, {
    x: b.x,
    y: b.y,
    color: "var(--danger)",
    label: "B"
  }) : null, rider && a && b ? /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      left: `${rx}%`,
      top: `${ry}%`,
      transform: "translate(-50%,-50%)",
      width: 30,
      height: 30,
      borderRadius: "50%",
      background: paused ? "var(--muted)" : "var(--accent)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      border: "2px solid #fff",
      boxShadow: "0 1px 4px rgba(0,0,0,.3)",
      opacity: paused ? 0.7 : 1
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "bike",
    size: 16,
    color: "#fff"
  })) : null, paused ? /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      top: 8,
      left: 8,
      display: "inline-flex",
      alignItems: "center",
      gap: 5,
      background: "var(--ink)",
      color: "#fff",
      borderRadius: "var(--radius-pill)",
      padding: "5px 10px",
      fontSize: 11,
      fontWeight: 600
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 6,
      height: 6,
      borderRadius: "50%",
      background: "#fff",
      opacity: 0.7
    }
  }), " Live paused \u2014 reconnecting\u2026") : null);
}

/* ── Offer card — composite over Card (the customer's bid row). ── */
function OfferCard({
  o,
  recommended,
  onChoose
}) {
  return /*#__PURE__*/React.createElement(Card, {
    accent: recommended,
    style: recommended ? {
      borderColor: "var(--highlight)"
    } : undefined
  }, recommended ? /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      fontWeight: 700,
      color: "var(--highlight-ink)",
      letterSpacing: 0.5,
      marginBottom: 3
    }
  }, "\u2605 RECOMMENDED") : null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 16,
      fontWeight: 700,
      color: "var(--ink)"
    }
  }, o.name), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: "var(--muted)"
    },
    className: "lynia-tabular"
  }, "\u2605 ", o.rating, " \xB7 ", o.trips, " trips \xB7 ETA ", o.eta, " min"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 20,
      fontWeight: 700,
      margin: "4px 0"
    },
    className: "lynia-tabular"
  }, "$", o.fare), /*#__PURE__*/React.createElement(Button, {
    label: "Choose this rider",
    onClick: onChoose
  }));
}

/* ── Sort chips (segmented pills) ── */
function SortChips({
  value,
  onChange
}) {
  const modes = [["best", "Best match"], ["cheapest", "Cheapest"], ["fastest", "Fastest"], ["rated", "Top rated"]];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexWrap: "wrap",
      gap: 6,
      marginBottom: "var(--space-sm)"
    }
  }, modes.map(([k, lbl]) => {
    const on = value === k;
    return /*#__PURE__*/React.createElement("button", {
      key: k,
      onClick: () => onChange(k),
      style: {
        minHeight: 36,
        padding: "0 14px",
        borderRadius: "var(--radius-pill)",
        border: `1px solid ${on ? "var(--accent)" : "var(--line)"}`,
        background: on ? "var(--accent)" : "var(--bg)",
        color: on ? "var(--on-accent)" : "var(--muted)",
        fontFamily: "var(--font-sans)",
        fontSize: 12,
        fontWeight: 600,
        cursor: "pointer"
      }
    }, lbl);
  }));
}

/* ── Pin-target segmented toggle (DT5): selected colour == the pin being placed ── */
function PinToggle({
  target,
  onChange,
  hasPickup,
  hasDrop
}) {
  const opts = [["pickup", "Pickup", "var(--accent)", hasPickup], ["drop", "Drop-off", "var(--danger)", hasDrop]];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 4,
      background: "var(--surface)",
      borderRadius: "var(--radius-pill)",
      padding: 4
    }
  }, opts.map(([k, lbl, color, done]) => {
    const on = target === k;
    return /*#__PURE__*/React.createElement("button", {
      key: k,
      onClick: () => onChange(k),
      style: {
        flex: 1,
        minHeight: 36,
        border: "none",
        borderRadius: "var(--radius-pill)",
        background: on ? color : "transparent",
        color: on ? "#fff" : "var(--muted)",
        fontFamily: "var(--font-sans)",
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6
      }
    }, done ? /*#__PURE__*/React.createElement(Icon, {
      name: "check",
      size: 14,
      color: on ? "#fff" : "var(--accent-text)"
    }) : null, lbl);
  }));
}

/* ── MapSheet (DT5): the bottom sheet over the full-bleed map. Two snap states: peek / expanded.
   Tap the handle (or the chevron) to toggle — real drag physics are device-gated (DT5). ── */
function MapSheet({
  expanded,
  onToggle,
  children,
  footer
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 10,
      background: "var(--bg)",
      borderRadius: "20px 20px 0 0",
      boxShadow: "var(--shadow-sheet)",
      display: "flex",
      flexDirection: "column",
      maxHeight: expanded ? "88%" : "58%"
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onToggle,
    "aria-expanded": expanded,
    "aria-label": expanded ? "Collapse the sheet" : "Expand for more details",
    style: {
      background: "none",
      border: "none",
      padding: "10px 0 4px",
      cursor: "pointer",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 2
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 36,
      height: 4,
      borderRadius: 2,
      background: "var(--line)"
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      overflowY: "auto",
      padding: "4px var(--space-screen) 0"
    }
  }, children), footer ? /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "0 var(--space-screen) var(--space-md)"
    }
  }, footer) : null);
}

/* Best-match ranking (port of @lynia/shared offer-ranking.ts, D-d). Blends price/rating/ETA so a
   cheap-but-slow-and-poorly-rated offer doesn't automatically win. Returns indexes best-first. */
const OFFER_WEIGHTS = {
  price: 0.45,
  rating: 0.35,
  eta: 0.2
};
const NEW_RIDER_RATING_SCORE = 0.5;
function normv(value, min, max, lowerIsBetter) {
  if (max <= min) return 0.5;
  const t = (value - min) / (max - min);
  return lowerIsBetter ? 1 - t : t;
}
function rankOffers(offers) {
  // offers: [{ offeredFare, ratingAvg, ratingCount, etaMinutes }]
  if (offers.length === 0) return [];
  const fares = offers.map(o => o.offeredFare);
  const etas = offers.map(o => o.etaMinutes);
  const rated = offers.filter(o => o.ratingCount > 0).map(o => o.ratingAvg);
  const fMin = Math.min(...fares),
    fMax = Math.max(...fares);
  const eMin = Math.min(...etas),
    eMax = Math.max(...etas);
  const rMin = rated.length ? Math.min(...rated) : 0,
    rMax = rated.length ? Math.max(...rated) : 0;
  const scored = offers.map((o, index) => {
    const price = normv(o.offeredFare, fMin, fMax, true);
    const eta = normv(o.etaMinutes, eMin, eMax, true);
    const rating = o.ratingCount > 0 ? normv(o.ratingAvg, rMin, rMax, false) : NEW_RIDER_RATING_SCORE;
    return {
      index,
      score: OFFER_WEIGHTS.price * price + OFFER_WEIGHTS.rating * rating + OFFER_WEIGHTS.eta * eta
    };
  });
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const oa = offers[a.index],
      ob = offers[b.index];
    if (oa.offeredFare !== ob.offeredFare) return oa.offeredFare - ob.offeredFare;
    if (oa.ratingAvg !== ob.ratingAvg) return ob.ratingAvg - oa.ratingAvg;
    if (oa.etaMinutes !== ob.etaMinutes) return oa.etaMinutes - ob.etaMinutes;
    return a.index - b.index;
  });
  return scored.map(s => s.index);
}
window.LyniaKit = {
  FauxMap,
  OfferCard,
  SortChips,
  Pin,
  PinToggle,
  MapSheet,
  rankOffers
};
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/mobile/kit-parts.js", error: String((e && e.message) || e) }); }

// ui_kits/support/parts.js
try { (() => {
/* LyniaGo — support / onboarding / edge flows kit.
   A gallery of the peripheral screens the core courier kit doesn't cover: first-run onboarding,
   permission priming, notifications centre, help, settings, and the system/edge states
   (suspended, force-update, no-GPS, generic error). Built from the design-system bundle. */

const D = window.LyniaDesignSystem_94c56a;
const {
  Button,
  Card,
  Field,
  StatusPill,
  EmptyState,
  Icon,
  Heading,
  Sub,
  Label
} = D;

/* Dove mark (creases only ≥32px, per brand rule) */
function Dove({
  size = 40,
  on = "green"
}) {
  const fill = on === "green" ? "#fff" : "var(--accent)";
  const keel = on === "green" ? "rgba(255,255,255,.62)" : "var(--accent-700)";
  const crease = on === "green" ? "var(--accent)" : "#fff";
  return /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 96 96",
    "aria-hidden": "true",
    style: {
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("polygon", {
    points: "28,6 58,32 38,42",
    fill: fill
  }), /*#__PURE__*/React.createElement("polygon", {
    points: "90,26 14,52 48,60",
    fill: fill
  }), /*#__PURE__*/React.createElement("polygon", {
    points: "90,26 48,60 42,84",
    fill: keel
  }), size >= 32 ? /*#__PURE__*/React.createElement("path", {
    d: "M90 26 L48 60 M70.5 30.2 L81.5 43.8",
    stroke: crease,
    strokeWidth: "2.4",
    fill: "none"
  }) : null);
}
function Wordmark({
  size = 22,
  color = "var(--ink)"
}) {
  return /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-wordmark)",
      fontWeight: 600,
      fontSize: size,
      color
    }
  }, "Lynia", /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--accent-700)"
    }
  }, "Go"));
}

/* Phone frame with a caption */
function Phone({
  label,
  children,
  bg = "var(--surface)"
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 300,
      height: 620,
      background: bg,
      borderRadius: 30,
      border: "9px solid #14181b",
      overflow: "hidden",
      position: "relative",
      boxShadow: "0 14px 40px rgba(20,24,27,.22)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      top: 0,
      left: "50%",
      transform: "translateX(-50%)",
      width: 96,
      height: 20,
      background: "#14181b",
      borderRadius: "0 0 12px 12px",
      zIndex: 30
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      height: "100%",
      overflowY: "auto"
    }
  }, children)), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      fontWeight: 700,
      color: "var(--muted)",
      fontFamily: "var(--font-sans)"
    }
  }, label));
}
const Pad = ({
  children,
  style
}) => /*#__PURE__*/React.createElement("div", {
  style: {
    padding: "var(--space-screen)",
    minHeight: "100%",
    boxSizing: "border-box",
    ...style
  }
}, children);
const Top = ({
  title,
  onBack
}) => /*#__PURE__*/React.createElement("div", {
  style: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
    paddingTop: 14
  }
}, onBack !== false ? /*#__PURE__*/React.createElement(Icon, {
  name: "chevron-right",
  size: 20,
  color: "var(--ink)",
  style: {
    transform: "rotate(180deg)"
  }
}) : null, /*#__PURE__*/React.createElement("span", {
  style: {
    fontSize: 18,
    fontWeight: 700,
    color: "var(--ink)",
    fontFamily: "var(--font-sans)",
    letterSpacing: "-0.02em"
  }
}, title));

/* Full-screen system state (edge): green or white, dove/icon, message, actions */
function SystemState({
  tone = "white",
  icon,
  title,
  message,
  primary,
  secondary,
  brand
}) {
  const green = tone === "green";
  return /*#__PURE__*/React.createElement(Pad, {
    style: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      textAlign: "center",
      gap: 4,
      background: green ? "var(--accent)" : "var(--bg)"
    }
  }, brand ? /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement(Dove, {
    size: 56,
    on: green ? "green" : "white"
  })) : /*#__PURE__*/React.createElement("div", {
    style: {
      width: 84,
      height: 84,
      borderRadius: "50%",
      background: green ? "rgba(255,255,255,.16)" : "var(--surface)",
      display: "grid",
      placeItems: "center",
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: icon,
    size: 34,
    color: green ? "#fff" : "var(--accent-text)"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 19,
      fontWeight: 700,
      color: green ? "#fff" : "var(--ink)",
      fontFamily: "var(--font-sans)"
    }
  }, title), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      lineHeight: 1.55,
      color: green ? "rgba(255,255,255,.9)" : "var(--muted)",
      maxWidth: 230,
      fontFamily: "var(--font-sans)"
    }
  }, message), /*#__PURE__*/React.createElement("div", {
    style: {
      alignSelf: "stretch",
      marginTop: 18
    }
  }, primary ? green ? /*#__PURE__*/React.createElement("button", {
    style: {
      width: "100%",
      minHeight: 52,
      borderRadius: 999,
      border: "none",
      background: "#fff",
      color: "var(--accent-700)",
      fontFamily: "var(--font-sans)",
      fontSize: 16,
      fontWeight: 600,
      cursor: "pointer"
    }
  }, primary) : /*#__PURE__*/React.createElement(Button, {
    label: primary
  }) : null, secondary ? /*#__PURE__*/React.createElement(Button, {
    label: secondary,
    variant: "ghost"
  }) : null));
}
window.LyniaSupport = {
  Dove,
  Wordmark,
  Phone,
  Pad,
  Top,
  SystemState,
  D
};
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/support/parts.js", error: String((e && e.message) || e) }); }

// ui_kits/support/screens.js
try { (() => {
/* LyniaGo support / onboarding / edge screens. */
const S = window.LyniaSupport;
const {
  Dove,
  Wordmark,
  Phone,
  Pad,
  Top,
  SystemState
} = S;
const {
  Button,
  Card,
  Field,
  StatusPill,
  EmptyState,
  Icon
} = S.D;

/* ── 1. Onboarding carousel (first run) ── */
function Onboarding() {
  const [i, setI] = React.useState(0);
  const slides = [{
    icon: "banknote",
    t: "Name your price",
    m: "Say what you'll pay to send your parcel — no fixed tariffs, no haggling in the street."
  }, {
    icon: "bike",
    t: "A rider takes it",
    m: "Nearby riders offer on your route. Pick by price, rating or ETA — you're in control."
  }, {
    icon: "map-pin",
    t: "Track it live",
    m: "Watch your rider to the door, share a delivery code, and rate them when it's done."
  }];
  const s = slides[i];
  return /*#__PURE__*/React.createElement(Pad, {
    style: {
      display: "flex",
      flexDirection: "column",
      background: "var(--bg)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      paddingTop: 12
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 7
    }
  }, /*#__PURE__*/React.createElement(Dove, {
    size: 24,
    on: "white"
  }), /*#__PURE__*/React.createElement(Wordmark, {
    size: 17
  })), /*#__PURE__*/React.createElement("button", {
    onClick: () => setI(2),
    style: {
      background: "none",
      border: "none",
      color: "var(--muted)",
      fontSize: 13,
      fontWeight: 600,
      cursor: "pointer",
      fontFamily: "var(--font-sans)"
    }
  }, "Skip")), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      textAlign: "center",
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 120,
      height: 120,
      borderRadius: "50%",
      background: "var(--accent-wash)",
      display: "grid",
      placeItems: "center",
      marginBottom: 18
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: s.icon,
    size: 52,
    color: "var(--accent-text)"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 22,
      fontWeight: 700,
      color: "var(--ink)",
      fontFamily: "var(--font-sans)"
    }
  }, s.t), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      lineHeight: 1.55,
      color: "var(--muted)",
      maxWidth: 240,
      fontFamily: "var(--font-sans)"
    }
  }, s.m)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "center",
      gap: 7,
      marginBottom: 16
    }
  }, slides.map((_, n) => /*#__PURE__*/React.createElement("span", {
    key: n,
    style: {
      width: n === i ? 22 : 7,
      height: 7,
      borderRadius: 999,
      background: n === i ? "var(--accent)" : "var(--line)",
      transition: "width .2s"
    }
  }))), /*#__PURE__*/React.createElement(Button, {
    label: i < 2 ? "Next" : "Get started",
    onClick: () => setI(v => Math.min(2, v + 1))
  }));
}

/* ── 2 & 3. Permission priming ── */
function PermissionLocation() {
  return /*#__PURE__*/React.createElement(SystemState, {
    icon: "navigation",
    title: "Turn on location",
    message: "LyniaGo uses your location to set your pickup pin and match you with the closest riders. We only use it while you're arranging a delivery.",
    primary: "Allow location",
    secondary: "Enter address manually"
  });
}
function PermissionNotifications() {
  return /*#__PURE__*/React.createElement(SystemState, {
    icon: "phone",
    title: "Stay in the loop",
    message: "Get notified the moment a rider offers, when they're arriving, and when your parcel is delivered. You can change this anytime in Settings.",
    primary: "Turn on notifications",
    secondary: "Not now"
  });
}

/* ── 4. Notifications centre ── */
function Notifications({
  empty
}) {
  const items = [{
    icon: "bike",
    t: "Tendai M. is on the way",
    m: "Arriving at pickup in about 6 min.",
    w: "now",
    unread: true
  }, {
    icon: "banknote",
    t: "New offer — $3.20",
    m: "Kudzai N. offered on your CBD → Avenues order.",
    w: "2 min",
    unread: true
  }, {
    icon: "check",
    t: "Delivered",
    m: "Order 8f3a91c2 was delivered. Rate your rider.",
    w: "1 hr"
  }, {
    icon: "id-card",
    t: "You're verified",
    m: "Your rider account is approved — you can go online.",
    w: "Yesterday"
  }];
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Pad, {
    style: {
      minHeight: 0,
      paddingBottom: 0
    }
  }, /*#__PURE__*/React.createElement(Top, {
    title: "Notifications"
  })), empty ? /*#__PURE__*/React.createElement(Pad, null, /*#__PURE__*/React.createElement(EmptyState, {
    icon: "inbox",
    title: "No notifications yet",
    message: "Offers, delivery updates and account news will show up here."
  })) : /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "0 var(--space-screen) var(--space-screen)"
    }
  }, items.map((n, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: "flex",
      gap: 11,
      padding: "12px 0",
      borderBottom: "1px solid var(--line)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 38,
      height: 38,
      borderRadius: "50%",
      background: "var(--accent-wash)",
      display: "grid",
      placeItems: "center",
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: n.icon,
    size: 18,
    color: "var(--accent-text)"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      fontWeight: 600,
      color: "var(--ink)",
      fontFamily: "var(--font-sans)"
    }
  }, n.t), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12.5,
      color: "var(--muted)",
      lineHeight: 1.45,
      fontFamily: "var(--font-sans)"
    }
  }, n.m), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "var(--muted)",
      marginTop: 2,
      fontFamily: "var(--font-sans)"
    }
  }, n.w)), n.unread ? /*#__PURE__*/React.createElement("span", {
    style: {
      width: 8,
      height: 8,
      borderRadius: "50%",
      background: "var(--accent)",
      flexShrink: 0,
      marginTop: 6
    }
  }) : null))));
}

/* ── 5. Help / support ── */
function Help() {
  const topics = [["package", "A delivery problem", "Late, damaged or wrong drop-off"], ["banknote", "Payments & fares", "How pricing and cash work"], ["id-card", "My account", "Verification, phone number, safety"], ["bike", "Becoming a rider", "Requirements and onboarding"]];
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Pad, {
    style: {
      minHeight: 0,
      paddingBottom: 0
    }
  }, /*#__PURE__*/React.createElement(Top, {
    title: "Help"
  })), /*#__PURE__*/React.createElement(Pad, {
    style: {
      paddingTop: 4
    }
  }, /*#__PURE__*/React.createElement(Field, {
    placeholder: "Search help\u2026",
    value: "",
    onChange: () => {}
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      fontWeight: 600,
      color: "var(--muted)",
      margin: "6px 0 8px",
      fontFamily: "var(--font-sans)"
    }
  }, "Browse topics"), topics.map(([ic, t, m]) => /*#__PURE__*/React.createElement(Card, {
    key: t,
    style: {
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 11
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: ic,
    size: 20,
    color: "var(--accent-text)"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      fontWeight: 600,
      color: "var(--ink)",
      fontFamily: "var(--font-sans)"
    }
  }, t), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "var(--muted)",
      fontFamily: "var(--font-sans)"
    }
  }, m)), /*#__PURE__*/React.createElement(Icon, {
    name: "chevron-right",
    size: 18,
    color: "var(--muted)"
  })))), /*#__PURE__*/React.createElement(Card, {
    style: {
      background: "var(--accent-wash)",
      border: "1px solid transparent",
      boxShadow: "none"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 11
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "phone",
    size: 20,
    color: "var(--accent-text)"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      fontSize: 13,
      fontWeight: 600,
      color: "var(--ink)",
      fontFamily: "var(--font-sans)"
    }
  }, "Chat with us on WhatsApp"), /*#__PURE__*/React.createElement(Icon, {
    name: "chevron-right",
    size: 18,
    color: "var(--accent-text)"
  })))));
}

/* ── 6. Settings ── */
function Settings() {
  const Row = ({
    icon,
    label,
    value,
    danger
  }) => /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 12,
      padding: "13px 0",
      borderBottom: "1px solid var(--line)"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: icon,
    size: 19,
    color: danger ? "var(--danger)" : "var(--accent-text)"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      fontSize: 14,
      fontWeight: 600,
      color: danger ? "var(--danger)" : "var(--ink)",
      fontFamily: "var(--font-sans)"
    }
  }, label), value ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: "var(--muted)",
      fontFamily: "var(--font-sans)"
    }
  }, value) : null, !danger ? /*#__PURE__*/React.createElement(Icon, {
    name: "chevron-right",
    size: 17,
    color: "var(--muted)"
  }) : null);
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Pad, {
    style: {
      minHeight: 0,
      paddingBottom: 0
    }
  }, /*#__PURE__*/React.createElement(Top, {
    title: "Settings"
  })), /*#__PURE__*/React.createElement(Pad, {
    style: {
      paddingTop: 4
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 12,
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 52,
      height: 52,
      borderRadius: "50%",
      background: "var(--accent-wash)",
      display: "grid",
      placeItems: "center"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "user",
    size: 24,
    color: "var(--accent-text)"
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 16,
      fontWeight: 700,
      color: "var(--ink)",
      fontFamily: "var(--font-sans)"
    }
  }, "Chipo M."), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: "var(--muted)",
      fontFamily: "var(--font-sans)"
    },
    className: "lynia-tabular"
  }, "+263 77 000 0000"))), /*#__PURE__*/React.createElement(Row, {
    icon: "user",
    label: "Edit profile"
  }), /*#__PURE__*/React.createElement(Row, {
    icon: "phone",
    label: "Notifications",
    value: "On"
  }), /*#__PURE__*/React.createElement(Row, {
    icon: "map-pin",
    label: "Language",
    value: "English"
  }), /*#__PURE__*/React.createElement(Row, {
    icon: "id-card",
    label: "Privacy & safety"
  }), /*#__PURE__*/React.createElement(Row, {
    icon: "banknote",
    label: "Payment",
    value: "Cash"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 10
    }
  }), /*#__PURE__*/React.createElement(Row, {
    icon: "x",
    label: "Sign out",
    danger: true
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "var(--muted)",
      textAlign: "center",
      marginTop: 14,
      fontFamily: "var(--font-sans)"
    }
  }, "LyniaGo v1.0.0")));
}

/* ── Edge / system states ── */
const Suspended = () => /*#__PURE__*/React.createElement(SystemState, {
  icon: "triangle-alert",
  title: "Your account is on hold",
  message: "We've paused your account while we review recent activity. This usually takes 24 hours \u2014 reach out if you think it's a mistake.",
  primary: "Contact support",
  secondary: "Sign out"
});
const ForceUpdate = () => /*#__PURE__*/React.createElement(SystemState, {
  tone: "green",
  brand: true,
  title: "Time to update",
  message: "A new version of LyniaGo is ready with the latest fixes. Update to keep sending and delivering.",
  primary: "Update now"
});
const NoGps = () => /*#__PURE__*/React.createElement(SystemState, {
  icon: "wifi-off",
  title: "Can't find your location",
  message: "Turn on GPS / location so we can set your pickup and match nearby riders. Or enter your pickup address by hand.",
  primary: "Open location settings",
  secondary: "Enter address manually"
});
const GenericError = () => /*#__PURE__*/React.createElement(SystemState, {
  icon: "circle-alert",
  title: "Something went wrong",
  message: "That didn't load. Check your connection and try again \u2014 your order is safe.",
  primary: "Try again",
  secondary: "Back home"
});

/* ── Gallery ── */
const SCREENS = [["Onboarding · carousel", /*#__PURE__*/React.createElement(Onboarding, null), "var(--bg)"], ["Permission · location", /*#__PURE__*/React.createElement(PermissionLocation, null), "var(--bg)"], ["Permission · notifications", /*#__PURE__*/React.createElement(PermissionNotifications, null), "var(--bg)"], ["Notifications centre", /*#__PURE__*/React.createElement(Notifications, null), "var(--bg)"], ["Notifications · empty", /*#__PURE__*/React.createElement(Notifications, {
  empty: true
}), "var(--bg)"], ["Help & support", /*#__PURE__*/React.createElement(Help, null), "var(--bg)"], ["Settings", /*#__PURE__*/React.createElement(Settings, null), "var(--bg)"], ["Edge · account on hold", /*#__PURE__*/React.createElement(Suspended, null), "var(--bg)"], ["Edge · force update", /*#__PURE__*/React.createElement(ForceUpdate, null), "var(--accent)"], ["Edge · location off", /*#__PURE__*/React.createElement(NoGps, null), "var(--bg)"], ["Edge · generic error", /*#__PURE__*/React.createElement(GenericError, null), "var(--bg)"]];
function Gallery() {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexWrap: "wrap",
      gap: 28,
      justifyContent: "center",
      alignItems: "flex-start",
      padding: 28
    }
  }, SCREENS.map(([label, el, bg]) => /*#__PURE__*/React.createElement(Phone, {
    key: label,
    label: label,
    bg: bg
  }, el)));
}
ReactDOM.createRoot(document.getElementById("root")).render(/*#__PURE__*/React.createElement(Gallery, null));
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/support/screens.js", error: String((e && e.message) || e) }); }

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.Icon = __ds_scope.Icon;

__ds_ns.StatusPill = __ds_scope.StatusPill;

__ds_ns.EmptyState = __ds_scope.EmptyState;

__ds_ns.OfflineBanner = __ds_scope.OfflineBanner;

__ds_ns.Skeleton = __ds_scope.Skeleton;

__ds_ns.SkeletonCard = __ds_scope.SkeletonCard;

__ds_ns.SkeletonList = __ds_scope.SkeletonList;

__ds_ns.Field = __ds_scope.Field;

__ds_ns.Stepper = __ds_scope.Stepper;

__ds_ns.Heading = __ds_scope.Heading;

__ds_ns.Label = __ds_scope.Label;

__ds_ns.Sub = __ds_scope.Sub;

})();
