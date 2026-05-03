export const dynamic = "force-dynamic";

import { createServerSupabaseClient } from "../../lib/supabase-server";
import { redirect } from "next/navigation";

export default async function ConversationsPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const { data: conversations } = await supabase
    .from("conversations")
    .select("id, platform, title, message_count, summary, topics, processed_at, created_at, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(100);

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px" }}>
      <nav style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 24, color: "#6366f1" }}>⬡</span>
          <span style={{ fontWeight: 700, fontSize: 18 }}>LLM Memory</span>
        </div>
        <div style={{ display: "flex", gap: 16, fontSize: 13 }}>
          <a href="/conversations" style={{ color: "#f0f0f0", textDecoration: "none", fontWeight: 600 }}>Conversations</a>
          <a href="/packages"      style={{ color: "#666",    textDecoration: "none" }}>Packages</a>
        </div>
      </nav>

      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}>
        All Conversations
        <span style={{ fontSize: 14, fontWeight: 400, color: "#666", marginLeft: 10 }}>
          {conversations?.length ?? 0} total
        </span>
      </h1>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {(conversations ?? []).map((conv) => (
          <div
            key={conv.id}
            style={{
              background: "#111", border: "1px solid #222", borderRadius: 10,
              padding: "14px 16px", display: "flex", gap: 12, alignItems: "flex-start",
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {conv.title}
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 11, color: "#666" }}>
                <span style={{ background: "#1a1a1a", border: "1px solid #333", borderRadius: 4, padding: "1px 6px", color: "#aaa", fontWeight: 600 }}>
                  {conv.platform}
                </span>
                {conv.processed_at && (
                  <span style={{ color: "#10b981", fontSize: 10 }}>✦ AI</span>
                )}
                <span>{conv.message_count} msgs</span>
                <span>{new Date(conv.updated_at).toLocaleDateString()}</span>
              </div>
              {conv.summary && (
                <div style={{ fontSize: 12, color: "#888", marginTop: 6, lineHeight: 1.4 }}>
                  {conv.summary}
                </div>
              )}
              {conv.topics?.length && (
                <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
                  {conv.topics.map((t: string) => (
                    <span key={t} style={{ fontSize: 10, background: "#1a1a1a", border: "1px solid #333", borderRadius: 4, padding: "1px 6px", color: "#aaa" }}>
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {!conversations?.length && (
          <div style={{ textAlign: "center", color: "#555", padding: "60px 0" }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>⬡</div>
            <div>No conversations yet.</div>
            <div style={{ fontSize: 12, marginTop: 6 }}>Install the extension and start chatting on any LLM.</div>
          </div>
        )}
      </div>
    </div>
  );
}
