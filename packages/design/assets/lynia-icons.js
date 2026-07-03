/* Lynia icon subset — 22 Lucide icons (ISC license, lucide.dev), self-hosted for
   low-bandwidth networks (~4KB vs ~300KB for the full CDN library). Exposes a minimal
   window.lucide shim ({ icons, createIcons }) compatible with the design-system Icon component
   and <i data-lucide="name"> usage. Regenerate by re-importing icons/*.svg and re-running the build. */
(function () {
  var ICONS = {"Bike":[["circle",{"cx":"18.5","cy":"17.5","r":"3.5"}],["circle",{"cx":"5.5","cy":"17.5","r":"3.5"}],["circle",{"cx":"15","cy":"5","r":"1"}],["path",{"d":"M12 17.5V14l-3-3 4-3 2 3h2"}]],"Inbox":[["polyline",{"points":"22 12 16 12 14 15 10 15 8 12 2 12"}],["path",{"d":"M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"}]],"IdCard":[["path",{"d":"M16 10h2"}],["path",{"d":"M16 14h2"}],["path",{"d":"M6.17 15a3 3 0 0 1 5.66 0"}],["circle",{"cx":"9","cy":"11","r":"2"}],["rect",{"x":"2","y":"5","width":"20","height":"14","rx":"2"}]],"Banknote":[["rect",{"width":"20","height":"12","x":"2","y":"6","rx":"2"}],["circle",{"cx":"12","cy":"12","r":"2"}],["path",{"d":"M6 12h.01M18 12h.01"}]],"Package":[["path",{"d":"M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"}],["path",{"d":"M12 22V12"}],["polyline",{"points":"3.29 7 12 12 20.71 7"}],["path",{"d":"m7.5 4.27 9 5.15"}]],"WifiOff":[["path",{"d":"M12 20h.01"}],["path",{"d":"M8.5 16.429a5 5 0 0 1 7 0"}],["path",{"d":"M5 12.859a10 10 0 0 1 5.17-2.69"}],["path",{"d":"M19 12.859a10 10 0 0 0-2.007-1.523"}],["path",{"d":"M2 8.82a15 15 0 0 1 4.177-2.643"}],["path",{"d":"M22 8.82a15 15 0 0 0-11.288-3.764"}],["path",{"d":"m2 2 20 20"}]],"TriangleAlert":[["path",{"d":"m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"}],["path",{"d":"M12 9v4"}],["path",{"d":"M12 17h.01"}]],"MapPin":[["path",{"d":"M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"}],["circle",{"cx":"12","cy":"10","r":"3"}]],"Phone":[["path",{"d":"M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384"}]],"Clock":[["circle",{"cx":"12","cy":"12","r":"10"}],["path",{"d":"M12 6v6l4 2"}]],"ChevronRight":[["path",{"d":"m9 18 6-6-6-6"}]],"ChevronDown":[["path",{"d":"m6 9 6 6 6-6"}]],"ChevronUp":[["path",{"d":"m18 15-6-6-6 6"}]],"Star":[["path",{"d":"M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"}]],"Check":[["path",{"d":"M20 6 9 17l-5-5"}]],"ArrowRight":[["path",{"d":"M5 12h14"}],["path",{"d":"m12 5 7 7-7 7"}]],"Navigation":[["polygon",{"points":"3 11 22 2 13 21 11 13 3 11"}]],"User":[["path",{"d":"M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"}],["circle",{"cx":"12","cy":"7","r":"4"}]],"History":[["path",{"d":"M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"}],["path",{"d":"M3 3v5h5"}],["path",{"d":"M12 7v5l4 2"}]],"Search":[["path",{"d":"m21 21-4.34-4.34"}],["circle",{"cx":"11","cy":"11","r":"8"}]],"X":[["path",{"d":"M18 6 6 18"}],["path",{"d":"m6 6 12 12"}]],"CircleAlert":[["circle",{"cx":"12","cy":"12","r":"10"}],["line",{}],["line",{}]]};
  var SVG_NS = "http://www.w3.org/2000/svg";
  function pascal(name) {
    return String(name || "").split(/[-_ ]+/).filter(Boolean)
      .map(function (s) { return s[0].toUpperCase() + s.slice(1); }).join("");
  }
  function createIcons(opts) {
    var root = (opts && opts.root) || document;
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
  window.lucide = { icons: ICONS, createIcons: createIcons };
})();
