import type { Message } from "../types/index.js";

const MAX_MSG_LENGTH = 700;
const MAX_CODE_LENGTH = 300;
const TOTAL_BUDGET = 5000;
const HEAD_MSGS = 2;
const TAIL_MSGS = 4;

export function trimMessages(messages: Message[]): Message[] {
  const cleaned = messages.map((m) => {
    let content = m.content;

    content = content.replace(/```[\s\S]*?```/g, (match) => {
      if (match.length <= MAX_CODE_LENGTH) return match;
      const lang = match.match(/```(\w*)/)?.[1] ?? "";
      return `\`\`\`${lang}\n[${match.length} chars of code — see original]\n\`\`\``;
    });

    if (content.length > MAX_MSG_LENGTH) {
      content = content.slice(0, MAX_MSG_LENGTH) + `… [+${content.length - MAX_MSG_LENGTH} chars]`;
    }

    return { ...m, content };
  });

  const total = cleaned.reduce((s, m) => s + m.content.length, 0);
  if (total > TOTAL_BUDGET && cleaned.length > HEAD_MSGS + TAIL_MSGS) {
    const omitted = cleaned.length - HEAD_MSGS - TAIL_MSGS;
    return [
      ...cleaned.slice(0, HEAD_MSGS),
      { role: "system", content: `[${omitted} messages omitted for brevity]` },
      ...cleaned.slice(-TAIL_MSGS),
    ];
  }

  return cleaned;
}

export function makeTitle(messages: Message[]): string {
  const first = messages.find((m) => m.role === "user");
  if (!first) return "Untitled conversation";
  const text = first.content.replace(/\s+/g, " ").trim();
  return text.length > 60 ? text.slice(0, 60) + "…" : text;
}
