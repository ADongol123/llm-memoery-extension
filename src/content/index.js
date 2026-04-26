import { makeTitle, buildBriefing } from "../utils/shared.js";

const PLATFORM_MAP = {
  "claude.ai":           "Claude",
  "chatgpt.com":         "ChatGPT",
  "chat.openai.com":     "ChatGPT",
  "gemini.google.com":   "Gemini",
  "perplexity.ai":       "Perplexity",
  "grok.com":            "Grok",
  "chat.deepseek.com":   "DeepSeek",
};

function getPlatform() {
  const host = window.location.hostname;
  for (const [domain, name] of Object.entries(PLATFORM_MAP)) {
    if (host.includes(domain)) return name;
  }
  return null;
}

// ── Sidebar scraping ───────────────────────────────────────────────────────────
// Reads the conversation list from each LLM's sidebar.
// Returns up to 50 { title, url } objects.

function getSidebarConversations() {
  const host = window.location.hostname;
  const raw = [];

  if (host.includes("claude.ai")) {
    // Primary: nav links that go to /chat/<uuid>
    document.querySelectorAll('nav a[href*="/chat/"]').forEach((a) => {
      const title = a.innerText.trim();
      if (title && a.href) raw.push({ title, url: a.href });
    });
    // Fallback: any sidebar list items with chat links
    if (!raw.length) {
      document.querySelectorAll('a[href*="/chat/"]').forEach((a) => {
        const title = a.innerText.trim();
        if (title && a.href && !raw.some(r => r.url === a.href))
          raw.push({ title, url: a.href });
      });
    }

  } else if (host.includes("chatgpt.com") || host.includes("openai.com")) {
    // Primary: sidebar conversation links /c/<uuid>
    document.querySelectorAll('a[href^="/c/"]').forEach((a) => {
      const title = a.innerText.trim();
      if (title && a.href) raw.push({ title, url: a.href });
    });
    // Fallback: nav list items
    if (!raw.length) {
      document.querySelectorAll('nav li a, nav ol li a').forEach((a) => {
        const title = a.innerText.trim();
        if (title && a.href && !raw.some(r => r.url === a.href))
          raw.push({ title, url: a.href });
      });
    }

  } else if (host.includes("gemini.google.com")) {
    // Gemini sidebar: links to /app/<id>
    document.querySelectorAll('a[href*="/app/"]').forEach((a) => {
      const title = a.innerText.trim();
      if (title && a.href && !a.href.includes("gemini.google.com/app#"))
        raw.push({ title, url: a.href });
    });
    // Fallback: check for bard-sidenav-item or similar elements
    if (!raw.length) {
      document.querySelectorAll(
        'bard-sidenav-item a, .sidenav-item a, [data-conversation-id]'
      ).forEach((el) => {
        const a = el.tagName === "A" ? el : el.closest("a");
        if (!a) return;
        const title = el.innerText.trim() || a.innerText.trim();
        if (title && a.href) raw.push({ title, url: a.href });
      });
    }

  } else if (host.includes("grok.com")) {
    // Grok: conversation links
    document.querySelectorAll('a[href*="/conversation/"], a[href*="/chat/"]').forEach((a) => {
      const title = a.innerText.trim();
      if (title && a.href) raw.push({ title, url: a.href });
    });
    // Fallback: any nav links
    if (!raw.length) {
      document.querySelectorAll('nav a, aside a').forEach((a) => {
        const title = a.innerText.trim();
        if (title && a.href && a.href !== location.href)
          raw.push({ title, url: a.href });
      });
    }

  } else if (host.includes("chat.deepseek.com")) {
    // DeepSeek: conversation links /chat/<id> or /session/<id>
    document.querySelectorAll('a[href*="/chat/"], a[href*="/session/"]').forEach((a) => {
      const title = a.innerText.trim();
      if (title && a.href) raw.push({ title, url: a.href });
    });
    // Fallback: sidebar list items
    if (!raw.length) {
      document.querySelectorAll(
        '.conversation-list a, .chat-list a, aside a, nav a'
      ).forEach((a) => {
        const title = a.innerText.trim();
        if (title && a.href && a.href !== location.href)
          raw.push({ title, url: a.href });
      });
    }

  } else if (host.includes("perplexity.ai")) {
    document.querySelectorAll('a[href^="/search/"], a[href^="/thread/"]').forEach((a) => {
      const title = a.innerText.trim();
      if (title) raw.push({ title, url: a.href });
    });
  }

  // Deduplicate by URL, skip current page
  const current = location.href;
  const seen = new Set();
  return raw
    .filter((c) => {
      if (!c.title || c.url === current || seen.has(c.url)) return false;
      seen.add(c.url);
      return true;
    })
    .slice(0, 50);
}

// ── Conversation extraction from current page ──────────────────────────────────

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
    const items = [];
    document.querySelectorAll(".query-text, .user-query-bubble .query-text-container")
      .forEach((el) => items.push({ el, role: "user" }));
    document.querySelectorAll("message-content .markdown, model-response .response-text")
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
    document.querySelectorAll("[class*='UserMessage'], [class*='user-message']")
      .forEach((el) => messages.push({ role: "user", content: el.innerText.trim() }));
    document.querySelectorAll("[class*='AssistantMessage'], [class*='BotMessage']")
      .forEach((el) => messages.push({ role: "assistant", content: el.innerText.trim() }));

  } else if (host.includes("chat.deepseek.com")) {
    // DeepSeek message extraction
    document.querySelectorAll(
      '[class*="user-message"], [class*="UserMessage"], [data-role="user"]'
    ).forEach((el) => messages.push({ role: "user", content: el.innerText.trim() }));
    document.querySelectorAll(
      '[class*="assistant-message"], [class*="AssistantMessage"], [data-role="assistant"], .ds-markdown'
    ).forEach((el) => messages.push({ role: "assistant", content: el.innerText.trim() }));
  }

  return messages.filter((m) => m.content.length > 0);
}

// ── Input injection ────────────────────────────────────────────────────────────

function findInput() {
  const host = window.location.hostname;
  if (host.includes("claude.ai"))
    return document.querySelector("div.ProseMirror[contenteditable='true']") ||
           document.querySelector("[contenteditable='true']");
  if (host.includes("chatgpt.com") || host.includes("openai.com"))
    return document.querySelector("#prompt-textarea") ||
           document.querySelector("[contenteditable='true']");
  if (host.includes("gemini.google.com"))
    return document.querySelector(".ql-editor[contenteditable='true']") ||
           document.querySelector("rich-textarea [contenteditable='true']") ||
           document.querySelector("[contenteditable='true']");
  if (host.includes("chat.deepseek.com"))
    return document.querySelector("textarea") ||
           document.querySelector("[contenteditable='true']");
  return document.querySelector("textarea") ||
         document.querySelector("[contenteditable='true']");
}

function injectIntoInput(text) {
  const input = findInput();
  if (!input) return false;
  input.focus();
  if (input.tagName === "TEXTAREA") {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype, "value"
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

// ── Cross-LLM banner ───────────────────────────────────────────────────────────

let bannerMounted = false;

function mountCrossLLMBanner(otherMemories) {
  if (bannerMounted || document.getElementById("llm-memory-banner")) return;
  bannerMounted = true;
  const shown = otherMemories.slice(0, 5);

  const wrap = document.createElement("div");
  wrap.id = "llm-memory-banner";
  Object.assign(wrap.style, {
    position: "fixed", bottom: "24px", right: "22px", zIndex: "2147483647",
    background: "#0d0d0d", border: "1px solid #252525", borderRadius: "14px",
    padding: "15px",
    fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif',
    fontSize: "13px", boxShadow: "0 20px 60px rgba(0,0,0,.8)",
    width: "300px", display: "flex", flexDirection: "column", gap: "10px",
    opacity: "0", transform: "translateY(14px)",
    transition: "opacity 0.28s ease, transform 0.28s cubic-bezier(0.34,1.3,0.64,1)",
  });

  const hdr = document.createElement("div");
  hdr.style.cssText = "display:flex;justify-content:space-between;align-items:flex-start;";
  hdr.innerHTML = `
    <div>
      <div style="font-weight:700;font-size:13.5px;color:#fff;">Continue from another AI?</div>
      <div style="font-size:11px;color:#505050;margin-top:2px;">Recent from your other LLMs</div>
    </div>
    <button id="llm-banner-close" style="background:#1a1a1a;border:1px solid #2c2c2c;color:#555;cursor:pointer;font-size:15px;padding:3px 8px;border-radius:6px;margin-left:8px;">×</button>
  `;
  wrap.appendChild(hdr);

  const list = document.createElement("div");
  list.style.cssText = "display:flex;flex-direction:column;gap:4px;";

  if (!shown.length) {
    const msg = document.createElement("div");
    msg.style.cssText = "font-size:12px;color:#444;text-align:center;padding:8px 0;";
    msg.textContent = "No saved conversations yet. Use other AI tools and they'll appear here.";
    list.appendChild(msg);
  } else {
    shown.forEach((mem, i) => {
      const btn = document.createElement("button");
      Object.assign(btn.style, {
        background: "#161616", border: "1px solid #222", borderRadius: "9px",
        color: "#ccc", padding: "9px 11px", cursor: "pointer", textAlign: "left",
        fontFamily: "inherit", fontSize: "12px", display: "flex",
        alignItems: "center", gap: "9px", width: "100%",
        transition: "background 0.12s, border-color 0.12s, transform 0.1s",
      });
      btn.innerHTML = `
        <span style="font-size:10px;font-weight:800;color:#3a3a3a;width:12px;text-align:center;">${i + 1}</span>
        <div style="flex:1;min-width:0;">
          <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:500;color:#d5d5d5;">${mem.title}</div>
          <div style="font-size:10.5px;color:#444;margin-top:2px;">${mem.platform} · ${mem.timestamp}</div>
        </div>
        <span style="font-size:11px;color:#333;">→</span>
      `;
      btn.addEventListener("mouseenter", () => { btn.style.background="#1e1e1e"; btn.style.borderColor="#383838"; btn.style.transform="translateX(2px)"; });
      btn.addEventListener("mouseleave", () => { btn.style.background="#161616"; btn.style.borderColor="#222"; btn.style.transform="translateX(0)"; });
      btn.addEventListener("click", () => {
        const ok = injectIntoInput(buildBriefing(mem));
        wrap.remove();
        if (!ok) navigator.clipboard.writeText(buildBriefing(mem));
        chrome.runtime.sendMessage({ type: "BUMP_ANALYTIC", key: "injects" });
      });
      list.appendChild(btn);
    });
  }
  wrap.appendChild(list);

  if (shown.length > 1) {
    const rnd = document.createElement("button");
    Object.assign(rnd.style, {
      background: "none", border: "1px solid #222", color: "#555",
      borderRadius: "7px", padding: "7px", fontSize: "12px", fontWeight: "600",
      cursor: "pointer", fontFamily: "inherit", transition: "all 0.12s",
    });
    rnd.textContent = "↻  Pick random";
    rnd.addEventListener("mouseenter", () => { rnd.style.borderColor="#fff"; rnd.style.color="#fff"; });
    rnd.addEventListener("mouseleave", () => { rnd.style.borderColor="#222"; rnd.style.color="#555"; });
    rnd.addEventListener("click", () => {
      const pick = shown[Math.floor(Math.random() * shown.length)];
      const ok = injectIntoInput(buildBriefing(pick));
      wrap.remove();
      if (!ok) navigator.clipboard.writeText(buildBriefing(pick));
      chrome.runtime.sendMessage({ type: "BUMP_ANALYTIC", key: "injects" });
    });
    wrap.appendChild(rnd);
  }

  wrap.querySelector("#llm-banner-close").addEventListener("click", () => wrap.remove());
  document.body.appendChild(wrap);
  requestAnimationFrame(() => { wrap.style.opacity="1"; wrap.style.transform="translateY(0)"; });
}

// ── SPA navigation ─────────────────────────────────────────────────────────────

let currentUrl = location.href;

function onUrlChange() {
  if (location.href === currentUrl) return;
  currentUrl = location.href;
  bannerMounted = false;
  waitForReadyThenBanner();
}

const _pushState = history.pushState.bind(history);
const _replaceState = history.replaceState.bind(history);
history.pushState = (...args) => { _pushState(...args); onUrlChange(); };
history.replaceState = (...args) => { _replaceState(...args); onUrlChange(); };
window.addEventListener("popstate", onUrlChange);

// ── Banner trigger ─────────────────────────────────────────────────────────────

function waitForReadyThenBanner() {
  if (extractConversation().length > 0) return;
  chrome.storage.local.get("llm_picker_enabled", ({ llm_picker_enabled: isOn }) => {
    if (!isOn) return;
    let resolved = false;
    const done = (isNewChat) => {
      if (resolved) return;
      resolved = true;
      observer.disconnect();
      if (!isNewChat) return;
      chrome.runtime.sendMessage({ type: "GET_MEMORIES" }, (res) => {
        if (chrome.runtime.lastError || !res?.success) return;
        const currentPlatform = getPlatform();
        const others = (res.data || [])
          .filter((m) => m.platform !== currentPlatform)
          .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        mountCrossLLMBanner(others);
      });
    };
    const observer = new MutationObserver(() => {
      if (extractConversation().length > 0) done(false);
    });
    observer.observe(document.body, { subtree: true, childList: true });
    setTimeout(() => done(extractConversation().length === 0), 2000);
  });
}

// ── Auto-save ──────────────────────────────────────────────────────────────────

let autoSaveCount = 0;
let autoSaveUrl   = "";

const autoSaveTimer = setInterval(() => {
  try {
    if (document.visibilityState !== "visible") return;
    const messages = extractConversation();
    if (messages.length < 4) return;
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
      if (chrome.runtime.lastError) { clearInterval(autoSaveTimer); return; }
      if (res?.success) { autoSaveCount = messages.length; autoSaveUrl = location.href; }
    });
  } catch (_) { clearInterval(autoSaveTimer); }
}, 30000);

// ── Snippet save ───────────────────────────────────────────────────────────────

let snippetBtn = null;

function removeSnippetBtn() {
  if (snippetBtn) { snippetBtn.remove(); snippetBtn = null; }
}

function showSnippetBtn(text, rect) {
  removeSnippetBtn();
  const btn = document.createElement("button");
  btn.id = "llm-snippet-btn";
  btn.textContent = "⊕ Save snippet";
  Object.assign(btn.style, {
    position: "fixed",
    top:  `${Math.max(rect.top - 38, 8)}px`,
    left: `${Math.min(rect.left + rect.width / 2 - 52, window.innerWidth - 120)}px`,
    zIndex: "2147483647",
    background: "#0d0d0d", color: "#f0f0f0",
    border: "1px solid #333", borderRadius: "7px",
    padding: "5px 11px", fontSize: "12px", fontWeight: "600",
    fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif',
    cursor: "pointer", boxShadow: "0 4px 16px rgba(0,0,0,.55)",
    whiteSpace: "nowrap", transition: "background 0.12s, transform 0.1s",
    userSelect: "none",
  });
  btn.addEventListener("mouseenter", () => { btn.style.background="#1e1e1e"; btn.style.transform="scale(1.04)"; });
  btn.addEventListener("mouseleave", () => { btn.style.background="#0d0d0d"; btn.style.transform="scale(1)"; });
  btn.addEventListener("mousedown", (e) => e.preventDefault());
  btn.addEventListener("click", () => {
    const title = text.replace(/\s+/g, " ").slice(0, 55) + (text.length > 55 ? "…" : "");
    const payload = {
      id: `snippet-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title, isSnippet: true, tags: ["snippet"], workspace: "Default",
      messages: [{ role: "assistant", content: text }],
      platform: getPlatform() || "Unknown", url: location.href,
      timestamp: new Date().toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
      createdAt: Date.now(), updatedAt: Date.now(),
    };
    chrome.runtime.sendMessage({ type: "SAVE_MEMORY", payload }, (res) => {
      removeSnippetBtn();
      window.getSelection()?.removeAllRanges();
      if (res?.success) {
        const tip = document.createElement("div");
        Object.assign(tip.style, {
          position: "fixed",
          top: `${Math.max(rect.top - 38, 8)}px`,
          left: `${Math.min(rect.left + rect.width / 2 - 40, window.innerWidth - 100)}px`,
          zIndex: "2147483647", background: "#0d0d0d", color: "#d0d0d0",
          border: "1px solid #333", borderRadius: "7px",
          padding: "5px 12px", fontSize: "12px", fontWeight: "600",
          fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", sans-serif',
          boxShadow: "0 4px 16px rgba(0,0,0,.5)", pointerEvents: "none",
        });
        tip.textContent = "Snippet saved ✓";
        document.body.appendChild(tip);
        setTimeout(() => tip.remove(), 1800);
      }
    });
  });
  snippetBtn = btn;
  document.body.appendChild(btn);
}

if (getPlatform()) {
  document.addEventListener("mouseup", (e) => {
    if (e.target.closest("#llm-snippet-btn, #llm-memory-banner")) return;
    setTimeout(() => {
      const sel = window.getSelection();
      const text = sel?.toString().trim() || "";
      if (text.length >= 30) {
        const range = sel.getRangeAt(0);
        showSnippetBtn(text, range.getBoundingClientRect());
      } else {
        removeSnippetBtn();
      }
    }, 10);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") removeSnippetBtn();
  });
}

// ── Init ───────────────────────────────────────────────────────────────────────

if (getPlatform()) {
  if (document.readyState === "complete") waitForReadyThenBanner();
  else window.addEventListener("load", waitForReadyThenBanner);
}

// ── Message listener ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "GET_SIDEBAR_CONVERSATIONS") {
    sendResponse({
      success: true,
      conversations: getSidebarConversations(),
      platform: getPlatform(),
    });
    return true;
  }
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
