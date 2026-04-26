const saveBtn = document.getElementById("saveBtn");
const generateBtn = document.getElementById("generateBtn");
const clearBtn = document.getElementById("clearBtn");
const statusEl = document.getElementById("status");
const previewEl = document.getElementById("preview");

function showStatus(msg, type = "success") {
  statusEl.textContent = msg;
  statusEl.className = `status ${type}`;
  statusEl.classList.remove("hidden");
  setTimeout(() => statusEl.classList.add("hidden"), 3000);
}

function showPreview(text) {
  previewEl.textContent = text;
  previewEl.classList.remove("hidden");
}

function buildSummary(messages) {
  return messages
    .slice(-10)
    .map((m) => {
      const snippet = m.content.length > 200 ? m.content.slice(0, 200) + "…" : m.content;
      return `[${m.role.toUpperCase()}]: ${snippet}`;
    })
    .join("\n\n");
}

function generateBriefingPrompt(memory) {
  if (!memory) return "No memory saved yet.";
  const recent = (memory.messages || []).slice(-6);
  const lines = recent
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n\n");

  return `You are continuing an existing conversation that was previously held on a different AI assistant.

Source: ${memory.url || "unknown page"}
Saved at: ${memory.timestamp || "unknown time"}

--- Recent Conversation ---
${lines}
--- End of Conversation ---

Please acknowledge that you have reviewed this context and are ready to continue the conversation from where it left off.`;
}

saveBtn.addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    chrome.tabs.sendMessage(tab.id, { type: "GET_CONVERSATION" }, (response) => {
      if (chrome.runtime.lastError || !response || !response.success) {
        showStatus("Could not read messages from this page.", "error");
        return;
      }

      const messages = response.messages;
      if (!messages || messages.length === 0) {
        showStatus("No conversation found on this page.", "error");
        return;
      }

      const payload = {
        messages,
        summary: buildSummary(messages),
        url: tab.url,
        timestamp: new Date().toLocaleString(),
      };

      chrome.runtime.sendMessage({ type: "SAVE_MEMORY", payload }, (res) => {
        if (res && res.success) {
          showStatus(`Saved ${messages.length} messages.`, "success");
          showPreview(payload.summary);
        } else {
          showStatus("Failed to save memory.", "error");
        }
      });
    });
  });
});

generateBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "GET_MEMORY" }, (res) => {
    if (!res || !res.success || !res.data) {
      showStatus("No memory saved yet. Save a conversation first.", "error");
      return;
    }

    const prompt = generateBriefingPrompt(res.data);
    navigator.clipboard.writeText(prompt).then(() => {
      showStatus("Briefing copied to clipboard!", "success");
      showPreview(prompt);
    }).catch(() => {
      showStatus("Clipboard access denied.", "error");
      showPreview(prompt);
    });
  });
});

clearBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "CLEAR_MEMORY" }, (res) => {
    if (res && res.success) {
      previewEl.classList.add("hidden");
      showStatus("Memory cleared.", "success");
    } else {
      showStatus("Failed to clear memory.", "error");
    }
  });
});
