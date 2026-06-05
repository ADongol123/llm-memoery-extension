import type { Message, SidebarItem, PlatformSelectors } from "../types.js";
import type { PlatformAdapter } from "./base.js";
import { injectIntoElement, deduplicateSidebar, querySelector } from "./base.js";

const DEFAULT_SELECTORS = {
  messagesTurn: [
    '[data-sender="user"]',
    '[data-sender="assistant"]',
    '[class*="user-message"]',
    '[class*="ai-message"]',
    '[class*="HumanMessage"]',
    '[class*="MetaMessage"]',
  ],
  sidebarLinks: [
    'a[href*="/c/"]',
    'a[href*="/thread/"]',
    'a[href*="/conversation/"]',
    "nav a",
    "aside a",
  ],
  inputField: [
    '[contenteditable="true"][role="textbox"]',
    'div[contenteditable="true"]',
    "textarea",
  ],
  userTurnAttr:       "data-sender",
  userTurnValue:      "user",
  assistantTurnValue: "assistant",
};

export class MetaAIAdapter implements PlatformAdapter {
  readonly platform = "MetaAI" as const;
  readonly domains  = ["meta.ai", "www.meta.ai"];

  extractConversation(selectors?: PlatformSelectors): Message[] {
    const s    = selectors ?? DEFAULT_SELECTORS;
    const msgs: Message[] = [];

    if (s.userTurnAttr) {
      const userSel   = `[${s.userTurnAttr}="${s.userTurnValue ?? "user"}"]`;
      const assistSel = `[${s.userTurnAttr}="${s.assistantTurnValue ?? "assistant"}"]`;
      const all = Array.from(
        document.querySelectorAll<HTMLElement>(`${userSel}, ${assistSel}`)
      );
      if (all.length > 0) {
        all.forEach((el) => {
          const attr = el.getAttribute(s.userTurnAttr ?? "data-sender") ?? "";
          const role = attr === (s.userTurnValue ?? "user") ? "user" : "assistant";
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
