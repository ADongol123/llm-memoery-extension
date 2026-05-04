// Injects text into the active LLM's input field.
// Called from the banner and from messages sent by the popup.

import type { PlatformAdapter } from "../adapters/base.js";
import type { SelectorRegistry } from "../types.js";

const CONTEXT_BADGE_ID = "llm-memory-context-badge";

export function injectText(
  text: string,
  adapter: PlatformAdapter,
  registry: SelectorRegistry
): boolean {
  const selectors = registry[adapter.platform] ?? undefined;
  const ok = adapter.injectText(text, selectors);

  if (ok) {
    chrome.runtime.sendMessage({ type: "BUMP_ANALYTIC", key: "injects" });
    showContextBadge(text);
  }

  return ok;
}

// Shows a persistent badge near the input field confirming context is loaded.
// Disappears when the user submits the message.
function showContextBadge(text: string): void {
  document.getElementById(CONTEXT_BADGE_ID)?.remove();

  // Count messages in injected context (lines starting with "User:" or "Assistant:")
  const lineCount = text.split("\n").filter(
    (l) => l.startsWith("User:") || l.startsWith("Assistant:")
  ).length;
  const label = lineCount > 0
    ? `${lineCount} messages loaded as context`
    : "Context loaded from LLM Memory";

  const badge = document.createElement("div");
  badge.id = CONTEXT_BADGE_ID;
  Object.assign(badge.style, {
    position:     "fixed",
    bottom:       "80px",
    left:         "50%",
    transform:    "translateX(-50%) translateY(8px)",
    zIndex:       "2147483647",
    background:   "rgba(99,102,241,0.95)",
    backdropFilter: "blur(8px)",
    border:       "1px solid rgba(129,140,248,0.6)",
    borderRadius: "20px",
    padding:      "7px 14px",
    fontFamily:   '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif',
    fontSize:     "12px",
    fontWeight:   "600",
    color:        "#fff",
    display:      "flex",
    alignItems:   "center",
    gap:          "7px",
    boxShadow:    "0 4px 20px rgba(99,102,241,0.4)",
    opacity:      "0",
    transition:   "opacity 0.2s ease, transform 0.2s cubic-bezier(0.34,1.3,0.64,1)",
    pointerEvents: "none",
    whiteSpace:   "nowrap",
  });

  badge.innerHTML = `
    <span style="font-size:14px;">⬡</span>
    <span>LLM Memory: ${label}</span>
    <span style="opacity:0.7;font-size:11px;">· Press Enter to send</span>
  `;

  document.body.appendChild(badge);

  requestAnimationFrame(() => {
    badge.style.opacity   = "1";
    badge.style.transform = "translateX(-50%) translateY(0)";
  });

  // Remove after 6 seconds or when a form is submitted / Enter pressed
  const dismiss = () => {
    badge.style.opacity   = "0";
    badge.style.transform = "translateX(-50%) translateY(8px)";
    setTimeout(() => badge.remove(), 250);
    document.removeEventListener("keydown", onKey, true);
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) setTimeout(dismiss, 400);
  };
  document.addEventListener("keydown", onKey, true);
  setTimeout(dismiss, 6000);
}

export function copyToClipboard(text: string): void {
  navigator.clipboard.writeText(text).catch(() => {
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
