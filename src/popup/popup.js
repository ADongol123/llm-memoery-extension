import { buildBriefing, buildSummary, buildMergedBriefing } from "../utils/shared.js";

const $ = (id) => document.getElementById(id);

const toggleInput    = $("toggleInput");
const statusDot      = $("statusDot");
const statusText     = $("statusText");
const countBadge     = $("countBadge");
const offState       = $("offState");
const mainPanel      = $("mainPanel");
const tabBar         = $("tabBar");
const convList       = $("convList");
const randomBtn      = $("randomBtn");
const syncBtn        = $("syncBtn");
const toast          = $("toast");
const searchInput    = $("searchInput");
const clearSearch    = $("clearSearch");
const modeFullBtn    = $("modeFullBtn");
const modeSummaryBtn = $("modeSummaryBtn");
const selectionBar   = $("selectionBar");
const selectionCount = $("selectionCount");
const clearSelection = $("clearSelection");
const useSelected    = $("useSelected");

// Fixed 5 LLMs — always show all tabs regardless of data
const LLMS = [
  { name: "Claude",    patterns: ["claude.ai"] },
  { name: "ChatGPT",  patterns: ["chatgpt.com", "chat.openai.com"] },
  { name: "Grok",     patterns: ["grok.com"] },
  { name: "Gemini",   patterns: ["gemini.google.com"] },
  { name: "DeepSeek", patterns: ["chat.deepseek.com"] },
];

// Keyed by platform name: { sidebar: [{title,url}], stored: [memory], tabId: n|null }
let platformData = {};
let activeTab    = "All";
let searchQuery  = "";
let injectMode   = "full";
let currentItems = [];

// Multi-select: Set of memory IDs
const selectedIds = new Set();

// ── Toast ──────────────────────────────────────────────────────────────────────

function showToast(msg) {
  clearTimeout(showToast._t);
  toast.textContent = msg;
  toast.classList.remove("hidden");
  void toast.offsetWidth;
  showToast._t = setTimeout(() => toast.classList.add("hidden"), 2500);
}

// ── Mode ───────────────────────────────────────────────────────────────────────

function setMode(mode) {
  injectMode = mode;
  modeFullBtn.classList.toggle("active", mode === "full");
  modeSummaryBtn.classList.toggle("active", mode === "summary");
}

// ── Toggle UI ──────────────────────────────────────────────────────────────────

function applyToggleUI(isOn) {
  statusDot.className = `dot ${isOn ? "dot-on" : "dot-off"}`;
  statusText.textContent = isOn ? "Picker is active" : "Picker is off";
}

// ── Data loading ───────────────────────────────────────────────────────────────

async function loadAll() {
  // 1. Load stored memories
  const memRes = await new Promise((r) =>
    chrome.runtime.sendMessage({ type: "GET_MEMORIES" }, r)
  );
  const stored = (memRes?.data || []).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  // 2. Load persisted sidebar cache (works even if LLM tabs aren't open)
  const cacheRes = await new Promise((r) =>
    chrome.runtime.sendMessage({ type: "GET_SIDEBAR_CACHE" }, r)
  );
  const sidebarCache = cacheRes?.data || {};

  // Init platformData
  platformData = {};
  LLMS.forEach((llm) => {
    platformData[llm.name] = {
      tabId: null,
      sidebar: sidebarCache[llm.name] || [],   // from cache
      stored: stored.filter((m) => m.platform === llm.name),
    };
  });

  const total = stored.length + LLMS.reduce((s, l) => s + (sidebarCache[l.name]?.length || 0), 0);
  countBadge.textContent = `${stored.length} saved`;
  countBadge.classList.toggle("hidden", stored.length === 0);

  renderTabs();
  renderList();

  // 3. Scrape currently open LLM tabs — fresher than cache
  const allTabs = await chrome.tabs.query({});
  const freshPromises = [];

  LLMS.forEach((llm) => {
    const match = allTabs.find((tab) =>
      llm.patterns.some((p) => tab.url?.includes(p))
    );
    if (!match) return;
    platformData[llm.name].tabId = match.id;

    freshPromises.push(
      new Promise((resolve) => {
        chrome.tabs.sendMessage(match.id, { type: "GET_SIDEBAR_CONVERSATIONS" }, (res) => {
          if (!chrome.runtime.lastError && res?.success && res.conversations?.length) {
            platformData[llm.name].sidebar = res.conversations;
            // Update the persistent cache too
            chrome.runtime.sendMessage({ type: "GET_SIDEBAR_CACHE" }, (cur) => {
              const updated = { ...(cur?.data || {}), [llm.name]: res.conversations };
              chrome.storage.local.set({ llm_sidebar_cache: updated });
            });
          }
          resolve();
        });
      })
    );
  });

  if (freshPromises.length) {
    await Promise.all(freshPromises);
    renderTabs();
    renderList();
  }
}

// ── Sync all LLMs in background ────────────────────────────────────────────────

let isSyncing = false;

async function syncAll() {
  if (isSyncing) return;
  isSyncing = true;

  const LLMS_LIST = LLMS.map((l) => l.name);

  // Show progress panel
  convList.innerHTML = "";
  const progress = document.createElement("div");
  progress.className = "sync-progress";
  progress.innerHTML = `
    <div class="sync-progress-title">Syncing conversations…</div>
    <div class="sync-note" style="font-size:10.5px;color:var(--text3);margin-bottom:2px;">Each LLM opens briefly in the background, then closes.</div>
    ${LLMS_LIST.map((name) => `
      <div class="sync-row" id="sync-row-${name}">
        <span><span class="sync-status-dot pending" id="sync-dot-${name}"></span><span class="sync-name">${name}</span></span>
        <span id="sync-result-${name}" style="color:var(--text3);font-size:10.5px;">waiting…</span>
      </div>
    `).join("")}
  `;
  convList.appendChild(progress);

  syncBtn.classList.add("syncing");
  syncBtn.textContent = "⟳  Syncing…";

  // Listen for storage changes to update progress dots
  const onStorageChange = (changes) => {
    if (changes.llm_sidebar_cache) {
      const newCache = changes.llm_sidebar_cache.newValue || {};
      LLMS_LIST.forEach((name) => {
        const dot    = $(`sync-dot-${name}`);
        const result = $(`sync-result-${name}`);
        if (!dot || !result) return;
        const convs = newCache[name];
        if (Array.isArray(convs)) {
          dot.className = "sync-status-dot done";
          result.textContent = convs.length ? `${convs.length} found` : "none found";
          result.style.color = "var(--text2)";
        }
      });
    }
  };
  chrome.storage.onChanged.addListener(onStorageChange);

  // Mark all as loading
  LLMS_LIST.forEach((name) => {
    const dot = $(`sync-dot-${name}`);
    if (dot) dot.className = "sync-status-dot loading";
    const r = $(`sync-result-${name}`);
    if (r) r.textContent = "opening…";
  });

  // Kick off sync in background
  await new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: "SYNC_SIDEBARS", platforms: LLMS_LIST },
      () => resolve()
    );
  });

  chrome.storage.onChanged.removeListener(onStorageChange);
  isSyncing = false;
  syncBtn.classList.remove("syncing");
  syncBtn.textContent = "⟳  Sync all";
  showToast("Sync complete ✓");

  await loadAll();
}

// ── Merge sidebar + stored for a platform ─────────────────────────────────────
// Returns unified list. sidebar-only items have stored=null. stored-only and
// matched items have the full memory object.

function getMergedItems(platformName) {
  const d = platformData[platformName] || { sidebar: [], stored: [] };

  const storedByUrl = new Map(
    d.stored.filter((m) => m.url).map((m) => [m.url, m])
  );

  const items = [];
  const seenUrls = new Set();

  // Sidebar items first (they reflect actual recency from LLM's own UI)
  d.sidebar.forEach((conv) => {
    if (seenUrls.has(conv.url)) return;
    seenUrls.add(conv.url);
    const mem = storedByUrl.get(conv.url) || null;
    items.push({ title: conv.title, url: conv.url, mem, tabId: d.tabId });
  });

  // Stored mems not in sidebar (older / from sessions not reflected in sidebar)
  d.stored.forEach((mem) => {
    const key = mem.url || `id:${mem.id}`;
    if (seenUrls.has(key)) return;
    seenUrls.add(key);
    items.push({ title: mem.title, url: mem.url, mem, tabId: d.tabId });
  });

  return items;
}

function getAllItems() {
  return LLMS.flatMap((llm) =>
    getMergedItems(llm.name).map((item) => ({ ...item, platform: llm.name }))
  ).sort((a, b) => {
    // Pinned first
    if (a.mem?.pinned && !b.mem?.pinned) return -1;
    if (!a.mem?.pinned && b.mem?.pinned) return 1;
    // Stored items with updatedAt
    const aTime = a.mem?.updatedAt || 0;
    const bTime = b.mem?.updatedAt || 0;
    return bTime - aTime;
  });
}

function applySearch(items) {
  if (!searchQuery) return items;
  const q = searchQuery.toLowerCase();
  return items.filter(
    (item) =>
      item.title.toLowerCase().includes(q) ||
      (item.platform || "").toLowerCase().includes(q) ||
      (item.mem?.tags || []).some((t) => t.toLowerCase().includes(q)) ||
      (item.mem?.messages || []).some((m) => m.content.toLowerCase().includes(q))
  );
}

// ── Render tabs ────────────────────────────────────────────────────────────────

function renderTabs() {
  tabBar.innerHTML = "";
  const tabs = ["All", ...LLMS.map((l) => l.name)];

  tabs.forEach((label) => {
    const btn = document.createElement("button");
    btn.className = "tab" + (activeTab === label ? " active" : "");

    // Count for badge
    let count = 0;
    if (label === "All") {
      count = LLMS.reduce((s, l) => s + getMergedItems(l.name).length, 0);
    } else {
      count = getMergedItems(label).length;
    }

    const isOpen = label !== "All" && platformData[label]?.tabId != null;
    btn.innerHTML = `${label}${count ? ` <span class="tab-count">${count}</span>` : ""}${isOpen ? `<span class="tab-open-dot"></span>` : ""}`;

    btn.addEventListener("click", () => {
      activeTab = label;
      renderTabs();
      renderList();
    });
    tabBar.appendChild(btn);
  });
}

// ── Render list ────────────────────────────────────────────────────────────────

function renderList() {
  convList.innerHTML = "";
  currentItems = [];

  let items = activeTab === "All"
    ? getAllItems()
    : getMergedItems(activeTab).map((item) => ({ ...item, platform: activeTab }));

  items = applySearch(items);

  // Tab not open and no stored data
  if (!items.length) {
    const d = activeTab !== "All" ? platformData[activeTab] : null;
    const notOpen = d && d.tabId == null && !d.stored.length;

    const empty = document.createElement("div");
    empty.className = "empty-state";

    if (searchQuery) {
      empty.textContent = `No results for "${searchQuery}"`;
    } else if (notOpen) {
      empty.innerHTML = `
        <div class="empty-icon">↗</div>
        <div>Open <strong>${activeTab}</strong> in Chrome to see your conversations here.</div>
        <div class="empty-hint">Your sidebar conversations will appear automatically.</div>
      `;
    } else {
      empty.textContent = "No conversations yet.";
    }

    convList.appendChild(empty);
    return;
  }

  const pinned   = items.filter((i) => i.mem?.pinned);
  const unpinned = items.filter((i) => !i.mem?.pinned);
  const recent   = unpinned.slice(0, 5);
  const older    = unpinned.slice(5);
  let   counter  = 1;

  if (pinned.length) {
    appendLabel("Pinned ★");
    pinned.forEach((item) => { convList.appendChild(makeItem(item, counter++)); currentItems.push(item); });
  }
  if (older.length) appendLabel("Recent");
  recent.forEach((item) => { convList.appendChild(makeItem(item, counter++)); currentItems.push(item); });

  if (older.length) {
    const div = document.createElement("div");
    div.className = "older-divider";
    div.innerHTML = `<div class="older-line"></div><span class="older-text">Older</span><div class="older-line"></div>`;
    convList.appendChild(div);
    older.forEach((item) => { convList.appendChild(makeItem(item, counter++)); currentItems.push(item); });
  }
}

function appendLabel(text) {
  const el = document.createElement("div");
  el.className = "section-label";
  el.textContent = text;
  convList.appendChild(el);
}

// ── Selection helpers ──────────────────────────────────────────────────────────

function updateSelectionBar() {
  const count = selectedIds.size;
  if (count === 0) {
    selectionBar.classList.add("hidden");
    return;
  }
  selectionBar.classList.remove("hidden");
  selectionCount.textContent = `${count} selected`;
  useSelected.textContent = `Use all ${count} →`;
}

function toggleSelect(mem, el) {
  if (selectedIds.has(mem.id)) {
    selectedIds.delete(mem.id);
    el.classList.remove("selected");
    el.querySelector(".check-input").checked = false;
  } else {
    selectedIds.add(mem.id);
    el.classList.add("selected");
    el.querySelector(".check-input").checked = true;
  }
  updateSelectionBar();
}

function clearAll() {
  selectedIds.clear();
  convList.querySelectorAll(".conv-item.selected").forEach((el) => {
    el.classList.remove("selected");
    const cb = el.querySelector(".check-input");
    if (cb) cb.checked = false;
  });
  updateSelectionBar();
}

// ── Build conv item ────────────────────────────────────────────────────────────

function makeItem(item, num) {
  const { title, url, mem, platform, tabId } = item;
  const injectable   = !!mem;
  const isSnippet    = !!mem?.isSnippet;
  const isPinned     = !!mem?.pinned;
  const isSelected   = mem && selectedIds.has(mem.id);
  const showPlatform = activeTab === "All";

  const el = document.createElement("div");
  el.className = [
    "conv-item",
    isPinned   ? "pinned"   : "",
    !injectable ? "nav-only" : "",
    isSelected  ? "selected" : "",
  ].filter(Boolean).join(" ");
  el.style.animationDelay = `${Math.min(num - 1, 8) * 0.03}s`;

  const msgCount      = mem && !isSnippet ? `<span>·</span><span>${mem.messages.length} msgs</span>` : "";
  const platformBadge = showPlatform ? `<span class="platform-badge">${platform}</span>` : "";
  const snippetBadge  = isSnippet    ? `<span class="snippet-badge">snippet</span>` : "";
  const pinBtn        = injectable
    ? `<button class="pin-btn" title="${isPinned ? "Unpin" : "Pin"}">${isPinned ? "★" : "☆"}</button>`
    : `<span style="width:16px;flex-shrink:0;"></span>`;
  const actionIcon    = injectable
    ? `<span class="conv-arrow">→</span>`
    : `<span class="nav-arrow">↗</span>`;
  const checkbox      = injectable
    ? `<label class="conv-check" title="Select to combine with others">
         <input type="checkbox" class="check-input" ${isSelected ? "checked" : ""}/>
         <span class="check-box"></span>
       </label>`
    : "";

  el.innerHTML = `
    ${checkbox}
    <span class="conv-num">${num}</span>
    ${pinBtn}
    <div class="conv-body">
      <div class="conv-title" title="${title}">${title}</div>
      <div class="conv-meta">
        ${platformBadge}${snippetBadge}
        ${mem
          ? `<span>${mem.timestamp}</span>${msgCount}`
          : `<span class="sidebar-label">from sidebar</span>`}
      </div>
    </div>
    ${actionIcon}
  `;

  if (injectable) {
    // Checkbox toggles selection; doesn't inject
    el.querySelector(".conv-check").addEventListener("click", (e) => {
      e.stopPropagation();
      toggleSelect(mem, el);
    });

    el.querySelector(".pin-btn")?.addEventListener("click", (e) => {
      e.stopPropagation();
      togglePin(mem);
    });

    // Row click: if nothing selected yet → inject immediately.
    //            If items are already selected → add this one to selection.
    el.addEventListener("click", (e) => {
      if (e.target.closest(".conv-check, .pin-btn")) return;
      if (selectedIds.size > 0) {
        toggleSelect(mem, el);
      } else {
        injectMemory(mem, el);
      }
    });
  } else {
    el.addEventListener("click", () => navigateTo(url, tabId));
  }

  return el;
}

// ── Actions ────────────────────────────────────────────────────────────────────

function togglePin(mem) {
  mem.pinned = !mem.pinned;
  chrome.runtime.sendMessage({ type: "UPDATE_MEMORY", id: mem.id, changes: { pinned: mem.pinned } });
  renderTabs();
  renderList();
  showToast(mem.pinned ? "Pinned ★" : "Unpinned");
}

function injectMemory(mem, el) {
  const text = injectMode === "summary" ? buildSummary(mem) : buildBriefing(mem);
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (!tab) { copyFallback(text); return; }
    chrome.tabs.sendMessage(tab.id, { type: "INJECT_CONTEXT", text }, (res) => {
      if (chrome.runtime.lastError || !res?.success) {
        copyFallback(text);
      } else {
        chrome.runtime.sendMessage({ type: "BUMP_ANALYTIC", key: "injects" });
        el?.classList.add("flashing");
        setTimeout(() => el?.classList.remove("flashing"), 450);
        showToast(injectMode === "summary" ? "Summary injected ✓" : "Context injected ✓");
        setTimeout(() => window.close(), 900);
      }
    });
  });
}

function copyFallback(text) {
  navigator.clipboard.writeText(text)
    .then(() => showToast("Copied — paste into your chat"))
    .catch(() => showToast("Could not copy"));
}

function navigateTo(url, tabId) {
  if (!url) return;
  if (tabId) {
    chrome.tabs.update(tabId, { url, active: true });
  } else {
    chrome.tabs.create({ url });
  }
  window.close();
}

function pickRandom() {
  const injectable = currentItems.filter((i) => !!i.mem);
  const pool = injectable.length ? injectable : currentItems;
  if (!pool.length) return;

  const idx  = Math.floor(Math.random() * pool.length);
  const item = pool[idx];
  const allEls = convList.querySelectorAll(".conv-item");
  // Find matching DOM element index
  const domIdx = currentItems.indexOf(item);
  if (allEls[domIdx]) {
    allEls[domIdx].classList.add("flashing");
    setTimeout(() => {
      allEls[domIdx].classList.remove("flashing");
      if (item.mem) injectMemory(item.mem, allEls[domIdx]);
      else navigateTo(item.url, item.tabId);
    }, 450);
  }
}

// ── Init ───────────────────────────────────────────────────────────────────────

async function init() {
  const { llm_picker_enabled: isOn = false } =
    await chrome.storage.local.get("llm_picker_enabled");
  toggleInput.checked = isOn;
  applyToggleUI(isOn);

  if (isOn) {
    offState.classList.add("hidden");
    mainPanel.classList.remove("hidden");
    await loadAll();
  }
}

// ── Events ─────────────────────────────────────────────────────────────────────

toggleInput.addEventListener("change", async () => {
  const isOn = toggleInput.checked;
  await chrome.storage.local.set({ llm_picker_enabled: isOn });
  applyToggleUI(isOn);
  if (isOn) {
    offState.classList.add("hidden");
    mainPanel.classList.remove("hidden");
    await loadAll();
  } else {
    mainPanel.classList.add("hidden");
    offState.classList.remove("hidden");
  }
});

searchInput.addEventListener("input", () => {
  searchQuery = searchInput.value.trim();
  clearSearch.classList.toggle("hidden", !searchQuery);
  renderList();
});

clearSearch.addEventListener("click", () => {
  searchInput.value = "";
  searchQuery = "";
  clearSearch.classList.add("hidden");
  searchInput.focus();
  renderList();
});

modeFullBtn.addEventListener("click",    () => setMode("full"));
modeSummaryBtn.addEventListener("click", () => setMode("summary"));
randomBtn.addEventListener("click", pickRandom);
syncBtn.addEventListener("click", syncAll);
clearSelection.addEventListener("click", clearAll);

useSelected.addEventListener("click", () => {
  if (!selectedIds.size) return;

  // Collect the full memory objects for all selected IDs
  const allStored = LLMS.flatMap((llm) => platformData[llm.name]?.stored || []);
  const selected  = [...selectedIds]
    .map((id) => allStored.find((m) => m.id === id))
    .filter(Boolean);

  if (!selected.length) { showToast("No injectable items selected"); return; }

  // Build merged or single briefing
  const text = selected.length === 1
    ? (injectMode === "summary" ? buildSummary(selected[0]) : buildBriefing(selected[0]))
    : buildMergedBriefing(selected);

  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (!tab) { copyFallback(text); return; }
    chrome.tabs.sendMessage(tab.id, { type: "INJECT_CONTEXT", text }, (res) => {
      if (chrome.runtime.lastError || !res?.success) {
        copyFallback(text);
      } else {
        chrome.runtime.sendMessage({ type: "BUMP_ANALYTIC", key: "injects" });
        selectedIds.clear();
        showToast(
          selected.length === 1
            ? "Context injected ✓"
            : `${selected.length} conversations merged & injected ✓`
        );
        setTimeout(() => window.close(), 900);
      }
    });
  });
});

init();
