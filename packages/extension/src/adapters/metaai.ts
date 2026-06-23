import type { Message, SidebarItem, PlatformSelectors } from "../types.js";
import type { PlatformAdapter } from "./base.js";
import { injectIntoElement, deduplicateSidebar, querySelector, genericSidebarScrape, genericMessageExtract } from "./base.js";

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

    // Strategy 1: data-sender attribute
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
        if (msgs.length >= 2) return msgs.filter((m) => m.content.length > 0);
      }
    }

    // Strategy 2: Meta AI's message bubbles (class-based)
    const userBubbles = document.querySelectorAll<HTMLElement>('[class*="user-message"], [class*="UserMessage"], [class*="humanMessage"]');
    const aiBubbles = document.querySelectorAll<HTMLElement>('[class*="ai-message"], [class*="MetaMessage"], [class*="botMessage"], [class*="assistant"]');
    if (userBubbles.length > 0 || aiBubbles.length > 0) {
      const items: { el: HTMLElement; role: "user" | "assistant" }[] = [];
      userBubbles.forEach((el) => items.push({ el, role: 'user' }));
      aiBubbles.forEach((el) => items.push({ el, role: 'assistant' }));
      items
        .sort((a, b) =>
          a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
        )
        .forEach(({ el, role }) => {
          const content = el.innerText.trim();
          if (content) msgs.push({ role, content, timestamp: Date.now() });
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

    // Strategy 3: role-based containers
    const roleEls = document.querySelectorAll<HTMLElement>('[role="listitem"], [role="row"]');
    if (roleEls.length >= 2) {
      roleEls.forEach((el, i) => {
        const content = el.innerText.trim();
        if (content && content.length > 1) {
          msgs.push({ role: i % 2 === 0 ? 'user' : 'assistant', content, timestamp: Date.now() });
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

    // Strategy 4: fallback messagesTurn selectors
    for (const sel of (s.messagesTurn ?? DEFAULT_SELECTORS.messagesTurn)) {
      try {
        document.querySelectorAll<HTMLElement>(sel).forEach((el) => {
          const content = el.innerText.trim();
          if (content) msgs.push({ role: "assistant", content, timestamp: Date.now() });
        });
      } catch { /* skip */ }
    }

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
    return genericSidebarScrape("meta.ai");
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
