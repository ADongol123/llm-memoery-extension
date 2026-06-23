"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.retrieveContext = exports.processConversation = void 0;
const admin = __importStar(require("firebase-admin"));
const https_1 = require("firebase-functions/v2/https");
const vertexai_1 = require("@google-cloud/vertexai");
admin.initializeApp();
const db = admin.firestore();
const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "llm-memory-d3e9d";
const LOCATION = "us-central1";
const vertexAI = new vertexai_1.VertexAI({ project: PROJECT_ID, location: LOCATION });
const gemini = vertexAI.getGenerativeModel({ model: "gemini-2.0-flash" });
// ── Helpers ──────────────────────────────────────────────────────────────────
async function verifyAuth(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer "))
        throw new Error("Unauthorized");
    const token = authHeader.split("Bearer ")[1];
    return admin.auth().verifyIdToken(token);
}
async function getAccessToken() {
    const token = await admin.app().options.credential.getAccessToken();
    return token.access_token;
}
async function embedText(text) {
    const url = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/text-embedding-004:predict`;
    const accessToken = await getAccessToken();
    const res = await fetch(url, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            instances: [{ content: text }],
        }),
    });
    if (!res.ok) {
        console.error("Embedding error:", res.status, await res.text());
        return [];
    }
    const data = await res.json();
    return data.predictions?.[0]?.embeddings?.values ?? [];
}
async function embedBatch(texts) {
    if (texts.length === 0)
        return [];
    const url = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/text-embedding-004:predict`;
    const accessToken = await getAccessToken();
    const results = [];
    const BATCH_SIZE = 50;
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
        const batch = texts.slice(i, i + BATCH_SIZE);
        const res = await fetch(url, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                instances: batch.map((text) => ({ content: text })),
            }),
        });
        if (!res.ok) {
            console.error("Batch embedding error:", res.status, await res.text());
            results.push(...batch.map(() => []));
            continue;
        }
        const data = await res.json();
        const predictions = data.predictions ?? [];
        results.push(...predictions.map((p) => p.embeddings?.values ?? []));
    }
    return results;
}
function extractCodeBlocks(text) {
    const blocks = [];
    const codeRe = /```([^\n`]*)\n([\s\S]*?)```/g;
    const remainder = text.replace(codeRe, (_m, lang, body) => {
        blocks.push({ language: lang.trim(), body: body.trim() });
        return "\n";
    });
    return { blocks, remainder };
}
function splitProse(text) {
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length === 0)
        return [];
    const chunks = [];
    let start = 0;
    while (start < words.length) {
        const end = Math.min(start + 300, words.length);
        chunks.push(words.slice(start, end).join(" "));
        if (end === words.length)
            break;
        start = end - 50;
    }
    return chunks;
}
// ── processConversation ──────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a conversation analyst for an AI memory system.
Given a chat conversation between a user and an AI assistant, extract structured information.

Always respond with valid JSON matching exactly this schema:
{
  "summary": "2-3 sentences describing what was discussed and any outcomes",
  "keyPoints": ["array of decisions or conclusions reached"],
  "openQuestions": ["array of questions left unresolved"],
  "topics": ["array of 3-7 topic tags, lowercase, specific"],
  "entities": {
    "code": [{"language": "string", "snippet": "string (first 200 chars)", "description": "one line"}],
    "decisions": ["specific decisions made"],
    "people": ["names mentioned"],
    "projects": ["project names mentioned"],
    "urls": ["URLs mentioned"]
  }
}

Respond with JSON only, no markdown fences.`;
exports.processConversation = (0, https_1.onRequest)({ cors: true, timeoutSeconds: 120, memory: "512MiB" }, async (req, res) => {
    if (req.method !== "POST") {
        res.status(405).send("Method not allowed");
        return;
    }
    try {
        await verifyAuth(req);
    }
    catch {
        res.status(401).send("Unauthorized");
        return;
    }
    const { conversationId, rawMessages, title } = req.body;
    if (!conversationId || !rawMessages?.length) {
        res.status(400).send("Missing conversationId or rawMessages");
        return;
    }
    try {
        // Step 1: Summarize with Gemini
        const msgText = rawMessages
            .slice(0, 30)
            .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content.slice(0, 500)}`)
            .join("\n\n");
        const result = await gemini.generateContent({
            systemInstruction: { role: "system", parts: [{ text: SYSTEM_PROMPT }] },
            contents: [{ role: "user", parts: [{ text: `Analyze this conversation:\n\n${msgText}` }] }],
            generationConfig: { temperature: 0.2, maxOutputTokens: 1024, responseMimeType: "application/json" },
        });
        let parsed = {};
        try {
            const aiText = result.response.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
            parsed = JSON.parse(aiText);
        }
        catch {
            console.error("Failed to parse Gemini response");
        }
        // Step 2: Generate embedding
        const textToEmbed = [title, parsed.summary ?? "", (parsed.keyPoints ?? []).join(". ")].filter(Boolean).join("\n");
        const embedding = await embedText(textToEmbed);
        // Step 3: Update conversation in Firestore
        const convRef = db.collection("conversations").doc(conversationId);
        await convRef.update({
            summary: parsed.summary ?? null,
            keyPoints: parsed.keyPoints ?? null,
            openQuestions: parsed.openQuestions ?? null,
            topics: parsed.topics ?? null,
            entities: parsed.entities ?? null,
            processedAt: admin.firestore.FieldValue.serverTimestamp(),
            ...(embedding.length > 0 ? { embedding: admin.firestore.FieldValue.vector(embedding) } : {}),
        });
        // Step 4: Ingest chunks
        await ingestChunksForConversation(conversationId, rawMessages);
        res.json({ success: true, conversationId });
    }
    catch (error) {
        console.error("processConversation error:", error);
        res.status(500).json({ success: false, error: String(error) });
    }
});
// ── ingestChunks (internal) ──────────────────────────────────────────────────
async function ingestChunksForConversation(conversationId, rawMessages) {
    const pending = [];
    for (const msg of rawMessages) {
        const content = (msg.content ?? "").trim();
        if (!content)
            continue;
        const { blocks: codeBlocks, remainder } = extractCodeBlocks(content);
        for (const cb of codeBlocks) {
            pending.push({
                contentType: "code",
                rawContent: "```" + cb.language + "\n" + cb.body + "\n```",
                processedContent: cb.language ? `[${cb.language} code]\n${cb.body}` : cb.body,
                metadata: { language: cb.language || undefined, role: msg.role },
            });
        }
        const proseText = remainder.replace(/\n{3,}/g, "\n\n").trim();
        if (proseText) {
            for (const chunk of splitProse(proseText)) {
                pending.push({
                    contentType: "text",
                    rawContent: chunk,
                    processedContent: chunk,
                    metadata: { role: msg.role },
                });
            }
        }
    }
    if (pending.length === 0)
        return;
    // Embed all chunks
    const embeddings = await embedBatch(pending.map((p) => p.processedContent));
    // Delete existing chunks for this conversation
    const existing = await db.collection("chunks").where("conversationId", "==", conversationId).get();
    const batch1 = db.batch();
    existing.docs.forEach((doc) => batch1.delete(doc.ref));
    if (!existing.empty)
        await batch1.commit();
    // Insert new chunks (Firestore batch limit is 500)
    for (let i = 0; i < pending.length; i += 400) {
        const batch = db.batch();
        const slice = pending.slice(i, i + 400);
        slice.forEach((p, j) => {
            const idx = i + j;
            const ref = db.collection("chunks").doc();
            const data = {
                conversationId,
                contentType: p.contentType,
                rawContent: p.rawContent,
                processedContent: p.processedContent,
                chunkIndex: idx,
                metadata: p.metadata,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            };
            if (embeddings[idx]?.length > 0) {
                data.embedding = admin.firestore.FieldValue.vector(embeddings[idx]);
            }
            batch.set(ref, data);
        });
        await batch.commit();
    }
}
// ── retrieveContext ──────────────────────────────────────────────────────────
exports.retrieveContext = (0, https_1.onRequest)({ cors: true, timeoutSeconds: 60, memory: "256MiB" }, async (req, res) => {
    if (req.method !== "POST") {
        res.status(405).send("Method not allowed");
        return;
    }
    try {
        await verifyAuth(req);
    }
    catch {
        res.status(401).send("Unauthorized");
        return;
    }
    const { conversation_ids, intent } = req.body;
    if (!conversation_ids?.length || !intent?.trim()) {
        res.status(400).send("conversation_ids and intent are required");
        return;
    }
    try {
        // Step 1: Embed the intent
        const queryVector = await embedText(intent);
        if (queryVector.length === 0) {
            res.json({ synthesizedContext: "", keyArtifacts: [], openQuestions: [], topicTags: [], sourceCount: 0 });
            return;
        }
        // Step 2: Vector search on chunks collection
        // Firestore findNearest requires a composite index — we query per conversation_id
        const allChunks = [];
        for (const convId of conversation_ids) {
            const snapshot = await db.collection("chunks")
                .where("conversationId", "==", convId)
                .findNearest({
                vectorField: "embedding",
                queryVector: admin.firestore.FieldValue.vector(queryVector),
                limit: 10,
                distanceMeasure: "COSINE",
            })
                .get();
            snapshot.docs.forEach((doc) => {
                const data = doc.data();
                allChunks.push({
                    contentType: data.contentType,
                    rawContent: data.rawContent,
                    metadata: data.metadata ?? {},
                    conversationId: data.conversationId,
                    similarity: 1 - (data._distance ?? 0),
                });
            });
        }
        // Sort by similarity and take top 12
        allChunks.sort((a, b) => b.similarity - a.similarity);
        const top12 = allChunks.slice(0, 12);
        // Step 3: Assemble KnowledgeBrief
        const textChunks = top12.filter((c) => c.contentType === "text");
        const artifactChunks = top12.filter((c) => c.contentType === "code" || c.contentType === "table");
        const keyArtifacts = artifactChunks.map((c) => ({
            type: c.contentType,
            content: c.rawContent,
            label: c.contentType === "code" ? (c.metadata?.language ?? "code") : "table",
        }));
        const synthesizedContext = textChunks.map((c) => c.rawContent.trim()).join("\n\n");
        const openQuestions = textChunks
            .flatMap((c) => c.rawContent.split(/(?<=[.!?])\s+/).filter((s) => s.trimEnd().endsWith("?")).map((s) => s.trim()))
            .filter(Boolean);
        const sourceCount = new Set(top12.map((c) => c.conversationId)).size;
        res.json({ synthesizedContext, keyArtifacts, openQuestions, topicTags: [], sourceCount });
    }
    catch (error) {
        console.error("retrieveContext error:", error);
        res.status(500).json({ success: false, error: String(error) });
    }
});
//# sourceMappingURL=index.js.map