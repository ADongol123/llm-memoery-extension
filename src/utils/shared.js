export function makeTitle(messages) {
  const first = messages.find((m) => m.role === "user");
  if (!first) return "Untitled conversation";
  const text = first.content.replace(/\s+/g, " ").trim();
  return text.length > 55 ? text.slice(0, 55) + "…" : text;
}

export function trimMessages(messages) {
  // Collapse large code blocks, truncate long messages
  const cleaned = messages.map((m) => {
    let content = m.content;
    content = content.replace(/```[\s\S]*?```/g, (match) => {
      if (match.length <= 300) return match;
      const lang = match.match(/```(\w*)/)?.[1] || "";
      return `\`\`\`${lang}\n[${match.length} chars of code omitted]\n\`\`\``;
    });
    if (content.length > 700) {
      content = content.slice(0, 700) + `… [+${content.length - 700} chars]`;
    }
    return { ...m, content };
  });

  // If total still over ~5 KB, keep head + tail and skip the middle
  const total = cleaned.reduce((s, m) => s + m.content.length, 0);
  if (total > 5000 && cleaned.length > 6) {
    const omitted = cleaned.length - 6;
    return [
      ...cleaned.slice(0, 2),
      { role: "system", content: `[${omitted} messages omitted for brevity]` },
      ...cleaned.slice(-4),
    ];
  }
  return cleaned;
}

export function buildBriefing(memory) {
  const msgs = trimMessages(memory.messages);
  const body = msgs
    .map((m) => {
      if (m.role === "system") return m.content;
      return `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`;
    })
    .join("\n\n");
  return (
    `[Continuing a ${memory.platform} conversation — ${memory.timestamp}]\n\n` +
    body +
    `\n\n[Acknowledge you've read this and continue from here.]`
  );
}
