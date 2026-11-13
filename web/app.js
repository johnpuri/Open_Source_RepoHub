/* ============================================================
   Open Source RepoHub — app logic
   Loads data.json once, renders adaptively.
   ============================================================ */

const state = {
  data: null,
  sections: [],
  repos: [],
  activeSection: "all",
  query: "",
  // Filters
  types: new Set(),       // "Agent" | "Skill" | ...
  languages: new Set(),   // "Python" | ... | "None"
  starTiers: new Set(),   // "100k" | "50k" | "10k" | "1k" | "under1k" | "unknown"
  licences: new Set(),    // canonical licence ids, or "none"
  sort: "default",
};

/* Star tier definitions: [id, label, min, max] */
const STAR_TIERS = [
  ["100k", "100k+", 100000, Infinity],
  ["50k", "50k–100k", 50000, 100000],
  ["10k", "10k–50k", 10000, 50000],
  ["1k", "1k–10k", 1000, 10000],
  ["under1k", "< 1k", 0, 1000],
  ["unknown", "No data", null, null],
];

/** Effective licence: live GitHub SPDX id beats README prose. */
function licenceOf(repo) {
  const live = repo.licence_live;
  if (live && live !== "NOASSERTION") return live;
  if (repo.licence) return repo.licence;
  return "none";
}

function tierOf(repo) {
  const s = repo.stars;
  if (s == null) return "unknown";
  for (const [id, , min, max] of STAR_TIERS) {
    if (min == null) continue;
    if (s >= min && s < max) return id;
  }
  return "unknown";
}

const $ = (id) => document.getElementById(id);
const el = {
  navList: $("navList"),
  list: $("list"),
  search: $("search"),
  clearSearch: $("clearSearch"),
  countPill: $("countPill"),
  heroStats: $("heroStats"),
  empty: $("empty"),
  emptyTerm: $("emptyTerm"),
  sidebar: $("sidebar"),
  scrim: $("scrim"),
  menuBtn: $("menuBtn"),
  closeMenu: $("closeMenu"),
  themeBtn: $("themeBtn"),
  toTop: $("toTop"),
  footMeta: $("footMeta"),
  typeChips: $("typeChips"),
  langChips: $("langChips"),
  starChips: $("starChips"),
  licenceChips: $("licenceChips"),
  sortSelect: $("sortSelect"),
  resetFilters: $("resetFilters"),
  activeFilters: $("activeFilters"),
  filterToggle: $("filterToggle"),
  filterGroups: $("filterGroups"),
  filterBadge: $("filterBadge"),
  emptyReset: $("emptyReset"),
};

/* ---------- theme ---------- */

function initTheme() {
  const saved = localStorage.getItem("osrh-theme");
  const dark = saved
    ? saved === "dark"
    : window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

el.themeBtn.addEventListener("click", () => {
  const next =
    document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  localStorage.setItem("osrh-theme", next);
});

/* ---------- helpers ---------- */

const fmtStars = (n) =>
  n == null
    ? ""
    : n >= 1_000_000
    ? (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M"
    : n >= 1000
    ? (n / 1000).toFixed(1).replace(/\.0$/, "") + "k"
    : String(n);

const esc = (s) =>
  s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));

/** Escape then wrap every query match in <mark>. */
function highlight(text, q) {
  const safe = esc(text);
  if (!q) return safe;
  const terms = q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!terms.length) return safe;
  const re = new RegExp(`(${terms.join("|")})`, "gi");
  return safe.replace(re, "<mark>$1</mark>");
}

/* ---------- search ---------- */

function score(repo, q) {
  if (!q) return 0;
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  const hay = {
    name: repo.name.toLowerCase(),
    owner: repo.full_name.toLowerCase(),
    desc: repo.desc.toLowerCase(),
    section: repo.section.toLowerCase(),
  };
  let total = 0;
  for (const t of terms) {
    let hit = 0;
    if (hay.name === t) hit += 60;
    else if (hay.name.startsWith(t)) hit += 40;
    else if (hay.name.includes(t)) hit += 24;
    if (hay.owner.includes(t)) hit += 12;
    if (hay.desc.includes(t)) hit += 8;
    if (hay.section.includes(t)) hit += 3;
    if (!hit) return -1; // every term must match somewhere
    total += hit;
  }
  return total;
}

function filtered() {
  const q = state.query.trim();
  let pool = state.repos;

  if (state.activeSection !== "all") {
    pool = pool.filter((r) => r.section_slug === state.activeSection);
  }

  // Type filter (OR across selected types)
  if (state.types.size) {
    pool = pool.filter((r) => state.types.has(r.type || "Other"));
  }

  // Language filter (OR across selected languages)
  if (state.languages.size) {
    pool = pool.filter((r) => state.languages.has(r.language || "None"));
  }

  // Star tier filter (OR across selected tiers)
  if (state.starTiers.size) {
    pool = pool.filter((r) => state.starTiers.has(tierOf(r)));
  }

  // Licence filter (OR across selected licences)
  if (state.licences.size) {
    pool = pool.filter((r) => state.licences.has(licenceOf(r)));
  }

  // Search
  if (q) {
    pool = pool
      .map((r) => ({ r, s: score(r, q) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || (b.r.stars || 0) - (a.r.stars || 0))
      .map((x) => x.r);
  }

  // Explicit sort (overrides source order)
  if (state.sort === "stars-desc") {
    pool = [...pool].sort((a, b) => (b.stars ?? -1) - (a.stars ?? -1));
  } else if (state.sort === "stars-asc") {
    pool = [...pool].sort((a, b) => (a.stars ?? Infinity) - (b.stars ?? Infinity));
  } else if (state.sort === "name") {
    pool = [...pool].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
    );
  }

  return pool;
}

const hasFilters = () =>
  state.types.size > 0 ||
  state.languages.size > 0 ||
  state.starTiers.size > 0 ||
  state.licences.size > 0 ||
  state.sort !== "default";

/* ---------- filter chips ---------- */

/** Generic multi-select chip group. */
function renderChipGroup(container, entries, selected, key) {
  container.innerHTML = "";
  for (const [value, label, count] of entries) {
    const b = document.createElement("button");
    b.className = "chip";
    b.type = "button";
    b.dataset[key] = value;
    b.setAttribute("aria-pressed", selected.has(value) ? "true" : "false");
    b.innerHTML = `${esc(label)}<span class="chip-n">${count}</span>`;
    b.addEventListener("click", () => {
      if (selected.has(value)) selected.delete(value);
      else selected.add(value);
      syncFilterUI();
      render();
    });
    container.appendChild(b);
  }
}

const TYPE_ORDER = [
  "Agent", "Skill", "MCP Server", "Framework", "Model", "App",
  "CLI / TUI", "Desktop App", "Web App", "Runtime / Toolchain",
  "Infra / Network", "Bot", "Browser Ext", "Docs / Guide", "Awesome List", "Other",
];

function buildTypeChips(pool) {
  const counts = new Map();
  for (const r of pool) {
    const t = r.type || "Other";
    counts.set(t, (counts.get(t) || 0) + 1);
  }
  // A selected chip must survive a section switch even if this section has none,
  // otherwise the filter is active but invisible and can't be un-clicked.
  for (const t of state.types) if (!counts.has(t)) counts.set(t, 0);
  const entries = [...counts.entries()]
    .sort((a, b) => {
      const ia = TYPE_ORDER.indexOf(a[0]);
      const ib = TYPE_ORDER.indexOf(b[0]);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    })
    .map(([t, n]) => [t, t, n]);
  renderChipGroup(el.typeChips, entries, state.types, "type");
}

function buildLangChips(pool) {
  const counts = new Map();
  for (const r of pool) {
    const l = r.language || "None";
    counts.set(l, (counts.get(l) || 0) + 1);
  }
  for (const l of state.languages) if (!counts.has(l)) counts.set(l, 0);

  const entries = [...counts.entries()]
    .sort((a, b) => {
      // Always list selected languages first so they stay reachable
      const sa = state.languages.has(a[0]) ? 1 : 0;
      const sb = state.languages.has(b[0]) ? 1 : 0;
      if (sa !== sb) return sb - sa;
      return b[1] - a[1];
    })
    .slice(0, 14)
    .map(([l, n]) => [l, l, n]);
  renderChipGroup(el.langChips, entries, state.languages, "language");
}

function buildChips() {
  // Star tiers: count how many repos fall in each, over the current section
  const sectionPool =
    state.activeSection === "all"
      ? state.repos
      : state.repos.filter((r) => r.section_slug === state.activeSection);

  const tierCounts = new Map();
  for (const r of sectionPool) {
    const t = tierOf(r);
    tierCounts.set(t, (tierCounts.get(t) || 0) + 1);
  }

  buildTypeChips(sectionPool);
  buildLangChips(sectionPool);

  el.starChips.innerHTML = "";
  for (const [id, label] of STAR_TIERS) {
    const n = tierCounts.get(id) || 0;
    // Skip chips that can never match — unless the user has it selected, in
    // which case hiding it would strand an active, invisible filter.
    if (!n && !state.starTiers.has(id)) continue;
    const b = document.createElement("button");
    b.className = "chip";
    b.type = "button";
    b.setAttribute("aria-pressed", state.starTiers.has(id) ? "true" : "false");
    b.dataset.tier = id;
    b.innerHTML = `${esc(label)}<span class="chip-n">${n}</span>`;
    b.addEventListener("click", () => {
      if (state.starTiers.has(id)) state.starTiers.delete(id);
      else state.starTiers.add(id);
      syncFilterUI();
      render();
    });
    el.starChips.appendChild(b);
  }

  // Licences: only ones that actually occur
  const licCounts = new Map();
  for (const r of state.repos) {
    const k = licenceOf(r);
    licCounts.set(k, (licCounts.get(k) || 0) + 1);
  }
  const ordered = [...licCounts.entries()]
    .filter(([k]) => k !== "none")
    .sort((a, b) => b[1] - a[1]);

  el.licenceChips.innerHTML = "";
  if (ordered.length) {
    for (const [lic, n] of ordered) {
      const b = document.createElement("button");
      b.className = "chip";
      b.type = "button";
      b.setAttribute("aria-pressed", state.licences.has(lic) ? "true" : "false");
      b.dataset.licence = lic;
      b.innerHTML = `${esc(lic)}<span class="chip-n">${n}</span>`;
      b.addEventListener("click", () => {
        if (state.licences.has(lic)) state.licences.delete(lic);
        else state.licences.add(lic);
        syncFilterUI();
        render();
      });
      el.licenceChips.appendChild(b);
    }
    // "Unlisted" only matters if the user is hunting for gaps
    const b = document.createElement("button");
    b.className = "chip";
    b.type = "button";
    b.setAttribute("aria-pressed", state.licences.has("none") ? "true" : "false");
    b.dataset.licence = "none";
    b.innerHTML = `Unlisted<span class="chip-n">${licCounts.get("none") || 0}</span>`;
    b.addEventListener("click", () => {
      if (state.licences.has("none")) state.licences.delete("none");
      else state.licences.add("none");
      syncFilterUI();
      render();
    });
    el.licenceChips.appendChild(b);
  } else {
    el.licenceChips.innerHTML = `<span class="filter-label" style="text-transform:none;letter-spacing:0">No licence data yet</span>`;
  }
}

/** Reflect state into chip pressed states, badge, reset button, pills. */
function syncFilterUI() {
  for (const b of el.typeChips.querySelectorAll(".chip")) {
    b.setAttribute("aria-pressed", state.types.has(b.dataset.type) ? "true" : "false");
  }
  for (const b of el.langChips.querySelectorAll(".chip")) {
    b.setAttribute("aria-pressed", state.languages.has(b.dataset.language) ? "true" : "false");
  }
  for (const b of el.starChips.querySelectorAll(".chip")) {
    b.setAttribute(
      "aria-pressed",
      state.starTiers.has(b.dataset.tier) ? "true" : "false"
    );
  }
  for (const b of el.licenceChips.querySelectorAll(".chip")) {
    b.setAttribute(
      "aria-pressed",
      state.licences.has(b.dataset.licence) ? "true" : "false"
    );
  }

  el.sortSelect.value = state.sort;
  const active = hasFilters();
  el.resetFilters.hidden = !active;

  const total = state.types.size + state.languages.size + state.starTiers.size + state.licences.size;
  el.filterBadge.hidden = total === 0;
  el.filterBadge.textContent = total;

  // Explain current filters as removable pills
  el.activeFilters.innerHTML = "";
  const addPill = (label, onRemove) => {
    const p = document.createElement("span");
    p.className = "af-pill";
    p.innerHTML = `${esc(label)}<button type="button" aria-label="Remove ${esc(label)}">&times;</button>`;
    p.querySelector("button").addEventListener("click", onRemove);
    el.activeFilters.appendChild(p);
  };
  for (const t of state.types) {
    addPill(`Type: ${t}`, () => {
      state.types.delete(t);
      syncFilterUI();
      render();
    });
  }
  for (const l of state.languages) {
    addPill(l === "None" ? "Lang: none" : l, () => {
      state.languages.delete(l);
      syncFilterUI();
      render();
    });
  }
  for (const id of state.starTiers) {
    const t = STAR_TIERS.find((x) => x[0] === id);
    addPill(`★ ${t ? t[1] : id}`, () => {
      state.starTiers.delete(id);
      syncFilterUI();
      render();
    });
  }
  for (const lic of state.licences) {
    addPill(lic === "none" ? "Licence unlisted" : lic, () => {
      state.licences.delete(lic);
      syncFilterUI();
      render();
    });
  }
  if (state.sort !== "default") {
    const lbl = el.sortSelect.selectedOptions[0]?.textContent || state.sort;
    addPill(`Sort: ${lbl}`, () => {
      state.sort = "default";
      syncFilterUI();
      render();
    });
  }
}

function resetAllFilters() {
  state.types.clear();
  state.languages.clear();
  state.starTiers.clear();
  state.licences.clear();
  state.sort = "default";
  syncFilterUI();
  render();
}

/* ---------- rendering ---------- */

function repoCard(repo, q) {
  const a = document.createElement("a");
  a.className = "card";
  a.href = repo.url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.setAttribute("role", "listitem");

  const stars = repo.stars != null
    ? `<span class="card-stars" title="${repo.stars.toLocaleString()} stars">★ ${fmtStars(repo.stars)}</span>`
    : `<span class="card-stars" style="color:var(--text-faint)">—</span>`;

  a.innerHTML = `
    <div class="card-top">
      ${repo.emoji ? `<span class="card-emoji">${esc(repo.emoji)}</span>` : ""}
      <span class="card-name">${highlight(repo.name, q)}</span>
      ${stars}
    </div>
    <div class="card-owner">${esc(repo.full_name)}</div>
    <p class="card-desc">${highlight(repo.desc || "No description.", q)}</p>
  `;
  return a;
}

function render() {
  const q = state.query.trim();
  const items = filtered();

  el.list.innerHTML = "";
  el.countPill.textContent = items.length;
  el.empty.hidden = items.length > 0;
  // Say *why* it's empty: a filter still on is the likely cause
  const filterNote = el.empty.querySelector(".empty-filters");
  if (items.length === 0 && hasFilters()) {
    el.emptyTerm.textContent = q || "these filters";
    if (filterNote) filterNote.hidden = false;
  } else {
    el.emptyTerm.textContent = q;
    if (filterNote) filterNote.hidden = true;
  }

  // Group by section, preserving declared order
  const groups = new Map();
  for (const r of items) {
    if (!groups.has(r.section_slug)) {
      // Take the emoji from the section definition, not from the first repo
      const def = state.sections.find((s) => s.slug === r.section_slug);
      groups.set(r.section_slug, {
        title: r.section,
        emoji: def ? def.emoji : "",
        repos: [],
      });
    }
    groups.get(r.section_slug).repos.push(r);
  }

  // Sort repos within a group by stars desc when searching, else keep source order
  for (const g of groups.values()) {
    if (q) g.repos.sort((a, b) => (b.stars || 0) - (a.stars || 0));
  }

  const frag = document.createDocumentFragment();
  for (const [slug, g] of groups) {
    const head = document.createElement("div");
    head.className = "section-head";
    head.id = `s-${slug}`;
    head.innerHTML = `<h2>${g.emoji ? esc(g.emoji) + " " : ""}${esc(g.title)}</h2>
                      <span class="n">${g.repos.length}</span>`;
    frag.appendChild(head);
    for (const r of g.repos) frag.appendChild(repoCard(r, q));
  }
  el.list.appendChild(frag);
}

function renderNav() {
  el.navList.innerHTML = "";
  const mk = (slug, emoji, label, count) => {
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.className = "nav-item" + (state.activeSection === slug ? " active" : "");
    b.dataset.slug = slug;
    b.innerHTML = `<span class="nav-emoji">${emoji || "•"}</span>
                   <span class="nav-label">${esc(label)}</span>
                   <span class="nav-count">${count}</span>`;
    b.addEventListener("click", () => {
      state.activeSection = slug;
      // Tier counts are section-relative, so rebuild chips on every switch
      buildChips();
      syncFilterUI();
      renderNav();
      render();
      closeDrawer();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    li.appendChild(b);
    el.navList.appendChild(li);
  };

  mk("all", "📚", "All projects", state.repos.length);
  for (const s of state.sections) {
    mk(s.slug, s.emoji, s.title, s.repos.length);
  }
}

function renderStats() {
  const withStars = state.repos.filter((r) => r.stars).length;
  const totalStars = state.repos.reduce((a, r) => a + (r.stars || 0), 0);
  el.heroStats.innerHTML = `
    <span class="stat-chip"><b>${state.repos.length}</b> projects</span>
    <span class="stat-chip"><b>${state.sections.length}</b> categories</span>
    <span class="stat-chip"><b>${fmtStars(totalStars)}</b> combined ★</span>
    <span class="stat-chip"><b>${withStars}</b> with star data</span>
  `;
  el.footMeta.textContent = `Open Source RepoHub — ${state.repos.length} projects across ${state.sections.length} categories.`;
}

function updateSearchPlaceholder() {
  el.search.placeholder = `Search ${state.repos.length} projects…`;
}

/* ---------- drawer ---------- */

function openDrawer() {
  el.sidebar.classList.add("open");
  el.scrim.hidden = false;
  el.menuBtn.setAttribute("aria-expanded", "true");
  document.body.style.overflow = "hidden";
}
function closeDrawer() {
  el.sidebar.classList.remove("open");
  el.scrim.hidden = true;
  el.menuBtn.setAttribute("aria-expanded", "false");
  document.body.style.overflow = "";
}

el.menuBtn.addEventListener("click", openDrawer);
el.closeMenu.addEventListener("click", closeDrawer);
el.scrim.addEventListener("click", closeDrawer);

// Esc closes drawer
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (!el.sidebar.classList.contains("open") && state.query) {
      el.search.value = "";
      state.query = "";
      el.clearSearch.hidden = true;
      render();
    } else {
      closeDrawer();
    }
  }
  // "/" focuses search
  if (e.key === "/" && document.activeElement !== el.search) {
    e.preventDefault();
    el.search.focus();
  }
});

/* ---------- filter wiring ---------- */

el.sortSelect.addEventListener("change", (e) => {
  state.sort = e.target.value;
  syncFilterUI();
  render();
});

el.resetFilters.addEventListener("click", resetAllFilters);
el.emptyReset.addEventListener("click", resetAllFilters);

el.filterToggle.addEventListener("click", () => {
  const open = el.filterGroups.classList.toggle("open");
  el.filterToggle.setAttribute("aria-expanded", open ? "true" : "false");
});

/* ---------- search wiring ---------- */

let t = null;
el.search.addEventListener("input", (e) => {
  const v = e.target.value;
  el.clearSearch.hidden = !v;
  clearTimeout(t);
  t = setTimeout(() => {
    state.query = v;
    render();
  }, 90);
});

el.clearSearch.addEventListener("click", () => {
  el.search.value = "";
  state.query = "";
  el.clearSearch.hidden = true;
  el.search.focus();
  render();
});

/* ---------- scroll affordances ---------- */

window.addEventListener(
  "scroll",
  () => {
    el.toTop.hidden = window.scrollY < 600;
  },
  { passive: true }
);
el.toTop.addEventListener("click", () =>
  window.scrollTo({ top: 0, behavior: "smooth" })
);

/* ---------- boot ---------- */

async function boot() {
  initTheme();
  try {
    const res = await fetch("data.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    state.data = data;
    state.sections = data.sections;
    state.repos = data.sections.flatMap((s) => s.repos);

    renderNav();
    renderStats();
    updateSearchPlaceholder();
    buildChips();
    syncFilterUI();
    render();
  } catch (err) {
    el.list.innerHTML = `<p class="empty">Could not load <code>data.json</code> — ${esc(
      String(err.message || err)
    )}.<br>Run <code>python3 web/parse_hub.py README.md web/data.json</code> first.</p>`;
    console.error(err);
  }
}

boot();
