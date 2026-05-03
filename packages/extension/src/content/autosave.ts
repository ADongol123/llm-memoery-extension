// Auto-saves the current conversation every 30 seconds.
// Only fires if: page is visible, conversation has grown, and meets minimum length.

import type { PlatformAdapter } from "../adapters/base.js";
import type { Conversation, SelectorRegistry } from "../types.js";
import { makeTitle } from "../types.js";

const INTERVAL_MS     = 30_000;
const MIN_MESSAGES    = 4;
const MIN_GROWTH      = 2;  // must have at least 2 new messages since last save

let lastSavedUrl      = "";
let lastSavedCount    = 0;
let timer: ReturnType<typeof setInterval> | null = null;

export function startAutosave(
  adapter: PlatformAdapter,
  registry: SelectorRegistry
): void {
  if (timer) return;

  timer = setInterval(() => {
    try {
      tick(adapter, registry);
    } catch (e) {
      console.warn("[LLM Memory] Autosave error:", e);
      stopAutosave();
    }
  }, INTERVAL_MS);
}

export function stopAutosave(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

function tick(adapter: PlatformAdapter, registry: SelectorRegistry): void {
  if (document.visibilityState !== "visible") return;

  const selectors = registry[adapter.platform] ?? undefined;
  const messages  = adapter.extractConversation(selectors);

  if (messages.length < MIN_MESSAGES) return;

  const currentUrl = location.href;
  const isSameConv = currentUrl === lastSavedUrl;
  const growth     = messages.length - lastSavedCount;

  if (isSameConv && growth < MIN_GROWTH) return;

  const payload: Conversation = {
    id:            `auto-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    platform:      adapter.platform,
    sourceUrl:     currentUrl,
    title:         makeTitle(messages),
    messageCount:  messages.length,
    rawMessages:   messages,
    summary:       null,
    keyPoints:     null,
    openQuestions: null,
    topics:        null,
    entities:      null,
    processedAt:   null,
    isAutoSave:    true,
    isSnippet:     false,
    pinned:        false,
    createdAt:     Date.now(),
    updatedAt:     Date.now(),
  };

  chrome.runtime.sendMessage({ type: "AUTO_SAVE_CONVERSATION", payload }, (res) => {
    if (chrome.runtime.lastError) {
      stopAutosave();
      return;
    }
    if (res?.success) {
      lastSavedCount = messages.length;
      lastSavedUrl   = currentUrl;
    }
  });
}
