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
} from "../local-db/index.js";
import { syncNow } from "./sync.js";
import {
  getStoredSession,
  signInWithEmail,
  signOut,
  storeSession,
} from "./supabase-client.js";
import { getAuthenticatedClient } from "./supabase-client.js";

type Sender = chrome.runtime.MessageSender;
type SendResponse = (response: unknown) => void;

export function handleMessage(
  message: ExtensionMessage,
  _sender: Sender,
  sendResponse: SendResponse
): boolean {
  dispatch(message, sendResponse);
  return true; // keep channel open for async responses
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
        const result = await generatePackage(message.conversationIds);
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
        const { error } = await signInWithEmail(message.email);
        respond({ success: !error, error });
        break;
      }

      case "SIGN_OUT": {
        await signOut();
        respond({ success: true });
        break;
      }

      case "AUTH_CALLBACK": {
        // Received from the web app after OAuth completes
        const client = await getAuthenticatedClient();
        if (client) {
          const { data } = await client.auth.setSession({
            access_token:  message.accessToken,
            refresh_token: message.refreshToken,
          });
          if (data.session) {
            await storeSession({
              accessToken:  data.session.access_token,
              refreshToken: data.session.refresh_token,
              userId:       data.session.user.id,
              email:        data.session.user.email ?? "",
              expiresAt:    data.session.expires_at ?? 0,
            });
            syncNow().catch(console.warn);
            respond({ success: true });
          } else {
            respond({ success: false, error: "Failed to set session" });
          }
        }
        break;
      }

      // ── UI helpers ────────────────────────────────────────────────────────────

      case "OPEN_POPUP": {
        // Chrome doesn't support programmatic popup open; open as a small window instead
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
        const results = await syncSidebars();
        // Also try Supabase sync (silently skips if not authed)
        syncNow().catch(() => {});
        respond({ success: true, results });
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

      // ── Analytics ────────────────────────────────────────────────────────────

      case "BUMP_ANALYTIC": {
        await bumpAnalytic(message.key);
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

// ── Generate package via Supabase Edge Function ────────────────────────────────

async function generatePackage(conversationIds: string[]): Promise<{
  success: boolean;
  data?: unknown;
  error?: string;
}> {
  const client = await getAuthenticatedClient();

  if (!client) {
    // Fallback: generate locally from stored conversations (no AI, basic format)
    return generatePackageLocally(conversationIds);
  }

  const session = await getStoredSession();
  if (!session) return generatePackageLocally(conversationIds);

  try {
    const { data: { session: currentSession } } = await client.auth.getSession();
    if (!currentSession) return generatePackageLocally(conversationIds);

    const res = await fetch(
      `${__SUPABASE_URL__}/functions/v1/generate-package`,
      {
        method: "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${currentSession.access_token}`,
        },
        body: JSON.stringify({ conversationIds }),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      throw new Error(err);
    }

    const result = await res.json();

    // Cache the package locally
    if (result.package) {
      const { savePackage } = await import("../local-db/index.js");
      await savePackage({
        id:            result.package.id,
        name:          result.package.name,
        description:   result.package.description,
        document:      result.document,
        documentJson:  result.package.document_json,
        conversationIds,
        isPublic:      false,
        createdAt:     Date.now(),
        updatedAt:     Date.now(),
      });
    }

    bumpAnalytic("packages_generated");
    return { success: true, data: result };
  } catch (e) {
    console.error("[Background] generatePackage error:", e);
    return generatePackageLocally(conversationIds);
  }
}

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

// ── Sidebar sync ───────────────────────────────────────────────────────────────
// Scrapes already-open LLM tabs to discover sidebar conversations.
// Never opens new tabs — that would close the popup and cause unwanted redirects.
// Results cached in chrome.storage.local as llm_sidebar_cache.

const DOMAIN_MAP: Record<string, string> = {
  "claude.ai":          "Claude",
  "chatgpt.com":        "ChatGPT",
  "chat.openai.com":    "ChatGPT",
  "gemini.google.com":  "Gemini",
  "grok.com":           "Grok",
  "chat.deepseek.com":  "DeepSeek",
};

const KNOWN_PLATFORMS = ["Claude", "ChatGPT", "Gemini", "Grok", "DeepSeek"];

async function syncSidebars(): Promise<Record<string, number>> {
  const platforms = KNOWN_PLATFORMS;
  const results: Record<string, number> = {};

  // Find already-open LLM tabs
  const allTabs = await chrome.tabs.query({});
  const openTabMap: Record<string, chrome.tabs.Tab> = {};
  for (const tab of allTabs) {
    if (!tab.url) continue;
    try {
      const host = new URL(tab.url).hostname;
      for (const [domain, name] of Object.entries(DOMAIN_MAP)) {
        if (host.includes(domain) && !openTabMap[name]) {
          openTabMap[name] = tab;
        }
      }
    } catch { /* skip invalid URLs */ }
  }

  const cache: Record<string, unknown[]> = {};

  for (const platform of platforms) {
    let conversations: Array<{ title: string; url: string }> = [];

    const existingTab = openTabMap[platform];

    if (existingTab?.id) {
      // Only scrape already-open tabs — never open background tabs during sync
      // (background tab creation closes the popup and causes unwanted redirects)
      conversations = await scrapeTab(existingTab.id);
    }

    cache[platform] = conversations;
    results[platform] = conversations.length;

    // Persist after each platform so partial results are visible immediately
    const existing = await new Promise<Record<string, unknown[]>>((r) =>
      chrome.storage.local.get("llm_sidebar_cache", (res) =>
        r((res.llm_sidebar_cache ?? {}) as Record<string, unknown[]>)
      )
    );
    await chrome.storage.local.set({
      llm_sidebar_cache: { ...existing, [platform]: conversations },
    });
  }

  return results;
}

function scrapeTab(tabId: number): Promise<Array<{ title: string; url: string }>> {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(
      tabId,
      { type: "GET_SIDEBAR_CONVERSATIONS" },
      (res: { success?: boolean; conversations?: Array<{ title: string; url: string }> } | undefined) => {
        if (chrome.runtime.lastError || !res?.success) {
          resolve([]);
        } else {
          resolve(res.conversations ?? []);
        }
      }
    );
  });
}

// ── Transfer context via retrieve-context Edge Function ────────────────────────

async function transferContext(payload: TransferSession): Promise<{
  success: boolean;
  text: string | null;
}> {
  const client = await getAuthenticatedClient();
  if (!client) return { success: false, text: null };

  const { data: { session } } = await client.auth.getSession();
  if (!session) return { success: false, text: null };

  const { selectedConversationIds, intent } = payload;

  const res = await fetch(
    `${__SUPABASE_URL__}/functions/v1/retrieve-context`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${session.access_token}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({ conversation_ids: selectedConversationIds, intent }),
    }
  );

  if (!res.ok) throw new Error(await res.text());

  const brief = await res.json() as KnowledgeBrief;
  const text  = formatKnowledgeBrief(brief, selectedConversationIds.length, intent);

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

declare const __SUPABASE_URL__: string;
