// Background service worker — the central hub.
// Manages: storage, cloud sync, AI package generation, keyboard shortcuts,
//          selector registry refresh, periodic alarms.

import { handleMessage }           from "./message-handler.js";
import { syncNow }                  from "./sync.js";
import { refreshSelectorRegistry }  from "./selector-refresh.js";
import { getSettings, saveConversation } from "../local-db/index.js";
import { makeTitle }                from "../types.js";

// ── Startup ────────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async () => {
  console.log("[LLM Memory] Installed — initialising");
  await refreshSelectorRegistry();
  setupAlarms();
});

chrome.runtime.onStartup.addListener(async () => {
  await refreshSelectorRegistry();
  await syncNow().catch(() => {});
  setupAlarms();
});

// ── Alarms ─────────────────────────────────────────────────────────────────────

function setupAlarms(): void {
  chrome.alarms.create("sync",             { periodInMinutes: 5 });
  chrome.alarms.create("selector-refresh", { periodInMinutes: 60 });
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "sync")             await syncNow().catch(() => {});
  if (alarm.name === "selector-refresh") await refreshSelectorRegistry().catch(() => {});
});

// ── Message router ─────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(handleMessage);

// ── Keyboard shortcuts ─────────────────────────────────────────────────────────

chrome.commands.onCommand.addListener(async (command) => {
  if (command === "save-conversation") {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    chrome.tabs.sendMessage(
      tab.id,
      { type: "GET_CONVERSATION" },
      async (res: { success: boolean; messages: unknown[]; platform: string } | undefined) => {
        if (chrome.runtime.lastError || !res?.success || !res.messages?.length) return;

        const settings = await getSettings();
        const rawMsgs = res.messages as Array<{ role: string; content: string }>;
        const msgs    = rawMsgs.map((m) => ({
          role:    m.role as "user" | "assistant",
          content: m.content,
        }));

        await saveConversation({
          id:            `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          platform:      res.platform as never,
          sourceUrl:     tab.url ?? "",
          title:         makeTitle(msgs),
          messageCount:  msgs.length,
          rawMessages:   msgs,
          summary:       null,
          keyPoints:     null,
          openQuestions: null,
          topics:        null,
          entities:      null,
          processedAt:   null,
          isAutoSave:    false,
          isSnippet:     false,
          pinned:        false,
          createdAt:     Date.now(),
          updatedAt:     Date.now(),
        });
      }
    );
  }
});
