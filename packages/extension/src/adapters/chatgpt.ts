import type { Message, SidebarItem, PlatformSelectors } from "../types.js";
import type { PlatformAdapter } from "./base.js";
import { injectIntoElement, deduplicateSidebar, querySelector, genericSidebarScrape, genericMessageExtract } from "./base.js";

const DEFAULT_SELECTORS = {
  messagesTurn: ["[data-message-author-role]"],
  sidebarLinks: ['a[href^="/c/"]', "nav li a", "nav ol li a"],
  inputField:   ["#prompt-textarea", '[contenteditable="true"]', 'div[id="composer-background"] textarea'],
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

    // Strategy 1: data-message-author-role attribute
    document.querySelectorAll<HTMLElement>(`[${attr}]`).forEach((el) => {
      const role = el.getAttribute(attr) as "user" | "assistant";
      if (role !== "user" && role !== "assistant") return;
      const content = el.innerText.trim();
      if (content) msgs.push({ role, content, timestamp: Date.now() });
    });

    if (msgs.length >= 2) return msgs.filter((m) => m.content.length > 0);

    // Strategy 2: article-based conversation turns
    const articles = document.querySelectorAll<HTMLElement>('article[data-testid^="conversation-turn-"]');
    if (articles.length > 0) {
      articles.forEach((article) => {
        const roleEl = article.querySelector<HTMLElement>(`[${attr}]`);
        const role = roleEl?.getAttribute(attr);
        if (role !== "user" && role !== "assistant") return;
        const contentEl = article.querySelector<HTMLElement>('.markdown, .whitespace-pre-wrap') ?? article;
        const content = contentEl.innerText.trim();
        if (content) msgs.push({ role: role as "user" | "assistant", content, timestamp: Date.now() });
      });
      if (msgs.length >= 2) return msgs.filter((m) => m.content.length > 0);
    }

    // Strategy 3: thread container with alternating user/assistant turns
    const turns = document.querySelectorAll<HTMLElement>('[data-testid^="conversation-turn-"]');
    if (turns.length > 0) {
      turns.forEach((turn, i) => {
        const role = i % 2 === 0 ? "user" as const : "assistant" as const;
        const contentEl = turn.querySelector<HTMLElement>('.markdown, .whitespace-pre-wrap, .text-message') ?? turn;
        const content = contentEl.innerText.trim();
        if (content) msgs.push({ role, content, timestamp: Date.now() });
      });
      if (msgs.length >= 2) return msgs.filter((m) => m.content.length > 0);
    }

    // Strategy 4: generic fallback
    const generic = genericMessageExtract();
    if (generic.length >= 2) return generic;

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

    const result = deduplicateSidebar(items);
    if (result.length > 0) return result;
    return genericSidebarScrape("chatgpt.com");
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

  findSendButton(): HTMLElement | null {
    return (
      document.querySelector<HTMLElement>('[data-testid="send-button"]') ??
      document.querySelector<HTMLElement>('button[aria-label*="Send"]') ??
      null
    );
  }
}
