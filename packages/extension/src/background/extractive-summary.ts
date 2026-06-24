declare const __HF_API_TOKEN__: string;

export interface ExtractiveSummary {
  summary: string;
  keyPoints: string[];
  openQuestions: string[];
  topics: string[];
}

const HF_MODEL = "mistralai/Mistral-7B-Instruct-v0.3";

const SYSTEM_PROMPT = `You are a conversation analyst. Given a chat conversation, extract structured information.
Respond with valid JSON only, no markdown fences:
{
  "summary": "2-3 sentences describing what was discussed",
  "keyPoints": ["decisions or conclusions reached"],
  "openQuestions": ["unresolved questions"],
  "topics": ["3-7 specific topic tags, lowercase"]
}`;

async function hfSummarize(
  messages: Array<{ role: string; content: string }>,
): Promise<ExtractiveSummary | null> {
  if (!__HF_API_TOKEN__) return null;

  const msgText = messages
    .slice(0, 30)
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content.slice(0, 500)}`)
    .join("\n\n");

  try {
    const res = await fetch(
      `https://api-inference.huggingface.co/models/${HF_MODEL}/v1/chat/completions`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${__HF_API_TOKEN__}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: HF_MODEL,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: `Analyze this conversation:\n\n${msgText}` },
          ],
          max_tokens: 1024,
          temperature: 0.2,
        }),
      }
    );

    if (!res.ok) {
      console.warn("[LLM Memory] HF API error:", res.status);
      return null;
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content ?? "";
    const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(cleaned);

    return {
      summary: parsed.summary ?? "",
      keyPoints: parsed.keyPoints ?? [],
      openQuestions: parsed.openQuestions ?? [],
      topics: parsed.topics ?? [],
    };
  } catch (e) {
    console.warn("[LLM Memory] HF summarization failed, using local fallback:", e);
    return null;
  }
}

// ── Local fallback (no API) ───────────────────────────────────────────────────

const STOP_WORDS = new Set([
  "a","an","the","is","are","was","were","be","been","being","have","has","had",
  "do","does","did","will","would","shall","should","may","might","must","can",
  "could","i","you","he","she","it","we","they","me","him","her","us","them",
  "my","your","his","its","our","their","mine","yours","ours","theirs","this",
  "that","these","those","what","which","who","whom","when","where","why","how",
  "all","each","every","both","few","more","most","other","some","such","no",
  "not","only","same","so","than","too","very","just","about","above","after",
  "again","against","along","also","am","among","and","any","as","at","back",
  "because","before","below","between","but","by","come","could","day","down",
  "even","first","for","from","get","give","go","good","great","here","if","in",
  "into","know","like","look","make","man","many","much","new","now","of","off",
  "on","one","or","out","over","own","part","per","put","right","said","say",
  "see","still","take","tell","then","there","think","through","time","to","two",
  "under","up","upon","use","want","way","well","with","work","year",
]);

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 10);
}

function getWordFrequency(text: string): Map<string, number> {
  const freq = new Map<string, number>();
  const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/);
  for (const w of words) {
    if (w.length < 3 || STOP_WORDS.has(w)) continue;
    freq.set(w, (freq.get(w) ?? 0) + 1);
  }
  return freq;
}

function scoreSentence(
  sentence: string,
  position: number,
  total: number,
  wordFreq: Map<string, number>,
): number {
  let score = 0;
  const posRatio = position / total;
  if (posRatio < 0.2) score += 3;
  else if (posRatio > 0.8) score += 1;

  const wordCount = sentence.split(/\s+/).length;
  if (wordCount >= 8 && wordCount <= 30) score += 2;
  else if (wordCount < 5) score -= 1;

  const words = sentence.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/);
  let keywordScore = 0;
  for (const w of words) {
    if (wordFreq.has(w)) keywordScore += wordFreq.get(w)!;
  }
  score += Math.min(keywordScore / Math.max(words.length, 1), 3);

  return score;
}

function localSummarize(
  messages: Array<{ role: string; content: string }>,
): ExtractiveSummary {
  const allText = messages.map((m) => m.content).join("\n\n");
  const sentences = splitSentences(allText);
  const wordFreq = getWordFrequency(allText);

  const scored = sentences.map((s, i) => ({
    sentence: s,
    score: scoreSentence(s, i, sentences.length, wordFreq),
    index: i,
  }));
  scored.sort((a, b) => b.score - a.score);

  const topSentences = scored
    .slice(0, 3)
    .sort((a, b) => a.index - b.index)
    .map((s) => s.sentence);

  const keyPoints = scored
    .slice(0, 5)
    .map((s) => s.sentence)
    .filter((s) => s.length < 200);

  const openQuestions = sentences
    .filter((s) => s.trimEnd().endsWith("?"))
    .slice(0, 5);

  const topics = [...wordFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7)
    .map(([word]) => word);

  return { summary: topSentences.join(" "), keyPoints, openQuestions, topics };
}

// ── Public API: tries HF first, falls back to local ───────────────────────────

export async function extractSummary(
  messages: Array<{ role: string; content: string }>,
): Promise<ExtractiveSummary> {
  const hfResult = await hfSummarize(messages);
  if (hfResult) return hfResult;
  return localSummarize(messages);
}
