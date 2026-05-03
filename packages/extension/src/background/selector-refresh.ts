// Fetches the remote selector registry and caches it locally.
// Called on startup and periodically via alarm.
// If the fetch fails, falls back to whatever is cached (even stale).

import type { SelectorRegistry } from "../types.js";
import { cacheSelectors, getCachedSelectors } from "../local-db/index.js";

declare const __SELECTORS_URL__: string;

// Bundled fallback — always available even offline
const BUNDLED_DEFAULTS: SelectorRegistry = {
  Claude: {
    messagesTurn: ['[data-testid="human-turn"]', '[data-testid="ai-turn"]', "[data-message-role]"],
    sidebarLinks: ['nav a[href*="/chat/"]', 'a[href*="/chat/"]'],
    inputField:   ['div.ProseMirror[contenteditable="true"]', '[contenteditable="true"]'],
    userTurnAttr:       "data-testid",
    userTurnValue:      "human-turn",
    assistantTurnValue: "ai-turn",
  },
  ChatGPT: {
    messagesTurn: ["[data-message-author-role]"],
    sidebarLinks: ['a[href^="/c/"]', "nav li a"],
    inputField:   ["#prompt-textarea", '[contenteditable="true"]'],
    userTurnAttr:       "data-message-author-role",
    userTurnValue:      "user",
    assistantTurnValue: "assistant",
  },
  Gemini: {
    messagesTurn: [".query-text", "message-content .markdown", "model-response .response-text"],
    sidebarLinks: ['a[href*="/app/"]', "bard-sidenav-item a"],
    inputField:   ['.ql-editor[contenteditable="true"]', '[contenteditable="true"]'],
  },
  Grok: {
    messagesTurn: ['[class*="UserMessage"]', '[class*="AssistantMessage"]'],
    sidebarLinks: ['a[href*="/conversation/"]', "nav a"],
    inputField:   ["textarea", '[contenteditable="true"]'],
  },
  DeepSeek: {
    messagesTurn: ['[data-role="user"]', '[data-role="assistant"]', ".ds-markdown"],
    sidebarLinks: ['a[href*="/chat/"]', 'a[href*="/session/"]'],
    inputField:   ["textarea", '[contenteditable="true"]'],
  },
};

export async function refreshSelectorRegistry(): Promise<SelectorRegistry> {
  const url = __SELECTORS_URL__;

  if (!url) {
    const cached = await getCachedSelectors();
    return cached ?? BUNDLED_DEFAULTS;
  }

  try {
    const res = await fetch(url, {
      cache: "no-cache",
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();

    // Flatten the registry format from the Edge Function response
    const registry: SelectorRegistry = {};
    for (const [platform, entry] of Object.entries(data)) {
      registry[platform as keyof SelectorRegistry] = (entry as { selectors: SelectorRegistry[keyof SelectorRegistry] }).selectors;
    }

    await cacheSelectors(registry);
    return registry;
  } catch (e) {
    console.warn("[LLM Memory] Selector refresh failed, using cache:", e);
    const cached = await getCachedSelectors();
    return cached ?? BUNDLED_DEFAULTS;
  }
}

export { BUNDLED_DEFAULTS };
