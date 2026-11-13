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
};

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
  if (!q) return pool;

  return pool
    .map((r) => ({ r, s: score(r, q) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || (b.r.stars || 0) - (a.r.stars || 0))
    .map((x) => x.r);
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
  el.emptyTerm.textContent = q;

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
      renderNav();
      render();
      closeDrawer();
      if (slug === "all") window.scrollTo({ top: 0, behavior: "smooth" });
      else window.scrollTo({ top: 0, behavior: "smooth" });
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
    render();
  } catch (err) {
    el.list.innerHTML = `<p class="empty">Could not load <code>data.json</code> — ${esc(
      String(err.message || err)
    )}.<br>Run <code>python3 web/parse_hub.py README.md web/data.json</code> first.</p>`;
    console.error(err);
  }
}

boot();
