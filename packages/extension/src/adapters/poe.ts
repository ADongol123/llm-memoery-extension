import type { Message, SidebarItem, PlatformSelectors } from "../types.js";
import type { PlatformAdapter } from "./base.js";
import { injectIntoElement, deduplicateSidebar, querySelector, genericSidebarScrape, genericMessageExtract } from "./base.js";

const DEFAULT_SELECTORS = {
  messagesTurn: [
    '[class*="humanMessageBubble"]',
    '[class*="botMessageBubble"]',
    '[class*="Message_humanMessage"]',
    '[class*="Message_botMessage"]',
    '[data-message-type="human"]',
    '[data-message-type="bot"]',
  ],
  sidebarLinks: [
    'a[href*="/chat/"]',
    'a[href*="/conversation/"]',
    "nav a",
    "aside a",
  ],
  inputField: [
    'textarea[class*="GrowingTextArea"]',
    "textarea",
    '[contenteditable="true"]',
  ],
  userTurnAttr:       "data-message-type",
  userTurnValue:      "human",
  assistantTurnValue: "bot",
};

const USER_PATTERNS      = ["humanMessageBubble", "Message_humanMessage"];
const ASSISTANT_PATTERNS = ["botMessageBubble", "Message_botMessage"];

export class PoeAdapter implements PlatformAdapter {
  readonly platform = "Poe" as const;
  readonly domains  = ["poe.com"];

  extractConversation(selectors?: PlatformSelectors): Message[] {
    const s    = selectors ?? DEFAULT_SELECTORS;
    const msgs: Message[] = [];

    // Strategy 1: data-message-type attribute
    if (s.userTurnAttr) {
      const userSel   = `[${s.userTurnAttr}="${s.userTurnValue ?? "human"}"]`;
      const assistSel = `[${s.userTurnAttr}="${s.assistantTurnValue ?? "bot"}"]`;
      const all = Array.from(
        document.querySelectorAll<HTMLElement>(`${userSel}, ${assistSel}`)
      );
      if (all.length > 0) {
        all.forEach((el) => {
          const attr = el.getAttribute(s.userTurnAttr ?? "data-message-type") ?? "";
          const role = attr === (s.userTurnValue ?? "human") ? "user" : "assistant";
          const content = el.innerText.trim();
          if (content) msgs.push({ role, content, timestamp: Date.now() });
        });
        if (msgs.length >= 2) return msgs.filter((m) => m.content.length > 0);
      }
    }

    // Strategy 2: class-based message bubbles
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

    if (msgs.length >= 2) {
      const seen = new Set<string>();
      return msgs.filter((m) => {
        if (seen.has(m.content)) return false;
        seen.add(m.content);
        return m.content.length > 0;
      });
    }

    // Strategy 3: Poe's message pair structure (each message in a container with role info)
    const messageRows = document.querySelectorAll<HTMLElement>('[class*="Message_row"], [class*="message_row"], [class*="ChatMessage"]');
    if (messageRows.length >= 2) {
      messageRows.forEach((row) => {
        const cls = row.className.toLowerCase();
        const isHuman = cls.includes('human') || cls.includes('user');
        const role = isHuman ? 'user' as const : 'assistant' as const;
        const contentEl = row.querySelector<HTMLElement>('.markdown, [class*="Markdown"], [class*="messageText"]') ?? row;
        const content = contentEl.innerText.trim();
        if (content) msgs.push({ role, content, timestamp: Date.now() });
      });
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
    return genericSidebarScrape("poe.com");
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
