// Local IndexedDB storage — the offline-first layer.
// All reads/writes go here first. Supabase sync happens in background.
// Accessible from the background service worker and popup (same extension origin).

import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Conversation, ContextPackage, ExtensionSettings, SelectorRegistry } from "../types.js";
import { DEFAULT_SETTINGS } from "../types.js";

const DB_NAME    = "llm-memory";
const DB_VERSION = 1;

interface LLMMemoryDB extends DBSchema {
  conversations: {
    key:     string;
    value:   Conversation;
    indexes: {
      "by-platform":   string;
      "by-updated-at": number;
    };
  };
  packages: {
    key:   string;
    value: ContextPackage;
  };
  settings: {
    key:   "settings";
    value: ExtensionSettings;
  };
  selectors: {
    key:   "registry";
    value: { registry: SelectorRegistry; fetchedAt: number };
  };
  sync_queue: {
    key:   string;
    value: { id: string; type: "upsert" | "delete"; table: string; payload: unknown; createdAt: number };
  };
}

let _db: IDBPDatabase<LLMMemoryDB> | null = null;

async function getDB(): Promise<IDBPDatabase<LLMMemoryDB>> {
  if (_db) return _db;

  _db = await openDB<LLMMemoryDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Conversations store
      const convStore = db.createObjectStore("conversations", { keyPath: "id" });
      convStore.createIndex("by-platform",   "platform");
      convStore.createIndex("by-updated-at", "updatedAt");

      // Packages store
      db.createObjectStore("packages", { keyPath: "id" });

      // Settings
      db.createObjectStore("settings");

      // Selector registry cache
      db.createObjectStore("selectors");

      // Sync queue for offline-first writes
      db.createObjectStore("sync_queue", { keyPath: "id" });
    },
  });

  return _db;
}

// ── Conversations ──────────────────────────────────────────────────────────────

export async function saveConversation(conv: Conversation): Promise<void> {
  const db = await getDB();
  await db.put("conversations", conv);
  await enqueueSyncOp({ type: "upsert", table: "conversations", payload: conv });
}

export async function upsertConversationByUrl(conv: Conversation): Promise<void> {
  const db = await getDB();
  const existing = await getConversationByUrl(conv.sourceUrl);
  if (existing) {
    const merged = { ...existing, ...conv, id: existing.id, updatedAt: Date.now() };
    await db.put("conversations", merged);
    await enqueueSyncOp({ type: "upsert", table: "conversations", payload: merged });
  } else {
    await saveConversation(conv);
  }
}

export async function getConversationByUrl(url: string): Promise<Conversation | null> {
  const db    = await getDB();
  const all   = await db.getAll("conversations");
  return all.find((c) => c.sourceUrl === url && c.isAutoSave) ?? null;
}

export async function getAllConversations(): Promise<Conversation[]> {
  const db  = await getDB();
  const all = await db.getAll("conversations");
  return all.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
}

export async function getConversation(id: string): Promise<Conversation | null> {
  const db  = await getDB();
  const val = await db.get("conversations", id);
  return val ?? null;
}

export async function updateConversation(id: string, changes: Partial<Conversation>): Promise<void> {
  const db       = await getDB();
  const existing = await db.get("conversations", id);
  if (!existing) return;
  const updated = { ...existing, ...changes, id, updatedAt: Date.now() };
  await db.put("conversations", updated);
  await enqueueSyncOp({ type: "upsert", table: "conversations", payload: updated });
}

export async function deleteConversation(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("conversations", id);
  await enqueueSyncOp({ type: "delete", table: "conversations", payload: { id } });
}

// ── Context Packages ───────────────────────────────────────────────────────────

export async function savePackage(pkg: ContextPackage): Promise<void> {
  const db = await getDB();
  await db.put("packages", pkg);
  await enqueueSyncOp({ type: "upsert", table: "context_packages", payload: pkg });
}

export async function getAllPackages(): Promise<ContextPackage[]> {
  const db  = await getDB();
  const all = await db.getAll("packages");
  return all.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

export async function getPackage(id: string): Promise<ContextPackage | null> {
  const db  = await getDB();
  const val = await db.get("packages", id);
  return val ?? null;
}

export async function deletePackage(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("packages", id);
  await enqueueSyncOp({ type: "delete", table: "context_packages", payload: { id } });
}

// ── Settings ───────────────────────────────────────────────────────────────────

export async function getSettings(): Promise<ExtensionSettings> {
  const db  = await getDB();
  return (await db.get("settings", "settings")) ?? DEFAULT_SETTINGS;
}

export async function saveSettings(settings: ExtensionSettings): Promise<void> {
  const db = await getDB();
  await db.put("settings", settings, "settings");
}

// ── Selector Registry Cache ────────────────────────────────────────────────────

const SELECTOR_TTL = 3600 * 1000; // 1 hour

export async function getCachedSelectors(): Promise<SelectorRegistry | null> {
  const db    = await getDB();
  const entry = await db.get("selectors", "registry");
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > SELECTOR_TTL) return null;
  return entry.registry;
}

export async function cacheSelectors(registry: SelectorRegistry): Promise<void> {
  const db = await getDB();
  await db.put("selectors", { registry, fetchedAt: Date.now() }, "registry");
}

// ── Sync Queue ─────────────────────────────────────────────────────────────────
// Offline-first: ops are queued here and flushed to Supabase when online + authed.

async function enqueueSyncOp(op: {
  type: "upsert" | "delete";
  table: string;
  payload: unknown;
}): Promise<void> {
  const db = await getDB();
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  await db.put("sync_queue", { id, createdAt: Date.now(), ...op });
}

export async function getPendingSyncOps() {
  const db = await getDB();
  return db.getAll("sync_queue");
}

export async function deleteSyncOp(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("sync_queue", id);
}

export async function clearSyncQueue(): Promise<void> {
  const db = await getDB();
  await db.clear("sync_queue");
}
