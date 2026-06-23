// Fetches the remote selector registry and caches it locally.
// Called on startup and periodically via alarm.
// If the fetch fails, falls back to whatever is cached (even stale).

import type { SelectorRegistry } from "../types.js";
import { cacheSelectors, getCachedSelectors } from "../local-db/index.js";

// Selectors are now bundled — no remote fetch needed

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
  const cached = await getCachedSelectors();
  if (cached && Object.keys(cached).length > 0) return cached;

  await cacheSelectors(BUNDLED_DEFAULTS);
  return BUNDLED_DEFAULTS;
}

export { BUNDLED_DEFAULTS };
