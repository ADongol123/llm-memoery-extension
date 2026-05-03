// Content script entry point.
// Runs on every supported LLM page. Orchestrates:
//   - Adapter selection (which platform are we on?)
//   - Selector registry (remote CSS selectors from backend)
//   - Auto-save (every 30s)
//   - Snippet saving (text selection button)
//   - Banner (suggest continuing from another AI)
//   - Message listener (popup ↔ content bridge)
//   - SPA navigation detection

import { getAdapter }             from "../adapters/registry.js";
import { startAutosave, stopAutosave } from "./autosave.js";
import { initSnippetSaver }       from "./snippet.js";
import { mountBanner, resetBannerState } from "./banner.js";
import { injectText, copyToClipboard }   from "./inject.js";
import type { SelectorRegistry, Conversation } from "../types.js";

// ── Bootstrap ──────────────────────────────────────────────────────────────────

const adapter = getAdapter();
if (!adapter) {
  // Not an LLM page — nothing to do
  throw new Error("[LLM Memory] Not an LLM page, content script idle.");
}

let registry: SelectorRegistry = {};

async function init(): Promise<void> {
  // Get cached selector registry from background
  chrome.runtime.sendMessage({ type: "GET_SELECTOR_REGISTRY" }, (res) => {
    if (res?.success && res.data) {
      registry = res.data as SelectorRegistry;
    }
  });

  // Start auto-save
  chrome.storage.local.get("llm_settings", (result) => {
    const settings = result.llm_settings ?? {};
    if (settings.autoSaveEnabled !== false) {
      startAutosave(adapter!, registry);
    }
  });

  // Snippet saver (text selection → save button)
  initSnippetSaver(adapter!.platform);

  // Banner (show on new conversations when picker is enabled)
  maybeShowBanner();
}

// ── Banner trigger ─────────────────────────────────────────────────────────────

function maybeShowBanner(): void {
  // Don't show if there's already a conversation on this page
  const selectors = registry[adapter!.platform] ?? undefined;
  if (adapter!.extractConversation(selectors).length > 0) return;

  chrome.storage.local.get("llm_settings", (result) => {
    const settings = result.llm_settings ?? {};
    if (!settings.pickerEnabled) return;

    // Wait for page to settle, then check if it's genuinely a new chat
    let resolved = false;
    const finish = (isNew: boolean) => {
      if (resolved) return;
      resolved = true;
      observer.disconnect();
      if (!isNew) return;

      // Fetch saved conversations from background
      chrome.runtime.sendMessage({ type: "GET_CONVERSATIONS" }, (res) => {
        if (chrome.runtime.lastError || !res?.success) return;
        const convs = res.data as Conversation[];
        mountBanner(convs, adapter!.platform, adapter!, registry);
      });
    };

    const observer = new MutationObserver(() => {
      const hasMessages = adapter!.extractConversation(
        registry[adapter!.platform] ?? undefined
      ).length > 0;
      if (hasMessages) finish(false);
    });

    observer.observe(document.body, { subtree: true, childList: true });
    setTimeout(() => {
      const hasMessages = adapter!.extractConversation(
        registry[adapter!.platform] ?? undefined
      ).length > 0;
      finish(!hasMessages);
    }, 2000);
  });
}

// ── SPA navigation detection ───────────────────────────────────────────────────

let currentUrl = location.href;

function onUrlChange(): void {
  if (location.href === currentUrl) return;
  currentUrl = location.href;
  resetBannerState();
  stopAutosave();
  startAutosave(adapter!, registry);
  maybeShowBanner();
}

const _push    = history.pushState.bind(history);
const _replace = history.replaceState.bind(history);
history.pushState    = (...args) => { _push(...args);    onUrlChange(); };
history.replaceState = (...args) => { _replace(...args); onUrlChange(); };
window.addEventListener("popstate", onUrlChange);

// ── Message listener (popup ↔ content bridge) ──────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const selectors = registry[adapter!.platform] ?? undefined;

  switch (message.type) {
    case "GET_CONVERSATION": {
      const messages = adapter!.extractConversation(selectors);
      sendResponse({ success: true, messages, platform: adapter!.platform });
      return true;
    }

    case "GET_SIDEBAR_CONVERSATIONS": {
      const conversations = adapter!.getSidebarConversations(selectors);
      sendResponse({ success: true, conversations, platform: adapter!.platform });
      return true;
    }

    case "GET_PLATFORM": {
      sendResponse({ platform: adapter!.platform });
      return true;
    }

    case "INJECT_TEXT": {
      const ok = injectText(message.text, adapter!, registry);
      if (!ok) copyToClipboard(message.text);
      sendResponse({ success: ok });
      return true;
    }
  }
});

// ── Run ────────────────────────────────────────────────────────────────────────

if (document.readyState === "complete") {
  init();
} else {
  window.addEventListener("load", init);
}
