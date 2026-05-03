import type { Message, SidebarItem, PlatformSelectors } from "../types.js";
import type { PlatformAdapter } from "./base.js";
import { injectIntoElement, deduplicateSidebar, querySelector } from "./base.js";

const DEFAULT_SELECTORS = {
  messagesTurn: [
    ".query-text",
    ".user-query-bubble .query-text-container",
    "message-content .markdown",
    "model-response .response-text",
  ],
  sidebarLinks: [
    'a[href*="/app/"]',
    "bard-sidenav-item a",
    ".sidenav-item a",
  ],
  inputField: [
    '.ql-editor[contenteditable="true"]',
    'rich-textarea [contenteditable="true"]',
    '[contenteditable="true"]',
  ],
};

const USER_SELS = [
  ".query-text",
  ".user-query-bubble .query-text-container",
];

const ASSISTANT_SELS = [
  "message-content .markdown",
  "model-response .response-text",
];

export class GeminiAdapter implements PlatformAdapter {
  readonly platform = "Gemini" as const;
  readonly domains  = ["gemini.google.com"];

  extractConversation(_selectors?: PlatformSelectors): Message[] {
    // Gemini's structure doesn't have role attributes — we interleave by DOM position
    const items: { el: HTMLElement; role: "user" | "assistant" }[] = [];

    USER_SELS.forEach((sel) => {
      try {
        document.querySelectorAll<HTMLElement>(sel).forEach((el) =>
          items.push({ el, role: "user" })
        );
      } catch { /* skip */ }
    });

    ASSISTANT_SELS.forEach((sel) => {
      try {
        document.querySelectorAll<HTMLElement>(sel).forEach((el) =>
          items.push({ el, role: "assistant" })
        );
      } catch { /* skip */ }
    });

    return items
      .sort((a, b) =>
        a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
      )
      .map(({ el, role }) => ({
        role,
        content: el.innerText.trim(),
        timestamp: Date.now(),
      }))
      .filter((m) => m.content.length > 0);
  }

  getSidebarConversations(selectors?: PlatformSelectors): SidebarItem[] {
    const sels  = selectors?.sidebarLinks ?? DEFAULT_SELECTORS.sidebarLinks;
    const items: SidebarItem[] = [];

    for (const sel of sels) {
      try {
        document.querySelectorAll<HTMLAnchorElement>(sel).forEach((a) => {
          // Skip anchor-only links (gemini.google.com/app# fragments)
          if (a.href.includes("gemini.google.com/app#")) return;
          const title = a.innerText.trim();
          if (title && a.href) items.push({ title, url: a.href });
        });
        if (items.length) break;
      } catch { /* skip */ }
    }

    return deduplicateSidebar(items);
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
