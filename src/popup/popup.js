import { buildBriefing } from "../utils/shared.js";

const $ = (id) => document.getElementById(id);

const toggleInput = $("toggleInput");
const statusDot   = $("statusDot");
const statusText  = $("statusText");
const countBadge  = $("countBadge");
const offState    = $("offState");
const mainPanel   = $("mainPanel");
const tabBar      = $("tabBar");
const convList    = $("convList");
const randomBtn   = $("randomBtn");
const toast       = $("toast");

const PLATFORMS = ["Claude", "ChatGPT", "Gemini", "Grok", "Perplexity"];

let allMemories   = [];
let activeTab     = "All";
let currentItems  = []; // flat list currently rendered, for random pick

// ── Toast ──────────────────────────────────────────────────────────────────────

function showToast(msg) {
  clearTimeout(showToast._t);
  toast.textContent = msg;
  toast.classList.remove("hidden");
  void toast.offsetWidth; // re-trigger animation
  showToast._t = setTimeout(() => toast.classList.add("hidden"), 2500);
}

// ── Toggle UI ──────────────────────────────────────────────────────────────────

function applyToggleUI(isOn) {
  statusDot.className = `dot ${isOn ? "dot-on" : "dot-off"}`;
  statusText.textContent = isOn ? "Picker is active" : "Picker is off";
}

// ── Data helpers ───────────────────────────────────────────────────────────────

function getTabMemories(tab) {
  if (tab === "All") return allMemories;
  return allMemories.filter((m) => m.platform === tab);
}

function platformsWithData() {
  const found = new Set(allMemories.map((m) => m.platform));
  return PLATFORMS.filter((p) => found.has(p));
}

// ── Render tabs ────────────────────────────────────────────────────────────────

function renderTabs() {
  tabBar.innerHTML = "";
  const tabs = ["All", ...platformsWithData()];
  tabs.forEach((label) => {
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

  const mems = getTabMemories(activeTab);

  if (!mems.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent =
      activeTab === "All"
        ? "No conversations saved yet. Use an AI chat and they'll appear here."
        : `No saved conversations from ${activeTab} yet.`;
    convList.appendChild(empty);
    return;
  }

  const recent = mems.slice(0, 5);
  const older  = mems.slice(5);

  // Recent section label
  if (older.length > 0) {
    const lbl = document.createElement("div");
    lbl.className = "section-label";
    lbl.textContent = "Recent";
    convList.appendChild(lbl);
  }

  recent.forEach((mem, i) => {
    convList.appendChild(makeItem(mem, i + 1));
    currentItems.push(mem);
  });

  if (older.length > 0) {
    // Older divider
    const divider = document.createElement("div");
    divider.className = "older-divider";
    divider.innerHTML = `
      <div class="older-divider-line"></div>
      <span class="older-divider-text">Older</span>
      <div class="older-divider-line"></div>
    `;
    convList.appendChild(divider);

    older.forEach((mem, i) => {
      convList.appendChild(makeItem(mem, recent.length + i + 1));
      currentItems.push(mem);
    });
  }
}

function makeItem(mem, num) {
  const item = document.createElement("div");
  item.className = "conv-item";
  item.style.animationDelay = `${Math.min(num - 1, 7) * 0.04}s`;

  const showPlatform = activeTab === "All";

  item.innerHTML = `
    <span class="conv-num">${num}</span>
    <div class="conv-body">
      <div class="conv-title" title="${mem.title}">${mem.title}</div>
      <div class="conv-meta">
        ${showPlatform ? `<span class="platform-badge">${mem.platform}</span>` : ""}
        <span>${mem.timestamp}</span>
        <span>·</span>
        <span>${mem.messages.length} msgs</span>
      </div>
    </div>
    <span class="conv-arrow">→</span>
  `;

  item.addEventListener("click", () => injectMemory(mem, item));
  return item;
}

// ── Inject ─────────────────────────────────────────────────────────────────────

function injectMemory(mem, itemEl) {
  const briefing = buildBriefing(mem);

  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (!tab) {
      copyFallback(briefing);
      return;
    }
    chrome.tabs.sendMessage(tab.id, { type: "INJECT_CONTEXT", text: briefing }, (res) => {
      if (chrome.runtime.lastError || !res?.success) {
        copyFallback(briefing);
      } else {
        chrome.runtime.sendMessage({ type: "BUMP_ANALYTIC", key: "injects" });
        if (itemEl) {
          itemEl.classList.add("flashing");
          setTimeout(() => itemEl.classList.remove("flashing"), 450);
        }
        showToast("Context injected ✓");
        setTimeout(() => window.close(), 900);
      }
    });
  });
}

function copyFallback(text) {
  navigator.clipboard.writeText(text).then(() => {
    showToast("Copied to clipboard — paste into your chat");
  }).catch(() => showToast("Could not copy"));
}

// ── Random ─────────────────────────────────────────────────────────────────────

function pickRandom() {
  if (!currentItems.length) return;
  const idx  = Math.floor(Math.random() * currentItems.length);
  const mem  = currentItems[idx];
  const item = convList.querySelectorAll(".conv-item")[idx];

  if (item) {
    item.classList.add("flashing");
    setTimeout(() => {
      item.classList.remove("flashing");
      injectMemory(mem, item);
    }, 450);
  } else {
    injectMemory(mem, null);
  }
}

// ── Load & render everything ──────────────────────────────────────────────────

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

randomBtn.addEventListener("click", pickRandom);

init();
