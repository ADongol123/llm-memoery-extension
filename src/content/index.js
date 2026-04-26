function extractConversation() {
  const messages = [];
  const host = window.location.hostname;

  if (host.includes("claude.ai")) {
    const humanTurns = document.querySelectorAll('[data-testid="human-turn"]');
    const aiTurns = document.querySelectorAll('[data-testid="ai-turn"]');

    // Interleave by DOM order
    const allTurns = Array.from(
      document.querySelectorAll('[data-testid="human-turn"], [data-testid="ai-turn"]')
    );
    allTurns.forEach((el) => {
      const role = el.getAttribute("data-testid") === "human-turn" ? "user" : "assistant";
      const content = el.innerText.trim();
      if (content) messages.push({ role, content });
    });
  } else if (host.includes("openai.com") || host.includes("chatgpt.com")) {
    const turns = document.querySelectorAll("[data-message-author-role]");
    turns.forEach((el) => {
      const role = el.getAttribute("data-message-author-role");
      const content = el.innerText.trim();
      if (content) messages.push({ role, content });
    });
  }

  return messages;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "GET_CONVERSATION") {
    const messages = extractConversation();
    sendResponse({ success: true, messages });
    return true;
  }
});
