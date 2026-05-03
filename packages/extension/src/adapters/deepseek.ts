import type { Message, SidebarItem, PlatformSelectors } from "../types.js";
import type { PlatformAdapter } from "./base.js";
import { injectIntoElement, deduplicateSidebar, querySelector } from "./base.js";

const DEFAULT_SELECTORS = {
  messagesTurn: [
    '[class*="user-message"]',
    '[class*="UserMessage"]',
    '[data-role="user"]',
    '[class*="assistant-message"]',
    '[class*="AssistantMessage"]',
    '[data-role="assistant"]',
    ".ds-markdown",
  ],
  sidebarLinks: [
    'a[href*="/chat/"]',
    'a[href*="/session/"]',
    ".conversation-list a",
    ".chat-list a",
    "aside a",
    "nav a",
  ],
  inputField: ["textarea", '[contenteditable="true"]'],
  userTurnAttr:       "data-role",
  userTurnValue:      "user",
  assistantTurnValue: "assistant",
};

const USER_PATTERNS      = ["user-message", "UserMessage"];
const ASSISTANT_PATTERNS = ["assistant-message", "AssistantMessage", "ds-markdown"];

export class DeepSeekAdapter implements PlatformAdapter {
  readonly platform = "DeepSeek" as const;
  readonly domains  = ["chat.deepseek.com"];

  extractConversation(selectors?: PlatformSelectors): Message[] {
    const msgs: Message[] = [];
    const s = selectors ?? DEFAULT_SELECTORS;

    // Try data-role attribute first
    if (s.userTurnAttr) {
      const attr      = s.userTurnAttr;
      const userVal   = s.userTurnValue ?? "user";
      const assistVal = s.assistantTurnValue ?? "assistant";

      const userEls = Array.from(
        document.querySelectorAll<HTMLElement>(`[${attr}="${userVal}"]`)
      );
      const assistEls = Array.from(
        document.querySelectorAll<HTMLElement>(`[${attr}="${assistVal}"]`)
      );

      if (userEls.length || assistEls.length) {
        [...userEls.map((el) => ({ el, role: "user" as const })),
         ...assistEls.map((el) => ({ el, role: "assistant" as const }))]
          .sort((a, b) =>
            a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
          )
          .forEach(({ el, role }) => {
            const content = el.innerText.trim();
            if (content) msgs.push({ role, content, timestamp: Date.now() });
          });
        return msgs.filter((m) => m.content.length > 0);
      }
    }

    // Fallback: class-based
    USER_PATTERNS.forEach((pattern) => {
      try {
        document.querySelectorAll<HTMLElement>(`[class*="${pattern}"]`).forEach((el) => {
          const content = el.innerText.trim();
          if (content) msgs.push({ role: "user", content, timestamp: Date.now() });
        });
      } catch { /* skip */ }
    });

    ASSISTANT_PATTERNS.forEach((pattern) => {
      try {
        document.querySelectorAll<HTMLElement>(`[class*="${pattern}"]`).forEach((el) => {
          const content = el.innerText.trim();
          if (content) msgs.push({ role: "assistant", content, timestamp: Date.now() });
        });
      } catch { /* skip */ }
    });

    const seen = new Set<string>();
    return msgs.filter((m) => {
      if (seen.has(m.content)) return false;
      seen.add(m.content);
      return m.content.length > 0;
    });
  }

  getSidebarConversations(selectors?: PlatformSelectors): SidebarItem[] {
    const sels  = selectors?.sidebarLinks ?? DEFAULT_SELECTORS.sidebarLinks;
    const items: SidebarItem[] = [];

    for (const sel of sels) {
      try {
        document.querySelectorAll<HTMLAnchorElement>(sel).forEach((a) => {
          if (a.href === location.href) return;
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
