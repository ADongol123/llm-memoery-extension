import type { Message, SidebarItem, PlatformSelectors } from "../types.js";
import type { PlatformAdapter } from "./base.js";
import { injectIntoElement, deduplicateSidebar, querySelector } from "./base.js";

const DEFAULT_SELECTORS = {
  messagesTurn: [
    '[class*="UserMessage"]',
    '[class*="user-message"]',
    '[class*="AssistantMessage"]',
    '[class*="BotMessage"]',
  ],
  sidebarLinks: [
    'a[href*="/conversation/"]',
    'a[href*="/chat/"]',
    "nav a",
    "aside a",
  ],
  inputField: ["textarea", '[contenteditable="true"]'],
};

const USER_CLASS_PATTERNS    = ["UserMessage", "user-message"];
const ASSISTANT_CLASS_PATTERNS = ["AssistantMessage", "BotMessage"];

export class GrokAdapter implements PlatformAdapter {
  readonly platform = "Grok" as const;
  readonly domains  = ["grok.com"];

  extractConversation(_selectors?: PlatformSelectors): Message[] {
    const msgs: Message[] = [];

    USER_CLASS_PATTERNS.forEach((pattern) => {
      try {
        document.querySelectorAll<HTMLElement>(`[class*="${pattern}"]`).forEach((el) => {
          const content = el.innerText.trim();
          if (content) msgs.push({ role: "user", content, timestamp: Date.now() });
        });
      } catch { /* skip */ }
    });

    ASSISTANT_CLASS_PATTERNS.forEach((pattern) => {
      try {
        document.querySelectorAll<HTMLElement>(`[class*="${pattern}"]`).forEach((el) => {
          const content = el.innerText.trim();
          if (content) msgs.push({ role: "assistant", content, timestamp: Date.now() });
        });
      } catch { /* skip */ }
    });

    // Deduplicate by content
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
