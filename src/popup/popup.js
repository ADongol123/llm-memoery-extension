import { buildBriefing, buildSummary } from "../utils/shared.js";

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
const toast          = $("toast");
const searchInput    = $("searchInput");
const clearSearch    = $("clearSearch");
const modeFullBtn    = $("modeFullBtn");
const modeSummaryBtn = $("modeSummaryBtn");

const PLATFORMS = ["Claude", "ChatGPT", "Gemini", "Grok", "Perplexity"];

let allMemories  = [];
let activeTab    = "All";
let searchQuery  = "";
let injectMode   = "full";   // "full" | "summary"
let currentItems = [];       // items currently visible, for random pick

// ── Toast ──────────────────────────────────────────────────────────────────────

function showToast(msg) {
  clearTimeout(showToast._t);
  toast.textContent = msg;
  toast.classList.remove("hidden");
  void toast.offsetWidth;
  showToast._t = setTimeout(() => toast.classList.add("hidden"), 2500);
}

// ── Toggle UI ──────────────────────────────────────────────────────────────────

function applyToggleUI(isOn) {
  statusDot.className = `dot ${isOn ? "dot-on" : "dot-off"}`;
  statusText.textContent = isOn ? "Picker is active" : "Picker is off";
}

// ── Inject mode ────────────────────────────────────────────────────────────────

function setMode(mode) {
  injectMode = mode;
  modeFullBtn.classList.toggle("active", mode === "full");
  modeSummaryBtn.classList.toggle("active", mode === "summary");
}

// ── Filtering ──────────────────────────────────────────────────────────────────

function getFiltered() {
  let mems = activeTab === "All"
    ? allMemories
    : allMemories.filter((m) => m.platform === activeTab);

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    mems = mems.filter(
      (m) =>
        m.title.toLowerCase().includes(q) ||
        m.platform.toLowerCase().includes(q) ||
        (m.tags || []).some((t) => t.toLowerCase().includes(q)) ||
        m.messages.some((msg) => msg.content.toLowerCase().includes(q))
    );
  }

  // Pinned first, then by recency
  return mems.slice().sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return (b.updatedAt || 0) - (a.updatedAt || 0);
  });
}

function platformsWithData() {
  const found = new Set(allMemories.map((m) => m.platform));
  return PLATFORMS.filter((p) => found.has(p));
}

// ── Render tabs ────────────────────────────────────────────────────────────────

function renderTabs() {
  tabBar.innerHTML = "";
  ["All", ...platformsWithData()].forEach((label) => {
    const btn = document.createElement("button");
    btn.className = "tab" + (activeTab === label ? " active" : "");
    btn.textContent = label;
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

  const mems = getFiltered();

  if (!mems.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = searchQuery
      ? `No results for "${searchQuery}"`
      : activeTab === "All"
        ? "No conversations saved yet. Use an AI chat and they'll appear here."
        : `No saved conversations from ${activeTab} yet.`;
    convList.appendChild(empty);
    return;
  }

  const pinned   = mems.filter((m) => m.pinned);
  const unpinned = mems.filter((m) => !m.pinned);
  const recent   = unpinned.slice(0, 5);
  const older    = unpinned.slice(5);
  let   counter  = 1;

  // Pinned section
  if (pinned.length) {
    appendLabel("Pinned ★");
    pinned.forEach((m) => {
      convList.appendChild(makeItem(m, counter++));
      currentItems.push(m);
    });
  }

  // Recent section label only if there's also an older section
  if (older.length) appendLabel("Recent");

  recent.forEach((m) => {
    convList.appendChild(makeItem(m, counter++));
    currentItems.push(m);
  });

  // Older section
  if (older.length) {
    const div = document.createElement("div");
    div.className = "older-divider";
    div.innerHTML = `<div class="older-line"></div><span class="older-text">Older</span><div class="older-line"></div>`;
    convList.appendChild(div);

    older.forEach((m) => {
      convList.appendChild(makeItem(m, counter++));
      currentItems.push(m);
    });
  }
}

function appendLabel(text) {
  const el = document.createElement("div");
  el.className = "section-label";
  el.textContent = text;
  convList.appendChild(el);
}

// ── Build a single conv item ───────────────────────────────────────────────────

function makeItem(mem, num) {
  const item = document.createElement("div");
  item.className = "conv-item" + (mem.pinned ? " pinned" : "");
  item.style.animationDelay = `${Math.min(num - 1, 8) * 0.035}s`;

  const showPlatform = activeTab === "All";

  item.innerHTML = `
    <span class="conv-num">${num}</span>
    <button class="pin-btn" title="${mem.pinned ? "Unpin" : "Pin to top"}">${mem.pinned ? "★" : "☆"}</button>
    <div class="conv-body">
      <div class="conv-title" title="${mem.title}">${mem.title}</div>
      <div class="conv-meta">
        ${showPlatform ? `<span class="platform-badge">${mem.platform}</span>` : ""}
        ${mem.isSnippet ? `<span class="snippet-badge">snippet</span>` : ""}
        <span>${mem.timestamp}</span>
        ${!mem.isSnippet ? `<span>·</span><span>${mem.messages.length} msgs</span>` : ""}
      </div>
    </div>
    <span class="conv-arrow">→</span>
  `;

  item.querySelector(".pin-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    togglePin(mem);
  });

  item.addEventListener("click", () => injectMemory(mem, item));
  return item;
}

// ── Pin toggle ─────────────────────────────────────────────────────────────────

function togglePin(mem) {
  mem.pinned = !mem.pinned;
  chrome.runtime.sendMessage(
    { type: "UPDATE_MEMORY", id: mem.id, changes: { pinned: mem.pinned } }
  );
  renderTabs();
  renderList();
  showToast(mem.pinned ? "Pinned ★" : "Unpinned");
}

// ── Inject ─────────────────────────────────────────────────────────────────────

function injectMemory(mem, itemEl) {
  const text = injectMode === "summary" ? buildSummary(mem) : buildBriefing(mem);

  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (!tab) { copyFallback(text); return; }

    chrome.tabs.sendMessage(tab.id, { type: "INJECT_CONTEXT", text }, (res) => {
      if (chrome.runtime.lastError || !res?.success) {
        copyFallback(text);
      } else {
        chrome.runtime.sendMessage({ type: "BUMP_ANALYTIC", key: "injects" });
        if (itemEl) {
          itemEl.classList.add("flashing");
          setTimeout(() => itemEl.classList.remove("flashing"), 450);
        }
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

// ── Random ─────────────────────────────────────────────────────────────────────

function pickRandom() {
  if (!currentItems.length) return;
  const idx  = Math.floor(Math.random() * currentItems.length);
  const mem  = currentItems[idx];
  const item = convList.querySelectorAll(".conv-item")[idx];
  if (item) {
    item.classList.add("flashing");
    setTimeout(() => { item.classList.remove("flashing"); injectMemory(mem, item); }, 450);
  } else {
    injectMemory(mem, null);
  }
}

// ── Load ───────────────────────────────────────────────────────────────────────

async function loadAndRender() {
  const res = await new Promise((r) =>
    chrome.runtime.sendMessage({ type: "GET_MEMORIES" }, r)
  );
  allMemories = (res?.data || []).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  countBadge.textContent = `${allMemories.length} saved`;
  countBadge.classList.toggle("hidden", allMemories.length === 0);

  renderTabs();
  renderList();
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
    await loadAndRender();
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
    await loadAndRender();
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

init();
