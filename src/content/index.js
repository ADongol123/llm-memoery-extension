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

function extractConversation() {
  const host = window.location.hostname;
  const messages = [];

  if (host.includes("claude.ai")) {
    let turns = Array.from(
      document.querySelectorAll('[data-testid="human-turn"], [data-testid="ai-turn"]')
    );
    if (turns.length === 0) {
      turns = Array.from(document.querySelectorAll("[data-message-role]"));
      turns.forEach((el) => {
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
    // User messages
    document.querySelectorAll(".query-text, .user-query-bubble .query-text-container").forEach((el) => {
      const content = el.innerText.trim();
      if (content) messages.push({ role: "user", content });
    });
    // Assistant messages
    document.querySelectorAll("message-content .markdown, model-response .response-text").forEach((el) => {
      const content = el.innerText.trim();
      if (content) messages.push({ role: "assistant", content });
    });

  } else if (host.includes("perplexity.ai")) {
    document.querySelectorAll("[data-testid='user-message']").forEach((el) => {
      messages.push({ role: "user", content: el.innerText.trim() });
    });
    document.querySelectorAll("[data-testid='answer'], .prose").forEach((el) => {
      const content = el.innerText.trim();
      if (content) messages.push({ role: "assistant", content });
    });

  } else if (host.includes("grok.com")) {
    document.querySelectorAll("[class*='UserMessage'], [class*='user-message']").forEach((el) => {
      messages.push({ role: "user", content: el.innerText.trim() });
    });
    document.querySelectorAll("[class*='AssistantMessage'], [class*='assistant-message'], [class*='BotMessage']").forEach((el) => {
      messages.push({ role: "assistant", content: el.innerText.trim() });
    });
  }

  return messages.filter((m) => m.content.length > 0);
}

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
  // Perplexity and Grok use textarea
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
    // React-controlled textarea: use native setter to trigger onChange
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value"
    ).set;
    setter.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  } else {
    // contenteditable (ProseMirror, Quill, etc.)
    // execCommand is deprecated but still the most reliable cross-framework method
    document.execCommand("selectAll", false, null);
    document.execCommand("insertText", false, text);

    // If execCommand didn't populate (some sandboxed envs), fall back
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

function buildBriefing(memory) {
  const recent = memory.messages.slice(-8);
  const lines = recent
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n\n");
  return (
    `[Context from a previous ${memory.platform} conversation — ${memory.timestamp}]\n\n` +
    lines +
    `\n\n[Please acknowledge you've read this context and continue from here.]`
  );
}

// ── Auto-inject banner ──────────────────────────────────────────────────────

let bannerMounted = false;

function mountBanner(memories) {
  if (bannerMounted) return;
  if (extractConversation().length > 0) return; // not a new chat
  bannerMounted = true;

  const wrap = document.createElement("div");
  wrap.id = "llm-memory-banner";
  wrap.style.cssText = `
    position:fixed;bottom:80px;right:20px;z-index:2147483647;
    background:#16161e;color:#e0e0e0;border:1px solid #3a3a5c;
    border-radius:14px;padding:14px 16px;font-family:system-ui,sans-serif;
    font-size:13px;box-shadow:0 8px 32px rgba(0,0,0,.5);
    width:280px;display:flex;flex-direction:column;gap:10px;
  `;

  const latest = memories[0];

  wrap.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center">
      <span style="font-weight:700;font-size:14px">🧠 Memory available</span>
      <button data-action="close" style="background:none;border:none;color:#777;cursor:pointer;font-size:18px;line-height:1;padding:0">×</button>
    </div>
    <div style="color:#9a9abc;font-size:12px;line-height:1.4">
      <strong style="color:#c4b5fd">${latest.title}</strong><br>
      ${latest.platform} · ${latest.timestamp} · ${latest.messages.length} messages
    </div>
    <div style="display:flex;gap:8px">
      <button data-action="inject-latest" style="
        flex:1;background:#6d28d9;color:#fff;border:none;border-radius:8px;
        padding:7px 10px;cursor:pointer;font-size:12px;font-weight:600
      ">Inject latest</button>
      ${
        memories.length > 1
          ? `<button data-action="pick" style="
              flex:1;background:#1e1e2e;color:#c4b5fd;border:1px solid #3f3f5a;
              border-radius:8px;padding:7px 10px;cursor:pointer;font-size:12px;font-weight:600
            ">Pick (${memories.length})</button>`
          : ""
      }
    </div>
  `;

  wrap.addEventListener("click", (e) => {
    const action = e.target.closest("[data-action]")?.dataset.action;
    if (!action) return;

    if (action === "close") {
      wrap.remove();
    } else if (action === "inject-latest") {
      const ok = injectIntoInput(buildBriefing(latest));
      wrap.remove();
      if (!ok) navigator.clipboard.writeText(buildBriefing(latest));
    } else if (action === "pick") {
      wrap.remove();
      mountPicker(memories);
    }
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
    width:300px;display:flex;flex-direction:column;gap:8px;
    max-height:320px;overflow-y:auto;
  `;

  const header = document.createElement("div");
  header.style.cssText = "display:flex;justify-content:space-between;align-items:center;margin-bottom:4px";
  header.innerHTML = `
    <span style="font-weight:700;font-size:14px">🧠 Pick memory</span>
    <button style="background:none;border:none;color:#777;cursor:pointer;font-size:18px;line-height:1;padding:0">×</button>
  `;
  header.querySelector("button").onclick = () => wrap.remove();
  wrap.appendChild(header);

  memories.forEach((mem) => {
    const btn = document.createElement("button");
    btn.style.cssText = `
      background:#1e1e2e;border:1px solid #3f3f5a;border-radius:10px;
      color:#e0e0e0;padding:10px 12px;cursor:pointer;text-align:left;
      font-size:12px;display:flex;flex-direction:column;gap:3px;width:100%;
    `;
    btn.innerHTML = `
      <span style="font-weight:600;color:#f0f0f0">${mem.title}</span>
      <span style="color:#888">${mem.platform} · ${mem.timestamp} · ${mem.messages.length} msgs</span>
    `;
    btn.onmouseenter = () => (btn.style.background = "#2a2a3e");
    btn.onmouseleave = () => (btn.style.background = "#1e1e2e");
    btn.onclick = () => {
      const briefing = buildBriefing(mem);
      const ok = injectIntoInput(briefing);
      wrap.remove();
      if (!ok) navigator.clipboard.writeText(briefing);
    };
    wrap.appendChild(btn);
  });

  document.body.appendChild(wrap);
}

// Show banner after page settles on supported platforms
const platform = getPlatform();
if (platform) {
  window.addEventListener("load", () => {
    setTimeout(() => {
      chrome.runtime.sendMessage({ type: "GET_MEMORIES" }, (res) => {
        if (res?.success && res.data?.length > 0) {
          mountBanner(res.data);
        }
      });
    }, 1800);
  });
}

// ── Message listener ────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "GET_CONVERSATION") {
    const messages = extractConversation();
    sendResponse({ success: true, messages, platform: getPlatform() });
    return true;
  }

  if (message.type === "INJECT_CONTEXT") {
    const ok = injectIntoInput(message.text);
    sendResponse({ success: ok });
    return true;
  }

  if (message.type === "GET_PLATFORM") {
    sendResponse({ platform: getPlatform() });
    return true;
  }
});
