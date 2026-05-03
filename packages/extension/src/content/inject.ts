// Injects text into the active LLM's input field.
// Called from the banner and from messages sent by the popup.

import type { PlatformAdapter } from "../adapters/base.js";
import type { SelectorRegistry } from "../types.js";

export function injectText(
  text: string,
  adapter: PlatformAdapter,
  registry: SelectorRegistry
): boolean {
  const selectors = registry[adapter.platform] ?? undefined;
  const ok = adapter.injectText(text, selectors);

  if (ok) {
    chrome.runtime.sendMessage({ type: "BUMP_ANALYTIC", key: "injects" });
  }

  return ok;
}

export function copyToClipboard(text: string): void {
  navigator.clipboard.writeText(text).catch(() => {
    // Last resort: create a temporary textarea
    const el       = document.createElement("textarea");
    el.value       = text;
    el.style.position = "fixed";
    el.style.opacity  = "0";
    document.body.appendChild(el);
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);
  });
}
