// Popup entry point — full TypeScript UI.
// Architecture: all state in memory, rendered to DOM on change.
// No framework — vanilla TS keeps the bundle tiny.

import type {
  Conversation,
  ContextPackage,
  ExtensionSettings,
  AuthSession,
  BriefingMode,
  Platform,
} from "../types.js";
import { buildBriefing, buildMergedBriefing, DEFAULT_SETTINGS } from "../types.js";

// ── Constants ──────────────────────────────────────────────────────────────────

const PLATFORMS: Platform[] = ["Claude", "ChatGPT", "Gemini", "Grok", "DeepSeek"];

// ── State ──────────────────────────────────────────────────────────────────────

let conversations:   Conversation[]   = [];
let packages:        ContextPackage[] = [];
let settings:        ExtensionSettings = DEFAULT_SETTINGS;
let session:         AuthSession | null = null;
let activeTab:       Platform | "All" = "All";
let viewMode:        "conversations" | "packages" = "conversations";
let searchQuery:     string = "";
let briefingMode:    BriefingMode = "full";
let selectedItems:   Map<string, Conversation> = new Map();
let isGeneratingPkg  = false;
let isSyncing        = false;
let sidebarCache:    Record<string, Array<{ title: string; url: string }>> = {};

// ── DOM refs ───────────────────────────────────────────────────────────────────

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const toggleInput    = $<HTMLInputElement>("toggleInput");
const statusText     = $("statusText");
const offState       = $("offState");
const mainPanel      = $("mainPanel");
const settingsPanel  = $("settingsPanel");
const settingsBtn    = $("settingsBtn");
const settingsBack   = $("settingsBack");
const searchInput    = $<HTMLInputElement>("searchInput");
const clearSearch    = $("clearSearch");
const tabBar         = $("tabBar");
const modeConvBtn    = $("modeConvBtn");
const modePkgBtn     = $("modePkgBtn");
const generatePkgBtn = $("generatePkgBtn");
const syncBtn        = $("syncBtn");
const selectionBar   = $("selectionBar");
const selectionCount = $("selectionCount");
const clearSelection = $("clearSelection");
const useSelected    = $("useSelected");
const itemList       = $("itemList");
const toast          = $("toast");
const confirmModal   = $("confirmModal");
const confirmList    = $("confirmList");
const confirmCancel  = $("confirmCancel");
const confirmInject  = $("confirmInject");
const selectHint     = $("selectHint");

// Settings panel
const autoSaveToggle = $<HTMLInputElement>("autoSaveToggle");
const pickerToggle   = $<HTMLInputElement>("pickerToggle");
const emailInput     = $<HTMLInputElement>("emailInput");
const signInBtn      = $("signInBtn");
const signInMsg      = $("signInMsg");
const authSignedOut  = $("authSignedOut");
const authSignedIn   = $("authSignedIn");
const signedInEmail  = $("signedInEmail");
const signOutBtn     = $("signOutBtn");
const clearAllBtn    = $("clearAllBtn");

// ── Toast ──────────────────────────────────────────────────────────────────────

let toastTimer: ReturnType<typeof setTimeout> | null = null;

function showToast(msg: string): void {
  if (toastTimer) clearTimeout(toastTimer);
  toast.textContent = msg;
  toast.classList.remove("hidden");
  void toast.offsetWidth;
  toastTimer = setTimeout(() => toast.classList.add("hidden"), 2500);
}

// ── Messaging ──────────────────────────────────────────────────────────────────

function send<T = unknown>(message: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (res) => {
      if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
      else resolve(res as T);
    });
  });
}

// ── Data loading ───────────────────────────────────────────────────────────────

async function loadAll(): Promise<void> {
  const [convRes, pkgRes, settRes, authRes, cacheRes] = await Promise.all([
    send<{ success: boolean; data: Conversation[] }>({ type: "GET_CONVERSATIONS" }),
    send<{ success: boolean; data: ContextPackage[] }>({ type: "GET_PACKAGES" }),
    send<{ success: boolean; data: ExtensionSettings }>({ type: "GET_SETTINGS" }),
    send<{ success: boolean; data: AuthSession | null }>({ type: "GET_AUTH" }),
    send<{ success: boolean; data: Record<string, Array<{ title: string; url: string }>> }>({ type: "GET_SIDEBAR_CACHE" }),
  ]);

  if (convRes.success) conversations = convRes.data ?? [];
  if (pkgRes.success)  packages      = pkgRes.data ?? [];
  if (settRes.success) settings      = settRes.data ?? DEFAULT_SETTINGS;
  if (authRes.success) session       = authRes.data;
  if (cacheRes.success) sidebarCache = cacheRes.data ?? {};

  briefingMode = settings.defaultBriefingMode ?? "full";
  render();
}

// ── Tab logic ──────────────────────────────────────────────────────────────────

function getFilteredConversations(): Conversation[] {
  let items = activeTab === "All"
    ? conversations
    : conversations.filter((c) => c.platform === activeTab);

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    items = items.filter((c) =>
      c.title.toLowerCase().includes(q) ||
      c.platform.toLowerCase().includes(q) ||
      (c.topics ?? []).some((t) => t.toLowerCase().includes(q)) ||
      (c.keyPoints ?? []).some((k) => k.toLowerCase().includes(q)) ||
      c.rawMessages.some((m) => m.content.toLowerCase().includes(q))
    );
  }

  return items.sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
  });
}

// ── Render ─────────────────────────────────────────────────────────────────────

function render(): void {
  renderTabs();
  if (viewMode === "conversations") renderConversations();
  else renderPackages();
  updateSelectionBar();

  // Show selection hint only when there are conversations and nothing is selected
  const hasItems = conversations.length > 0 || Object.keys(sidebarCache).length > 0;
  selectHint.classList.toggle("hidden", !hasItems || selectedItems.size > 0 || viewMode !== "conversations");
}

function renderTabs(): void {
  tabBar.innerHTML = "";
  const tabs: Array<Platform | "All"> = ["All", ...PLATFORMS];

  tabs.forEach((label) => {
    const btn = document.createElement("button");
    btn.className = `tab${activeTab === label ? " active" : ""}`;

    const savedCount = label === "All"
      ? conversations.length
      : conversations.filter((c) => c.platform === label).length;

    const discoveredCount = label === "All"
      ? Object.values(sidebarCache).reduce((n, arr) => n + arr.length, 0)
      : (sidebarCache[label]?.length ?? 0);

    const total = savedCount + discoveredCount;
    btn.innerHTML = `${label}${total ? ` <span class="tab-count">${total}</span>` : ""}`;
    btn.addEventListener("click", () => {
      activeTab = label;
      render();
    });
    tabBar.appendChild(btn);
  });
}

function renderConversations(): void {
  itemList.innerHTML = "";
  const items = getFilteredConversations();

  // Discovered items from sidebar cache, filtered by active tab
  const discoveredItems = getDiscoveredItems();
  const savedUrls = new Set(conversations.map((c) => c.sourceUrl).filter(Boolean));
  const newDiscovered = discoveredItems.filter((d) => !savedUrls.has(d.url));

  if (!items.length && !newDiscovered.length) {
    renderEmpty();
    return;
  }

  const pinned   = items.filter((c) => c.pinned);
  const unpinned = items.filter((c) => !c.pinned);
  const recent   = unpinned.slice(0, 5);
  const older    = unpinned.slice(5);

  let counter = 1;

  if (pinned.length) {
    appendSectionLabel("Pinned ★");
    pinned.forEach((c) => { itemList.appendChild(makeConvItem(c, counter++)); });
  }

  if (recent.length) {
    if (pinned.length) appendSectionLabel("Recent");
    recent.forEach((c) => { itemList.appendChild(makeConvItem(c, counter++)); });
  }

  if (older.length) {
    appendDivider("Older");
    older.forEach((c) => { itemList.appendChild(makeConvItem(c, counter++)); });
  }

  if (newDiscovered.length) {
    appendDivider("Discovered on your LLMs");
    newDiscovered.forEach((d) => { itemList.appendChild(makeSidebarItem(d)); });
  }
}

function getDiscoveredItems(): Array<{ title: string; url: string; platform: string }> {
  const result: Array<{ title: string; url: string; platform: string }> = [];
  const platformFilter = activeTab === "All" ? null : activeTab;
  for (const [platform, items] of Object.entries(sidebarCache)) {
    if (platformFilter && platform !== platformFilter) continue;
    if (!searchQuery) {
      items.forEach((item) => result.push({ ...item, platform }));
    } else {
      const q = searchQuery.toLowerCase();
      items
        .filter((item) => item.title.toLowerCase().includes(q))
        .forEach((item) => result.push({ ...item, platform }));
    }
  }
  return result;
}

function renderPackages(): void {
  itemList.innerHTML = "";

  if (!packages.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = `
      <div class="empty-icon">⊕</div>
      <div>No Context Packages yet.</div>
      <div class="empty-hint">Select conversations and click "Generate Package".</div>
    `;
    itemList.appendChild(empty);
    return;
  }

  packages.forEach((pkg) => {
    itemList.appendChild(makePkgItem(pkg));
  });
}

function renderEmpty(): void {
  const empty = document.createElement("div");
  empty.className = "empty-state";

  if (searchQuery) {
    empty.innerHTML = `<div class="empty-icon">⊘</div><div>No results for "${escHtml(searchQuery)}"</div>`;
  } else if (activeTab !== "All") {
    empty.innerHTML = `
      <div class="empty-icon">↗</div>
      <div style="font-weight:600;">No ${activeTab} conversations yet</div>
      <div class="empty-hint">Open ${activeTab}, start a chat with a few messages, and they'll appear here automatically.</div>
      <div class="empty-hint" style="margin-top:6px;">Or click <strong>⟳ Sync</strong> to scan your open tabs now.</div>
    `;
  } else {
    empty.innerHTML = `
      <div class="empty-icon">⬡</div>
      <div style="font-weight:600;">No conversations saved yet</div>
      <div class="empty-hint" style="margin-top:8px;">
        <strong>How to get started:</strong>
      </div>
      <ol class="empty-steps">
        <li>Open Claude, ChatGPT, Gemini, Grok, or DeepSeek</li>
        <li>Have a conversation (4+ messages)</li>
        <li>Conversations auto-save every 30 seconds</li>
        <li>Come back here, select one or more, then click <strong>Use selected →</strong></li>
      </ol>
      <div class="empty-hint" style="margin-top:10px;">Already chatting? Click <strong>⟳ Sync</strong> above to import now.</div>
    `;
  }

  itemList.appendChild(empty);
}

function appendSectionLabel(text: string): void {
  const el = document.createElement("div");
  el.className = "section-label";
  el.textContent = text;
  itemList.appendChild(el);
}

function appendDivider(text: string): void {
  const el = document.createElement("div");
  el.className = "older-divider";
  el.innerHTML = `<div class="older-line"></div><span class="older-text">${text}</span><div class="older-line"></div>`;
  itemList.appendChild(el);
}

// ── Conversation item ──────────────────────────────────────────────────────────

function makeConvItem(conv: Conversation, num: number): HTMLElement {
  const key        = conv.id;
  const isSelected = selectedItems.has(key);
  const showPlatform = activeTab === "All";
  const hasAI      = !!conv.processedAt;

  const el = document.createElement("div");
  el.className = [
    "item",
    conv.pinned   ? "pinned"   : "",
    isSelected ? "selected" : "",
  ].filter(Boolean).join(" ");
  el.style.animationDelay = `${Math.min(num - 1, 8) * 0.025}s`;

  const timestamp = new Date(conv.updatedAt).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });

  el.innerHTML = `
    <label class="item-check" title="Select">
      <input type="checkbox" class="check-input" ${isSelected ? "checked" : ""}/>
      <span class="check-box"></span>
    </label>
    <span class="item-num">${num}</span>
    <button class="pin-btn" title="${conv.pinned ? "Unpin" : "Pin"}">${conv.pinned ? "★" : "☆"}</button>
    <div class="item-body">
      <div class="item-title" title="${escHtml(conv.title)}">${escHtml(conv.title)}</div>
      <div class="item-meta">
        ${showPlatform ? `<span class="platform-badge">${conv.platform}</span>` : ""}
        ${conv.isSnippet ? `<span class="snippet-badge">snippet</span>` : ""}
        ${hasAI ? `<span class="ai-badge">✦ AI</span>` : ""}
        <span>${timestamp}</span>
        ${!conv.isSnippet ? `<span>·</span><span>${conv.messageCount} msgs</span>` : ""}
      </div>
    </div>
    <span class="item-arrow">→</span>
  `;

  // Checkbox
  el.querySelector(".item-check")!.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleSelect(conv, el);
  });

  // Pin
  el.querySelector(".pin-btn")!.addEventListener("click", (e) => {
    e.stopPropagation();
    togglePin(conv);
  });

  // Row click
  el.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).closest(".item-check, .pin-btn")) return;
    if (selectedItems.size > 0) {
      toggleSelect(conv, el);
    } else {
      injectConversation(conv, el);
    }
  });

  return el;
}

// ── Sidebar-discovered item (not yet saved) ────────────────────────────────────

function makeSidebarItem(item: { title: string; url: string; platform: string }): HTMLElement {
  const el = document.createElement("div");
  el.className = "item sidebar-item";

  el.innerHTML = `
    <div class="item-body">
      <div class="item-title" title="${escHtml(item.title)}">${escHtml(item.title)}</div>
      <div class="item-meta">
        <span class="platform-badge">${escHtml(item.platform)}</span>
        <span class="discovered-badge">not saved</span>
      </div>
    </div>
    <button class="open-btn" title="Open conversation">Open →</button>
  `;

  el.querySelector(".open-btn")!.addEventListener("click", (e) => {
    e.stopPropagation();
    chrome.tabs.create({ url: item.url });
  });

  el.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).closest(".open-btn")) return;
    chrome.tabs.create({ url: item.url });
  });

  return el;
}

// ── Package item ───────────────────────────────────────────────────────────────

function makePkgItem(pkg: ContextPackage): HTMLElement {
  const el = document.createElement("div");
  el.className = "pkg-item";

  const timestamp = new Date(pkg.createdAt).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });

  const preview = pkg.documentJson?.summary ?? pkg.description ?? "";

  el.innerHTML = `
    <div class="pkg-title">${escHtml(pkg.name)}</div>
    <div class="pkg-meta">${timestamp} · ${pkg.conversationIds?.length ?? 0} conversations</div>
    ${preview ? `<div class="pkg-preview">${escHtml(preview)}</div>` : ""}
    <div class="pkg-actions">
      <button class="pkg-btn inject-btn">Inject →</button>
      <button class="pkg-btn copy-btn">Copy</button>
      <button class="pkg-btn delete-btn">Delete</button>
    </div>
  `;

  el.querySelector(".inject-btn")!.addEventListener("click", (e) => {
    e.stopPropagation();
    injectPackage(pkg);
  });

  el.querySelector(".copy-btn")!.addEventListener("click", (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(pkg.document).then(() => showToast("Copied ✓"));
  });

  el.querySelector(".delete-btn")!.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (!confirm(`Delete "${pkg.name}"?`)) return;
    await send({ type: "DELETE_PACKAGE", id: pkg.id });
    packages = packages.filter((p) => p.id !== pkg.id);
    renderPackages();
    showToast("Package deleted");
  });

  return el;
}

// ── Actions ────────────────────────────────────────────────────────────────────

function toggleSelect(conv: Conversation, el: HTMLElement): void {
  if (selectedItems.has(conv.id)) {
    selectedItems.delete(conv.id);
    el.classList.remove("selected");
    el.querySelector<HTMLInputElement>(".check-input")!.checked = false;
  } else {
    selectedItems.set(conv.id, conv);
    el.classList.add("selected");
    el.querySelector<HTMLInputElement>(".check-input")!.checked = true;
  }
  updateSelectionBar();
}

function clearAllSelections(): void {
  selectedItems.clear();
  itemList.querySelectorAll(".item").forEach((el) => {
    el.classList.remove("selected");
    el.querySelector<HTMLInputElement>(".check-input")!.checked = false;
  });
  updateSelectionBar();
}

function updateSelectionBar(): void {
  const count = selectedItems.size;
  selectionBar.classList.toggle("hidden", count === 0);
  generatePkgBtn.classList.toggle("hidden", count === 0 || viewMode !== "conversations");
  if (count > 0) {
    selectionCount.textContent = `${count} selected`;
    (useSelected as HTMLButtonElement).textContent = `Use all ${count} →`;
  }
}

function togglePin(conv: Conversation): void {
  conv.pinned = !conv.pinned;
  send({ type: "UPDATE_CONVERSATION", id: conv.id, changes: { pinned: conv.pinned } });
  render();
  showToast(conv.pinned ? "Pinned ★" : "Unpinned");
}

// ── Confirmation modal ─────────────────────────────────────────────────────────

let pendingInjectConvs: Conversation[] = [];
let pendingInjectMode: BriefingMode = "full";

function showConfirmModal(convs: Conversation[], onConfirm: (mode: BriefingMode) => void): void {
  pendingInjectConvs = convs;
  pendingInjectMode  = briefingMode;

  // Populate list
  confirmList.innerHTML = "";
  convs.forEach((c) => {
    const item = document.createElement("div");
    item.className = "confirm-item";
    item.innerHTML = `
      <span class="confirm-item-platform">${escHtml(c.platform)}</span>
      <span class="confirm-item-title">${escHtml(c.title)}</span>
    `;
    confirmList.appendChild(item);
  });

  // Mode buttons
  confirmModal.querySelectorAll<HTMLButtonElement>(".confirm-mode-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === pendingInjectMode);
    btn.onclick = () => {
      pendingInjectMode = btn.dataset.mode as BriefingMode;
      confirmModal.querySelectorAll(".confirm-mode-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
    };
  });

  confirmModal.classList.remove("hidden");

  const cleanup = () => { confirmModal.classList.add("hidden"); };

  confirmCancel.onclick = cleanup;
  confirmModal.onclick = (e) => { if (e.target === confirmModal) cleanup(); };

  confirmInject.onclick = () => {
    cleanup();
    onConfirm(pendingInjectMode);
  };
}

function injectConversation(conv: Conversation, el: HTMLElement): void {
  showConfirmModal([conv], (mode) => {
    const text = buildBriefing(conv, mode);
    injectTextToActiveTab(text, () => {
      el.classList.add("flashing");
      setTimeout(() => el.classList.remove("flashing"), 450);
      showToast("Context injected ✓");
      setTimeout(() => window.close(), 900);
    });
  });
}

function injectPackage(pkg: ContextPackage): void {
  injectTextToActiveTab(pkg.document, () => {
    showToast("Package injected ✓");
    chrome.runtime.sendMessage({ type: "BUMP_ANALYTIC", key: "injects" });
    setTimeout(() => window.close(), 900);
  });
}

function injectTextToActiveTab(text: string, onSuccess: () => void): void {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (!tab?.id) { copyFallback(text); return; }
    chrome.tabs.sendMessage(tab.id, { type: "INJECT_TEXT", text }, (res) => {
      if (chrome.runtime.lastError || !res?.success) {
        copyFallback(text);
      } else {
        onSuccess();
      }
    });
  });
}

function copyFallback(text: string): void {
  navigator.clipboard.writeText(text)
    .then(() => showToast("Copied — paste into your chat"))
    .catch(() => showToast("Could not inject or copy"));
}

async function generatePackage(): Promise<void> {
  if (isGeneratingPkg || !selectedItems.size) return;
  isGeneratingPkg = true;

  const ids = [...selectedItems.keys()];
  generatePkgBtn.textContent = "⟳ Generating…";
  generatePkgBtn.setAttribute("disabled", "true");

  try {
    const res = await send<{ success: boolean; data?: { package: ContextPackage; document: string }; error?: string }>(
      { type: "GENERATE_PACKAGE", conversationIds: ids }
    );

    if (res.success && res.data) {
      packages.unshift({
        ...res.data.package,
        document: res.data.document,
      });
      clearAllSelections();
      viewMode = "packages";
      modeConvBtn.classList.remove("active");
      modePkgBtn.classList.add("active");
      renderPackages();
      showToast("Context Package generated ✓");
    } else {
      showToast(`Error: ${res.error ?? "Failed to generate"}`);
    }
  } finally {
    isGeneratingPkg = false;
    generatePkgBtn.textContent = "⊕ Generate Package";
    generatePkgBtn.removeAttribute("disabled");
  }
}

async function syncAll(): Promise<void> {
  if (isSyncing) return;
  isSyncing = true;
  syncBtn.textContent = "⟳ Syncing…";
  syncBtn.classList.add("syncing");

  try {
    await send({ type: "SYNC_NOW" });
    await loadAll();
    showToast("Sync complete ✓");
  } finally {
    isSyncing = false;
    syncBtn.textContent = "⟳ Sync";
    syncBtn.classList.remove("syncing");
  }
}

// ── Settings ───────────────────────────────────────────────────────────────────

function showSettings(): void {
  mainPanel.classList.add("hidden");
  offState.classList.add("hidden");
  settingsPanel.classList.remove("hidden");

  autoSaveToggle.checked = settings.autoSaveEnabled;
  pickerToggle.checked   = settings.pickerEnabled;

  if (session) {
    authSignedOut.classList.add("hidden");
    authSignedIn.classList.remove("hidden");
    signedInEmail.textContent = session.email;
  } else {
    authSignedOut.classList.remove("hidden");
    authSignedIn.classList.add("hidden");
  }
}

function hideSettings(): void {
  settingsPanel.classList.add("hidden");
  if (toggleInput.checked) {
    mainPanel.classList.remove("hidden");
  } else {
    offState.classList.remove("hidden");
  }
}

async function saveSettingsNow(): Promise<void> {
  settings.autoSaveEnabled = autoSaveToggle.checked;
  settings.pickerEnabled   = pickerToggle.checked;
  await send({ type: "SAVE_SETTINGS", settings });
}

// ── Events ─────────────────────────────────────────────────────────────────────

toggleInput.addEventListener("change", async () => {
  const isOn = toggleInput.checked;
  statusText.textContent = isOn ? "Saving" : "Paused";
  settings.autoSaveEnabled = isOn;
  await send({ type: "SAVE_SETTINGS", settings });
  showToast(isOn ? "Auto-save on" : "Auto-save paused");
});

settingsBtn.addEventListener("click", showSettings);
settingsBack.addEventListener("click", () => { saveSettingsNow(); hideSettings(); });

searchInput.addEventListener("input", () => {
  searchQuery = searchInput.value.trim();
  clearSearch.classList.toggle("hidden", !searchQuery);
  render();
});

clearSearch.addEventListener("click", () => {
  searchInput.value = "";
  searchQuery = "";
  clearSearch.classList.add("hidden");
  searchInput.focus();
  render();
});

modeConvBtn.addEventListener("click", () => {
  viewMode = "conversations";
  modeConvBtn.classList.add("active");
  modePkgBtn.classList.remove("active");
  render();
});

modePkgBtn.addEventListener("click", () => {
  viewMode = "packages";
  modePkgBtn.classList.add("active");
  modeConvBtn.classList.remove("active");
  render();
});

generatePkgBtn.addEventListener("click", generatePackage);
syncBtn.addEventListener("click", syncAll);
clearSelection.addEventListener("click", clearAllSelections);

useSelected.addEventListener("click", () => {
  const convs = [...selectedItems.values()];
  if (!convs.length) return;

  showConfirmModal(convs, (mode) => {
    const text = convs.length === 1
      ? buildBriefing(convs[0]!, mode)
      : buildMergedBriefing(convs, mode === "full" ? "summary" : mode);

    injectTextToActiveTab(text, () => {
      showToast(
        convs.length === 1
          ? "Context injected ✓"
          : `${convs.length} conversations merged & injected ✓`
      );
      clearAllSelections();
      setTimeout(() => window.close(), 900);
    });
  });
});

// Settings events
autoSaveToggle.addEventListener("change", saveSettingsNow);
pickerToggle.addEventListener("change",   saveSettingsNow);

signInBtn.addEventListener("click", async () => {
  const email = emailInput.value.trim();
  if (!email) return;
  signInBtn.textContent = "Sending…";
  const res = await send<{ success: boolean; error?: string }>({ type: "SIGN_IN", email });
  signInBtn.textContent = "Send link";
  signInMsg.classList.remove("hidden");
  signInMsg.textContent = res.success
    ? "✓ Check your email for the magic link"
    : `Error: ${res.error ?? "Failed to send"}`;
});

signOutBtn.addEventListener("click", async () => {
  await send({ type: "SIGN_OUT" });
  session = null;
  authSignedOut.classList.remove("hidden");
  authSignedIn.classList.add("hidden");
  showToast("Signed out");
});

clearAllBtn.addEventListener("click", async () => {
  if (!confirm("Clear all conversations? This cannot be undone.")) return;
  for (const conv of conversations) {
    await send({ type: "DELETE_CONVERSATION", id: conv.id });
  }
  conversations = [];
  render();
  showToast("All conversations cleared");
});

// ── Utilities ──────────────────────────────────────────────────────────────────

function escHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Init ───────────────────────────────────────────────────────────────────────

async function init(): Promise<void> {
  // Main panel is always visible — the toggle only controls auto-save
  offState.classList.add("hidden");
  mainPanel.classList.remove("hidden");

  await loadAll();

  // Sync toggle state to stored auto-save setting
  toggleInput.checked    = settings.autoSaveEnabled !== false;
  statusText.textContent = toggleInput.checked ? "Saving" : "Paused";
}

init().catch(console.error);
