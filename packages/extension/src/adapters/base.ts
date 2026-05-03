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
