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
import { buildBriefing, buildMergedBriefing, DEFAULT_SETTINGS, ALL_PLATFORMS } from "../types.js";

// ── State ──────────────────────────────────────────────────────────────────────

let conversations:  Conversation[]   = [];
let packages:       ContextPackage[] = [];
let settings:       ExtensionSettings = DEFAULT_SETTINGS;
let session:        AuthSession | null = null;
let activeTab:      Platform | "All" = "All";
let viewMode:       "conversations" | "packages" = "conversations";
let searchQuery:    string = "";
let briefingMode:   BriefingMode = "full";
let selectedItems:  Map<string, Conversation> = new Map();
let isGeneratingPkg      = false;
let isSyncing            = false;
let activeRagPool: { conversationIds: string[]; activatedAt: number } | null = null;
let sidebarCache:        Record<string, Array<{ title: string; url: string }>> = {};
let selectedDiscovered:  Map<string, { title: string; url: string; platform: string }> = new Map();
// Maps a conversation URL → tabId for tabs currently open in the browser.
// Used to silently extract content from already-open tabs at inject time.
let openTabUrlMap: Map<string, number> = new Map();

// ── DOM refs ───────────────────────────────────────────────────────────────────

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const toggleInput       = $<HTMLInputElement>("toggleInput");
const statusText        = $("statusText");
const offState          = $("offState");
const mainPanel         = $("mainPanel");
const settingsPanel     = $("settingsPanel");
const platformSelectPanel = $("platformSelectPanel");
const platformCheckboxes  = $("platformCheckboxes");
const platformSyncBtn     = $("platformSyncBtn");
const settingsBtn       = $("settingsBtn");
const settingsBack      = $("settingsBack");
const editPlatformsBtn  = $("editPlatformsBtn");
const searchInput       = $<HTMLInputElement>("searchInput");
const clearSearch       = $("clearSearch");
const tabBar            = $("tabBar");
const modeConvBtn       = $("modeConvBtn");
const modePkgBtn        = $("modePkgBtn");
const generatePkgBtn    = $("generatePkgBtn");
const mainPlatformsBtn  = $("mainPlatformsBtn");
const syncBtn           = $("syncBtn");
const selectionBar      = $("selectionBar");
const selectionCount    = $("selectionCount");
const clearSelection    = $("clearSelection");
const intentInput       = $<HTMLInputElement>("intentInput");
const activateContextBtn = $("activateContextBtn");
const useSelected       = $("useSelected");
const ragPoolStatus     = $("ragPoolStatus");
const ragPoolLabel      = $("ragPoolLabel");
const clearRagPool      = $("clearRagPool");
const itemList          = $("itemList");
const toast             = $("toast");
const confirmModal      = $("confirmModal");
const confirmList       = $("confirmList");
const confirmCancel     = $("confirmCancel");
const confirmInject     = $("confirmInject");
const selectHint        = $("selectHint");

// Settings panel
const autoSaveToggle  = $<HTMLInputElement>("autoSaveToggle");
const pickerToggle    = $<HTMLInputElement>("pickerToggle");
const emailInput      = $<HTMLInputElement>("emailInput");
const signInBtn       = $("signInBtn");
const signInMsg       = $("signInMsg");
const authSignedOut   = $("authSignedOut");
const authSignedIn    = $("authSignedIn");
const signedInEmail   = $("signedInEmail");
const signOutBtn      = $("signOutBtn");
const clearAllBtn     = $("clearAllBtn");

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

// ── Open-tab tracking ──────────────────────────────────────────────────────────

async function refreshOpenTabMap(): Promise<void> {
  const tabs = await new Promise<chrome.tabs.Tab[]>((r) => chrome.tabs.query({}, r));
  openTabUrlMap = new Map(
    tabs
      .filter((t) => t.url && t.id !== undefined)
      .map((t) => [t.url!, t.id!])
  );
}

// Silently extract conversation messages from an already-open tab without
// focusing it or changing the user's active tab in any way.
function extractFromTab(tabId: number): Promise<import("../types.js").Message[]> {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(
      tabId,
      { type: "GET_CONVERSATION" },
      (res: { success?: boolean; messages?: import("../types.js").Message[] } | undefined) => {
        if (chrome.runtime.lastError || !res?.success) resolve([]);
        else resolve(res.messages ?? []);
      }
    );
  });
}

// ── Data loading ───────────────────────────────────────────────────────────────

async function loadAll(): Promise<void> {
  const [convRes, pkgRes, settRes, authRes, cacheRes, poolRes] = await Promise.all([
    send<{ success: boolean; data: Conversation[] }>({ type: "GET_CONVERSATIONS" }),
    send<{ success: boolean; data: ContextPackage[] }>({ type: "GET_PACKAGES" }),
    send<{ success: boolean; data: ExtensionSettings }>({ type: "GET_SETTINGS" }),
    send<{ success: boolean; data: AuthSession | null }>({ type: "GET_AUTH" }),
    send<{ success: boolean; data: Record<string, Array<{ title: string; url: string }>> }>({ type: "GET_SIDEBAR_CACHE" }),
    send<{ success: boolean; data: { conversationIds: string[]; activatedAt: number } | null }>({ type: "GET_ACTIVE_RAG_POOL" }),
  ]);

  if (convRes.success) conversations = convRes.data ?? [];
  if (pkgRes.success)  packages      = pkgRes.data ?? [];
  if (settRes.success) settings      = settRes.data ?? DEFAULT_SETTINGS;
  if (authRes.success) session       = authRes.data;
  if (cacheRes.success) sidebarCache = cacheRes.data ?? {};
  if (poolRes.success) activeRagPool = poolRes.data;

  briefingMode = settings.defaultBriefingMode ?? "full";

  await refreshOpenTabMap();
}

// ── Platform selection screen ──────────────────────────────────────────────────

function showPlatformSelect(fromSettings = false): void {
  mainPanel.classList.add("hidden");
  settingsPanel.classList.add("hidden");
  platformSelectPanel.classList.remove("hidden");

  const enabled = new Set(settings.enabledPlatforms ?? ALL_PLATFORMS);

  platformCheckboxes.innerHTML = "";
  ALL_PLATFORMS.forEach((platform) => {
    const label = document.createElement("label");
    label.className = "platform-option";
    label.innerHTML = `
      <input type="checkbox" class="platform-check" value="${platform}" ${enabled.has(platform) ? "checked" : ""} />
      <span class="platform-option-name">${platform}</span>
    `;
    platformCheckboxes.appendChild(label);
  });

  platformSyncBtn.onclick = async () => {
    const checked = Array.from(
      platformCheckboxes.querySelectorAll<HTMLInputElement>(".platform-check:checked")
    ).map((el) => el.value as Platform);

    if (checked.length === 0) {
      showToast("Select at least one platform");
      return;
    }

    settings.enabledPlatforms = checked;
    await send({ type: "SAVE_SETTINGS", settings });

    platformSelectPanel.classList.add("hidden");

    if (fromSettings) {
      showSettings();
    } else {
      mainPanel.classList.remove("hidden");
      render();
      syncAll();
    }
  };
}

// ── Tab logic ──────────────────────────────────────────────────────────────────

function getEnabledPlatforms(): Platform[] {
  return (settings.enabledPlatforms ?? ALL_PLATFORMS) as Platform[];
}

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

  const hasItems = conversations.length > 0 || Object.keys(sidebarCache).length > 0;
  selectHint.classList.toggle("hidden", !hasItems || selectedItems.size > 0 || viewMode !== "conversations");
}

function renderTabs(): void {
  tabBar.innerHTML = "";
  const enabled = getEnabledPlatforms();
  const tabs: Array<Platform | "All"> = ["All", ...enabled];

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
      selectedDiscovered.clear();
      render();
    });
    tabBar.appendChild(btn);
  });
}

function renderConversations(): void {
  itemList.innerHTML = "";
  const items = getFilteredConversations();

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
    appendDivider("Discovered");
    newDiscovered.forEach((d) => { itemList.appendChild(makeSidebarItem(d)); });
  }
}

function getDiscoveredItems(): Array<{ title: string; url: string; platform: string }> {
  const result: Array<{ title: string; url: string; platform: string }> = [];
  const platformFilter = activeTab === "All" ? null : activeTab;
  const enabled = new Set(getEnabledPlatforms());

  for (const [platform, items] of Object.entries(sidebarCache)) {
    if (!enabled.has(platform as Platform)) continue;
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

  const enabled = getEnabledPlatforms();

  if (searchQuery) {
    empty.innerHTML = `<div class="empty-icon">⊘</div><div>No results for "${escHtml(searchQuery)}"</div>`;
  } else if (activeTab !== "All") {
    empty.innerHTML = `
      <div class="empty-icon">↗</div>
      <div style="font-weight:600;">No ${activeTab} conversations yet</div>
      <div class="empty-hint">Open ${activeTab}, start a chat, and it'll appear here automatically.</div>
      <div class="empty-hint" style="margin-top:6px;">Or click <strong>⟳ Sync</strong> to scan your open tabs now.</div>
    `;
  } else {
    const platformList = enabled.slice(0, 5).join(", ") + (enabled.length > 5 ? "…" : "");
    empty.innerHTML = `
      <div class="empty-icon">⬡</div>
      <div style="font-weight:600;">No conversations saved yet</div>
      <div class="empty-hint" style="margin-top:8px;"><strong>How to get started:</strong></div>
      <ol class="empty-steps">
        <li>Open ${platformList}</li>
        <li>Have a conversation (4+ messages)</li>
        <li>Conversations auto-save every 30 seconds</li>
        <li>Come back here, select one or more, then click <strong>Inject →</strong></li>
      </ol>
      <div class="empty-hint" style="margin-top:10px;">Already chatting? Click <strong>⟳ Sync</strong> above.</div>
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
  const hasAI      = !!conv.processedAt;

  const el = document.createElement("div");
  el.className = [
    "item",
    conv.pinned   ? "pinned"   : "",
    isSelected    ? "selected" : "",
  ].filter(Boolean).join(" ");
  el.style.animationDelay = `${Math.min(num - 1, 8) * 0.025}s`;

  const timestamp = new Date(conv.updatedAt).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });

  el.innerHTML = `
    <label class="item-check" title="Click to select">
      <input type="checkbox" class="check-input" ${isSelected ? "checked" : ""}/>
      <span class="check-box" data-num="${num}"></span>
    </label>
    <button class="pin-btn" title="${conv.pinned ? "Unpin" : "Pin"}">${conv.pinned ? "★" : "☆"}</button>
    <div class="item-body">
      <div class="item-title" title="${escHtml(conv.title)}">${escHtml(conv.title)}</div>
      <div class="item-meta">
        <span class="platform-badge">${conv.platform}</span>
        ${conv.isSnippet ? `<span class="snippet-badge">snippet</span>` : ""}
        ${hasAI
          ? `<span class="ai-badge rag-ready" title="Smart inject available">✦ smart</span>`
          : `<span class="ai-badge local-only" title="Local inject only">≈ local</span>`}
        <span>${timestamp}</span>
        ${!conv.isSnippet ? `<span>·</span><span>${conv.messageCount} msgs</span>` : ""}
      </div>
    </div>
    <span class="item-arrow">→</span>
  `;

  el.querySelector(".item-check")!.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleSelect(conv, el);
  });

  el.querySelector(".pin-btn")!.addEventListener("click", (e) => {
    e.stopPropagation();
    togglePin(conv);
  });

  el.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).closest(".item-check, .pin-btn")) return;
    if (selectedItems.size > 0) {
      toggleSelect(conv, el);
    } else {
      quickInject(conv, el);
    }
  });

  return el;
}

// ── Sidebar-discovered item (selectable) ──────────────────────────────────────

function makeSidebarItem(item: { title: string; url: string; platform: string }): HTMLElement {
  const key        = item.url;
  const isSelected = selectedDiscovered.has(key);
  const isOpen     = openTabUrlMap.has(item.url);

  const el = document.createElement("div");
  el.className = ["item", "sidebar-item", isSelected ? "selected" : ""].filter(Boolean).join(" ");

  el.innerHTML = `
    <label class="item-check" title="${isOpen ? "Select to inject silently" : "Open this tab first to capture it"}">
      <input type="checkbox" class="check-input" ${isSelected ? "checked" : ""}/>
      <span class="check-box check-box--disc">↗</span>
    </label>
    <div class="item-body">
      <div class="item-title" title="${escHtml(item.title)}">${escHtml(item.title)}</div>
      <div class="item-meta">
        <span class="platform-badge">${escHtml(item.platform)}</span>
        ${isOpen
          ? `<span class="discovered-badge open-now" title="Tab is open — content will be extracted silently">open</span>`
          : `<span class="discovered-badge" title="Visit this URL first to capture it">not captured</span>`}
      </div>
    </div>
    <button class="open-btn" title="Open in new tab">Open →</button>
  `;

  el.querySelector(".item-check")!.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleSelectDiscovered(item, el);
  });

  el.querySelector(".open-btn")!.addEventListener("click", (e) => {
    e.stopPropagation();
    chrome.tabs.create({ url: item.url });
    showToast("Opening — will auto-save in ~30s");
  });

  el.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).closest(".item-check, .open-btn")) return;
    // Discovered items always toggle selection on row click — "Open →" is the explicit open action
    toggleSelectDiscovered(item, el);
  });

  return el;
}

function toggleSelectDiscovered(
  item: { title: string; url: string; platform: string },
  el: HTMLElement,
): void {
  const key = item.url;
  if (selectedDiscovered.has(key)) {
    selectedDiscovered.delete(key);
    el.classList.remove("selected");
    el.querySelector<HTMLInputElement>(".check-input")!.checked = false;
  } else {
    selectedDiscovered.set(key, item);
    el.classList.add("selected");
    el.querySelector<HTMLInputElement>(".check-input")!.checked = true;
  }
  updateSelectionBar();
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
  selectedDiscovered.clear();
  itemList.querySelectorAll(".item").forEach((el) => {
    el.classList.remove("selected");
    const check = el.querySelector<HTMLInputElement>(".check-input");
    if (check) check.checked = false;
  });
  updateSelectionBar();
}

function updateSelectionBar(): void {
  const count = selectedItems.size + selectedDiscovered.size;
  selectionBar.classList.toggle("hidden", count === 0);
  generatePkgBtn.classList.toggle("hidden", selectedItems.size === 0 || viewMode !== "conversations");

  // "Activate" shown only when: saved convs selected (no discovered), all RAG-ready, signed in
  const savedConvs  = [...selectedItems.values()];
  const allRagReady = savedConvs.length > 0 && savedConvs.every((c) => c.processedAt !== null);
  const noDiscovered = selectedDiscovered.size === 0;
  const canActivate = allRagReady && noDiscovered && session !== null;

  activateContextBtn.classList.toggle("hidden", !canActivate);
  if (canActivate) {
    (activateContextBtn as HTMLButtonElement).disabled = false;
    activateContextBtn.title = "Save these conversations as background RAG context";
  }

  // Pool status indicator
  ragPoolStatus.classList.toggle("hidden", !activeRagPool);
  if (activeRagPool) {
    const n = activeRagPool.conversationIds.length;
    ragPoolLabel.textContent = `${n} conversation${n === 1 ? "" : "s"} active as RAG context`;
  }

  if (count > 0) {
    const parts: string[] = [];
    if (selectedItems.size > 0) parts.push(`${selectedItems.size} saved`);
    if (selectedDiscovered.size > 0) parts.push(`${selectedDiscovered.size} discovered`);
    selectionCount.textContent = parts.join(" · ");
  }
}

function togglePin(conv: Conversation): void {
  conv.pinned = !conv.pinned;
  send({ type: "UPDATE_CONVERSATION", id: conv.id, changes: { pinned: conv.pinned } });
  render();
  showToast(conv.pinned ? "Pinned ★" : "Unpinned");
}

// ── Inject flows ───────────────────────────────────────────────────────────────

function buildLocalBriefing(convs: Conversation[], mode: BriefingMode): string {
  return convs.length === 1
    ? buildBriefing(convs[0]!, mode)
    : buildMergedBriefing(convs, mode === "full" ? "summary" : mode);
}

// Single conversation quick-inject (click without selection mode)
function quickInject(conv: Conversation, el: HTMLElement): void {
  const ragAvailable = session !== null && conv.processedAt !== null;
  showConfirmModal([conv], (text) => {
    injectTextToActiveTab(text, () => {
      el.classList.add("flashing");
      setTimeout(() => el.classList.remove("flashing"), 450);
      showToast("Context injected ✓");
      setTimeout(() => window.close(), 900);
    });
  }, ragAvailable);
}

// Multi-select inject via selection bar "Inject →" button
async function injectSelected(): Promise<void> {
  let convs        = [...selectedItems.values()];
  const discovered = [...selectedDiscovered.values()];

  if (!convs.length && !discovered.length) return;

  if (discovered.length > 0) {
    // Refresh tab map at inject time so it's accurate even if tabs changed
    await refreshOpenTabMap();

    const notOpen: typeof discovered = [];

    for (const d of discovered) {
      const tabId = openTabUrlMap.get(d.url);
      if (!tabId) {
        notOpen.push(d);
        continue;
      }
      const messages = await extractFromTab(tabId);
      if (messages.length > 0) {
        convs = [...convs, {
          id:            `discovered-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          platform:      d.platform as Platform,
          sourceUrl:     d.url,
          title:         d.title,
          rawMessages:   messages,
          messageCount:  messages.length,
          summary:       null,
          keyPoints:     null,
          openQuestions: null,
          topics:        null,
          entities:      null,
          processedAt:   null,
          isAutoSave:    false,
          isSnippet:     false,
          pinned:        false,
          createdAt:     Date.now(),
          updatedAt:     Date.now(),
        }];
      } else {
        notOpen.push(d); // tab open but content script returned nothing
      }
    }

    if (notOpen.length > 0) {
      const msg = notOpen.length === discovered.length && !convs.length
        ? `Not captured yet — use "Open →" to visit first`
        : `${notOpen.length} skipped (not captured) — use "Open →" first`;
      showToast(msg);
      if (!convs.length) { clearAllSelections(); return; }
    }
  }

  if (!convs.length) return;

  const intent       = intentInput.value.trim();
  const ragAvailable = session !== null && convs.every((c) => c.processedAt !== null);

  useSelected.textContent = "Injecting…";
  (useSelected as HTMLButtonElement).disabled = true;

  try {
    let text: string;

    if (ragAvailable && intent.length > 0) {
      try {
        const res = await send<{ success: boolean; text: string | null }>({
          type: "TRANSFER_CONTEXT",
          payload: { selectedConversationIds: convs.map((c) => c.id), intent },
        });
        text = (res.success && res.text) ? res.text : buildLocalBriefing(convs, briefingMode);
        if (!res.success || !res.text) showToast("Smart retrieval unavailable — using summary");
      } catch {
        text = buildLocalBriefing(convs, briefingMode);
        showToast("Smart retrieval failed — using summary");
      }
    } else {
      text = buildLocalBriefing(convs, briefingMode);
    }

    injectTextToActiveTab(text, () => {
      showToast(
        convs.length === 1
          ? "Context injected ✓"
          : `${convs.length} conversations merged & injected ✓`
      );
      clearAllSelections();
      setTimeout(() => window.close(), 900);
    });
  } finally {
    useSelected.textContent = "Inject →";
    (useSelected as HTMLButtonElement).disabled = false;
  }
}

// Confirmation modal for single-conversation quick-inject
let pendingInjectMode: BriefingMode = "summary";

function showConfirmModal(
  convs: Conversation[],
  onInject: (text: string) => void,
  ragAvailable = false,
): void {
  pendingInjectMode = briefingMode;

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

  confirmInject.onclick = async () => {
    // If RAG is available and user typed an intent in the selection bar, use it
    const intent = intentInput.value.trim();

    if (ragAvailable && intent.length > 0) {
      confirmInject.textContent = "Retrieving…";
      (confirmInject as HTMLButtonElement).disabled = true;
      try {
        const res = await send<{ success: boolean; text: string | null }>({
          type: "TRANSFER_CONTEXT",
          payload: { selectedConversationIds: convs.map((c) => c.id), intent },
        });
        cleanup();
        if (res.success && res.text) {
          onInject(res.text);
        } else {
          showToast("Smart retrieval failed — using summary");
          onInject(buildLocalBriefing(convs, pendingInjectMode));
        }
      } catch {
        cleanup();
        showToast("Smart retrieval failed — using summary");
        onInject(buildLocalBriefing(convs, pendingInjectMode));
      } finally {
        confirmInject.textContent = "Inject context →";
        (confirmInject as HTMLButtonElement).disabled = false;
      }
    } else {
      cleanup();
      onInject(buildLocalBriefing(convs, pendingInjectMode));
    }
  };
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
      packages.unshift({ ...res.data.package, document: res.data.document });
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
    showToast("Syncing platforms in background…");
  } catch (e) {
    showToast(`Sync failed: ${String(e)}`);
    isSyncing = false;
    syncBtn.textContent = "⟳ Sync";
    syncBtn.classList.remove("syncing");
  }
}

// ── Settings ───────────────────────────────────────────────────────────────────

function showSettings(): void {
  mainPanel.classList.add("hidden");
  offState.classList.add("hidden");
  platformSelectPanel.classList.add("hidden");
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
  mainPanel.classList.remove("hidden");
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
settingsBack.addEventListener("click", () => { saveSettingsNow(); hideSettings(); render(); });
editPlatformsBtn.addEventListener("click", () => showPlatformSelect(true));

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
mainPlatformsBtn.addEventListener("click", () => showPlatformSelect(true));
syncBtn.addEventListener("click", syncAll);
clearSelection.addEventListener("click", clearAllSelections);
useSelected.addEventListener("click", injectSelected);

activateContextBtn.addEventListener("click", async () => {
  const ids = [...selectedItems.keys()];
  if (!ids.length) return;
  await send({ type: "SET_ACTIVE_RAG_POOL", conversationIds: ids });
  activeRagPool = { conversationIds: ids, activatedAt: Date.now() };
  clearAllSelections();
  updateSelectionBar();
  showToast(`${ids.length} conversation${ids.length === 1 ? "" : "s"} activated as RAG context ✓`);
  setTimeout(() => window.close(), 1200);
});

clearRagPool.addEventListener("click", async () => {
  await send({ type: "CLEAR_ACTIVE_RAG_POOL" });
  activeRagPool = null;
  updateSelectionBar();
  showToast("RAG context pool cleared");
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
  await Promise.all(conversations.map((conv) =>
    send({ type: "DELETE_CONVERSATION", id: conv.id })
  ));
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

// ── Live sync updates ──────────────────────────────────────────────────────────

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;

  if ("llm_sidebar_cache" in changes) {
    sidebarCache = (changes.llm_sidebar_cache.newValue as typeof sidebarCache) ?? {};
    refreshOpenTabMap().then(() => render());
  }

  if ("llm_active_rag_pool" in changes) {
    activeRagPool = (changes.llm_active_rag_pool.newValue as typeof activeRagPool) ?? null;
    updateSelectionBar();
  }

  if ("llm_sync_status" in changes) {
    const status = changes.llm_sync_status.newValue as { state: string; results?: Record<string, number> } | undefined;
    if (status?.state === "done") {
      isSyncing = false;
      syncBtn.textContent = "⟳ Sync";
      syncBtn.classList.remove("syncing");
      const total = Object.values(status.results ?? {}).reduce((n, v) => n + v, 0);
      showToast(total > 0 ? `Sync complete — ${total} conversations found ✓` : "Sync complete ✓");
    }
  }
});

// ── Init ───────────────────────────────────────────────────────────────────────

async function init(): Promise<void> {
  offState.classList.add("hidden");

  await loadAll();

  toggleInput.checked    = settings.autoSaveEnabled !== false;
  statusText.textContent = toggleInput.checked ? "Saving" : "Paused";

  // First-run: show platform selection screen if enabledPlatforms has never been set
  if (!settings.enabledPlatforms) {
    showPlatformSelect(false);
  } else {
    mainPanel.classList.remove("hidden");
    render();
  }
}

init().catch(console.error);
