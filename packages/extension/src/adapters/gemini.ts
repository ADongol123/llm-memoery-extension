import type { Message, SidebarItem, PlatformSelectors } from "../types.js";
import type { PlatformAdapter } from "./base.js";
import { injectIntoElement, deduplicateSidebar, querySelector, genericSidebarScrape, genericMessageExtract } from "./base.js";

const DEFAULT_SELECTORS = {
  messagesTurn: [
    ".query-text",
    ".user-query-bubble .query-text-container",
    "message-content .markdown",
    "model-response .response-text",
  ],
  sidebarLinks: [
    'a[href*="/app/"]',
    'a[href*="/gem/"]',
    "bard-sidenav-item a",
    ".sidenav-item a",
  ],
  inputField: [
    '.ql-editor[contenteditable="true"]',
    'rich-textarea [contenteditable="true"]',
    '.input-area [contenteditable="true"]',
    '[contenteditable="true"]',
  ],
};

const USER_SELS = [
  ".query-text",
  ".user-query-bubble .query-text-container",
  ".user-query-content",
  '[data-turn-role="user"]',
  'user-query .query-text',
  '.query-content',
];

const ASSISTANT_SELS = [
  "message-content .markdown",
  "model-response .response-text",
  ".model-response-text .markdown",
  ".response-container-content .markdown",
  '[data-turn-role="model"]',
  'model-response .markdown',
  '.response-content',
];

function queryShadowAndLight(selectors: string[]): HTMLElement[] {
  const results: HTMLElement[] = [];
  for (const sel of selectors) {
    try {
      document.querySelectorAll<HTMLElement>(sel).forEach((el) => results.push(el));
      if (results.length) return results;
    } catch { /* skip */ }
  }
  // Try piercing shadow DOM of common Gemini web components
  const hosts = document.querySelectorAll('message-content, model-response, user-query, conversation-turn');
  hosts.forEach((host) => {
    const shadow = (host as HTMLElement).shadowRoot;
    if (!shadow) return;
    for (const sel of selectors) {
      try {
        shadow.querySelectorAll<HTMLElement>(sel).forEach((el) => results.push(el));
      } catch { /* skip */ }
    }
  });
  return results;
}

export class GeminiAdapter implements PlatformAdapter {
  readonly platform = "Gemini" as const;
  readonly domains  = ["gemini.google.com"];

  extractConversation(_selectors?: PlatformSelectors): Message[] {
    const items: { el: HTMLElement; role: "user" | "assistant" }[] = [];

    // Strategy 1: data-turn-role attributes (newer Gemini)
    const turnRoleEls = document.querySelectorAll<HTMLElement>('[data-turn-role]');
    if (turnRoleEls.length > 0) {
      turnRoleEls.forEach((el) => {
        const turnRole = el.getAttribute('data-turn-role');
        const role = turnRole === 'user' ? 'user' as const : 'assistant' as const;
        items.push({ el, role });
      });
    }

    // Strategy 2: conversation-turn elements (Gemini web components)
    if (items.length === 0) {
      const turns = document.querySelectorAll<HTMLElement>('conversation-turn, .conversation-turn');
      if (turns.length > 0) {
        turns.forEach((turn) => {
          const isUser = turn.querySelector('.query-text, .user-query-content, user-query, [data-turn-role="user"]');
          const role = isUser ? 'user' as const : 'assistant' as const;
          items.push({ el: turn, role });
        });
      }
    }

    // Strategy 3: class-based selectors
    if (items.length === 0) {
      queryShadowAndLight(USER_SELS).forEach((el) =>
        items.push({ el, role: "user" })
      );
      queryShadowAndLight(ASSISTANT_SELS).forEach((el) =>
        items.push({ el, role: "assistant" })
      );
    }

    // Strategy 4: look for turn containers with user/model indicators
    if (items.length === 0) {
      const allTurns = document.querySelectorAll<HTMLElement>('[class*="turn"], [class*="Turn"]');
      allTurns.forEach((turn) => {
        const text = turn.className.toLowerCase();
        if (text.includes('user') || text.includes('human') || text.includes('query')) {
          items.push({ el: turn, role: 'user' });
        } else if (text.includes('model') || text.includes('bot') || text.includes('response') || text.includes('assistant')) {
          items.push({ el: turn, role: 'assistant' });
        }
      });
    }

    const result = items
      .sort((a, b) =>
        a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
      )
      .map(({ el, role }) => ({
        role,
        content: el.innerText.trim(),
        timestamp: Date.now(),
      }))
      .filter((m) => m.content.length > 0);

    if (result.length >= 2) return result;
    return genericMessageExtract();
  }

  getSidebarConversations(selectors?: PlatformSelectors): SidebarItem[] {
    const sels  = selectors?.sidebarLinks ?? DEFAULT_SELECTORS.sidebarLinks;
    const items: SidebarItem[] = [];

    for (const sel of sels) {
      try {
        document.querySelectorAll<HTMLAnchorElement>(sel).forEach((a) => {
          if (a.href.includes("gemini.google.com/app#")) return;
          const title = a.innerText.trim();
          if (title && a.href) items.push({ title, url: a.href });
        });
        if (items.length) break;
      } catch { /* skip */ }
    }

    const result = deduplicateSidebar(items);
    if (result.length > 0) return result;
    return genericSidebarScrape("gemini.google.com");
  }

  findInputElement(selectors?: PlatformSelectors): HTMLElement | null {
    return querySelector<HTMLElement>(selectors?.inputField ?? DEFAULT_SELECTORS.inputField);
  }

  injectText(text: string, selectors?: PlatformSelectors): boolean {
    const el = this.findInputElement(selectors);
    if (!el) return false;
    return injectIntoElement(el, text);
  }

  isNewConversation(): boolean {
    return this.extractConversation().length === 0;
  }
}
