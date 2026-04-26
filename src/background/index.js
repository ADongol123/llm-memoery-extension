chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "SAVE_MEMORY") {
    chrome.storage.local.get("llm_memories", (result) => {
      const memories = result.llm_memories || [];
      memories.unshift(message.payload);
      if (memories.length > 50) memories.splice(50);
      chrome.storage.local.set({ llm_memories: memories }, () => {
        sendResponse({ success: true });
      });
    });
    return true;
  }

  if (message.type === "GET_MEMORIES") {
    chrome.storage.local.get("llm_memories", (result) => {
      sendResponse({ success: true, data: result.llm_memories || [] });
    });
    return true;
  }

  if (message.type === "DELETE_MEMORY") {
    chrome.storage.local.get("llm_memories", (result) => {
      const memories = (result.llm_memories || []).filter(
        (m) => m.id !== message.id
      );
      chrome.storage.local.set({ llm_memories: memories }, () => {
        sendResponse({ success: true });
      });
    });
    return true;
  }

  if (message.type === "CLEAR_ALL") {
    chrome.storage.local.remove("llm_memories", () => {
      sendResponse({ success: true });
    });
    return true;
  }
});
