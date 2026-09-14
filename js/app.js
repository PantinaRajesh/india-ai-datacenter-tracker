/* India AI Data Center Tracker
   Vanilla JS app: loads data/datacenters.json, renders a Leaflet map,
   a filterable sidebar list, a sortable table view, and a detail panel. */

(function () {
  "use strict";

  const STATUS_LABELS = {
    operational: "Operational",
    under_construction: "Under construction",
    planned: "Planned",
    announced: "Announced",
  };

  const STATUS_COLORS = {
    operational: "#1a9e6b",
    under_construction: "#e08a1f",
    planned: "#8a5cf5",
    announced: "#8a5cf5",
  };

  const SUGGEST_URL_FALLBACK =
    "https://github.com/pantinarajesh/india-ai-datacenter-tracker/issues/new?labels=data-update&title=Data%20update%3A%20";

  const state = {
    facilities: [],
    meta: {},
    filtered: [],
    filters: { status: new Set(), operator: "", stateName: "", type: "", q: "" },
    activeId: null,
    sort: { key: "name", dir: 1 },
    map: null,
    markerLayer: null,
    markersById: {},
  };

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    wireStaticUI();
    try {
      const res = await fetch("data/datacenters.json", { cache: "no-store" });
      const json = await res.json();
      state.meta = json.meta || {};
      state.facilities = (json.facilities || []).map(normalizeFacility);
    } catch (err) {
      console.error("Failed to load dataset", err);
      state.facilities = [];
    }
    buildFilterOptions();
    initMap();
    applyFilters();
    renderStats();
    document.getElementById("footer-updated").textContent = state.meta.lastUpdated
      ? `Data snapshot: ${state.meta.lastUpdated}.`
      : "";
    const link = document.getElementById("link-suggest");
    link.href = state.meta.suggestUpdateUrl || SUGGEST_URL_FALLBACK;
  }

  function normalizeFacility(f) {
    return {
      id: f.id,
      name: f.name || "Unnamed facility",
      operator: f.operator || "Unknown",
      parentGroup: f.parentGroup || "",
      city: f.city || "",
      state: f.state || "",
      lat: typeof f.lat === "number" ? f.lat : null,
      lng: typeof f.lng === "number" ? f.lng : null,
      status: f.status || "announced",
      type: f.type || "Data Center",
      capacityMW: typeof f.capacityMW === "number" ? f.capacityMW : null,
      gpuCount: f.gpuCount || "",
      investmentUSD: typeof f.investmentUSD === "number" ? f.investmentUSD : null,
      investmentDisplay: f.investmentDisplay || "",
      announcedDate: f.announcedDate || "",
      expectedCompletion: f.expectedCompletion || "",
      partners: Array.isArray(f.partners) ? f.partners : [],
      description: f.description || "",
      sources: Array.isArray(f.sources) ? f.sources : [],
    };
  }

  /* ---------------- UI wiring ---------------- */

  function wireStaticUI() {
    document.querySelectorAll(".view-toggle").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".view-toggle").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        const view = btn.dataset.view;
        document.querySelectorAll(".view-panel").forEach((p) => p.classList.remove("active"));
        document.getElementById(view + "-view").classList.add("active");
        if (view === "map" && state.map) setTimeout(() => state.map.invalidateSize(), 50);
        if (view === "table") renderTable();
      });
    });

    document.getElementById("search-input").addEventListener("input", (e) => {
      state.filters.q = e.target.value.trim().toLowerCase();
      applyFilters();
    });

    document.getElementById("filter-operator").addEventListener("change", (e) => {
      state.filters.operator = e.target.value;
      applyFilters();
    });
    document.getElementById("filter-state").addEventListener("change", (e) => {
      state.filters.stateName = e.target.value;
      applyFilters();
    });
    document.getElementById("filter-type").addEventListener("change", (e) => {
      state.filters.type = e.target.value;
      applyFilters();
    });

    document.getElementById("btn-reset-filters").addEventListener("click", () => {
      state.filters = { status: new Set(), operator: "", stateName: "", type: "", q: "" };
      document.getElementById("search-input").value = "";
      document.getElementById("filter-operator").value = "";
      document.getElementById("filter-state").value = "";
      document.getElementById("filter-type").value = "";
      document.querySelectorAll("#filter-status .chip").forEach((c) => c.classList.remove("active"));
      applyFilters();
    });

    document.getElementById("detail-close").addEventListener("click", closeDetail);

    document.querySelectorAll("#data-table th[data-sort]").forEach((th) => {
      th.addEventListener("click", () => {
        const key = th.dataset.sort;
        if (state.sort.key === key) state.sort.dir *= -1;
        else {
          state.sort.key = key;
          state.sort.dir = 1;
        }
        renderTable();
      });
    });

    const statusRow = document.getElementById("filter-status");
    Object.keys(STATUS_LABELS)
      .filter((k) => k !== "announced")
      .forEach((key) => {
        const chip = document.createElement("button");
        chip.className = "chip";
        chip.innerHTML = `<span class="dot" style="background:${STATUS_COLORS[key]}"></span>${STATUS_LABELS[key]}`;
        chip.addEventListener("click", () => {
          chip.classList.toggle("active");
          if (chip.classList.contains("active")) state.filters.status.add(key);
          else state.filters.status.delete(key);
          applyFilters();
        });
        statusRow.appendChild(chip);
      });
  }

  function buildFilterOptions() {
    const operators = uniqueSorted(state.facilities.map((f) => f.operator));
    const states = uniqueSorted(state.facilities.map((f) => f.state).filter(Boolean));
    const types = uniqueSorted(state.facilities.map((f) => f.type).filter(Boolean));
    fillSelect("filter-operator", operators);
    fillSelect("filter-state", states);
    fillSelect("filter-type", types);
  }

  function fillSelect(id, values) {
    const sel = document.getElementById(id);
    values.forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v;
      opt.textContent = v;
      sel.appendChild(opt);
    });
  }

  function uniqueSorted(arr) {
    return Array.from(new Set(arr)).sort((a, b) => a.localeCompare(b));
  }

  /* ---------------- Filtering ---------------- */

  function applyFilters() {
    const { status, operator, stateName, type, q } = state.filters;
    state.filtered = state.facilities.filter((f) => {
      if (status.size && !status.has(f.status)) return false;
      if (operator && f.operator !== operator) return false;
      if (stateName && f.state !== stateName) return false;
      if (type && f.type !== type) return false;
      if (q) {
        const hay = `${f.name} ${f.operator} ${f.city} ${f.state} ${f.parentGroup}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    renderList();
    renderMarkers();
    renderTable();
    document.getElementById("results-count").textContent = state.filtered.length;
  }

  /* ---------------- Stats ---------------- */

  function renderStats() {
    const f = state.facilities;
    document.getElementById("stat-total").textContent = f.length;
    const totalMW = f.reduce((sum, x) => sum + (x.capacityMW || 0), 0);
    document.getElementById("stat-mw").textContent = totalMW ? Math.round(totalMW).toLocaleString() : "–";
    const totalInv = f.reduce((sum, x) => sum + (x.investmentUSD || 0), 0);
    document.getElementById("stat-investment").textContent = totalInv ? formatUSD(totalInv) : "–";
    document.getElementById("stat-states").textContent = uniqueSorted(f.map((x) => x.state).filter(Boolean)).length;
    document.getElementById("stat-operators").textContent = uniqueSorted(f.map((x) => x.operator)).length;
    document.getElementById("stat-updated").textContent = state.meta.lastUpdated || "–";
  }

  function formatLocation(f) {
    if (f.city && f.state) return `${f.city}, ${f.state}`;
    return f.city || f.state || "Location undisclosed";
  }

  function formatUSD(n) {
    if (n >= 1e9) return "$" + (n / 1e9).toFixed(1).replace(/\.0$/, "") + "B+";
    if (n >= 1e6) return "$" + (n / 1e6).toFixed(0) + "M+";
    return "$" + n.toLocaleString();
  }

  /* ---------------- Map ---------------- */

  function initMap() {
    const map = L.map("map", { scrollWheelZoom: true }).setView([22.9, 79.5], 5);
    const isDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    const tileUrl = isDark
      ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
    L.tileLayer(tileUrl, {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      maxZoom: 18,
    }).addTo(map);

    state.markerLayer = L.markerClusterGroup({
      maxClusterRadius: 42,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
    });
    map.addLayer(state.markerLayer);
    state.map = map;
  }

  function radiusForMW(mw) {
    if (!mw || mw <= 0) return 8;
    return Math.min(28, 8 + Math.sqrt(mw) * 1.3);
  }

  function renderMarkers() {
    state.markerLayer.clearLayers();
    state.markersById = {};
    state.filtered.forEach((f) => {
      if (f.lat == null || f.lng == null) return;
      const color = STATUS_COLORS[f.status] || "#999";
      const marker = L.circleMarker([f.lat, f.lng], {
        radius: radiusForMW(f.capacityMW),
        color: color,
        weight: 2,
        fillColor: color,
        fillOpacity: 0.55,
      });
      marker.bindPopup(popupHtml(f), { maxWidth: 260 });
      marker.on("click", () => openDetail(f.id));
      marker.on("mouseover", () => marker.openPopup());
      state.markerLayer.addLayer(marker);
      state.markersById[f.id] = marker;
    });
  }

  function popupHtml(f) {
    return `
      <div class="dc-popup">
        <h3>${escapeHtml(f.name)}</h3>
        <p class="pop-meta">${escapeHtml(f.operator)} · ${escapeHtml(formatLocation(f))}</p>
        <p class="pop-meta">${STATUS_LABELS[f.status] || f.status}${f.capacityMW ? " · " + f.capacityMW + " MW" : ""}</p>
        <a href="#" class="pop-link" data-open-detail="${f.id}">View full details →</a>
      </div>`;
  }

  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-open-detail]");
    if (t) {
      e.preventDefault();
      openDetail(t.dataset.openDetail);
    }
  });

  /* ---------------- Sidebar list ---------------- */

  function renderList() {
    const list = document.getElementById("facility-list");
    list.innerHTML = "";
    const sorted = [...state.filtered].sort((a, b) => a.name.localeCompare(b.name));
    sorted.forEach((f) => {
      const li = document.createElement("li");
      li.className = "facility-item" + (f.id === state.activeId ? " active" : "");
      li.dataset.id = f.id;
      li.innerHTML = `
        <p class="fi-name">${escapeHtml(f.name)}</p>
        <div class="fi-meta">
          <span class="status-dot ${f.status}"></span>
          <span>${escapeHtml(f.operator)}</span>
          <span>·</span>
          <span>${escapeHtml(formatLocation(f))}</span>
          ${f.capacityMW ? `<span>·</span><span>${f.capacityMW} MW</span>` : ""}
        </div>`;
      li.addEventListener("click", () => openDetail(f.id));
      list.appendChild(li);
    });
    if (!sorted.length) {
      list.innerHTML = `<li class="detail-empty" style="padding:20px 4px;">No facilities match these filters.</li>`;
    }
  }

  /* ---------------- Table view ---------------- */

  function renderTable() {
    const tbody = document.getElementById("table-body");
    tbody.innerHTML = "";
    const rows = [...state.filtered].sort((a, b) => {
      const k = state.sort.key;
      const av = a[k],
        bv = b[k];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number") return (av - bv) * state.sort.dir;
      return String(av).localeCompare(String(bv)) * state.sort.dir;
    });
    rows.forEach((f) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(f.name)}</td>
        <td>${escapeHtml(f.operator)}</td>
        <td>${escapeHtml(formatLocation(f))}</td>
        <td><span class="status-dot ${f.status}"></span> ${STATUS_LABELS[f.status] || f.status}</td>
        <td>${f.capacityMW ?? "–"}</td>
        <td>${escapeHtml(f.gpuCount || "–")}</td>
        <td>${escapeHtml(f.investmentDisplay || (f.investmentUSD ? formatUSD(f.investmentUSD) : "–"))}</td>
        <td>${escapeHtml(f.announcedDate || "–")}</td>`;
      tr.addEventListener("click", () => openDetail(f.id));
      tbody.appendChild(tr);
    });
  }

  /* ---------------- Detail panel ---------------- */

  function openDetail(id) {
    const f = state.facilities.find((x) => x.id === id);
    if (!f) return;
    state.activeId = id;
    document.querySelectorAll(".facility-item").forEach((li) => {
      li.classList.toggle("active", li.dataset.id === id);
    });
    document.getElementById("detail-close").style.display = "block";

    const content = document.getElementById("detail-content");
    content.classList.remove("detail-empty");
    content.classList.add("detail-content");

    const partnersHtml = f.partners.length
      ? f.partners.map((p) => `<span class="partner-tag">${escapeHtml(p)}</span>`).join("")
      : "";

    const sourcesHtml = f.sources.length
      ? `<ul class="source-list">${f.sources
          .map((s) => `<li><a href="${escapeAttr(s.url)}" target="_blank" rel="noopener">${escapeHtml(s.title || s.url)}</a></li>`)
          .join("")}</ul>`
      : `<p style="color:var(--text-faint);font-size:12.5px;">No source recorded yet.</p>`;

    content.innerHTML = `
      <h2>${escapeHtml(f.name)}</h2>
      <p class="detail-op">${escapeHtml(f.operator)}${f.parentGroup ? " · " + escapeHtml(f.parentGroup) : ""}</p>
      <span class="detail-status" style="color:${STATUS_COLORS[f.status]};background:${STATUS_COLORS[f.status]}22;">
        <span class="status-dot ${f.status}"></span>${STATUS_LABELS[f.status] || f.status}
      </span>
      <div class="detail-grid">
        <div class="detail-field"><span class="df-label">Location</span><span class="df-value">${escapeHtml(formatLocation(f))}</span></div>
        <div class="detail-field"><span class="df-label">Facility type</span><span class="df-value">${escapeHtml(f.type)}</span></div>
        <div class="detail-field"><span class="df-label">Power capacity</span><span class="df-value">${f.capacityMW ? f.capacityMW + " MW" : "Unknown"}</span></div>
        <div class="detail-field"><span class="df-label">GPU / compute</span><span class="df-value">${escapeHtml(f.gpuCount || "Unknown")}</span></div>
        <div class="detail-field"><span class="df-label">Investment</span><span class="df-value">${escapeHtml(f.investmentDisplay || (f.investmentUSD ? formatUSD(f.investmentUSD) : "Undisclosed"))}</span></div>
        <div class="detail-field"><span class="df-label">Announced</span><span class="df-value">${escapeHtml(f.announcedDate || "Unknown")}</span></div>
        <div class="detail-field"><span class="df-label">Expected completion</span><span class="df-value">${escapeHtml(f.expectedCompletion || "Unknown")}</span></div>
        <div class="detail-field"><span class="df-label">Coordinates</span><span class="df-value">${f.lat != null ? f.lat.toFixed(3) + ", " + f.lng.toFixed(3) : "Unknown"}</span></div>
      </div>
      ${f.description ? `<div class="detail-section"><h4>About</h4><p>${escapeHtml(f.description)}</p></div>` : ""}
      ${partnersHtml ? `<div class="detail-section"><h4>Partners</h4>${partnersHtml}</div>` : ""}
      <div class="detail-section"><h4>Sources</h4>${sourcesHtml}</div>
    `;

    const marker = state.markersById[id];
    if (marker && state.map) {
      state.map.setView(marker.getLatLng(), Math.max(state.map.getZoom(), 7), { animate: true });
      if (document.getElementById("btn-view-map").classList.contains("active")) {
        state.markerLayer.zoomToShowLayer(marker, () => marker.openPopup());
      }
    }
  }

  function closeDetail() {
    state.activeId = null;
    document.querySelectorAll(".facility-item").forEach((li) => li.classList.remove("active"));
    document.getElementById("detail-close").style.display = "none";
    const content = document.getElementById("detail-content");
    content.className = "detail-empty";
    content.innerHTML = `<p>Click any marker or list item to see full details about a facility — operator, capacity, investment, partners, and sources.</p>`;
  }

  /* ---------------- Utils ---------------- */

  function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function escapeAttr(str) {
    return escapeHtml(str);
  }
})();
