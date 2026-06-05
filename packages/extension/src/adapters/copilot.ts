import type { Message, SidebarItem, PlatformSelectors } from "../types.js";
import type { PlatformAdapter } from "./base.js";
import { injectIntoElement, deduplicateSidebar, querySelector } from "./base.js";

const DEFAULT_SELECTORS = {
  messagesTurn: [
    '[data-content="user-message"]',
    '[data-content="ai-message"]',
    '[class*="UserMessage"]',
    '[class*="AIMessage"]',
    ".user-turn",
    ".bot-turn",
  ],
  sidebarLinks: [
    'a[href*="/conversations/"]',
    'a[href*="/threads/"]',
    "nav a",
    "aside a",
  ],
  inputField: [
    'textarea[placeholder*="Message"]',
    'div[contenteditable="true"]',
    "textarea",
  ],
  userTurnAttr:       "data-content",
  userTurnValue:      "user-message",
  assistantTurnValue: "ai-message",
};

export class CopilotAdapter implements PlatformAdapter {
  readonly platform = "Copilot" as const;
  readonly domains  = ["copilot.microsoft.com", "bing.com/chat"];

  extractConversation(selectors?: PlatformSelectors): Message[] {
    const s    = selectors ?? DEFAULT_SELECTORS;
    const msgs: Message[] = [];

    if (s.userTurnAttr) {
      const userSel   = `[${s.userTurnAttr}="${s.userTurnValue ?? "user-message"}"]`;
      const assistSel = `[${s.userTurnAttr}="${s.assistantTurnValue ?? "ai-message"}"]`;
      const all = Array.from(
        document.querySelectorAll<HTMLElement>(`${userSel}, ${assistSel}`)
      );
      if (all.length > 0) {
        all.forEach((el) => {
          const attr = el.getAttribute(s.userTurnAttr ?? "data-content") ?? "";
          const role = attr === (s.userTurnValue ?? "user-message") ? "user" : "assistant";
          const content = el.innerText.trim();
          if (content) msgs.push({ role, content, timestamp: Date.now() });
        });
        return msgs.filter((m) => m.content.length > 0);
      }
    }

    for (const sel of (s.messagesTurn ?? DEFAULT_SELECTORS.messagesTurn)) {
      try {
        document.querySelectorAll<HTMLElement>(sel).forEach((el) => {
          const content = el.innerText.trim();
          if (content) msgs.push({ role: "assistant", content, timestamp: Date.now() });
        });
      } catch { /* skip */ }
    }

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
