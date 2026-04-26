import { makeTitle, buildBriefing } from "../utils/shared.js";

const PLATFORM_MAP = {
  "claude.ai": "Claude",
  "chatgpt.com": "ChatGPT",
  "chat.openai.com": "ChatGPT",
  "gemini.google.com": "Gemini",
  "perplexity.ai": "Perplexity",
  "grok.com": "Grok",
};

function getPlatform() {
  const host = window.location.hostname;
  for (const [domain, name] of Object.entries(PLATFORM_MAP)) {
    if (host.includes(domain)) return name;
  }
  return null;
}

// ── Extraction ────────────────────────────────────────────────────────────────

function extractConversation() {
  const host = window.location.hostname;
  const messages = [];

  if (host.includes("claude.ai")) {
    let turns = Array.from(
      document.querySelectorAll('[data-testid="human-turn"], [data-testid="ai-turn"]')
    );
    if (turns.length === 0) {
      document.querySelectorAll("[data-message-role]").forEach((el) => {
        const role = el.getAttribute("data-message-role") === "human" ? "user" : "assistant";
        const content = el.innerText.trim();
        if (content) messages.push({ role, content });
      });
      return messages;
    }
    turns.forEach((el) => {
      const role = el.getAttribute("data-testid") === "human-turn" ? "user" : "assistant";
      const content = el.innerText.trim();
      if (content) messages.push({ role, content });
    });

  } else if (host.includes("chatgpt.com") || host.includes("openai.com")) {
    document.querySelectorAll("[data-message-author-role]").forEach((el) => {
      const role = el.getAttribute("data-message-author-role");
      const content = el.innerText.trim();
      if (content) messages.push({ role, content });
    });

  } else if (host.includes("gemini.google.com")) {
    // Collect both roles with their DOM nodes, then sort by position so the
    // conversation order is preserved instead of all-user then all-assistant.
    const items = [];
    document
      .querySelectorAll(".query-text, .user-query-bubble .query-text-container")
      .forEach((el) => items.push({ el, role: "user" }));
    document
      .querySelectorAll("message-content .markdown, model-response .response-text")
      .forEach((el) => items.push({ el, role: "assistant" }));
    items
      .sort((a, b) =>
        a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
      )
      .forEach(({ el, role }) => {
        const content = el.innerText.trim();
        if (content) messages.push({ role, content });
      });

  } else if (host.includes("perplexity.ai")) {
    // .prose is too broad (matches nav, tooltips, etc.) — use specific testids only
    const pItems = [];
    document.querySelectorAll("[data-testid='user-message']").forEach((el) =>
      pItems.push({ el, role: "user" })
    );
    document.querySelectorAll("[data-testid='answer']").forEach((el) =>
      pItems.push({ el, role: "assistant" })
    );
    pItems
      .sort((a, b) =>
        a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
      )
      .forEach(({ el, role }) => {
        const content = el.innerText.trim();
        if (content) messages.push({ role, content });
      });

  } else if (host.includes("grok.com")) {
    document
      .querySelectorAll("[class*='UserMessage'], [class*='user-message']")
      .forEach((el) => {
        messages.push({ role: "user", content: el.innerText.trim() });
      });
    document
      .querySelectorAll("[class*='AssistantMessage'], [class*='BotMessage']")
      .forEach((el) => {
        messages.push({ role: "assistant", content: el.innerText.trim() });
      });
  }

  return messages.filter((m) => m.content.length > 0);
}

// ── Input injection ───────────────────────────────────────────────────────────

function findInput() {
  const host = window.location.hostname;
  if (host.includes("claude.ai")) {
    return (
      document.querySelector("div.ProseMirror[contenteditable='true']") ||
      document.querySelector("[contenteditable='true']")
    );
  }
  if (host.includes("chatgpt.com") || host.includes("openai.com")) {
    return (
      document.querySelector("#prompt-textarea") ||
      document.querySelector("[contenteditable='true']")
    );
  }
  if (host.includes("gemini.google.com")) {
    return (
      document.querySelector(".ql-editor[contenteditable='true']") ||
      document.querySelector("rich-textarea [contenteditable='true']") ||
      document.querySelector("[contenteditable='true']")
    );
  }
  return (
    document.querySelector("textarea") ||
    document.querySelector("[contenteditable='true']")
  );
}

function injectIntoInput(text) {
  const input = findInput();
  if (!input) return false;
  input.focus();

  if (input.tagName === "TEXTAREA") {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value"
    ).set;
    setter.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  } else {
    document.execCommand("selectAll", false, null);
    document.execCommand("insertText", false, text);
    if (!input.textContent.includes(text.slice(0, 30))) {
      input.textContent = text;
      input.dispatchEvent(
        new InputEvent("input", { bubbles: true, inputType: "insertText", data: text })
      );
    }
  }
  input.focus();
  return true;
}

// ── SPA navigation ────────────────────────────────────────────────────────────
// Claude, ChatGPT, Gemini are SPAs — URL changes don't reload the page.
// We intercept history mutations and treat each URL change as a potential new chat.

let currentUrl = location.href;
let bannerMounted = false;

function onUrlChange() {
  if (location.href === currentUrl) return;
  currentUrl = location.href;
  bannerMounted = false;
  // Wait for the new page content to settle before checking
  waitForReadyThenBanner();
}

const _pushState = history.pushState.bind(history);
const _replaceState = history.replaceState.bind(history);
history.pushState = (...args) => { _pushState(...args); onUrlChange(); };
history.replaceState = (...args) => { _replaceState(...args); onUrlChange(); };
window.addEventListener("popstate", onUrlChange);

// ── Banner logic ──────────────────────────────────────────────────────────────
// Uses a MutationObserver to wait until the page is confirmed empty (new chat)
// rather than a fixed timeout — avoids showing the banner on existing conversations.

function waitForReadyThenBanner() {
  if (extractConversation().length > 0) return; // already has messages

  let resolved = false;

  const done = (isNewChat) => {
    if (resolved) return;
    resolved = true;
    observer.disconnect();
    if (isNewChat) {
      chrome.runtime.sendMessage({ type: "GET_MEMORIES" }, (res) => {
        if (res?.success && res.data?.length > 0) mountBanner(res.data);
      });
    }
  };

  // If messages appear within 2s, this is not a new chat
  const observer = new MutationObserver(() => {
    if (extractConversation().length > 0) done(false);
  });
  observer.observe(document.body, { subtree: true, childList: true });
  setTimeout(() => done(extractConversation().length === 0), 2000);
}

function mountBanner(memories) {
  if (bannerMounted || document.getElementById("llm-memory-banner")) return;
  bannerMounted = true;

  const latest = memories[0];
  const wrap = document.createElement("div");
  wrap.id = "llm-memory-banner";
  wrap.style.cssText = `
    position:fixed;bottom:80px;right:20px;z-index:2147483647;
    background:#16161e;color:#e0e0e0;border:1px solid #3a3a5c;
    border-radius:14px;padding:14px 16px;font-family:system-ui,sans-serif;
    font-size:13px;box-shadow:0 8px 32px rgba(0,0,0,.5);
    width:284px;display:flex;flex-direction:column;gap:10px;
  `;
  wrap.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center">
      <span style="font-weight:700;font-size:14px">🧠 Memory available</span>
      <button data-action="close" style="background:none;border:none;color:#777;cursor:pointer;font-size:18px;line-height:1;padding:0">×</button>
    </div>
    <div style="color:#9a9abc;font-size:12px;line-height:1.5">
      <strong style="color:#c4b5fd">${latest.title}</strong><br>
      ${latest.platform} · ${latest.timestamp} · ${latest.messages.length} msgs
    </div>
    <div style="display:flex;gap:8px">
      <button data-action="inject" style="flex:1;background:#6d28d9;color:#fff;border:none;border-radius:8px;padding:7px 10px;cursor:pointer;font-size:12px;font-weight:600">Inject latest</button>
      ${memories.length > 1
        ? `<button data-action="pick" style="flex:1;background:#1e1e2e;color:#c4b5fd;border:1px solid #3f3f5a;border-radius:8px;padding:7px 10px;cursor:pointer;font-size:12px;font-weight:600">Pick (${memories.length})</button>`
        : ""}
    </div>
  `;

  wrap.addEventListener("click", (e) => {
    const action = e.target.closest("[data-action]")?.dataset.action;
    if (!action) return;
    if (action === "close") { wrap.remove(); return; }
    if (action === "inject") {
      const briefing = buildBriefing(latest);
      const ok = injectIntoInput(briefing);
      wrap.remove();
      if (!ok) navigator.clipboard.writeText(briefing);
      chrome.runtime.sendMessage({ type: "BUMP_ANALYTIC", key: "injects" });
    }
    if (action === "pick") { wrap.remove(); mountPicker(memories); }
  });

  document.body.appendChild(wrap);
}

function mountPicker(memories) {
  const wrap = document.createElement("div");
  wrap.style.cssText = `
    position:fixed;bottom:80px;right:20px;z-index:2147483647;
    background:#16161e;color:#e0e0e0;border:1px solid #3a3a5c;
    border-radius:14px;padding:14px 16px;font-family:system-ui,sans-serif;
    font-size:13px;box-shadow:0 8px 32px rgba(0,0,0,.5);
    width:300px;display:flex;flex-direction:column;gap:6px;
    max-height:320px;overflow-y:auto;
  `;
  const hdr = document.createElement("div");
  hdr.style.cssText = "display:flex;justify-content:space-between;align-items:center;margin-bottom:4px";
  hdr.innerHTML = `<span style="font-weight:700;font-size:14px">🧠 Pick memory</span>
    <button style="background:none;border:none;color:#777;cursor:pointer;font-size:18px;line-height:1;padding:0">×</button>`;
  hdr.querySelector("button").onclick = () => wrap.remove();
  wrap.appendChild(hdr);

  memories.forEach((mem) => {
    const btn = document.createElement("button");
    btn.style.cssText = `background:#1e1e2e;border:1px solid #3f3f5a;border-radius:10px;
      color:#e0e0e0;padding:10px 12px;cursor:pointer;text-align:left;
      font-size:12px;display:flex;flex-direction:column;gap:3px;width:100%;`;
    btn.innerHTML = `<span style="font-weight:600;color:#f0f0f0">${mem.title}</span>
      <span style="color:#888">${mem.platform} · ${mem.timestamp} · ${mem.messages.length} msgs</span>`;
    btn.onmouseenter = () => (btn.style.background = "#2a2a3e");
    btn.onmouseleave = () => (btn.style.background = "#1e1e2e");
    btn.onclick = () => {
      const briefing = buildBriefing(mem);
      const ok = injectIntoInput(briefing);
      wrap.remove();
      if (!ok) navigator.clipboard.writeText(briefing);
      chrome.runtime.sendMessage({ type: "BUMP_ANALYTIC", key: "injects" });
    };
    wrap.appendChild(btn);
  });

  document.body.appendChild(wrap);
}

// ── Auto-save ─────────────────────────────────────────────────────────────────
// Every 30 s, if the page is visible and has a meaningful conversation with new
// content since the last auto-save, upsert a background memory for this URL.
// Uses AUTO_SAVE_MEMORY in the background so it's always one record per URL.

let autoSaveCount = 0;
let autoSaveUrl = "";

const autoSaveTimer = setInterval(() => {
  try {
    if (document.visibilityState !== "visible") return;
    const messages = extractConversation();
    if (messages.length < 4) return; // need at least 2 full exchanges
    if (location.href === autoSaveUrl && messages.length <= autoSaveCount) return;
    if (location.href === autoSaveUrl && messages.length - autoSaveCount < 2) return;

    const platform = getPlatform();
    const payload = {
      id: `auto-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      title: makeTitle(messages),
      tags: ["auto"],
      workspace: "Default",
      messages,
      platform,
      url: location.href,
      timestamp: new Date().toLocaleString(undefined, {
        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
      }),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isAutoSave: true,
    };

    chrome.runtime.sendMessage({ type: "AUTO_SAVE_MEMORY", payload }, (res) => {
      if (chrome.runtime.lastError) {
        // Extension context invalidated (e.g. after update) — stop the timer
        clearInterval(autoSaveTimer);
        return;
      }
      if (res?.success) {
        autoSaveCount = messages.length;
        autoSaveUrl = location.href;
      }
    });
  } catch (_) {
    // Extension context invalidated
    clearInterval(autoSaveTimer);
  }
}, 30000);

// ── Init ──────────────────────────────────────────────────────────────────────

if (getPlatform()) {
  // On initial page load, run the same readiness check
  if (document.readyState === "complete") {
    waitForReadyThenBanner();
  } else {
    window.addEventListener("load", waitForReadyThenBanner);
  }
}

// ── Message listener ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "GET_CONVERSATION") {
    sendResponse({ success: true, messages: extractConversation(), platform: getPlatform() });
    return true;
  }
  if (message.type === "INJECT_CONTEXT") {
    const ok = injectIntoInput(message.text);
    if (ok) chrome.runtime.sendMessage({ type: "BUMP_ANALYTIC", key: "injects" });
    sendResponse({ success: ok });
    return true;
  }
  if (message.type === "GET_PLATFORM") {
    sendResponse({ platform: getPlatform() });
    return true;
  }
});
