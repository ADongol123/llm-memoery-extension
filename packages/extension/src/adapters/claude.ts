import type { Message, SidebarItem, PlatformSelectors } from "../types.js";
import type { PlatformAdapter } from "./base.js";
import { injectIntoElement, deduplicateSidebar, querySelectorAll, querySelector } from "./base.js";

const DEFAULT_SELECTORS = {
  messagesTurn: [
    '[data-testid="human-turn"]',
    '[data-testid="ai-turn"]',
    "[data-message-role]",
  ],
  sidebarLinks: ['nav a[href*="/chat/"]', 'a[href*="/chat/"]'],
  inputField:   ['div.ProseMirror[contenteditable="true"]', '[contenteditable="true"]'],
  userTurnAttr:        "data-testid",
  userTurnValue:       "human-turn",
  assistantTurnValue:  "ai-turn",
};

export class ClaudeAdapter implements PlatformAdapter {
  readonly platform = "Claude" as const;
  readonly domains  = ["claude.ai"];

  extractConversation(selectors?: PlatformSelectors): Message[] {
    const s    = selectors ?? DEFAULT_SELECTORS;
    const msgs: Message[] = [];

    // Primary: testid-based turns
    const turnSelectors = s.messagesTurn ?? DEFAULT_SELECTORS.messagesTurn;

    // Try attribute-based approach first (most reliable)
    const attrSel = s.userTurnAttr ? `[${s.userTurnAttr}]` : null;
    if (attrSel) {
      const humanSel  = `[${s.userTurnAttr}="${s.userTurnValue ?? "human-turn"}"]`;
      const assistSel = `[${s.userTurnAttr}="${s.assistantTurnValue ?? "ai-turn"}"]`;

      const allTurns = Array.from(
        document.querySelectorAll(`${humanSel}, ${assistSel}`)
      ) as HTMLElement[];

      if (allTurns.length > 0) {
        allTurns.forEach((el) => {
          const attr    = el.getAttribute(s.userTurnAttr ?? "data-testid") ?? "";
          const role    = attr === (s.userTurnValue ?? "human-turn") ? "user" : "assistant";
          const content = el.innerText.trim();
          if (content) msgs.push({ role, content, timestamp: Date.now() });
        });
        return msgs.filter((m) => m.content.length > 0);
      }
    }

    // Fallback: data-message-role
    document.querySelectorAll<HTMLElement>("[data-message-role]").forEach((el) => {
      const role = el.getAttribute("data-message-role") === "human" ? "user" : "assistant";
      const content = el.innerText.trim();
      if (content) msgs.push({ role, content, timestamp: Date.now() });
    });

    return msgs.filter((m) => m.content.length > 0);
  }

  getSidebarConversations(selectors?: PlatformSelectors): SidebarItem[] {
    const sidebarSels = selectors?.sidebarLinks ?? DEFAULT_SELECTORS.sidebarLinks;
    const items: SidebarItem[] = [];

    for (const sel of sidebarSels) {
      try {
        document.querySelectorAll<HTMLAnchorElement>(sel).forEach((a) => {
          const title = a.innerText.trim();
          if (title && a.href) items.push({ title, url: a.href });
        });
        if (items.length) break;
      } catch { /* invalid selector */ }
    }

    return deduplicateSidebar(items);
  }

  findInputElement(selectors?: PlatformSelectors): HTMLElement | null {
    const inputSels = selectors?.inputField ?? DEFAULT_SELECTORS.inputField;
    return querySelector<HTMLElement>(inputSels);
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
