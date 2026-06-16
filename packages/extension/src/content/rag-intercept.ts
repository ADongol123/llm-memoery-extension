// Persistent RAG context layer.
// Intercepts send events on LLM platforms, fetches relevant context from the
// active RAG pool, and silently prepends it to the user's message before send.

import type { PlatformAdapter } from "../adapters/base.js";
import type { SelectorRegistry } from "../types.js";
import { showRagBadge } from "./inject.js";

// ── Module state ───────────────────────────────────────────────────────────────

interface RagCache {
  text: string;
  fetchedAt: number;
}

let cache: RagCache | null = null;
let inflight: Promise<string | null> | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let overlayEl: HTMLDivElement | null = null;
let interceptAttached = false;
let isRetriggering = false;

// Stored so removeEventListener can be called on SPA navigation
let currentInputEl:    HTMLElement | null = null;
let sendHandler:       ((e: Event) => void) | null = null;
let prefetchHandler:   (() => void) | null = null;

const CACHE_TTL_MS  = 30_000;
const DEBOUNCE_MS   = 1_000;
const FETCH_TIMEOUT = 5_000;

// ── Core fetch ─────────────────────────────────────────────────────────────────

function fetchRagContext(userMessage: string): Promise<string | null> {
  const fetchPromise = new Promise<string | null>((resolve) => {
    chrome.runtime.sendMessage(
      { type: "RETRIEVE_RAG_CONTEXT", userMessage },
      (res: { success: boolean; text: string | null } | undefined) => {
        if (chrome.runtime.lastError || !res?.success) resolve(null);
        else resolve(res.text ?? null);
      }
    );
  });
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), FETCH_TIMEOUT));
  return Promise.race([fetchPromise, timeout]);
}

// ── Cache / in-flight management ───────────────────────────────────────────────

function schedulePrefetch(userMessage: string): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    // Always start a fresh fetch for the latest message text.
    // Use promise identity to discard results from superseded fetches.
    const p = fetchRagContext(userMessage).then((text) => {
      if (inflight === p) {
        if (text) cache = { text, fetchedAt: performance.now() };
        inflight = null;
      }
      return text;
    });
    inflight = p;
  }, DEBOUNCE_MS);
}

async function getContextForMessage(userMessage: string): Promise<string | null> {
  const now = performance.now();

  // Cache still fresh — instant, 0ms latency
  if (cache && (now - cache.fetchedAt) < CACHE_TTL_MS) return cache.text;

  // A fetch is already in flight (from prefetch debounce) — reuse it
  if (!inflight) {
    const p = fetchRagContext(userMessage).then((text) => {
      if (inflight === p) {
        if (text) cache = { text, fetchedAt: performance.now() };
        inflight = null;
      }
      return text;
    });
    inflight = p;
  }

  return inflight;
}

// ── Overlay (blocks input while fetching) ──────────────────────────────────────

function ensureKeyframe(): void {
  if (!document.getElementById("llm-rag-keyframe")) {
    const style = document.createElement("style");
    style.id = "llm-rag-keyframe";
    style.textContent = "@keyframes llm-spin { to { transform: rotate(360deg); } }";
    document.head.appendChild(style);
  }
}

function showOverlay(inputEl: HTMLElement): void {
  removeOverlay();
  ensureKeyframe();

  const rect = inputEl.getBoundingClientRect();

  const overlay = document.createElement("div");
  Object.assign(overlay.style, {
    position:       "fixed",
    top:            `${rect.top}px`,
    left:           `${rect.left}px`,
    width:          `${rect.width}px`,
    height:         `${rect.height}px`,
    zIndex:         "2147483646",
    background:     "rgba(10,10,10,0.82)",
    backdropFilter: "blur(3px)",
    borderRadius:   "10px",
    display:        "flex",
    alignItems:     "center",
    justifyContent: "center",
    gap:            "8px",
    pointerEvents:  "all",
    fontFamily:     '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif',
    fontSize:       "12px",
    color:          "rgba(255,255,255,0.75)",
    fontWeight:     "600",
    letterSpacing:  "0.01em",
    userSelect:     "none",
  });

  const spinner = document.createElement("div");
  Object.assign(spinner.style, {
    width:          "13px",
    height:         "13px",
    border:         "2px solid rgba(99,102,241,0.25)",
    borderTopColor: "#6366f1",
    borderRadius:   "50%",
    animation:      "llm-spin 0.65s linear infinite",
    flexShrink:     "0",
  });

  const label = document.createElement("span");
  label.textContent = "Loading context…";

  overlay.appendChild(spinner);
  overlay.appendChild(label);
  document.body.appendChild(overlay);
  overlayEl = overlay;
}

function removeOverlay(): void {
  overlayEl?.remove();
  overlayEl = null;
}

// ── Send re-trigger ────────────────────────────────────────────────────────────

function triggerSend(inputEl: HTMLElement, adapter: PlatformAdapter): void {
  const enterEvent = new KeyboardEvent("keydown", {
    key:        "Enter",
    code:       "Enter",
    keyCode:    13,
    which:      13,
    bubbles:    true,
    cancelable: true,
    composed:   true,
  });
  inputEl.dispatchEvent(enterEvent);

  // Only click the send button as a fallback if the Enter dispatch had no effect
  // (indicated by the platform not preventing the event's default action).
  // This avoids double-send on platforms like ChatGPT and Claude where both
  // the keydown Enter and the button click independently trigger submission.
  if (!enterEvent.defaultPrevented && adapter.findSendButton) {
    adapter.findSendButton()?.click();
  }
}

// ── Send interceptor ───────────────────────────────────────────────────────────

function interceptSend(
  inputEl: HTMLElement,
  adapter: PlatformAdapter,
  selectors: Parameters<typeof adapter.injectText>[1],
): void {
  sendHandler = async (e: Event) => {
    const ke = e as KeyboardEvent;

    // Only intercept Enter (not Shift+Enter which is a newline)
    if (ke.key !== "Enter" || ke.shiftKey) return;

    // Guard against our own re-triggered event
    if (isRetriggering) return;

    // Read current input text
    const userMessage = inputEl.tagName === "TEXTAREA"
      ? (inputEl as HTMLTextAreaElement).value.trim()
      : (inputEl.textContent ?? "").trim();

    if (!userMessage) return;

    ke.preventDefault();
    ke.stopImmediatePropagation();

    // Show overlay only if we'll need to wait (cache is stale)
    const now = performance.now();
    const cacheReady = cache && (now - cache.fetchedAt) < CACHE_TTL_MS;
    if (!cacheReady) showOverlay(inputEl);

    let contextText: string | null = null;
    try {
      contextText = await getContextForMessage(userMessage);
    } catch {
      // Network/auth failure — send without context
    }

    removeOverlay();

    let ragInjected = false;
    if (contextText) {
      const fullText = `${contextText}\n\n---\n\n${userMessage}`;
      ragInjected = adapter.injectText(fullText, selectors);
    }

    isRetriggering = true;
    triggerSend(inputEl, adapter);
    setTimeout(() => { isRetriggering = false; }, 200);

    if (ragInjected) {
      // Show green confirmation badge so user knows RAG ran
      showRagBadge(1);
      console.log("[LLM Memory] RAG context injected for message:", userMessage.slice(0, 60));
    } else {
      console.log("[LLM Memory] RAG fetch returned no context — sent without augmentation");
    }
  };

  inputEl.addEventListener("keydown", sendHandler, true);
}

// ── Prefetch on typing ─────────────────────────────────────────────────────────

function watchInputForPrefetch(inputEl: HTMLElement): void {
  prefetchHandler = () => {
    const text = inputEl.tagName === "TEXTAREA"
      ? (inputEl as HTMLTextAreaElement).value.trim()
      : (inputEl.textContent ?? "").trim();
    if (text.length > 3) schedulePrefetch(text);
  };
  inputEl.addEventListener("input", prefetchHandler);
}

// ── Pool check ─────────────────────────────────────────────────────────────────

function checkRagPoolActive(): Promise<boolean> {
  return new Promise((resolve) => {
    chrome.storage.local.get("llm_active_rag_pool", (result) => {
      const pool = result.llm_active_rag_pool as
        { conversationIds: string[] } | null | undefined;
      resolve(!!pool?.conversationIds?.length);
    });
  });
}

// ── Public API ─────────────────────────────────────────────────────────────────

export async function initRagIntercept(
  adapter: PlatformAdapter,
  registry: SelectorRegistry,
): Promise<void> {
  if (interceptAttached) return;

  const isActive = await checkRagPoolActive();
  if (!isActive) return;

  const selectors = registry[adapter.platform] ?? undefined;
  let inputEl = adapter.findInputElement(selectors);

  // Retry up to 3× with 2s delays if input not yet in DOM
  for (let attempt = 0; !inputEl && attempt < 3; attempt++) {
    await new Promise((r) => setTimeout(r, 2000));
    inputEl = adapter.findInputElement(selectors);
  }

  if (!inputEl) return;

  currentInputEl = inputEl;
  interceptAttached = true;

  watchInputForPrefetch(inputEl);
  interceptSend(inputEl, adapter, selectors);
}

export function resetRagIntercept(): void {
  // Remove event listeners from the previous input element to prevent accumulation
  if (currentInputEl) {
    if (sendHandler)     currentInputEl.removeEventListener("keydown", sendHandler, true);
    if (prefetchHandler) currentInputEl.removeEventListener("input", prefetchHandler);
  }
  currentInputEl    = null;
  sendHandler       = null;
  prefetchHandler   = null;

  cache             = null;
  inflight          = null;
  interceptAttached = false;
  isRetriggering    = false;
  removeOverlay();
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer     = null;
}
