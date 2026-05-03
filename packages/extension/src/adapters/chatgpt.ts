import type { Message, SidebarItem, PlatformSelectors } from "../types.js";
import type { PlatformAdapter } from "./base.js";
import { injectIntoElement, deduplicateSidebar, querySelector } from "./base.js";

const DEFAULT_SELECTORS = {
  messagesTurn: ["[data-message-author-role]"],
  sidebarLinks: ['a[href^="/c/"]', "nav li a", "nav ol li a"],
  inputField:   ["#prompt-textarea", '[contenteditable="true"]'],
  userTurnAttr:       "data-message-author-role",
  userTurnValue:      "user",
  assistantTurnValue: "assistant",
};

export class ChatGPTAdapter implements PlatformAdapter {
  readonly platform = "ChatGPT" as const;
  readonly domains  = ["chatgpt.com", "chat.openai.com"];

  extractConversation(selectors?: PlatformSelectors): Message[] {
    const s    = selectors ?? DEFAULT_SELECTORS;
    const msgs: Message[] = [];
    const attr = s.userTurnAttr ?? "data-message-author-role";

    document.querySelectorAll<HTMLElement>(`[${attr}]`).forEach((el) => {
      const role = el.getAttribute(attr) as "user" | "assistant";
      if (role !== "user" && role !== "assistant") return;
      const content = el.innerText.trim();
      if (content) msgs.push({ role, content, timestamp: Date.now() });
    });

    return msgs.filter((m) => m.content.length > 0);
  }

  getSidebarConversations(selectors?: PlatformSelectors): SidebarItem[] {
    const sels  = selectors?.sidebarLinks ?? DEFAULT_SELECTORS.sidebarLinks;
    const items: SidebarItem[] = [];

    for (const sel of sels) {
      try {
        document.querySelectorAll<HTMLAnchorElement>(sel).forEach((a) => {
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
