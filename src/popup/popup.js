const saveBtn = document.getElementById("saveBtn");
const clearAllBtn = document.getElementById("clearAllBtn");
const statusEl = document.getElementById("status");
const memoryListEl = document.getElementById("memoryList");
const emptyStateEl = document.getElementById("emptyState");
const footerEl = document.getElementById("footer");
const platformBadgeEl = document.getElementById("platformBadge");

function showStatus(msg, type = "success") {
  statusEl.textContent = msg;
  statusEl.className = `status ${type}`;
  statusEl.classList.remove("hidden");
  setTimeout(() => statusEl.classList.add("hidden"), 3000);
}

function makeTitle(messages) {
  const first = messages.find((m) => m.role === "user");
  if (!first) return "Untitled conversation";
  const text = first.content.replace(/\s+/g, " ").trim();
  return text.length > 52 ? text.slice(0, 52) + "…" : text;
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

function renderMemories(memories) {
  memoryListEl.innerHTML = "";

  if (memories.length === 0) {
    emptyStateEl.classList.remove("hidden");
    footerEl.classList.add("hidden");
    return;
  }

  emptyStateEl.classList.add("hidden");
  footerEl.classList.remove("hidden");

  memories.forEach((mem) => {
    const card = document.createElement("div");
    card.className = "memory-card";
    card.innerHTML = `
      <div class="memory-card-top">
        <div class="memory-title">${mem.title}</div>
        <div class="memory-actions">
          <button class="btn-icon inject-btn" title="Inject into current chat">↗</button>
          <button class="btn-icon copy-btn" title="Copy briefing">⎘</button>
          <button class="btn-icon danger delete-btn" title="Delete">✕</button>
        </div>
      </div>
      <div class="memory-meta">
        <span class="platform-tag">${mem.platform}</span>
        ${mem.timestamp} · ${mem.messages.length} messages
      </div>
    `;

    card.querySelector(".inject-btn").addEventListener("click", () => {
      injectIntoTab(mem);
    });

    card.querySelector(".copy-btn").addEventListener("click", () => {
      navigator.clipboard.writeText(buildBriefing(mem)).then(() => {
        showStatus("Briefing copied to clipboard!");
      });
    });

    card.querySelector(".delete-btn").addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "DELETE_MEMORY", id: mem.id }, () => {
        loadMemories();
      });
    });

    memoryListEl.appendChild(card);
  });
}

function injectIntoTab(mem) {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (!tab) return;
    const briefing = buildBriefing(mem);
    chrome.tabs.sendMessage(
      tab.id,
      { type: "INJECT_CONTEXT", text: briefing },
      (res) => {
        if (chrome.runtime.lastError || !res || !res.success) {
          // Page doesn't support injection — copy to clipboard instead
          navigator.clipboard.writeText(briefing).then(() => {
            showStatus("Copied to clipboard (injection not available here).", "success");
          });
        } else {
          showStatus("Context injected!");
          window.close();
        }
      }
    );
  });
}

function loadMemories() {
  chrome.runtime.sendMessage({ type: "GET_MEMORIES" }, (res) => {
    renderMemories(res?.data || []);
  });
}

function detectPlatform() {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (!tab) return;
    chrome.tabs.sendMessage(tab.id, { type: "GET_PLATFORM" }, (res) => {
      if (chrome.runtime.lastError || !res?.platform) return;
      platformBadgeEl.textContent = `${res.platform} detected`;
      platformBadgeEl.classList.remove("hidden");
    });
  });
}

saveBtn.addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (!tab) return;
    chrome.tabs.sendMessage(tab.id, { type: "GET_CONVERSATION" }, (response) => {
      if (chrome.runtime.lastError || !response?.success) {
        showStatus("Could not read this page. Open an AI chat first.", "error");
        return;
      }

      const { messages, platform } = response;

      if (!messages || messages.length === 0) {
        showStatus("No conversation found on this page.", "error");
        return;
      }

      const payload = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        title: makeTitle(messages),
        messages,
        platform: platform || "Unknown",
        url: tab.url,
        timestamp: new Date().toLocaleString(undefined, {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
      };

      chrome.runtime.sendMessage({ type: "SAVE_MEMORY", payload }, (res) => {
        if (res?.success) {
          showStatus(`Saved — ${messages.length} messages.`);
          loadMemories();
        } else {
          showStatus("Failed to save.", "error");
        }
      });
    });
  });
});

clearAllBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "CLEAR_ALL" }, (res) => {
    if (res?.success) {
      showStatus("All memories cleared.");
      loadMemories();
    }
  });
});

// Init
detectPlatform();
loadMemories();
