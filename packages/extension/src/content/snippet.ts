// Text selection → "Save snippet" button.
// Appears when the user selects 30+ characters on any supported LLM page.

import type { Platform } from "../types.js";
import type { Conversation } from "../types.js";

const BTN_ID    = "llm-snippet-btn";
const MIN_CHARS = 30;

let snippetBtn: HTMLButtonElement | null = null;

export function initSnippetSaver(platform: Platform): void {
  document.addEventListener("mouseup", (e) => {
    if ((e.target as HTMLElement).closest(`#${BTN_ID}, #llm-memory-banner`)) return;

    setTimeout(() => {
      const sel  = window.getSelection();
      const text = sel?.toString().trim() ?? "";

      if (text.length >= MIN_CHARS) {
        const range = sel!.getRangeAt(0);
        showBtn(text, range.getBoundingClientRect(), platform);
      } else {
        removeBtn();
      }
    }, 10);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") removeBtn();
  });
}

function removeBtn(): void {
  snippetBtn?.remove();
  snippetBtn = null;
}

function showBtn(text: string, rect: DOMRect, platform: Platform): void {
  removeBtn();

  const btn = document.createElement("button");
  btn.id = BTN_ID;
  btn.textContent = "⊕ Save snippet";

  Object.assign(btn.style, {
    position:   "fixed",
    top:        `${Math.max(rect.top - 38, 8)}px`,
    left:       `${Math.min(rect.left + rect.width / 2 - 52, window.innerWidth - 130)}px`,
    zIndex:     "2147483647",
    background: "#0d0d0d",
    color:      "#f0f0f0",
    border:     "1px solid #333",
    borderRadius: "7px",
    padding:    "5px 11px",
    fontSize:   "12px",
    fontWeight: "600",
    fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif',
    cursor:     "pointer",
    boxShadow:  "0 4px 16px rgba(0,0,0,.55)",
    whiteSpace: "nowrap",
    transition: "background 0.12s, transform 0.1s",
    userSelect: "none",
  });

  btn.addEventListener("mouseenter", () => {
    btn.style.background = "#1e1e1e";
    btn.style.transform  = "scale(1.04)";
  });
  btn.addEventListener("mouseleave", () => {
    btn.style.background = "#0d0d0d";
    btn.style.transform  = "scale(1)";
  });
  btn.addEventListener("mousedown", (e) => e.preventDefault());

  btn.addEventListener("click", () => {
    const title   = text.replace(/\s+/g, " ").slice(0, 55) + (text.length > 55 ? "…" : "");
    const payload: Conversation = {
      id:            `snippet-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      platform,
      sourceUrl:     location.href,
      title,
      messageCount:  1,
      rawMessages:   [{ role: "assistant", content: text }],
      summary:       null,
      keyPoints:     null,
      openQuestions: null,
      topics:        null,
      entities:      null,
      processedAt:   null,
      isAutoSave:    false,
      isSnippet:     true,
      pinned:        false,
      createdAt:     Date.now(),
      updatedAt:     Date.now(),
    };

    chrome.runtime.sendMessage({ type: "SAVE_CONVERSATION", payload }, (res) => {
      removeBtn();
      window.getSelection()?.removeAllRanges();

      if (res?.success) showToast("Snippet saved ✓", rect);
    });
  });

  snippetBtn = btn;
  document.body.appendChild(btn);
}

function showToast(msg: string, rect: DOMRect): void {
  const tip = document.createElement("div");
  Object.assign(tip.style, {
    position:   "fixed",
    top:        `${Math.max(rect.top - 38, 8)}px`,
    left:       `${Math.min(rect.left + rect.width / 2 - 40, window.innerWidth - 110)}px`,
    zIndex:     "2147483647",
    background: "#0d0d0d",
    color:      "#d0d0d0",
    border:     "1px solid #333",
    borderRadius: "7px",
    padding:    "5px 12px",
    fontSize:   "12px",
    fontWeight: "600",
    fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", sans-serif',
    boxShadow:  "0 4px 16px rgba(0,0,0,.5)",
    pointerEvents: "none",
  });
  tip.textContent = msg;
  document.body.appendChild(tip);
  setTimeout(() => tip.remove(), 1800);
}
