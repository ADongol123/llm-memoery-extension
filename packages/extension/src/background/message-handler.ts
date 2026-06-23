// Handles all messages from content scripts and popup.
// All storage and network operations go through here.

import type { ExtensionMessage, Conversation, ExtensionSettings, TransferSession, KnowledgeBrief } from "../types.js";
import { makeTitle } from "../types.js";
import {
  saveConversation,
  upsertConversationByUrl,
  getAllConversations,
  getConversation,
  updateConversation,
  deleteConversation,
  getAllPackages,
  getPackage,
  deletePackage,
  getSettings,
  saveSettings,
  getPendingSyncOps,
} from "../local-db/index.js";
import { syncNow } from "./sync.js";
import {
  getStoredSession,
  signInWithGoogle,
  signOut,
  storeSession,
  clearSession,
  getAuthenticatedUser,
} from "./firebase-client.js";
import { incrementNewSaves, clearNewSaves, updateBadge } from "./badge.js";
import { retrieveContext as retrieveContextLocal } from "./process-conversation.js";

type Sender = chrome.runtime.MessageSender;
type SendResponse = (response: unknown) => void;

export function handleMessage(
  message: ExtensionMessage,
  _sender: Sender,
  sendResponse: SendResponse
): boolean {
  dispatch(message, sendResponse);
  return true;
}

async function dispatch(message: ExtensionMessage, respond: SendResponse): Promise<void> {
  try {
    switch (message.type) {

      // ── Conversations ────────────────────────────────────────────────────────

      case "SAVE_CONVERSATION": {
        const conv = ensureConversationDefaults(message.payload);
        await saveConversation(conv);
        bumpAnalytic("saves");
        respond({ success: true, id: conv.id });
        break;
      }

      case "AUTO_SAVE_CONVERSATION": {
        const conv = ensureConversationDefaults(message.payload);
        await upsertConversationByUrl(conv);
        incrementNewSaves();
        respond({ success: true });
        break;
      }

      case "GET_CONVERSATIONS": {
        const convs = await getAllConversations();
        respond({ success: true, data: convs });
        break;
      }

      case "DELETE_CONVERSATION": {
        await deleteConversation(message.id);
        respond({ success: true });
        break;
      }

      case "UPDATE_CONVERSATION": {
        await updateConversation(message.id, message.changes);
        respond({ success: true });
        break;
      }

      // ── Context Packages ─────────────────────────────────────────────────────

      case "GET_PACKAGES": {
        const pkgs = await getAllPackages();
        respond({ success: true, data: pkgs });
        break;
      }

      case "GENERATE_PACKAGE": {
        const result = await generatePackageLocally(message.conversationIds);
        respond(result);
        break;
      }

      case "DELETE_PACKAGE": {
        await deletePackage(message.id);
        respond({ success: true });
        break;
      }

      case "INJECT_PACKAGE": {
        const pkg = await getPackage(message.packageId);
        if (!pkg) { respond({ success: false, error: "Package not found" }); break; }
        respond({ success: true, text: pkg.document });
        break;
      }

      // ── Settings ─────────────────────────────────────────────────────────────

      case "GET_SETTINGS": {
        const settings = await getSettings();
        respond({ success: true, data: settings });
        break;
      }

      case "SAVE_SETTINGS": {
        await saveSettings(message.settings);
        respond({ success: true });
        break;
      }

      // ── Auth ─────────────────────────────────────────────────────────────────

      case "GET_AUTH": {
        const session = await getStoredSession();
        respond({ success: true, data: session });
        break;
      }

      case "SIGN_IN": {
        // Legacy email sign-in — redirect to Google
        respond({ success: false, error: "Use Google sign-in" });
        break;
      }

      case "SIGN_IN_GOOGLE": {
        const { error } = await signInWithGoogle();
        if (!error) {
          syncNow().catch(console.warn);
        }
        respond({ success: !error, error });
        break;
      }

      case "SIGN_OUT": {
        await signOut();
        respond({ success: true });
        break;
      }

      case "REFRESH_AUTH": {
        const result = await getAuthenticatedUser();
        if (result) {
          const freshSession = await getStoredSession();
          respond({ success: true, data: freshSession });
        } else {
          await clearSession();
          respond({ success: false, data: null });
        }
        break;
      }

      case "AUTH_CALLBACK": {
        // Not needed with Firebase — Google OAuth handled directly
        respond({ success: false, error: "Use Google sign-in" });
        break;
      }

      // ── UI helpers ────────────────────────────────────────────────────────────

      case "OPEN_POPUP": {
        chrome.windows.create({
          url:    chrome.runtime.getURL("popup.html"),
          type:   "popup",
          width:  400,
          height: 580,
        });
        respond({ success: true });
        break;
      }

      // ── Sync ─────────────────────────────────────────────────────────────────

      case "SYNC_NOW": {
        respond({ success: true });
        updateBadge();
        syncSidebars().then(() => updateBadge()).catch(() => updateBadge());
        syncNow().then(() => updateBadge()).catch(() => updateBadge());
        break;
      }

      case "GET_SIDEBAR_CACHE": {
        const cache = await new Promise<Record<string, unknown>>((resolve) =>
          chrome.storage.local.get("llm_sidebar_cache", (res) =>
            resolve((res.llm_sidebar_cache ?? {}) as Record<string, unknown>)
          )
        );
        respond({ success: true, data: cache });
        break;
      }

      // ── Selector Registry ────────────────────────────────────────────────────

      case "GET_SELECTOR_REGISTRY": {
        const { getCachedSelectors } = await import("../local-db/index.js");
        const registry = await getCachedSelectors();
        respond({ success: true, data: registry });
        break;
      }

      // ── Transfer Context ──────────────────────────────────────────────────────

      case "TRANSFER_CONTEXT": {
        const result = await transferContext(message.payload);
        respond(result);
        break;
      }

      // ── Active RAG Pool ───────────────────────────────────────────────────────

      case "SET_ACTIVE_RAG_POOL": {
        const pool = { conversationIds: message.conversationIds, activatedAt: Date.now() };
        await new Promise<void>((r) => chrome.storage.local.set({ llm_active_rag_pool: pool }, r));
        respond({ success: true });
        break;
      }

      case "GET_ACTIVE_RAG_POOL": {
        const stored = await new Promise<Record<string, unknown>>((r) =>
          chrome.storage.local.get("llm_active_rag_pool", r)
        );
        respond({ success: true, data: stored.llm_active_rag_pool ?? null });
        break;
      }

      case "CLEAR_ACTIVE_RAG_POOL": {
        await new Promise<void>((r) => chrome.storage.local.remove("llm_active_rag_pool", r));
        respond({ success: true });
        break;
      }

      case "RETRIEVE_RAG_CONTEXT": {
        const poolStored = await new Promise<Record<string, unknown>>((r) =>
          chrome.storage.local.get("llm_active_rag_pool", r)
        );
        const ragPool = poolStored.llm_active_rag_pool as
          { conversationIds: string[]; activatedAt: number } | null;
        if (!ragPool?.conversationIds?.length) {
          respond({ success: false, text: null });
          break;
        }
        const ragResult = await transferContext({
          selectedConversationIds: ragPool.conversationIds,
          intent: message.userMessage,
        });
        respond(ragResult);
        break;
      }

      // ── Analytics ────────────────────────────────────────────────────────────

      case "BUMP_ANALYTIC": {
        await bumpAnalytic(message.key);
        respond({ success: true });
        break;
      }

      case "GET_PENDING_SYNC_IDS": {
        const ops = await getPendingSyncOps();
        const ids = ops
          .filter((o) => o.table === "conversations" && o.type === "upsert")
          .map((o) => (o.payload as { id?: string })?.id)
          .filter((id): id is string => !!id);
        respond({ success: true, data: ids });
        break;
      }

      case "CLEAR_BADGE_COUNT": {
        clearNewSaves();
        respond({ success: true });
        break;
      }

      default:
        respond({ success: false, error: "Unknown message type" });
    }
  } catch (e) {
    console.error("[Background] Error handling message:", message.type, e);
    respond({ success: false, error: String(e) });
  }
}

// ── Generate package locally ─────────────────────────────────────────────────

async function generatePackageLocally(conversationIds: string[]): Promise<{
  success: boolean;
  data?: unknown;
  error?: string;
}> {
  const convs = await Promise.all(conversationIds.map(getConversation));
  const valid = convs.filter(Boolean) as Conversation[];

  if (!valid.length) return { success: false, error: "No conversations found" };

  const { buildMergedBriefing, buildBriefing } = await import("../types.js");

  const document = valid.length === 1
    ? buildBriefing(valid[0]!, "full")
    : buildMergedBriefing(valid, "summary");

  const id  = `pkg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const pkg = {
    id,
    name:          valid[0]!.title,
    description:   "",
    document,
    documentJson:  {
      title:             valid[0]!.title,
      summary:           valid.map((c) => c.summary ?? c.title).join(". "),
      decisionsMade:     valid.flatMap((c) => c.keyPoints ?? []),
      openQuestions:     valid.flatMap((c) => c.openQuestions ?? []),
      codeProduced:      valid.flatMap((c) => c.entities?.code ?? []),
      whereWeLeftOff:    "",
      suggestedNextSteps: [],
      sources:           valid.map((c) => ({
        platform:     c.platform,
        title:        c.title,
        timestamp:    new Date(c.createdAt).toLocaleString(),
        messageCount: c.messageCount,
      })),
    },
    conversationIds,
    isPublic:  false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const { savePackage } = await import("../local-db/index.js");
  await savePackage(pkg);

  return { success: true, data: { package: pkg, document } };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function ensureConversationDefaults(payload: Conversation): Conversation {
  return {
    ...payload,
    id:           payload.id || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title:        payload.title || makeTitle(payload.rawMessages),
    messageCount: payload.rawMessages?.length ?? 0,
    summary:      payload.summary ?? null,
    keyPoints:    payload.keyPoints ?? null,
    openQuestions: payload.openQuestions ?? null,
    topics:       payload.topics ?? null,
    entities:     payload.entities ?? null,
    processedAt:  payload.processedAt ?? null,
    createdAt:    payload.createdAt ?? Date.now(),
    updatedAt:    Date.now(),
  };
}

async function bumpAnalytic(key: string): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.get("llm_analytics", (result) => {
      const a = result.llm_analytics ?? { saves: 0, injects: 0, packages_generated: 0 };
      a[key] = (a[key] ?? 0) + 1;
      chrome.storage.local.set({ llm_analytics: a }, resolve);
    });
  });
}

// ── Transfer context (local retrieval) ───────────────────────────────────────

async function transferContext(payload: TransferSession): Promise<{
  success: boolean;
  text: string | null;
}> {
  const { selectedConversationIds, intent } = payload;

  const brief = await retrieveContextLocal(selectedConversationIds, intent);
  const text = formatKnowledgeBrief(brief as KnowledgeBrief, selectedConversationIds.length, intent);

  return { success: true, text };
}

function formatKnowledgeBrief(
  brief: KnowledgeBrief,
  count: number,
  intent: string,
): string {
  const parts: string[] = [
    `I have context from ${count} previous conversation${count === 1 ? "" : "s"}. Here is what is relevant to: ${intent}\n`,
    brief.synthesizedContext,
    "",
  ];

  for (const artifact of brief.keyArtifacts) {
    parts.push(`**${artifact.label}**`);
    if (artifact.type === "code") {
      parts.push(`\`\`\`\n${artifact.content}\n\`\`\``);
    } else {
      parts.push(artifact.content);
    }
    parts.push("");
  }

  if (brief.openQuestions?.length) {
    parts.push("**Open Questions**");
    for (const q of brief.openQuestions) {
      parts.push(`- ${q}`);
    }
  }

  return parts.join("\n");
}

// ── Sidebar sync ───────────────────────────────────────────────────────────────

const SEED_URLS: Record<string, string> = {
  Claude:      "https://claude.ai/new",
  ChatGPT:     "https://chatgpt.com",
  Grok:        "https://grok.com",
  Gemini:      "https://gemini.google.com/app",
  DeepSeek:    "https://chat.deepseek.com",
  Perplexity:  "https://www.perplexity.ai",
  Copilot:     "https://copilot.microsoft.com",
  Mistral:     "https://chat.mistral.ai/chat",
  MetaAI:      "https://www.meta.ai",
  Poe:         "https://poe.com",
};

const DOMAIN_MAP: Record<string, string> = {
  "claude.ai":                "Claude",
  "chatgpt.com":              "ChatGPT",
  "chat.openai.com":          "ChatGPT",
  "gemini.google.com":        "Gemini",
  "grok.com":                 "Grok",
  "chat.deepseek.com":        "DeepSeek",
  "perplexity.ai":            "Perplexity",
  "copilot.microsoft.com":    "Copilot",
  "bing.com":                 "Copilot",
  "chat.mistral.ai":          "Mistral",
  "meta.ai":                  "MetaAI",
  "poe.com":                  "Poe",
};

function keepAlive(signal: { stop: boolean }): void {
  if (signal.stop) return;
  chrome.storage.local.get("_sw_ping", () => {
    if (!signal.stop) setTimeout(() => keepAlive(signal), 20_000);
  });
}

async function syncSidebars(): Promise<Record<string, number>> {
  const ka = { stop: false };
  keepAlive(ka);

  try {
    await chrome.storage.local.set({ llm_sync_status: { state: "running", startedAt: Date.now() } });

    const allTabs = await chrome.tabs.query({});
    const openTabMap: Record<string, chrome.tabs.Tab> = {};
    for (const tab of allTabs) {
      if (!tab.url) continue;
      try {
        const host = new URL(tab.url).hostname;
        for (const [domain, name] of Object.entries(DOMAIN_MAP)) {
          if (host.includes(domain) && !openTabMap[name]) openTabMap[name] = tab;
        }
      } catch { /* skip */ }
    }

    const settings = await getSettings();
    const enabled  = new Set(settings.enabledPlatforms ?? Object.keys(SEED_URLS));

    const platformResults = await Promise.all(
      Object.keys(SEED_URLS)
        .filter((p) => enabled.has(p))
        .map((platform) => scrapePlatform(platform, openTabMap[platform]))
    );

    const results: Record<string, number> = {};
    platformResults.forEach(({ platform, count }) => { results[platform] = count; });

    await chrome.storage.local.set({
      llm_sync_status: { state: "done", completedAt: Date.now(), results },
    });

    return results;
  } finally {
    ka.stop = true;
  }
}

async function scrapePlatform(
  platform: string,
  existingTab: chrome.tabs.Tab | undefined,
): Promise<{ platform: string; count: number }> {
  let conversations: Array<{ title: string; url: string }> = [];

  // Fast path: try existing tab first
  if (existingTab?.id) {
    console.log(`[Sync] ${platform}: using existing tab ${existingTab.id} (${existingTab.url})`);
    conversations = await scrapeTabWithTimeout(existingTab.id, platform);
    if (conversations.length > 0) {
      console.log(`[Sync] ${platform}: found ${conversations.length} sidebar items (existing tab)`);
      return saveSidebarCache(platform, conversations);
    }
    // Existing tab failed (content script not loaded) — try injecting it
    console.log(`[Sync] ${platform}: existing tab returned 0, reloading and retrying`);
    try {
      await chrome.tabs.reload(existingTab.id);
      await new Promise((r) => setTimeout(r, 3500));
      conversations = await scrapeTabWithTimeout(existingTab.id, platform);
    } catch {
      console.warn(`[Sync] ${platform}: reload+retry failed`);
    }
  }

  // Slow path: open a background tab if fast path failed
  if (conversations.length === 0) {
    const seedUrl = SEED_URLS[platform];
    if (!seedUrl) return { platform, count: 0 };

    let createdTabId: number | undefined;
    try {
      console.log(`[Sync] ${platform}: opening background tab → ${seedUrl}`);
      const tab = await chrome.tabs.create({ url: seedUrl, active: false });
      createdTabId = tab.id;
      if (!createdTabId) return { platform, count: 0 };

      const tabId = createdTabId;

      await new Promise<void>((res) => {
        const onUpdated = (id: number, info: chrome.tabs.TabChangeInfo) => {
          if (id === tabId && info.status === "complete") {
            chrome.tabs.onUpdated.removeListener(onUpdated);
            console.log(`[Sync] ${platform}: tab loaded (status=complete)`);
            res();
          }
        };
        chrome.tabs.onUpdated.addListener(onUpdated);
        setTimeout(() => { console.log(`[Sync] ${platform}: tab load timed out (12s)`); res(); }, 12_000);
      });

      await new Promise((r) => setTimeout(r, 2500));

      conversations = await scrapeTabWithTimeout(tabId, platform);
    } catch (e) {
      console.warn(`[Sync] ${platform}: error during scrape:`, e);
    } finally {
      if (createdTabId !== undefined) chrome.tabs.remove(createdTabId).catch(() => {});
    }
  }

  return saveSidebarCache(platform, conversations);
}

async function saveSidebarCache(
  platform: string,
  conversations: Array<{ title: string; url: string }>,
): Promise<{ platform: string; count: number }> {
  console.log(`[Sync] ${platform}: found ${conversations.length} sidebar items`);

  if (conversations.length > 0) {
    const stored = await new Promise<Record<string, unknown[]>>((r) =>
      chrome.storage.local.get("llm_sidebar_cache", (res) =>
        r((res.llm_sidebar_cache ?? {}) as Record<string, unknown[]>)
      )
    );
    await chrome.storage.local.set({
      llm_sidebar_cache: { ...stored, [platform]: conversations },
    });
  }

  return { platform, count: conversations.length };
}

function scrapeTabWithTimeout(tabId: number, platform = ""): Promise<Array<{ title: string; url: string }>> {
  return Promise.race([
    scrapeTab(tabId, platform),
    new Promise<Array<{ title: string; url: string }>>((r) => setTimeout(() => {
      console.warn(`[Sync] ${platform}: scrapeTab timed out (5s)`);
      r([]);
    }, 5_000)),
  ]);
}

function scrapeTab(tabId: number, platform = ""): Promise<Array<{ title: string; url: string }>> {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(
      tabId,
      { type: "GET_SIDEBAR_CONVERSATIONS" },
      (res: { success?: boolean; conversations?: Array<{ title: string; url: string }> } | undefined) => {
        if (chrome.runtime.lastError) {
          console.warn(`[Sync] ${platform}: sendMessage error:`, chrome.runtime.lastError.message);
          resolve([]);
        } else if (!res?.success) {
          console.warn(`[Sync] ${platform}: content script responded with failure:`, res);
          resolve([]);
        } else {
          console.log(`[Sync] ${platform}: content script returned ${res.conversations?.length ?? 0} items`);
          resolve(res.conversations ?? []);
        }
      }
    );
  });
}
