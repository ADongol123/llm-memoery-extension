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
import { initRagIntercept, resetRagIntercept } from "./rag-intercept.js";
import { createStatusIndicator, updateStatus } from "./status-indicator.js";
import type { SelectorRegistry, Conversation } from "../types.js";

// ── Bootstrap ──────────────────────────────────────────────────────────────────

const adapter = getAdapter();
if (!adapter) {
  throw new Error("[LLM Memory] Not an LLM page, content script idle.");
}
console.debug(`[LLM Memory] Adapter loaded: ${adapter.platform} on ${location.hostname}`);

function dumpDomDiagnostics(): void {
  const selectors: Record<string, string> = {
    '[data-message-author-role]': 'ChatGPT role attr',
    'article[data-testid^="conversation-turn-"]': 'ChatGPT article turns',
    'article': 'generic articles',
    '[data-testid]': 'any data-testid',
    '[data-role]': 'data-role attr',
    '[data-turn-role]': 'Gemini turn role',
    'conversation-turn': 'Gemini web component',
    '.query-text': 'Gemini query text',
    '.ds-markdown': 'DeepSeek markdown',
    '[class*="UserMessage"]': 'UserMessage class',
    '[class*="user-message"]': 'user-message class',
    '[class*="humanMessage"]': 'humanMessage class',
    '[class*="AssistantMessage"]': 'AssistantMessage class',
    '[class*="BotMessage"]': 'BotMessage class',
    '[class*="botMessage"]': 'botMessage class',
    '[data-message-type]': 'Poe message type',
    '[data-sender]': 'MetaAI sender',
    '[data-content]': 'Copilot content attr',
    '.markdown': 'markdown class',
    '.prose': 'prose class',
    '[role="listitem"]': 'listitem role',
    '[role="log"]': 'log role',
    'main': 'main element',
  };

  const results: string[] = [];
  for (const [sel, label] of Object.entries(selectors)) {
    try {
      const count = document.querySelectorAll(sel).length;
      if (count > 0) results.push(`  ${label} (${sel}): ${count}`);
    } catch { /* skip */ }
  }

  // Collect unique data-* attributes from message-like containers
  const dataAttrs = new Set<string>();
  const mainEl = document.querySelector('main') ?? document.body;
  mainEl.querySelectorAll('div, article, section').forEach((el) => {
    for (const attr of el.attributes) {
      if (attr.name.startsWith('data-') && (
        attr.name.includes('message') || attr.name.includes('role') ||
        attr.name.includes('turn') || attr.name.includes('author') ||
        attr.name.includes('sender') || attr.name.includes('type') ||
        attr.name.includes('testid')
      )) {
        dataAttrs.add(`${attr.name}="${attr.value}"`);
      }
    }
  });

  // Collect class name patterns that look message-related
  const msgClasses = new Set<string>();
  mainEl.querySelectorAll('[class]').forEach((el) => {
    const cls = el.className;
    if (typeof cls !== 'string') return;
    cls.split(/\s+/).forEach((c) => {
      const lower = c.toLowerCase();
      if (lower.match(/message|turn|chat|query|response|answer|human|user|bot|assistant|markdown|prose|bubble/)) {
        msgClasses.add(c);
      }
    });
  });

  console.group(`[LLM Memory] DOM diagnostics for ${adapter!.platform}`);
  console.log('Matching selectors:\n' + (results.length ? results.join('\n') : '  (none matched)'));
  console.log('Message-related data attributes:', [...dataAttrs].slice(0, 40));
  console.log('Message-related CSS classes:', [...msgClasses].slice(0, 40));
  console.groupEnd();
}

let registry: SelectorRegistry = {};

async function init(): Promise<void> {
  // Load selector registry first, then start autosave with the correct registry.
  chrome.runtime.sendMessage({ type: "GET_SELECTOR_REGISTRY" }, (res) => {
    if (res?.success && res.data) {
      registry = res.data as SelectorRegistry;
    }
    chrome.storage.local.get("llm_settings", (result) => {
      const settings = result.llm_settings ?? {};
      if (settings.autoSaveEnabled !== false) {
        createStatusIndicator();
        startAutosave(adapter!, registry);

        // Run diagnostics after a delay to let the page fully render
        setTimeout(() => {
          const selectors = registry[adapter!.platform] ?? undefined;
          const messages = adapter!.extractConversation(selectors);
          if (messages.length < 2) {
            console.warn(`[LLM Memory] ${adapter!.platform}: only extracted ${messages.length} messages — running DOM diagnostics`);
            dumpDomDiagnostics();
          } else {
            console.debug(`[LLM Memory] ${adapter!.platform}: extracted ${messages.length} messages ✓`);
          }
        }, 5000);
      } else {
        updateStatus("hidden");
      }
      initRagIntercept(adapter!, registry).catch(console.warn);
    });
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
  resetRagIntercept();
  stopAutosave();
  startAutosave(adapter!, registry);
  maybeShowBanner();
  initRagIntercept(adapter!, registry).catch(console.warn);
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

    case "GET_CONVERSATION_FULL": {
      scrollAndExtract(selectors).then((messages) => {
        sendResponse({ success: true, messages, platform: adapter!.platform });
      });
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

// ── Full extraction with auto-scroll ──────────────────────────────────────────

async function scrollAndExtract(
  selectors: import("../types.js").PlatformSelectors | undefined,
): Promise<import("../types.js").Message[]> {
  const container =
    document.querySelector('[role="presentation"]') ??
    document.querySelector("main") ??
    document.scrollingElement ??
    document.documentElement;

  // Scroll to top first to load earliest messages
  container.scrollTop = 0;
  await new Promise((r) => setTimeout(r, 1000));

  // Scroll down incrementally until no new content loads
  let prevHeight = 0;
  let stableCount = 0;
  for (let i = 0; i < 50; i++) {
    container.scrollTop = container.scrollHeight;
    await new Promise((r) => setTimeout(r, 800));

    if (container.scrollHeight === prevHeight) {
      stableCount++;
      if (stableCount >= 3) break;
    } else {
      stableCount = 0;
    }
    prevHeight = container.scrollHeight;
  }

  // Small delay for any final rendering
  await new Promise((r) => setTimeout(r, 500));

  return adapter!.extractConversation(selectors);
}

// ── Run ────────────────────────────────────────────────────────────────────────

if (document.readyState === "complete") {
  init();
} else {
  window.addEventListener("load", init);
}
