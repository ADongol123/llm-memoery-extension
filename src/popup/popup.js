import LZString from "lz-string";
import { makeTitle, buildBriefing } from "../utils/shared.js";

const SHARE_BASE = "https://aayushdongol.github.io/llm-memoery-extension/share";

// ── State ─────────────────────────────────────────────────────────────────────

const state = {
  memories: [],
  currentWorkspace: "__all__",
  searchQuery: "",
  currentPlatform: null,
  analytics: { saves: 0, injects: 0 },
  settings: {},
};

// ── DOM refs ──────────────────────────────────────────────────────────────────

const $ = (id) => document.getElementById(id);
const saveBtn        = $("saveBtn");
const exportBtn      = $("exportBtn");
const importInput    = $("importInput");
const searchInput    = $("searchInput");
const workspaceTabs  = $("workspaceTabs");
const statusEl       = $("status");
const memoryListEl   = $("memoryList");
const emptyStateEl   = $("emptyState");
const analyticsEl    = $("analytics");
const platformBadge  = $("platformBadge");
const upgradeBanner  = $("upgradeBanner");

// ── Helpers ───────────────────────────────────────────────────────────────────

function showStatus(msg, type = "success") {
  statusEl.textContent = msg;
  statusEl.className = `status ${type}`;
  statusEl.classList.remove("hidden");
  setTimeout(() => statusEl.classList.add("hidden"), 3500);
}

function sendMsg(type, payload = {}) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, ...payload }, resolve);
  });
}

function getWorkspaces() {
  const ws = new Set(state.memories.map((m) => m.workspace || "Default"));
  return ["Default", ...Array.from(ws).filter((w) => w !== "Default").sort()];
}

function filteredMemories() {
  const q = state.searchQuery.toLowerCase();
  return state.memories.filter((m) => {
    const wsMatch =
      state.currentWorkspace === "__all__" ||
      (m.workspace || "Default") === state.currentWorkspace;
    if (!wsMatch) return false;
    if (!q) return true;
    return (
      m.title.toLowerCase().includes(q) ||
      (m.tags || []).some((t) => t.toLowerCase().includes(q)) ||
      m.platform.toLowerCase().includes(q) ||
      m.messages.some((msg) => msg.content.toLowerCase().includes(q))
    );
  });
}

// ── Workspace tabs ────────────────────────────────────────────────────────────

function renderWorkspaceTabs() {
  const workspaces = getWorkspaces();
  workspaceTabs.innerHTML = "";

  const allChip = makeWsChip("All", "__all__");
  workspaceTabs.appendChild(allChip);

  workspaces.forEach((ws) => {
    workspaceTabs.appendChild(makeWsChip(ws, ws));
  });

  // "+ Add" chip
  const addChip = document.createElement("button");
  addChip.className = "ws-chip add-ws";
  addChip.textContent = "+ Add";
  addChip.addEventListener("click", () => startAddWorkspace(addChip));
  workspaceTabs.appendChild(addChip);
}

function makeWsChip(label, value) {
  const chip = document.createElement("button");
  chip.className = "ws-chip" + (state.currentWorkspace === value ? " active" : "");
  chip.textContent = label;
  chip.addEventListener("click", () => {
    state.currentWorkspace = value;
    render();
  });
  return chip;
}

function startAddWorkspace(addChip) {
  const input = document.createElement("input");
  input.className = "ws-name-input";
  input.placeholder = "Name…";
  addChip.replaceWith(input);
  input.focus();

  const commit = () => {
    const name = input.value.trim();
    if (name && name !== "Default") {
      state.currentWorkspace = name;
    }
    render();
  };
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") commit();
    if (e.key === "Escape") render();
  });
  input.addEventListener("blur", commit);
}

// ── Memory card ───────────────────────────────────────────────────────────────

function renderMemoryCard(mem) {
  const card = document.createElement("div");
  card.className = "memory-card" + (mem.isAutoSave ? " auto-saved" : "");
  card.dataset.id = mem.id;

  // Title row
  const top = document.createElement("div");
  top.className = "memory-card-top";

  const titleEl = document.createElement("div");
  titleEl.className = "memory-title";
  titleEl.textContent = mem.title;
  titleEl.title = "Double-click to rename";
  titleEl.addEventListener("dblclick", () => startTitleEdit(titleEl, mem));

  const actions = document.createElement("div");
  actions.className = "card-actions";
  actions.innerHTML = `
    <button class="card-btn inject-btn" title="Inject into current chat">↗</button>
    <button class="card-btn copy-btn" title="Copy briefing">⎘</button>
    <button class="card-btn share-btn" title="Copy share link">🔗</button>
    <button class="card-btn danger delete-btn" title="Delete">✕</button>
  `;

  top.appendChild(titleEl);
  top.appendChild(actions);

  // Tags row
  const tagsRow = document.createElement("div");
  tagsRow.className = "memory-tags";
  renderTags(tagsRow, mem);

  // Meta row
  const meta = document.createElement("div");
  meta.className = "memory-meta";
  const canSync = state.currentPlatform === mem.platform;
  meta.innerHTML = `
    <span class="platform-tag">${mem.platform}</span>
    <span>·</span>
    <span>${mem.timestamp}</span>
    <span>·</span>
    <span>${mem.messages.length} msgs</span>
    ${canSync
      ? `<button class="sync-btn" title="Refresh from current tab">↺ Sync</button>`
      : ""}
  `;

  card.appendChild(top);
  card.appendChild(tagsRow);
  card.appendChild(meta);

  // Events
  actions.querySelector(".inject-btn").addEventListener("click", () => injectMemory(mem));
  actions.querySelector(".copy-btn").addEventListener("click", () => {
    navigator.clipboard.writeText(buildBriefing(mem)).then(() => {
      showStatus("Briefing copied!");
      sendMsg("BUMP_ANALYTIC", { key: "injects" });
    });
  });
  actions.querySelector(".share-btn").addEventListener("click", () => shareMemory(mem));
  actions.querySelector(".delete-btn").addEventListener("click", () => deleteMemory(mem.id));

  const syncBtn = meta.querySelector(".sync-btn");
  if (syncBtn) syncBtn.addEventListener("click", () => syncMemory(mem));

  return card;
}

// ── Inline title edit ─────────────────────────────────────────────────────────

function startTitleEdit(titleEl, mem) {
  const input = document.createElement("input");
  input.className = "memory-title-input";
  input.value = mem.title;
  titleEl.replaceWith(input);
  input.focus();
  input.select();

  const commit = () => {
    const newTitle = input.value.trim() || mem.title;
    if (newTitle !== mem.title) {
      mem.title = newTitle;
      sendMsg("UPDATE_MEMORY", { id: mem.id, changes: { title: newTitle } });
    }
    render();
  };
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") render(); });
  input.addEventListener("blur", commit);
}

// ── Tags ──────────────────────────────────────────────────────────────────────

function renderTags(container, mem) {
  container.innerHTML = "";
  (mem.tags || []).forEach((tag) => {
    const chip = document.createElement("span");
    chip.className = "tag-chip";
    chip.textContent = `#${tag}`;
    chip.title = "Click to remove";
    chip.addEventListener("click", () => removeTag(mem, tag));
    container.appendChild(chip);
  });

  const addBtn = document.createElement("button");
  addBtn.className = "tag-add";
  addBtn.textContent = "+ tag";
  addBtn.addEventListener("click", () => startTagAdd(container, addBtn, mem));
  container.appendChild(addBtn);
}

function startTagAdd(container, addBtn, mem) {
  const input = document.createElement("input");
  input.className = "tag-input";
  input.placeholder = "tag name";
  addBtn.replaceWith(input);
  input.focus();

  const commit = () => {
    const tag = input.value.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    if (tag && !(mem.tags || []).includes(tag)) {
      const newTags = [...(mem.tags || []), tag];
      mem.tags = newTags;
      sendMsg("UPDATE_MEMORY", { id: mem.id, changes: { tags: newTags } });
    }
    renderTags(container, mem);
  };
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") renderTags(container, mem); });
  input.addEventListener("blur", commit);
}

function removeTag(mem, tag) {
  const newTags = (mem.tags || []).filter((t) => t !== tag);
  mem.tags = newTags;
  sendMsg("UPDATE_MEMORY", { id: mem.id, changes: { tags: newTags } });
  // Re-render just the tags on this card without a full reload
  const card = memoryListEl.querySelector(`[data-id="${mem.id}"]`);
  if (card) {
    const tagsRow = card.querySelector(".memory-tags");
    if (tagsRow) renderTags(tagsRow, mem);
  }
}

// ── Actions ───────────────────────────────────────────────────────────────────

function injectMemory(mem) {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (!tab) return;
    chrome.tabs.sendMessage(
      tab.id,
      { type: "INJECT_CONTEXT", text: buildBriefing(mem) },
      (res) => {
        if (chrome.runtime.lastError || !res?.success) {
          navigator.clipboard.writeText(buildBriefing(mem)).then(() => {
            showStatus("Copied to clipboard (injection unavailable here).");
          });
        } else {
          showStatus("Context injected!");
          // Content script already bumped the analytic inside INJECT_CONTEXT handler
          window.close();
        }
      }
    );
  });
}

function deleteMemory(id) {
  sendMsg("DELETE_MEMORY", { id }).then(() => loadAll());
}

function shareMemory(mem) {
  const payload = JSON.stringify({
    v: 1,
    title: mem.title,
    platform: mem.platform,
    timestamp: mem.timestamp,
    messages: mem.messages,
  });
  const compressed = LZString.compressToEncodedURIComponent(payload);
  const url = `${SHARE_BASE}#${compressed}`;
  navigator.clipboard.writeText(url).then(() => {
    showStatus("Share link copied to clipboard!");
  }).catch(() => {
    showStatus("Could not copy link.", "error");
  });
}

function syncMemory(mem) {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (!tab) return;
    chrome.tabs.sendMessage(tab.id, { type: "GET_CONVERSATION" }, (res) => {
      if (chrome.runtime.lastError || !res?.success || !res.messages?.length) {
        showStatus("Could not read the current conversation.", "error");
        return;
      }
      const changes = {
        messages: res.messages,
        title: makeTitle(res.messages),
        updatedAt: Date.now(),
      };
      mem.messages = changes.messages;
      mem.title = changes.title;
      sendMsg("UPDATE_MEMORY", { id: mem.id, changes }).then(() => {
        showStatus(`Synced — ${changes.messages.length} messages.`);
        render();
      });
    });
  });
}

function saveCurrentConversation() {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (!tab) return;
    chrome.tabs.sendMessage(tab.id, { type: "GET_CONVERSATION" }, (response) => {
      if (chrome.runtime.lastError || !response?.success) {
        showStatus("Could not read this page. Open an AI chat first.", "error");
        return;
      }
      const { messages, platform } = response;
      if (!messages?.length) {
        showStatus("No conversation found on this page.", "error");
        return;
      }

      const payload = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        title: makeTitle(messages),
        tags: [],
        workspace: state.currentWorkspace === "__all__" ? "Default" : state.currentWorkspace,
        messages,
        platform: platform || "Unknown",
        url: tab.url,
        timestamp: new Date().toLocaleString(undefined, {
          month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
        }),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      sendMsg("SAVE_MEMORY", { payload }).then((res) => {
        if (res?.limitReached) {
          upgradeBanner.classList.remove("hidden");
          showStatus("Free limit reached (5 memories).", "error");
          return;
        }
        if (res?.success) {
          showStatus(`Saved — ${messages.length} messages.`);
          loadAll();
        } else {
          showStatus("Failed to save.", "error");
        }
      });
    });
  });
}

// ── Export / Import ───────────────────────────────────────────────────────────

function exportMemories() {
  const data = {
    version: "2.1.0",
    exportedAt: new Date().toISOString(),
    memories: state.memories,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `llm-memory-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importFromFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      const imported = Array.isArray(data.memories) ? data.memories : [];
      if (!imported.length) { showStatus("No memories found in file.", "error"); return; }
      sendMsg("IMPORT_MEMORIES", { memories: imported }).then((res) => {
        if (res?.success) {
          showStatus(`Imported ${res.imported} new memor${res.imported === 1 ? "y" : "ies"}.`);
          loadAll();
        }
      });
    } catch (_) {
      showStatus("Invalid export file.", "error");
    }
  };
  reader.readAsText(file);
}

// ── Render ────────────────────────────────────────────────────────────────────

function render() {
  renderWorkspaceTabs();

  const shown = filteredMemories();
  memoryListEl.innerHTML = "";

  if (shown.length === 0) {
    emptyStateEl.classList.remove("hidden");
  } else {
    emptyStateEl.classList.add("hidden");
    shown.forEach((mem) => memoryListEl.appendChild(renderMemoryCard(mem)));
  }

  analyticsEl.textContent =
    state.analytics.saves || state.analytics.injects
      ? `${state.analytics.saves} saves · ${state.analytics.injects} injects`
      : "";
}

// ── Load ──────────────────────────────────────────────────────────────────────

async function loadAll() {
  const [memRes, analyticsRes] = await Promise.all([
    sendMsg("GET_MEMORIES"),
    sendMsg("GET_ANALYTICS"),
  ]);
  state.memories  = memRes?.data || [];
  state.analytics = analyticsRes?.data || { saves: 0, injects: 0 };

  // Show upgrade banner if already at limit
  const { llm_settings: settings = {} } = await chrome.storage.local.get("llm_settings");
  state.settings = settings;
  upgradeBanner.classList.toggle(
    "hidden",
    settings.isPro || state.memories.length < 5
  );

  render();
}

function detectPlatform() {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (!tab) return;
    chrome.tabs.sendMessage(tab.id, { type: "GET_PLATFORM" }, (res) => {
      if (chrome.runtime.lastError || !res?.platform) return;
      state.currentPlatform = res.platform;
      platformBadge.textContent = res.platform;
      platformBadge.classList.remove("hidden");
      // Re-render so Sync buttons appear now that we know the platform
      render();
    });
  });
}

// ── Events ────────────────────────────────────────────────────────────────────

saveBtn.addEventListener("click", saveCurrentConversation);
exportBtn.addEventListener("click", exportMemories);
importInput.addEventListener("change", (e) => {
  if (e.target.files[0]) importFromFile(e.target.files[0]);
  e.target.value = "";
});
searchInput.addEventListener("input", (e) => {
  state.searchQuery = e.target.value;
  render();
});

// ── Init ──────────────────────────────────────────────────────────────────────

detectPlatform();
loadAll();
