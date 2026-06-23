// Processes a conversation locally in the extension:
// 1. Summarizes with Gemini Flash
// 2. Generates embeddings with Gemini text-embedding-004
// 3. Updates conversation in Firestore
// 4. Creates and stores searchable chunks

import { getDb, getAuthenticatedUser } from "./firebase-client.js";
import { doc, updateDoc, collection, query, where, getDocs, writeBatch, Timestamp } from "firebase/firestore";
import { saveChunks, getChunksByConversation, deleteChunksByConversation, type LocalChunk } from "../local-db/index.js";

declare const __GEMINI_API_KEY__: string;

const GEMINI_MODEL = "gemini-2.0-flash";
const EMBED_MODEL = "text-embedding-004";

interface RawMessage {
  role: string;
  content: string;
}

const SYSTEM_PROMPT = `You are a conversation analyst for an AI memory system.
Given a chat conversation, extract structured information.
Respond with valid JSON only, no markdown fences:
{
  "summary": "2-3 sentences describing what was discussed",
  "keyPoints": ["decisions or conclusions reached"],
  "openQuestions": ["unresolved questions"],
  "topics": ["3-7 specific topic tags, lowercase"]
}`;

// ── Gemini API calls ─────────────────────────────────────────────────────────

async function callGemini(prompt: string): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${__GEMINI_API_KEY__}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 1024, responseMimeType: "application/json" },
      }),
    }
  );

  if (!res.ok) {
    console.error("Gemini error:", res.status);
    return "{}";
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
}

async function embedTexts(texts: string[]): Promise<Array<number[]>> {
  if (texts.length === 0) return [];

  const results: Array<number[]> = [];
  const BATCH = 100;

  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH);

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:batchEmbedContents?key=${__GEMINI_API_KEY__}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: batch.map((text) => ({
            model: `models/${EMBED_MODEL}`,
            content: { parts: [{ text }] },
          })),
        }),
      }
    );

    if (!res.ok) {
      console.error("Embed error:", res.status);
      results.push(...batch.map(() => []));
      continue;
    }

    const data = await res.json();
    const embeddings = data.embeddings as Array<{ values: number[] }> | undefined;
    if (embeddings) {
      results.push(...embeddings.map((e) => e.values ?? []));
    } else {
      results.push(...batch.map(() => []));
    }
  }

  return results;
}

// ── Chunking ─────────────────────────────────────────────────────────────────

function extractCodeBlocks(text: string): { blocks: Array<{ language: string; body: string }>; remainder: string } {
  const blocks: Array<{ language: string; body: string }> = [];
  const remainder = text.replace(/```([^\n`]*)\n([\s\S]*?)```/g, (_m, lang: string, body: string) => {
    blocks.push({ language: lang.trim(), body: body.trim() });
    return "\n";
  });
  return { blocks, remainder };
}

function splitProse(text: string): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const chunks: string[] = [];
  let start = 0;
  while (start < words.length) {
    const end = Math.min(start + 300, words.length);
    chunks.push(words.slice(start, end).join(" "));
    if (end === words.length) break;
    start = end - 50;
  }
  return chunks;
}

// ── Main processing function ─────────────────────────────────────────────────

export async function processConversation(
  conversationId: string,
  rawMessages: RawMessage[],
  title: string,
): Promise<void> {
  if (rawMessages.length < 2) return;

  const authData = await getAuthenticatedUser();
  if (!authData) return;

  const db = getDb();

  try {
    // Step 1: Summarize
    const msgText = rawMessages
      .slice(0, 30)
      .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content.slice(0, 500)}`)
      .join("\n\n");

    const aiText = await callGemini(`Analyze this conversation:\n\n${msgText}`);
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(aiText); } catch { /* use empty */ }

    // Step 2: Update conversation in Firestore
    const convRef = doc(db, "conversations", conversationId);
    await updateDoc(convRef, {
      summary: parsed.summary ?? null,
      keyPoints: parsed.keyPoints ?? null,
      openQuestions: parsed.openQuestions ?? null,
      topics: parsed.topics ?? null,
      processedAt: Timestamp.now(),
    });

    // Step 3: Create chunks
    interface PendingChunk {
      contentType: "text" | "code";
      rawContent: string;
      processedContent: string;
      metadata: Record<string, unknown>;
    }

    const pending: PendingChunk[] = [];
    for (const msg of rawMessages) {
      const content = (msg.content ?? "").trim();
      if (!content) continue;

      const { blocks, remainder } = extractCodeBlocks(content);
      for (const cb of blocks) {
        pending.push({
          contentType: "code",
          rawContent: "```" + cb.language + "\n" + cb.body + "\n```",
          processedContent: cb.language ? `[${cb.language} code]\n${cb.body}` : cb.body,
          metadata: { language: cb.language || undefined, role: msg.role },
        });
      }

      const prose = remainder.replace(/\n{3,}/g, "\n\n").trim();
      if (prose) {
        for (const chunk of splitProse(prose)) {
          pending.push({
            contentType: "text",
            rawContent: chunk,
            processedContent: chunk,
            metadata: { role: msg.role },
          });
        }
      }
    }

    if (pending.length === 0) return;

    // Step 4: Embed all chunks
    const embeddings = await embedTexts(pending.map((p) => p.processedContent));

    // Step 5: Save chunks to IndexedDB (local-first)
    await deleteChunksByConversation(conversationId);
    const localChunks: LocalChunk[] = pending.map((p, idx) => ({
      id: `${conversationId}-${idx}`,
      conversationId,
      contentType: p.contentType,
      rawContent: p.rawContent,
      processedContent: p.processedContent,
      chunkIndex: idx,
      embedding: embeddings[idx] ?? [],
      metadata: p.metadata,
      createdAt: Date.now(),
    }));
    await saveChunks(localChunks);

    // Step 6: Also push to Firestore for cross-device sync
    const oldChunks = await getDocs(
      query(collection(db, "chunks"), where("conversationId", "==", conversationId))
    );
    if (!oldChunks.empty) {
      const delBatch = writeBatch(db);
      oldChunks.docs.forEach((d) => delBatch.delete(d.ref));
      await delBatch.commit();
    }

    for (let i = 0; i < pending.length; i += 400) {
      const batch = writeBatch(db);
      const slice = pending.slice(i, i + 400);

      slice.forEach((p, j) => {
        const idx = i + j;
        const ref = doc(collection(db, "chunks"));
        const data: Record<string, unknown> = {
          conversationId,
          contentType: p.contentType,
          rawContent: p.rawContent,
          processedContent: p.processedContent,
          chunkIndex: idx,
          metadata: p.metadata,
          userId: authData.user.uid,
          createdAt: Timestamp.now(),
        };

        if (embeddings[idx]?.length > 0) {
          data.embedding = embeddings[idx];
        }

        batch.set(ref, data);
      });

      await batch.commit();
    }

    console.log(`[LLM Memory] Processed conversation ${conversationId}: ${pending.length} chunks`);
  } catch (e) {
    console.error("[LLM Memory] processConversation error:", e);
  }
}

// ── Retrieve context (vector search) ─────────────────────────────────────────

export async function retrieveContext(
  conversationIds: string[],
  intent: string,
): Promise<{ synthesizedContext: string; keyArtifacts: Array<{ type: string; content: string; label: string }>; openQuestions: string[]; topicTags: string[]; sourceCount: number }> {
  const empty = { synthesizedContext: "", keyArtifacts: [], openQuestions: [], topicTags: [], sourceCount: 0 };

  const [queryEmbedding] = await embedTexts([intent]);
  if (!queryEmbedding?.length) return empty;

  // Read chunks from IndexedDB (local-first, instant)
  const allChunks: Array<{ contentType: string; rawContent: string; metadata: Record<string, unknown>; conversationId: string; similarity: number }> = [];

  for (const convId of conversationIds) {
    const localChunks = await getChunksByConversation(convId);

    for (const chunk of localChunks) {
      if (chunk.embedding.length > 0) {
        allChunks.push({
          contentType: chunk.contentType,
          rawContent: chunk.rawContent,
          metadata: chunk.metadata,
          conversationId: chunk.conversationId,
          similarity: cosineSimilarity(queryEmbedding, chunk.embedding),
        });
      }
    }
  }

  allChunks.sort((a, b) => b.similarity - a.similarity);
  const top12 = allChunks.slice(0, 12);

  if (!top12.length) return empty;

  const textChunks = top12.filter((c) => c.contentType === "text");
  const artifactChunks = top12.filter((c) => c.contentType === "code");

  return {
    synthesizedContext: textChunks.map((c) => c.rawContent.trim()).join("\n\n"),
    keyArtifacts: artifactChunks.map((c) => ({
      type: c.contentType,
      content: c.rawContent,
      label: (c.metadata?.language as string) ?? "code",
    })),
    openQuestions: textChunks
      .flatMap((c) => c.rawContent.split(/(?<=[.!?])\s+/).filter((s) => s.trimEnd().endsWith("?")))
      .filter(Boolean),
    topicTags: [],
    sourceCount: new Set(top12.map((c) => c.conversationId)).size,
  };
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}
