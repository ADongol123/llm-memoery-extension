import type { Message, SidebarItem, PlatformSelectors } from "../types.js";
import type { PlatformAdapter } from "./base.js";
import { injectIntoElement, deduplicateSidebar, querySelector, genericSidebarScrape, genericMessageExtract } from "./base.js";

const DEFAULT_SELECTORS = {
  messagesTurn: [
    '[data-testid="user-message"]',
    '[data-testid="answer"]',
    ".user-query-bubble",
    ".answer-content",
    '[class*="UserQuery"]',
    '[class*="AnswerContent"]',
  ],
  sidebarLinks: [
    'a[href*="/search/"]',
    'a[href*="/collections/"]',
    "nav a",
    "aside a",
  ],
  inputField: ['textarea[placeholder*="Ask"]', "textarea", '[contenteditable="true"]'],
  userTurnAttr:       "data-testid",
  userTurnValue:      "user-message",
  assistantTurnValue: "answer",
};

export class PerplexityAdapter implements PlatformAdapter {
  readonly platform = "Perplexity" as const;
  readonly domains  = ["perplexity.ai"];

  extractConversation(selectors?: PlatformSelectors): Message[] {
    const s    = selectors ?? DEFAULT_SELECTORS;
    const msgs: Message[] = [];

    // Strategy 1: data-testid attributes
    if (s.userTurnAttr) {
      const userSel  = `[${s.userTurnAttr}="${s.userTurnValue ?? "user-message"}"]`;
      const assistSel = `[${s.userTurnAttr}="${s.assistantTurnValue ?? "answer"}"]`;
      const all = Array.from(
        document.querySelectorAll<HTMLElement>(`${userSel}, ${assistSel}`)
      );
      if (all.length > 0) {
        all.forEach((el) => {
          const attr = el.getAttribute(s.userTurnAttr ?? "data-testid") ?? "";
          const role = attr === (s.userTurnValue ?? "user-message") ? "user" : "assistant";
          const content = el.innerText.trim();
          if (content) msgs.push({ role, content, timestamp: Date.now() });
        });
        if (msgs.length >= 2) return msgs.filter((m) => m.content.length > 0);
      }
    }

    // Strategy 2: query/answer block structure (Perplexity's thread-based UI)
    const queryBlocks = document.querySelectorAll<HTMLElement>('[class*="QueryBlock"], [class*="query-block"], [class*="UserQuery"]');
    const answerBlocks = document.querySelectorAll<HTMLElement>('[class*="AnswerBlock"], [class*="answer-block"], [class*="AnswerContent"], .prose');
    if (queryBlocks.length > 0 || answerBlocks.length > 0) {
      const items: { el: HTMLElement; role: "user" | "assistant" }[] = [];
      queryBlocks.forEach((el) => items.push({ el, role: "user" }));
      answerBlocks.forEach((el) => items.push({ el, role: "assistant" }));
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

    // Strategy 3: thread-based layout with question headings and answer sections
    const threadItems = document.querySelectorAll<HTMLElement>('[class*="ThreadItem"], [class*="thread-item"], [class*="SearchResult"]');
    if (threadItems.length > 0) {
      threadItems.forEach((item) => {
        // Find the query text (usually a heading or bold text at the top)
        const queryEl = item.querySelector<HTMLElement>('h2, h3, [class*="query"], [class*="question"]');
        if (queryEl) {
          const qContent = queryEl.innerText.trim();
          if (qContent) msgs.push({ role: 'user', content: qContent, timestamp: Date.now() });
        }
        // Find the answer text (markdown/prose content)
        const answerEl = item.querySelector<HTMLElement>('.prose, .markdown, [class*="answer"], [class*="Answer"]');
        if (answerEl) {
          const aContent = answerEl.innerText.trim();
          if (aContent) msgs.push({ role: 'assistant', content: aContent, timestamp: Date.now() });
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

    // Strategy 4: fallback with messagesTurn selectors
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
    return genericSidebarScrape("perplexity.ai");
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
