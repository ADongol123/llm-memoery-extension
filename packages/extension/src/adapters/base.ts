import type { Message, Platform, SidebarItem, PlatformSelectors } from "../types.js";

// Every platform adapter implements this interface.
// Adding a new LLM = create one file implementing this.
export interface PlatformAdapter {
  readonly platform: Platform;
  readonly domains:  string[];

  extractConversation(selectors?: PlatformSelectors): Message[];
  getSidebarConversations(selectors?: PlatformSelectors): SidebarItem[];
  findInputElement(selectors?: PlatformSelectors): HTMLElement | null;
  injectText(text: string, selectors?: PlatformSelectors): boolean;
  isNewConversation(): boolean;
  findSendButton?(): HTMLElement | null;
}

// Shared injection logic — works for contenteditable and textarea
export function injectIntoElement(el: HTMLElement, text: string): boolean {
  el.focus();

  if (el.tagName === "TEXTAREA") {
    const nativeSet = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype, "value"
    )?.set;
    if (nativeSet) {
      nativeSet.call(el, text);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    } else {
      (el as HTMLTextAreaElement).value = text;
    }
  } else {
    // contenteditable
    document.execCommand("selectAll", false, undefined);
    document.execCommand("insertText", false, text);

    // Verify insertion succeeded (execCommand is deprecated on some browsers)
    if (!el.textContent?.includes(text.slice(0, 30))) {
      el.textContent = text;
      el.dispatchEvent(
        new InputEvent("input", { bubbles: true, inputType: "insertText", data: text })
      );
    }
  }

  el.focus();
  return true;
}

// Deduplicate sidebar items by URL, exclude current page
export function deduplicateSidebar(items: SidebarItem[]): SidebarItem[] {
  const current = location.href;
  const seen    = new Set<string>();
  return items.filter(({ title, url }) => {
    if (!title || !url || url === current || seen.has(url)) return false;
    seen.add(url);
    return true;
  }).slice(0, 50);
}

// Generic sidebar scraper — finds conversation-like links anywhere on the page.
// Used as a fallback when platform-specific selectors fail.
export function genericSidebarScrape(domain: string): SidebarItem[] {
  const SKIP_PATTERNS = /\/(settings|profile|account|login|signup|auth|help|faq|terms|privacy|about|pricing|api|docs|blog|status)\b/i;
  const SKIP_TEXTS = /^(settings|profile|log ?out|sign ?out|sign ?in|log ?in|help|new chat|upgrade|plus|pro|premium|team|enterprise)$/i;

  const items: SidebarItem[] = [];
  const origin = location.origin;

  document.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((a) => {
    const href = a.href;
    if (!href || !href.startsWith(origin)) return;

    const path = new URL(href).pathname;
    if (path === "/" || path.length < 3) return;
    if (SKIP_PATTERNS.test(path)) return;

    const title = a.innerText.trim();
    if (!title || title.length < 2 || title.length > 200) return;
    if (SKIP_TEXTS.test(title)) return;

    // Must look like a conversation link (has an ID-like segment in the path)
    const segments = path.split("/").filter(Boolean);
    const hasId = segments.some((s) => s.length >= 8 || /[0-9a-f-]{8,}/.test(s) || /^\d+$/.test(s));
    if (!hasId) return;

    items.push({ title, url: href });
  });

  return deduplicateSidebar(items);
}

// Generic message extraction — finds alternating message containers.
// Tries common patterns used across chat UIs.
export function genericMessageExtract(): Message[] {
  const msgs: Message[] = [];

  // Strategy A: any element with data attributes indicating role
  const roleAttrs = ["data-role", "data-message-role", "data-message-author-role", "data-sender", "data-testid", "data-turn-role"];
  for (const attr of roleAttrs) {
    const els = document.querySelectorAll<HTMLElement>(`[${attr}]`);
    const items: { el: HTMLElement; role: "user" | "assistant" }[] = [];
    els.forEach((el) => {
      const val = (el.getAttribute(attr) ?? "").toLowerCase();
      if (val.includes("user") || val.includes("human")) {
        items.push({ el, role: "user" });
      } else if (val.includes("assistant") || val.includes("bot") || val.includes("ai") || val.includes("model")) {
        items.push({ el, role: "assistant" });
      }
    });
    if (items.length >= 2) {
      items
        .sort((a, b) => a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1)
        .forEach(({ el, role }) => {
          const content = el.innerText.trim();
          if (content) msgs.push({ role, content, timestamp: Date.now() });
        });
      if (msgs.length >= 2) return deduplicateMessages(msgs);
    }
  }

  // Strategy B: class-name patterns
  const userPatterns = ["user", "human", "query"];
  const assistPatterns = ["assistant", "bot", "response", "answer", "model", "ai-message"];
  const items: { el: HTMLElement; role: "user" | "assistant" }[] = [];

  const mainEl = document.querySelector('main') ?? document.body;
  mainEl.querySelectorAll<HTMLElement>('[class]').forEach((el) => {
    const cls = typeof el.className === 'string' ? el.className.toLowerCase() : '';
    if (!cls) return;
    const isMessageLike = cls.includes("message") || cls.includes("turn") || cls.includes("bubble") || cls.includes("content") || cls.includes("markdown");
    if (!isMessageLike) return;

    const isUser = userPatterns.some((p) => cls.includes(p));
    const isAssist = assistPatterns.some((p) => cls.includes(p));
    if (isUser && !isAssist) items.push({ el, role: "user" });
    else if (isAssist && !isUser) items.push({ el, role: "assistant" });
  });

  if (items.length >= 2) {
    items
      .sort((a, b) => a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1)
      .forEach(({ el, role }) => {
        const content = el.innerText.trim();
        if (content) msgs.push({ role, content, timestamp: Date.now() });
      });
    if (msgs.length >= 2) return deduplicateMessages(msgs);
  }

  return msgs;
}

function deduplicateMessages(msgs: Message[]): Message[] {
  const seen = new Set<string>();
  return msgs.filter((m) => {
    if (!m.content || seen.has(m.content)) return false;
    seen.add(m.content);
    return true;
  });
}

// Try selectors in order, return first match
export function querySelector<T extends Element>(
  selectors: string[],
  root: Document | Element = document
): T | null {
  for (const sel of selectors) {
    try {
      const el = root.querySelector<T>(sel);
      if (el) return el;
    } catch {
      // invalid selector from registry — skip
    }
  }
  return null;
}

export function querySelectorAll<T extends Element>(
  selectors: string[],
  root: Document | Element = document
): T[] {
  for (const sel of selectors) {
    try {
      const els = Array.from(root.querySelectorAll<T>(sel));
      if (els.length) return els;
    } catch {
      // invalid selector — skip
    }
  }
  return [];
}
