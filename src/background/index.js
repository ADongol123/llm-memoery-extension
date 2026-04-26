import { makeTitle } from "../utils/shared.js";

const FREE_LIMIT = 100;

// ── Cross-device sync ─────────────────────────────────────────────────────────
// Stores a compressed snapshot in chrome.storage.sync so memories survive
// reinstalls and appear on other devices when local storage is empty.

async function syncToCloud(memories) {
  const snapshot = memories.slice(0, 15).map((m) => ({
    id: m.id,
    title: m.title,
    tags: m.tags || [],
    workspace: m.workspace || "Default",
    platform: m.platform,
    timestamp: m.timestamp,
    createdAt: m.createdAt,
    messages: m.messages.slice(-4).map((msg) => ({
      role: msg.role,
      content: msg.content.slice(0, 250),
    })),
  }));

  try {
    await chrome.storage.sync.set({ llm_sync_backup: snapshot });
  } catch (_) {
    // Quota exceeded — retry with fewer, shorter messages
    try {
      const smaller = snapshot.slice(0, 8).map((m) => ({
        ...m,
        messages: m.messages.slice(-2).map((msg) => ({
          role: msg.role,
          content: msg.content.slice(0, 100),
        })),
      }));
      await chrome.storage.sync.set({ llm_sync_backup: smaller });
    } catch (_) {
      // sync unavailable, skip silently
    }
  }
}

// Restore from sync only when local is empty (new install / cleared browser)
async function restoreFromSync() {
  const local = await chrome.storage.local.get("llm_memories");
  if ((local.llm_memories || []).length > 0) return;
  const sync = await chrome.storage.sync.get("llm_sync_backup");
  if (sync.llm_sync_backup?.length > 0) {
    await chrome.storage.local.set({ llm_memories: sync.llm_sync_backup });
  }
}

chrome.runtime.onStartup.addListener(restoreFromSync);
chrome.runtime.onInstalled.addListener(restoreFromSync);

// ── Analytics ─────────────────────────────────────────────────────────────────

async function bumpAnalytic(key) {
  const { llm_analytics: a = { saves: 0, injects: 0 } } =
    await chrome.storage.local.get("llm_analytics");
  a[key] = (a[key] || 0) + 1;
  await chrome.storage.local.set({ llm_analytics: a });
}

// ── Keyboard shortcut ─────────────────────────────────────────────────────────

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "save-memory") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  chrome.tabs.sendMessage(tab.id, { type: "GET_CONVERSATION" }, async (response) => {
    if (chrome.runtime.lastError || !response?.success || !response.messages?.length) return;

    const { llm_memories: memories = [], llm_settings: settings = {} } =
      await chrome.storage.local.get(["llm_memories", "llm_settings"]);

    if (!settings.isPro && memories.length >= FREE_LIMIT) return;

    const payload = buildPayload(response.messages, response.platform, tab.url);
    memories.unshift(payload);
    if (memories.length > 50) memories.splice(50);
    await chrome.storage.local.set({ llm_memories: memories });
    await bumpAnalytic("saves");
    syncToCloud(memories);
  });
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildPayload(messages, platform, url) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: makeTitle(messages),
    tags: [],
    workspace: "Default",
    messages,
    platform: platform || "Unknown",
    url,
    timestamp: new Date().toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// ── Message listener ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "SAVE_MEMORY") {
    (async () => {
      const { llm_memories: memories = [], llm_settings: settings = {} } =
        await chrome.storage.local.get(["llm_memories", "llm_settings"]);

      if (!settings.isPro && memories.length >= FREE_LIMIT) {
        sendResponse({ success: false, limitReached: true });
        return;
      }

      memories.unshift(message.payload);
      if (memories.length > 50) memories.splice(50);
      await chrome.storage.local.set({ llm_memories: memories });
      await bumpAnalytic("saves");
      syncToCloud(memories);
      sendResponse({ success: true });
    })();
    return true;
  }

  // Auto-save upserts by URL so repeated fires don't create duplicates.
  // Replacing an existing auto-save never increases the count so no limit check
  // is needed for that path — only new entries are gated.
  if (message.type === "AUTO_SAVE_MEMORY") {
    (async () => {
      const { llm_memories: memories = [], llm_settings: settings = {} } =
        await chrome.storage.local.get(["llm_memories", "llm_settings"]);
      const idx = memories.findIndex(
        (m) => m.isAutoSave && m.url === message.payload.url
      );
      if (idx >= 0) {
        memories[idx] = message.payload; // replace in place, count unchanged
      } else {
        if (!settings.isPro && memories.length >= FREE_LIMIT) {
          sendResponse({ success: false });
          return;
        }
        memories.unshift(message.payload);
        if (memories.length > 50) memories.splice(50);
      }
      await chrome.storage.local.set({ llm_memories: memories });
      syncToCloud(memories);
      sendResponse({ success: true });
    })();
    return true;
  }

  if (message.type === "GET_MEMORIES") {
    chrome.storage.local.get("llm_memories", (result) => {
      sendResponse({ success: true, data: result.llm_memories || [] });
    });
    return true;
  }

  if (message.type === "DELETE_MEMORY") {
    (async () => {
      const { llm_memories: memories = [] } =
        await chrome.storage.local.get("llm_memories");
      const updated = memories.filter((m) => m.id !== message.id);
      await chrome.storage.local.set({ llm_memories: updated });
      syncToCloud(updated);
      sendResponse({ success: true });
    })();
    return true;
  }

  if (message.type === "UPDATE_MEMORY") {
    (async () => {
      const { llm_memories: memories = [] } =
        await chrome.storage.local.get("llm_memories");
      const idx = memories.findIndex((m) => m.id === message.id);
      if (idx < 0) { sendResponse({ success: false }); return; }
      memories[idx] = { ...memories[idx], ...message.changes, updatedAt: Date.now() };
      await chrome.storage.local.set({ llm_memories: memories });
      syncToCloud(memories);
      sendResponse({ success: true });
    })();
    return true;
  }

  if (message.type === "CLEAR_ALL") {
    (async () => {
      await chrome.storage.local.remove("llm_memories");
      await chrome.storage.sync.remove("llm_sync_backup").catch(() => {});
      sendResponse({ success: true });
    })();
    return true;
  }

  if (message.type === "GET_SETTINGS") {
    chrome.storage.local.get("llm_settings", (result) => {
      sendResponse({ success: true, data: result.llm_settings || {} });
    });
    return true;
  }

  if (message.type === "SAVE_SETTINGS") {
    chrome.storage.local.set({ llm_settings: message.settings }, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === "GET_ANALYTICS") {
    chrome.storage.local.get("llm_analytics", (result) => {
      sendResponse({
        success: true,
        data: result.llm_analytics || { saves: 0, injects: 0 },
      });
    });
    return true;
  }

  if (message.type === "BUMP_ANALYTIC") {
    bumpAnalytic(message.key).then(() => sendResponse({ success: true }));
    return true;
  }

  if (message.type === "IMPORT_MEMORIES") {
    (async () => {
      const { llm_memories: existing = [] } =
        await chrome.storage.local.get("llm_memories");
      const existingIds = new Set(existing.map((m) => m.id));
      const newOnes = (message.memories || []).filter((m) => !existingIds.has(m.id));
      const merged = [...newOnes, ...existing].slice(0, 50);
      await chrome.storage.local.set({ llm_memories: merged });
      syncToCloud(merged);
      sendResponse({ success: true, imported: newOnes.length });
    })();
    return true;
  }

  // ── Sync sidebar conversations from all LLMs ──────────────────────────────
  // Opens each LLM in a background tab, waits for the page to load + sidebar
  // to render, scrapes conversation links, caches in storage, then closes tab.
  if (message.type === "SYNC_SIDEBARS") {
    (async () => {
      const SEED_URLS = {
        Claude:   "https://claude.ai/new",
        ChatGPT:  "https://chatgpt.com",
        Grok:     "https://grok.com",
        Gemini:   "https://gemini.google.com/app",
        DeepSeek: "https://chat.deepseek.com",
      };

      const targets = message.platforms || Object.keys(SEED_URLS);
      const results = {};

      for (const name of targets) {
        const seedUrl = SEED_URLS[name];
        if (!seedUrl) continue;

        // Update progress
        const { llm_sidebar_cache: cur = {} } =
          await chrome.storage.local.get("llm_sidebar_cache");
        await chrome.storage.local.set({
          llm_sidebar_cache: { ...cur, [name]: cur[name] || [] },
          llm_sync_progress: { ...cur, [name]: "loading" },
        });

        let tab;
        try {
          tab = await chrome.tabs.create({ url: seedUrl, active: false });

          // Wait for tab to reach "complete" status
          await new Promise((res) => {
            const onUpdated = (id, info) => {
              if (id === tab.id && info.status === "complete") {
                chrome.tabs.onUpdated.removeListener(onUpdated);
                res();
              }
            };
            chrome.tabs.onUpdated.addListener(onUpdated);
            setTimeout(res, 15000); // 15s max wait
          });

          // Extra wait for sidebar JS to render (SPAs need time)
          await new Promise((r) => setTimeout(r, 3000));

          // Scrape sidebar
          const res = await new Promise((r) => {
            chrome.tabs.sendMessage(
              tab.id,
              { type: "GET_SIDEBAR_CONVERSATIONS" },
              (response) => {
                if (chrome.runtime.lastError) r({ conversations: [] });
                else r(response || { conversations: [] });
              }
            );
          });

          results[name] = res.conversations || [];
        } catch (_) {
          results[name] = [];
        } finally {
          if (tab) chrome.tabs.remove(tab.id).catch(() => {});
        }

        // Persist after each platform so partial results show up
        const { llm_sidebar_cache: existing = {} } =
          await chrome.storage.local.get("llm_sidebar_cache");
        await chrome.storage.local.set({
          llm_sidebar_cache: { ...existing, [name]: results[name] },
          llm_sync_progress: null,
        });
      }

      sendResponse({ success: true, results });
    })();
    return true;
  }

  // ── Get cached sidebar ────────────────────────────────────────────────────
  if (message.type === "GET_SIDEBAR_CACHE") {
    chrome.storage.local.get("llm_sidebar_cache", (result) => {
      sendResponse({ success: true, data: result.llm_sidebar_cache || {} });
    });
    return true;
  }
});
