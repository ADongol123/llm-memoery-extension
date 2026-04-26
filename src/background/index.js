chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "SAVE_MEMORY") {
    chrome.storage.local.set({ llm_memory: message.payload }, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === "GET_MEMORY") {
    chrome.storage.local.get("llm_memory", (result) => {
      sendResponse({ success: true, data: result.llm_memory || null });
    });
    return true;
  }

  if (message.type === "CLEAR_MEMORY") {
    chrome.storage.local.remove("llm_memory", () => {
      sendResponse({ success: true });
    });
    return true;
  }
});
