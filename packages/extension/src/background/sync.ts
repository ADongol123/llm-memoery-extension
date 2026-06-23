// Cloud sync — flushes the local sync queue to Firestore.
// Runs on demand and via periodic alarm.

import { getDb, getAuthenticatedUser } from "./firebase-client.js";
import {
  doc, setDoc, deleteDoc, collection, query, where, orderBy, limit, getDocs, Timestamp,
} from "firebase/firestore";
import {
  getPendingSyncOps,
  deleteSyncOp,
  saveConversation,
  savePackage,
} from "../local-db/index.js";
import type { Conversation, ContextPackage } from "../types.js";
import { processConversation } from "./process-conversation.js";

// ── Push local changes to Firestore ───────────────────────────────────────────

export async function flushSyncQueue(): Promise<void> {
  const authData = await getAuthenticatedUser();
  if (!authData) return;

  const { user } = authData;
  const db = getDb();
  const ops = await getPendingSyncOps();
  if (!ops.length) return;

  for (const op of ops) {
    try {
      const payload = op.payload as Record<string, unknown>;
      const docId = payload.id as string;

      if (op.type === "upsert") {
        const colName = op.table === "conversations" ? "conversations" : "packages";
        const docRef = doc(db, colName, docId);
        await setDoc(docRef, {
          ...toFirestoreFields(payload, op.table),
          userId: user.uid,
          updatedAt: Timestamp.now(),
        }, { merge: true });

        // Trigger processing for newly synced conversations
        if (op.table === "conversations") {
          triggerProcessing(payload);
        }
      } else if (op.type === "delete") {
        const colName = op.table === "conversations" ? "conversations" : "packages";
        await deleteDoc(doc(db, colName, docId));
      }
      await deleteSyncOp(op.id);
    } catch (e) {
      console.warn(`[Sync] Failed op ${op.id}:`, e);
    }
  }
}

// ── Pull remote changes into local DB ─────────────────────────────────────────

export async function pullFromFirestore(): Promise<void> {
  const authData = await getAuthenticatedUser();
  if (!authData) return;

  const { user } = authData;
  const db = getDb();

  // Pull recent conversations
  const convsRef = collection(db, "conversations");
  const convsQuery = query(
    convsRef,
    where("userId", "==", user.uid),
    orderBy("updatedAt", "desc"),
    limit(200)
  );

  const convsSnap = await getDocs(convsQuery);
  for (const docSnap of convsSnap.docs) {
    const conv = firestoreToConversation(docSnap.id, docSnap.data());
    await saveConversation(conv);
  }

  // Pull packages
  const pkgsRef = collection(db, "packages");
  const pkgsQuery = query(
    pkgsRef,
    where("userId", "==", user.uid),
    orderBy("updatedAt", "desc"),
    limit(50)
  );

  const pkgsSnap = await getDocs(pkgsQuery);
  for (const docSnap of pkgsSnap.docs) {
    const pkg = firestoreToPackage(docSnap.id, docSnap.data());
    await savePackage(pkg);
  }
}

// ── Full sync: push then pull ────────────────────────────────────────────────

export async function syncNow(): Promise<void> {
  await flushSyncQueue();
  await pullFromFirestore();
}

// ── Trigger local processing ─────────────────────────────────────────────────

function triggerProcessing(payload: Record<string, unknown>): void {
  const rawMessages = (payload.rawMessages ?? payload.raw_messages ?? []) as Array<{ role: string; content: string }>;
  const title = (payload.title ?? "") as string;
  const id = payload.id as string;

  processConversation(id, rawMessages, title).catch((e) =>
    console.warn("[Sync] process-conversation failed:", e)
  );
}

// ── Field mappers ─────────────────────────────────────────────────────────────

function toFirestoreFields(payload: Record<string, unknown>, table: string): Record<string, unknown> {
  if (table === "conversations") {
    return {
      platform:      payload.platform,
      sourceUrl:     payload.sourceUrl ?? payload.source_url,
      title:         payload.title,
      messageCount:  payload.messageCount ?? payload.message_count,
      rawMessages:   payload.rawMessages ?? payload.raw_messages,
      summary:       payload.summary ?? null,
      keyPoints:     payload.keyPoints ?? payload.key_points ?? null,
      openQuestions: payload.openQuestions ?? payload.open_questions ?? null,
      topics:        payload.topics ?? null,
      entities:      payload.entities ?? null,
      processedAt:   payload.processedAt ?? payload.processed_at ?? null,
      isAutoSave:    payload.isAutoSave ?? payload.is_auto_save ?? false,
      isSnippet:     payload.isSnippet ?? payload.is_snippet ?? false,
      pinned:        payload.pinned ?? false,
      createdAt:     Timestamp.fromMillis(payload.createdAt as number ?? Date.now()),
    };
  }

  // packages
  return {
    name:            payload.name,
    description:     payload.description,
    document:        payload.document,
    documentJson:    payload.documentJson ?? payload.document_json,
    conversationIds: payload.conversationIds ?? [],
    isPublic:        payload.isPublic ?? payload.is_public ?? false,
    createdAt:       Timestamp.fromMillis(payload.createdAt as number ?? Date.now()),
  };
}

function firestoreToConversation(id: string, data: Record<string, unknown>): Conversation {
  return {
    id,
    platform:      data.platform as Conversation["platform"],
    sourceUrl:     data.sourceUrl as string ?? "",
    title:         data.title as string ?? "",
    messageCount:  data.messageCount as number ?? 0,
    rawMessages:   (data.rawMessages as Conversation["rawMessages"]) ?? [],
    summary:       data.summary as string | null ?? null,
    keyPoints:     data.keyPoints as string[] | null ?? null,
    openQuestions: data.openQuestions as string[] | null ?? null,
    topics:        data.topics as string[] | null ?? null,
    entities:      data.entities as Conversation["entities"] ?? null,
    processedAt:   data.processedAt ? (data.processedAt as { toMillis?: () => number }).toMillis?.() ?? (data.processedAt as number) : null,
    isAutoSave:    data.isAutoSave as boolean ?? false,
    isSnippet:     data.isSnippet as boolean ?? false,
    pinned:        data.pinned as boolean ?? false,
    createdAt:     (data.createdAt as { toMillis?: () => number })?.toMillis?.() ?? Date.now(),
    updatedAt:     (data.updatedAt as { toMillis?: () => number })?.toMillis?.() ?? Date.now(),
  };
}

function firestoreToPackage(id: string, data: Record<string, unknown>): ContextPackage {
  return {
    id,
    name:            data.name as string ?? "",
    description:     data.description as string ?? "",
    document:        data.document as string ?? "",
    documentJson:    data.documentJson as ContextPackage["documentJson"],
    conversationIds: (data.conversationIds as string[]) ?? [],
    isPublic:        data.isPublic as boolean ?? false,
    createdAt:       (data.createdAt as { toMillis?: () => number })?.toMillis?.() ?? Date.now(),
    updatedAt:       (data.updatedAt as { toMillis?: () => number })?.toMillis?.() ?? Date.now(),
  };
}
