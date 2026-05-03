// Auto-saves the current conversation every 30 seconds.
// Only fires if: page is visible, conversation has grown, and meets minimum length.

import type { PlatformAdapter } from "../adapters/base.js";
import type { Conversation, SelectorRegistry } from "../types.js";
import { makeTitle } from "../types.js";

const INTERVAL_MS     = 30_000;
const MIN_MESSAGES    = 4;
const MIN_GROWTH      = 2;  // must have at least 2 new messages since last save

let lastSavedUrl      = "";
let lastSavedCount    = 0;
let timer: ReturnType<typeof setInterval> | null = null;

const NOTIF_ID = "llm-memory-save-notif";

function showSaveNotification(title: string): void {
  document.getElementById(NOTIF_ID)?.remove();

  const el = document.createElement("div");
  el.id = NOTIF_ID;
  Object.assign(el.style, {
    position:     "fixed",
    bottom:       "24px",
    left:         "24px",
    zIndex:       "2147483647",
    background:   "#0d0d0d",
    border:       "1px solid #252525",
    borderRadius: "12px",
    padding:      "12px 14px",
    fontFamily:   '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif',
    fontSize:     "12px",
    boxShadow:    "0 12px 40px rgba(0,0,0,.7)",
    maxWidth:     "280px",
    display:      "flex",
    flexDirection: "column",
    gap:          "10px",
    opacity:      "0",
    transform:    "translateY(10px)",
    transition:   "opacity 0.2s ease, transform 0.2s cubic-bezier(0.34,1.3,0.64,1)",
  });

  const truncated = title.length > 45 ? title.slice(0, 45) + "…" : title;

  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">
      <div>
        <div style="font-weight:700;color:#d5d5d5;margin-bottom:3px;">✦ Conversation saved</div>
        <div style="color:#505050;font-size:11px;line-height:1.4;">${truncated}</div>
      </div>
      <button id="llm-notif-close" style="background:none;border:none;color:#444;cursor:pointer;font-size:14px;padding:0;line-height:1;flex-shrink:0;">×</button>
    </div>
    <div style="display:flex;gap:7px;">
      <button id="llm-notif-use" style="
        flex:1;background:#6366f1;border:none;border-radius:7px;color:#fff;
        cursor:pointer;font-family:inherit;font-size:11px;font-weight:700;
        padding:7px 10px;transition:opacity 0.12s;
      ">Use in another chat →</button>
      <button id="llm-notif-dismiss" style="
        background:#161616;border:1px solid #2a2a2a;border-radius:7px;color:#555;
        cursor:pointer;font-family:inherit;font-size:11px;font-weight:600;
        padding:7px 10px;transition:all 0.12s;
      ">Not now</button>
    </div>
  `;

  document.body.appendChild(el);
  requestAnimationFrame(() => {
    el.style.opacity   = "1";
    el.style.transform = "translateY(0)";
  });

  const dismiss = () => {
    el.style.opacity   = "0";
    el.style.transform = "translateY(10px)";
    setTimeout(() => el.remove(), 250);
  };

  el.querySelector("#llm-notif-close")!.addEventListener("click", dismiss);
  el.querySelector("#llm-notif-dismiss")!.addEventListener("click", dismiss);
  el.querySelector("#llm-notif-use")!.addEventListener("click", () => {
    dismiss();
    // Open the extension popup
    chrome.runtime.sendMessage({ type: "OPEN_POPUP" });
  });

  // Auto-dismiss after 8 seconds
  setTimeout(dismiss, 8000);
}

export function startAutosave(
  adapter: PlatformAdapter,
  registry: SelectorRegistry
): void {
  if (timer) return;

  timer = setInterval(() => {
    try {
      tick(adapter, registry);
    } catch (e) {
      console.warn("[LLM Memory] Autosave error:", e);
      stopAutosave();
    }
  }, INTERVAL_MS);
}

export function stopAutosave(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

function tick(adapter: PlatformAdapter, registry: SelectorRegistry): void {
  if (document.visibilityState !== "visible") return;

  const selectors = registry[adapter.platform] ?? undefined;
  const messages  = adapter.extractConversation(selectors);

  if (messages.length < MIN_MESSAGES) return;

  const currentUrl = location.href;
  const isSameConv = currentUrl === lastSavedUrl;
  const growth     = messages.length - lastSavedCount;

  if (isSameConv && growth < MIN_GROWTH) return;

  const payload: Conversation = {
    id:            `auto-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    platform:      adapter.platform,
    sourceUrl:     currentUrl,
    title:         makeTitle(messages),
    messageCount:  messages.length,
    rawMessages:   messages,
    summary:       null,
    keyPoints:     null,
    openQuestions: null,
    topics:        null,
    entities:      null,
    processedAt:   null,
    isAutoSave:    true,
    isSnippet:     false,
    pinned:        false,
    createdAt:     Date.now(),
    updatedAt:     Date.now(),
  };

  chrome.runtime.sendMessage({ type: "AUTO_SAVE_CONVERSATION", payload }, (res) => {
    if (chrome.runtime.lastError) {
      stopAutosave();
      return;
    }
    if (res?.success) {
      const isFirstSave = lastSavedCount === 0;
      lastSavedCount = messages.length;
      lastSavedUrl   = currentUrl;
      if (isFirstSave) showSaveNotification(payload.title);
    }
  });
}
