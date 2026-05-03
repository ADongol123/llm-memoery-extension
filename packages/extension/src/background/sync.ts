// Cloud sync — flushes the local sync queue to Supabase.
// Runs on demand and via periodic alarm.
// Gracefully handles being offline or unauthenticated.

import { getAuthenticatedClient } from "./supabase-client.js";
import {
  getPendingSyncOps,
  deleteSyncOp,
  getAllConversations,
  getAllPackages,
  saveConversation,
  savePackage,
} from "../local-db/index.js";
import type { Conversation, ContextPackage } from "../types.js";

// ── Push local changes to Supabase ─────────────────────────────────────────────

export async function flushSyncQueue(): Promise<void> {
  const client = await getAuthenticatedClient();
  if (!client) return; // not signed in — skip

  const ops = await getPendingSyncOps();
  if (!ops.length) return;

  for (const op of ops) {
    try {
      if (op.type === "upsert") {
        const { error } = await client
          .from(op.table)
          .upsert(op.payload as Record<string, unknown>, { onConflict: "id" });
        if (error) throw error;
      } else if (op.type === "delete") {
        const payload = op.payload as { id: string };
        const { error } = await client
          .from(op.table)
          .delete()
          .eq("id", payload.id);
        if (error) throw error;
      }
      await deleteSyncOp(op.id);
    } catch (e) {
      console.warn(`[Sync] Failed op ${op.id}:`, e);
      // Leave in queue — will retry next sync
    }
  }
}

// ── Pull remote changes (conversations + packages) into local DB ───────────────

export async function pullFromSupabase(): Promise<void> {
  const client = await getAuthenticatedClient();
  if (!client) return;

  const { data: { user } } = await client.auth.getUser();
  if (!user) return;

  // Pull conversations updated in the last 24h
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  const { data: remoteConvs } = await client
    .from("conversations")
    .select("*")
    .eq("user_id", user.id)
    .gte("updated_at", since)
    .order("updated_at", { ascending: false })
    .limit(200);

  if (remoteConvs) {
    for (const row of remoteConvs) {
      const conv = rowToConversation(row);
      await saveConversation(conv);
    }
  }

  // Pull packages
  const { data: remotePkgs } = await client
    .from("context_packages")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(50);

  if (remotePkgs) {
    for (const row of remotePkgs) {
      const pkg = rowToPackage(row);
      await savePackage(pkg);
    }
  }
}

// ── Full sync: push then pull ──────────────────────────────────────────────────

export async function syncNow(): Promise<void> {
  await flushSyncQueue();
  await pullFromSupabase();
}

// ── Row mappers ────────────────────────────────────────────────────────────────

function rowToConversation(row: Record<string, unknown>): Conversation {
  return {
    id:            row.id as string,
    userId:        row.user_id as string | undefined,
    workspaceId:   row.workspace_id as string | undefined,
    platform:      row.platform as Conversation["platform"],
    sourceUrl:     row.source_url as string,
    title:         row.title as string,
    messageCount:  row.message_count as number,
    rawMessages:   (row.raw_messages as Conversation["rawMessages"]) ?? [],
    summary:       row.summary as string | null,
    keyPoints:     row.key_points as string[] | null,
    openQuestions: row.open_questions as string[] | null,
    topics:        row.topics as string[] | null,
    entities:      row.entities as Conversation["entities"],
    processedAt:   row.processed_at ? new Date(row.processed_at as string).getTime() : null,
    isAutoSave:    row.is_auto_save as boolean,
    isSnippet:     row.is_snippet as boolean,
    pinned:        row.pinned as boolean,
    createdAt:     new Date(row.created_at as string).getTime(),
    updatedAt:     new Date(row.updated_at as string).getTime(),
  };
}

function rowToPackage(row: Record<string, unknown>): ContextPackage {
  return {
    id:              row.id as string,
    userId:          row.user_id as string | undefined,
    name:            row.name as string,
    description:     row.description as string,
    document:        row.document as string,
    documentJson:    row.document_json as ContextPackage["documentJson"],
    conversationIds: [],  // not returned in this query; fetched separately if needed
    shareableSlug:   row.shareable_slug as string | undefined,
    isPublic:        row.is_public as boolean,
    createdAt:       new Date(row.created_at as string).getTime(),
    updatedAt:       new Date(row.updated_at as string).getTime(),
  };
}
