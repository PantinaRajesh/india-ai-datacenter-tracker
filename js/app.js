/* India AI Data Center Tracker
   Vanilla JS app: loads data/datacenters.json, renders a Leaflet map,
   a filterable sidebar list, a sortable table, timeline, capital-flows,
   and policy views, plus a per-facility detail panel. */

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

  const RAW_JSON_URL =
    "https://raw.githubusercontent.com/pantinarajesh/india-ai-datacenter-tracker/main/data/datacenters.json";

  const state = {
    facilities: [],
    meta: {},
    filtered: [],
    filters: { status: new Set(), operator: "", stateName: "", type: "", q: "", sustainableOnly: false },
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
    document.getElementById("api-json-url").textContent = RAW_JSON_URL;
    loadChangelog();
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
      isPolicy: !!f.isPolicy,
      capacityMW: typeof f.capacityMW === "number" ? f.capacityMW : null,
      gpuCount: f.gpuCount || "",
      investmentUSD: typeof f.investmentUSD === "number" ? f.investmentUSD : null,
      investmentDisplay: f.investmentDisplay || "",
      announcedDate: f.announcedDate || "",
      expectedCompletion: f.expectedCompletion || "",
      partners: Array.isArray(f.partners) ? f.partners : [],
      investors: Array.isArray(f.investors) ? f.investors : [],
      sustainability: f.sustainability && typeof f.sustainability === "object" ? f.sustainability : null,
      description: f.description || "",
      conflictNote: f.conflictNote || "",
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

    const sustainBtn = document.getElementById("filter-sustainable");
    sustainBtn.addEventListener("click", () => {
      state.filters.sustainableOnly = !state.filters.sustainableOnly;
      sustainBtn.classList.toggle("active", state.filters.sustainableOnly);
      applyFilters();
    });

    document.getElementById("btn-reset-filters").addEventListener("click", () => {
      state.filters = { status: new Set(), operator: "", stateName: "", type: "", q: "", sustainableOnly: false };
      document.getElementById("search-input").value = "";
      document.getElementById("filter-operator").value = "";
      document.getElementById("filter-state").value = "";
      document.getElementById("filter-type").value = "";
      sustainBtn.classList.remove("active");
      document.querySelectorAll("#filter-status .chip").forEach((c) => c.classList.remove("active"));
      applyFilters();
    });

    document.getElementById("detail-close").addEventListener("click", closeDetail);

    wireModal("btn-changelog", "changelog-overlay", "changelog-close");
    wireModal("btn-data-api", "data-api-overlay", "data-api-close");

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

    document.getElementById("btn-export-csv").addEventListener("click", () => {
      downloadCSV(state.filtered, "india-ai-datacenters-filtered.csv");
    });
    document.getElementById("btn-download-csv").addEventListener("click", () => {
      downloadCSV(state.facilities, "india-ai-datacenters-full.csv");
    });
    document.getElementById("btn-download-json").addEventListener("click", () => {
      const a = document.createElement("a");
      a.href = "data/datacenters.json";
      a.download = "india-ai-datacenters.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
    });

    const statusRow = document.getElementById("filter-status");
    Object.keys(STATUS_LABELS)
      .filter((k) => k !== "announced")
      .forEach((key) => {
        const chip = document.createElement("button");
        chip.className = "chip";
        chip.type = "button";
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

  function wireModal(btnId, overlayId, closeId) {
    const overlay = document.getElementById(overlayId);
    document.getElementById(btnId).addEventListener("click", () => {
      overlay.hidden = false;
    });
    document.getElementById(closeId).addEventListener("click", () => {
      overlay.hidden = true;
    });
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.hidden = true;
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !overlay.hidden) overlay.hidden = true;
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

  /* ---------------- Changelog ---------------- */

  async function loadChangelog() {
    try {
      const res = await fetch("data/changelog.json", { cache: "no-store" });
      const entries = await res.json();
      renderChangelog(Array.isArray(entries) ? entries : []);
    } catch (err) {
      console.error("Failed to load changelog", err);
    }
  }

  function renderChangelog(entries) {
    const list = document.getElementById("changelog-list");
    list.innerHTML = "";
    entries.forEach((entry) => {
      const li = document.createElement("li");
      li.className = "changelog-entry";
      const changesHtml = (entry.changes || []).map((c) => `<li>${escapeHtml(c)}</li>`).join("");
      li.innerHTML = `<span class="changelog-date">${escapeHtml(entry.date || "")}</span><ul>${changesHtml}</ul>`;
      list.appendChild(li);
    });
    if (!entries.length) {
      list.innerHTML = `<li class="detail-empty">No changelog entries yet.</li>`;
    }
  }

  /* ---------------- Filtering ---------------- */

  function isSustainable(f) {
    return !!f.sustainability;
  }

  function applyFilters() {
    const { status, operator, stateName, type, q, sustainableOnly } = state.filters;
    state.filtered = state.facilities.filter((f) => {
      if (status.size && !status.has(f.status)) return false;
      if (operator && f.operator !== operator) return false;
      if (stateName && f.state !== stateName) return false;
      if (type && f.type !== type) return false;
      if (sustainableOnly && !isSustainable(f)) return false;
      if (q) {
        const hay = `${f.name} ${f.operator} ${f.city} ${f.state} ${f.parentGroup}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    renderList();
    renderMarkers();
    renderTable();
    renderTimeline();
    renderCapitalFlows();
    renderPolicy();
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
    document.getElementById("stat-conflicts").textContent = f.filter((x) => x.conflictNote).length;
  }

  function conflictBadge(f) {
    if (!f.conflictNote) return "";
    return `<span class="conflict-badge" title="${escapeAttr(f.conflictNote)}">⚠ Conflicting reports</span>`;
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
        ${conflictBadge(f)}
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
        <p class="fi-name">${escapeHtml(f.name)}${f.conflictNote ? ` <span class="conflict-dot" title="${escapeAttr(f.conflictNote)}">⚠</span>` : ""}${f.sustainability ? ` <span title="Sustainability data available">🌱</span>` : ""}</p>
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
        <td>${escapeHtml(f.name)}${f.conflictNote ? ` <span class="conflict-dot" title="${escapeAttr(f.conflictNote)}">⚠</span>` : ""}</td>
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

  /* ---------------- Timeline view ---------------- */

  function dateSortKey(dateStr) {
    if (!dateStr) return "";
    if (dateStr.length === 4) return dateStr + "-13-99";
    if (dateStr.length === 7) return dateStr + "-99";
    return dateStr;
  }

  function announcedYear(dateStr) {
    const m = /^(\d{4})/.exec(dateStr || "");
    return m ? m[1] : null;
  }

  function renderTimeline() {
    const container = document.getElementById("timeline-list");
    container.innerHTML = "";
    const withDate = state.filtered.filter((f) => f.announcedDate);
    const withoutDate = state.filtered.filter((f) => !f.announcedDate);
    withDate.sort((a, b) => dateSortKey(b.announcedDate).localeCompare(dateSortKey(a.announcedDate)));

    let lastYear = null;
    withDate.forEach((f) => {
      const year = announcedYear(f.announcedDate);
      if (year !== lastYear) {
        const h = document.createElement("div");
        h.className = "timeline-year";
        h.textContent = year;
        container.appendChild(h);
        lastYear = year;
      }
      container.appendChild(timelineItem(f));
    });

    if (withoutDate.length) {
      const h = document.createElement("div");
      h.className = "timeline-year";
      h.textContent = "Date unknown";
      container.appendChild(h);
      withoutDate
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach((f) => container.appendChild(timelineItem(f)));
    }

    if (!withDate.length && !withoutDate.length) {
      container.innerHTML = `<p class="detail-empty">No facilities match these filters.</p>`;
    }
  }

  function timelineItem(f) {
    const item = document.createElement("div");
    item.className = `timeline-item status-${f.status}`;
    item.innerHTML = `
      <span class="timeline-date">${escapeHtml(f.announcedDate || "Unknown")}</span>
      <div class="timeline-body">
        <p class="tb-name">${escapeHtml(f.name)}${f.conflictNote ? ` <span class="conflict-dot" title="${escapeAttr(f.conflictNote)}">⚠</span>` : ""}</p>
        <p class="tb-meta">${escapeHtml(f.operator)} · ${escapeHtml(formatLocation(f))} · ${STATUS_LABELS[f.status] || f.status}</p>
      </div>`;
    item.addEventListener("click", () => openDetail(f.id));
    return item;
  }

  /* ---------------- Capital Flows view ---------------- */

  function renderCapitalFlows() {
    const container = document.getElementById("capital-list");
    container.innerHTML = "";
    const byInvestor = new Map();
    state.filtered.forEach((f) => {
      (f.investors || []).forEach((inv) => {
        if (!byInvestor.has(inv.name)) byInvestor.set(inv.name, { total: 0, hasUnknown: false, deals: [] });
        const entry = byInvestor.get(inv.name);
        if (typeof inv.amountUSD === "number") entry.total += inv.amountUSD;
        else entry.hasUnknown = true;
        entry.deals.push({ facility: f, amountUSD: inv.amountUSD, note: inv.note || "" });
      });
    });

    const investors = Array.from(byInvestor.entries()).sort((a, b) => b[1].total - a[1].total);

    investors.forEach(([name, data]) => {
      const li = document.createElement("li");
      li.className = "capital-card";
      const dealsHtml = data.deals
        .map(
          (d) => `
        <li class="capital-deal" data-id="${d.facility.id}">
          <span class="cd-name">${escapeHtml(d.facility.operator)} — ${escapeHtml(d.facility.name)}</span>
          <span class="cd-amount">${d.amountUSD ? formatUSD(d.amountUSD) : "Undisclosed"}</span>
        </li>`
        )
        .join("");
      li.innerHTML = `
        <div class="capital-head">
          <h3>${escapeHtml(name)}</h3>
          <span class="capital-total">${data.total ? formatUSD(data.total) + (data.hasUnknown ? "+" : "") : "Undisclosed amount"}</span>
        </div>
        <ul class="capital-deals">${dealsHtml}</ul>`;
      li.querySelectorAll(".capital-deal").forEach((el) => {
        el.addEventListener("click", () => openDetail(el.dataset.id));
      });
      container.appendChild(li);
    });

    if (!investors.length) {
      container.innerHTML = `<p class="detail-empty">No tracked financial investors among the facilities matching these filters. Try resetting filters — investor data is only recorded for a subset of deals where it's been publicly disclosed.</p>`;
    }
  }

  /* ---------------- Policy & Incentives view ---------------- */

  function renderPolicy() {
    const container = document.getElementById("policy-list");
    container.innerHTML = "";
    const policies = state.filtered.filter((f) => f.isPolicy);
    policies.forEach((f) => {
      const li = document.createElement("li");
      li.className = "policy-card";
      li.dataset.id = f.id;
      const figures = [];
      if (f.investmentDisplay || f.investmentUSD) {
        figures.push(`<span class="policy-figure">Investment: <b>${escapeHtml(f.investmentDisplay || formatUSD(f.investmentUSD))}</b></span>`);
      }
      if (f.expectedCompletion) {
        figures.push(`<span class="policy-figure">Target: <b>${escapeHtml(f.expectedCompletion)}</b></span>`);
      }
      if (f.announcedDate) {
        figures.push(`<span class="policy-figure">Announced: <b>${escapeHtml(f.announcedDate)}</b></span>`);
      }
      li.innerHTML = `
        <h3>${escapeHtml(f.name)}</h3>
        <p class="policy-meta">${escapeHtml(f.operator)} · ${escapeHtml(f.state || "Pan-India")}</p>
        ${f.description ? `<p>${escapeHtml(f.description)}</p>` : ""}
        <div class="policy-figures">${figures.join("")}</div>`;
      li.addEventListener("click", () => openDetail(f.id));
      container.appendChild(li);
    });
    if (!policies.length) {
      container.innerHTML = `<p class="detail-empty">No government policies or national programs match these filters.</p>`;
    }
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

    const investorsHtml = f.investors.length
      ? f.investors
          .map(
            (inv) =>
              `<div class="investor-row"><span>${escapeHtml(inv.name)}${inv.note ? " — " + escapeHtml(inv.note) : ""}</span><strong>${inv.amountUSD ? formatUSD(inv.amountUSD) : "Undisclosed"}</strong></div>`
          )
          .join("")
      : "";

    const sustainability = f.sustainability;
    const sustainRows = [];
    if (sustainability) {
      if (sustainability.landAcres) sustainRows.push(`<div class="investor-row"><span>Land footprint</span><strong>${sustainability.landAcres} acres</strong></div>`);
      if (sustainability.powerSource) sustainRows.push(`<div class="investor-row"><span>Power source</span><strong>${escapeHtml(sustainability.powerSource)}</strong></div>`);
      if (sustainability.coolingType) sustainRows.push(`<div class="investor-row"><span>Cooling</span><strong>${escapeHtml(sustainability.coolingType)}</strong></div>`);
      if (sustainability.note) sustainRows.push(`<p style="margin-top:8px;">${escapeHtml(sustainability.note)}</p>`);
    }

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
      ${f.conflictNote ? `<div class="detail-section conflict-callout"><h4>⚠ Conflicting reports</h4><p>${escapeHtml(f.conflictNote)}</p></div>` : ""}
      ${sustainRows.length ? `<div class="detail-section sustainability-callout"><h4>🌱 Sustainability</h4>${sustainRows.join("")}</div>` : ""}
      ${investorsHtml ? `<div class="detail-section"><h4>Financial investors</h4>${investorsHtml}</div>` : ""}
      ${partnersHtml ? `<div class="detail-section"><h4>Partners</h4>${partnersHtml}</div>` : ""}
      <div class="detail-section"><h4>Sources</h4>${sourcesHtml}</div>
    `;

    const marker = state.markersById[id];
    if (marker && state.map) {
      state.map.setView(marker.getLatLng(), Math.max(state.map.getZoom(), 7), { animate: true });
      if (document.getElementById("map-view").classList.contains("active")) {
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

  /* ---------------- CSV export ---------------- */

  function csvEscape(val) {
    const s = val == null ? "" : String(val);
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function toCSV(facilities) {
    const cols = [
      "id", "name", "operator", "parentGroup", "city", "state", "lat", "lng",
      "status", "type", "capacityMW", "gpuCount", "investmentUSD", "investmentDisplay",
      "announcedDate", "expectedCompletion", "partners", "investors", "sustainability",
      "conflictNote", "sourceUrls",
    ];
    const lines = [cols.join(",")];
    facilities.forEach((f) => {
      const row = [
        f.id, f.name, f.operator, f.parentGroup, f.city, f.state, f.lat, f.lng,
        f.status, f.type, f.capacityMW, f.gpuCount, f.investmentUSD, f.investmentDisplay,
        f.announcedDate, f.expectedCompletion,
        f.partners.join("; "),
        f.investors.map((i) => `${i.name}${i.amountUSD ? " ($" + i.amountUSD + ")" : ""}`).join("; "),
        f.sustainability
          ? Object.entries(f.sustainability)
              .map(([k, v]) => `${k}: ${v}`)
              .join("; ")
          : "",
        f.conflictNote,
        f.sources.map((s) => s.url).join("; "),
      ];
      lines.push(row.map(csvEscape).join(","));
    });
    return lines.join("\n");
  }

  function downloadCSV(facilities, filename) {
    const csv = toCSV(facilities);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  /* ---------------- Utils ---------------- */

  function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function escapeAttr(str) {
    return escapeHtml(str);
  }
})();
