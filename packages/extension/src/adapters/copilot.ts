import type { Message, SidebarItem, PlatformSelectors } from "../types.js";
import type { PlatformAdapter } from "./base.js";
import { injectIntoElement, deduplicateSidebar, querySelector, genericSidebarScrape, genericMessageExtract } from "./base.js";

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

    // Strategy 1: data-content attributes
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
        if (msgs.length >= 2) return msgs.filter((m) => m.content.length > 0);
      }
    }

    // Strategy 2: Copilot web component turn structure
    const turnGroups = document.querySelectorAll<HTMLElement>('[class*="turn-group"], [class*="TurnGroup"], [class*="chat-turn"]');
    if (turnGroups.length > 0) {
      turnGroups.forEach((group) => {
        const cls = group.className.toLowerCase();
        const role = cls.includes('user') || cls.includes('human') ? 'user' as const : 'assistant' as const;
        const content = group.innerText.trim();
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

    // Strategy 3: Shadow DOM piercing for Copilot web components
    const cibHost = document.querySelector('cib-serp');
    const shadow1 = cibHost?.shadowRoot;
    if (shadow1) {
      const conversation = shadow1.querySelector('cib-conversation');
      const shadow2 = conversation?.shadowRoot;
      if (shadow2) {
        const turns = shadow2.querySelectorAll('cib-chat-turn');
        turns.forEach((turn) => {
          const shadow3 = turn.shadowRoot;
          if (!shadow3) return;
          const userMsg = shadow3.querySelector('cib-message-group[source="user"]');
          const botMsg = shadow3.querySelector('cib-message-group[source="bot"]');
          if (userMsg) {
            const content = (userMsg as HTMLElement).innerText.trim();
            if (content) msgs.push({ role: 'user', content, timestamp: Date.now() });
          }
          if (botMsg) {
            const content = (botMsg as HTMLElement).innerText.trim();
            if (content) msgs.push({ role: 'assistant', content, timestamp: Date.now() });
          }
        });
        if (msgs.length >= 2) return msgs.filter((m) => m.content.length > 0);
      }
    }

    // Strategy 4: class-based fallback
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
    return genericSidebarScrape("copilot.microsoft.com");
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
