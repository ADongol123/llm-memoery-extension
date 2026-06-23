import { getPendingSyncOps } from "../local-db/index.js";

let newSaveCount = 0;

export function incrementNewSaves(): void {
  newSaveCount++;
  updateBadge();
}

export function clearNewSaves(): void {
  newSaveCount = 0;
  updateBadge();
}

export async function updateBadge(): Promise<void> {
  const syncStatus = await new Promise<{ state?: string }>((r) =>
    chrome.storage.local.get("llm_sync_status", (res) =>
      r((res.llm_sync_status ?? {}) as { state?: string })
    )
  );

  if (syncStatus.state === "running") {
    chrome.action.setBadgeText({ text: "..." });
    chrome.action.setBadgeBackgroundColor({ color: "#3b82f6" });
    return;
  }

  if (newSaveCount > 0) {
    chrome.action.setBadgeText({ text: String(newSaveCount) });
    chrome.action.setBadgeBackgroundColor({ color: "#10b981" });
    return;
  }

  try {
    const ops = await getPendingSyncOps();
    const pending = ops.filter((o: { table: string }) => o.table === "conversations").length;
    if (pending > 0) {
      chrome.action.setBadgeText({ text: String(pending) });
      chrome.action.setBadgeBackgroundColor({ color: "#6366f1" });
      return;
    }
  } catch {}

  chrome.action.setBadgeText({ text: "" });
}
