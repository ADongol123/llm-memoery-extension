import type { Message, SidebarItem, PlatformSelectors } from "../types.js";
import type { PlatformAdapter } from "./base.js";
import { injectIntoElement, deduplicateSidebar, querySelector, genericSidebarScrape, genericMessageExtract } from "./base.js";

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

const USER_CLASS_PATTERNS    = ["UserMessage", "user-message", "human-message"];
const ASSISTANT_CLASS_PATTERNS = ["AssistantMessage", "BotMessage", "assistant-message", "grok-message"];

export class GrokAdapter implements PlatformAdapter {
  readonly platform = "Grok" as const;
  readonly domains  = ["grok.com", "x.com"];

  extractConversation(_selectors?: PlatformSelectors): Message[] {
    const msgs: Message[] = [];

    // Strategy 1: data-testid attributes
    const userTestIds = document.querySelectorAll<HTMLElement>('[data-testid="user-message"], [data-testid="userMessage"]');
    const assistTestIds = document.querySelectorAll<HTMLElement>('[data-testid="assistant-message"], [data-testid="botMessage"], [data-testid="grok-message"]');
    if (userTestIds.length > 0 || assistTestIds.length > 0) {
      const items: { el: HTMLElement; role: "user" | "assistant" }[] = [];
      userTestIds.forEach((el) => items.push({ el, role: "user" }));
      assistTestIds.forEach((el) => items.push({ el, role: "assistant" }));
      items
        .sort((a, b) =>
          a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
        )
        .forEach(({ el, role }) => {
          const content = el.innerText.trim();
          if (content) msgs.push({ role, content, timestamp: Date.now() });
        });
      if (msgs.length >= 2) return msgs;
    }

    // Strategy 2: data-role or role-like attributes
    const roleEls = document.querySelectorAll<HTMLElement>('[data-role="user"], [data-role="assistant"], [data-message-role]');
    if (roleEls.length > 0) {
      roleEls.forEach((el) => {
        const role = (el.getAttribute('data-role') || el.getAttribute('data-message-role') || '').toLowerCase();
        if (role === 'user' || role === 'human') {
          msgs.push({ role: 'user', content: el.innerText.trim(), timestamp: Date.now() });
        } else if (role === 'assistant' || role === 'bot' || role === 'grok') {
          msgs.push({ role: 'assistant', content: el.innerText.trim(), timestamp: Date.now() });
        }
      });
      if (msgs.length >= 2) {
        const seen = new Set<string>();
        return msgs.filter((m) => {
          if (seen.has(m.content) || !m.content) return false;
          seen.add(m.content);
          return true;
        });
      }
    }

    // Strategy 3: class-based patterns
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

    // Strategy 4: generic fallback
    if (msgs.length < 2) {
      const generic = genericMessageExtract();
      if (generic.length >= 2) return generic;
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

    const result = deduplicateSidebar(items);
    if (result.length > 0) return result;
    return genericSidebarScrape("grok.com");
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
