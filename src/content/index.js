import { makeTitle, buildBriefing } from "../utils/shared.js";

const PLATFORM_MAP = {
  "claude.ai":           "Claude",
  "chatgpt.com":         "ChatGPT",
  "chat.openai.com":     "ChatGPT",
  "gemini.google.com":   "Gemini",
  "perplexity.ai":       "Perplexity",
  "grok.com":            "Grok",
};

function getPlatform() {
  const host = window.location.hostname;
  for (const [domain, name] of Object.entries(PLATFORM_MAP)) {
    if (host.includes(domain)) return name;
  }
  return null;
}

// ── Sidebar scraping ───────────────────────────────────────────────────────────

function getRecentConversations() {
  const host = window.location.hostname;
  const raw = [];

  if (host.includes("claude.ai")) {
    // Main nav sidebar: links to /chat/uuid
    document.querySelectorAll('nav a[href*="/chat/"]').forEach((a) => {
      const title = a.innerText.trim();
      if (title && a.href) raw.push({ title, url: a.href });
    });

  } else if (host.includes("chatgpt.com") || host.includes("openai.com")) {
    // Sidebar conversation list: links /c/uuid
    document.querySelectorAll('nav a[href^="/c/"], nav ol li a').forEach((a) => {
      const title = a.innerText.trim();
      if (title && a.href) raw.push({ title, url: a.href });
    });

  } else if (host.includes("gemini.google.com")) {
    // Recent chats in the left rail
    document.querySelectorAll(
      'a[href*="/app/"], .conversation-list-item a, [data-conversation-id]'
    ).forEach((el) => {
      const a = el.tagName === "A" ? el : el.querySelector("a");
      if (!a) return;
      const title = a.innerText.trim() || el.innerText.trim();
      if (title) raw.push({ title, url: a.href || "" });
    });

  } else if (host.includes("perplexity.ai")) {
    // Threads in the left sidebar
    document.querySelectorAll(
      'a[href^="/search/"], a[href^="/thread/"]'
    ).forEach((a) => {
      const title = a.innerText.trim();
      if (title) raw.push({ title, url: a.href });
    });

  } else if (host.includes("grok.com")) {
    document.querySelectorAll('a[href*="/conversation/"]').forEach((a) => {
      const title = a.innerText.trim();
      if (title) raw.push({ title, url: a.href });
    });
  }

  // Deduplicate by URL, skip current page, return first 5
  const current = location.href;
  const seen = new Set();
  return raw
    .filter((c) => {
      if (!c.title || c.url === current || seen.has(c.url)) return false;
      seen.add(c.url);
      return true;
    })
    .slice(0, 5);
}

// ── Conversation extraction ───────────────────────────────────────────────────

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
      .forEach((el) => messages.push({ role: "user", content: el.innerText.trim() }));
    document
      .querySelectorAll("[class*='AssistantMessage'], [class*='BotMessage']")
      .forEach((el) => messages.push({ role: "assistant", content: el.innerText.trim() }));
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

// ── Floating picker banner ────────────────────────────────────────────────────
// Shown on new (empty) chats when the toggle is ON.

let bannerMounted = false;

const BANNER_STYLES = `
  position:fixed;bottom:24px;right:22px;z-index:2147483647;
  background:#0f0f0f;color:#e8e8e8;
  border:1px solid #272727;border-radius:14px;
  padding:16px;font-family:-apple-system,BlinkMacSystemFont,"Inter","Segoe UI",sans-serif;
  font-size:13px;box-shadow:0 16px 48px rgba(0,0,0,.7),0 4px 16px rgba(0,0,0,.4);
  width:296px;display:flex;flex-direction:column;gap:10px;
`;

const ITEM_BASE = `
  background:#161616;border:1px solid #222;border-radius:9px;
  color:#ccc;padding:9px 12px;cursor:pointer;text-align:left;
  font-family:inherit;font-size:12px;font-weight:500;
  display:flex;align-items:center;gap:10px;width:100%;
  transition:background 0.12s,border-color 0.12s,transform 0.1s;
`;

function mountPickerBanner(convs) {
  if (bannerMounted || document.getElementById("llm-picker-banner")) return;
  bannerMounted = true;

  const platform = getPlatform();

  const wrap = document.createElement("div");
  wrap.id = "llm-picker-banner";
  wrap.style.cssText = BANNER_STYLES;

  // Header
  const hdr = document.createElement("div");
  hdr.style.cssText = "display:flex;justify-content:space-between;align-items:center;";
  hdr.innerHTML = `
    <div>
      <div style="font-weight:700;font-size:13.5px;color:#fff;margin-bottom:1px;">Pick up where you left off</div>
      <div style="font-size:11px;color:#555;">Recent on ${platform}</div>
    </div>
    <button data-action="close" style="background:#1a1a1a;border:1px solid #2a2a2a;color:#666;cursor:pointer;font-size:16px;line-height:1;padding:4px 8px;border-radius:6px;transition:all 0.12s;">×</button>
  `;
  wrap.appendChild(hdr);

  // Conversation list
  const list = document.createElement("div");
  list.style.cssText = "display:flex;flex-direction:column;gap:4px;";

  if (!convs.length) {
    const empty = document.createElement("div");
    empty.style.cssText = "color:#444;font-size:12px;padding:8px 0;text-align:center;";
    empty.textContent = "No recent conversations found in sidebar.";
    list.appendChild(empty);
  } else {
    convs.forEach((conv, i) => {
      const btn = document.createElement("button");
      btn.style.cssText = ITEM_BASE;
      btn.innerHTML = `
        <span style="font-size:10px;font-weight:800;color:#333;width:14px;text-align:center;flex-shrink:0;">${i + 1}</span>
        <span style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${conv.title}</span>
        <span style="font-size:11px;color:#333;flex-shrink:0;">→</span>
      `;
      btn.addEventListener("mouseenter", () => {
        btn.style.background = "#1e1e1e";
        btn.style.borderColor = "#3a3a3a";
        btn.style.transform = "translateX(2px)";
      });
      btn.addEventListener("mouseleave", () => {
        btn.style.background = "#161616";
        btn.style.borderColor = "#222";
        btn.style.transform = "translateX(0)";
      });
      btn.addEventListener("click", () => {
        wrap.remove();
        if (conv.url) window.location.href = conv.url;
      });
      list.appendChild(btn);
    });
  }
  wrap.appendChild(list);

  // Random button (only if there are convs)
  if (convs.length > 1) {
    const randomBtn = document.createElement("button");
    randomBtn.style.cssText = `
      background:none;border:1px solid #222;color:#555;border-radius:7px;
      padding:7px;font-size:12px;font-weight:600;cursor:pointer;
      font-family:inherit;transition:all 0.12s;
    `;
    randomBtn.textContent = "↻  Pick random";
    randomBtn.addEventListener("mouseenter", () => {
      randomBtn.style.borderColor = "#fff";
      randomBtn.style.color = "#fff";
    });
    randomBtn.addEventListener("mouseleave", () => {
      randomBtn.style.borderColor = "#222";
      randomBtn.style.color = "#555";
    });
    randomBtn.addEventListener("click", () => {
      const pick = convs[Math.floor(Math.random() * convs.length)];
      wrap.remove();
      if (pick.url) window.location.href = pick.url;
    });
    wrap.appendChild(randomBtn);
  }

  wrap.addEventListener("click", (e) => {
    if (e.target.closest("[data-action='close']")) wrap.remove();
  });

  // Animate in
  wrap.style.opacity = "0";
  wrap.style.transform = "translateY(12px)";
  wrap.style.transition = "opacity 0.25s ease, transform 0.25s cubic-bezier(0.34,1.3,0.64,1)";
  document.body.appendChild(wrap);
  requestAnimationFrame(() => {
    wrap.style.opacity = "1";
    wrap.style.transform = "translateY(0)";
  });
}

// ── SPA navigation ────────────────────────────────────────────────────────────

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

// ── Banner trigger logic ──────────────────────────────────────────────────────

function waitForReadyThenBanner() {
  if (extractConversation().length > 0) return; // existing conversation — skip

  chrome.storage.local.get("llm_picker_enabled", ({ llm_picker_enabled: isOn }) => {
    if (!isOn) return; // feature is toggled off

    let resolved = false;

    const done = (isNewChat) => {
      if (resolved) return;
      resolved = true;
      observer.disconnect();
      if (!isNewChat) return;

      // Give sidebar a moment to load, then scrape
      setTimeout(() => {
        const convs = getRecentConversations();
        mountPickerBanner(convs);
      }, 800);
    };

    const observer = new MutationObserver(() => {
      if (extractConversation().length > 0) done(false);
    });
    observer.observe(document.body, { subtree: true, childList: true });
    setTimeout(() => done(extractConversation().length === 0), 2000);
  });
}

// ── Auto-save ─────────────────────────────────────────────────────────────────

let autoSaveCount = 0;
let autoSaveUrl = "";

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
      if (res?.success) {
        autoSaveCount = messages.length;
        autoSaveUrl = location.href;
      }
    });
  } catch (_) {
    clearInterval(autoSaveTimer);
  }
}, 30000);

// ── Init ──────────────────────────────────────────────────────────────────────

if (getPlatform()) {
  if (document.readyState === "complete") {
    waitForReadyThenBanner();
  } else {
    window.addEventListener("load", waitForReadyThenBanner);
  }
}

// ── Message listener ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "GET_RECENT_CONVERSATIONS") {
    const conversations = getRecentConversations();
    sendResponse({ success: true, conversations, platform: getPlatform() });
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
