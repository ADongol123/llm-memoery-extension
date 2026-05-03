import { createServerSupabaseClient } from "../../lib/supabase";
import { redirect } from "next/navigation";

export default async function PackagesPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const { data: packages } = await supabase
    .from("context_packages")
    .select("id, name, description, document, document_json, is_public, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px" }}>
      <nav style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 24, color: "#6366f1" }}>⬡</span>
          <span style={{ fontWeight: 700, fontSize: 18 }}>LLM Memory</span>
        </div>
        <div style={{ display: "flex", gap: 16, fontSize: 13 }}>
          <a href="/conversations" style={{ color: "#666",    textDecoration: "none" }}>Conversations</a>
          <a href="/packages"      style={{ color: "#f0f0f0", textDecoration: "none", fontWeight: 600 }}>Packages</a>
        </div>
      </nav>

      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}>
        Context Packages
        <span style={{ fontSize: 14, fontWeight: 400, color: "#666", marginLeft: 10 }}>
          {packages?.length ?? 0} total
        </span>
      </h1>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {(packages ?? []).map((pkg) => {
          const doc = pkg.document_json as {
            summary?: string;
            decisionsMade?: string[];
            openQuestions?: string[];
            suggestedNextSteps?: string[];
          } | null;

          return (
            <div
              key={pkg.id}
              style={{ background: "#111", border: "1px solid #222", borderRadius: 12, padding: "16px 18px" }}
            >
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>{pkg.name}</div>
              <div style={{ fontSize: 11, color: "#555", marginBottom: 10 }}>
                {new Date(pkg.created_at).toLocaleString()}
                {pkg.is_public && <span style={{ marginLeft: 8, color: "#6366f1" }}>Public</span>}
              </div>

              {doc?.summary && (
                <div style={{ fontSize: 13, color: "#aaa", lineHeight: 1.5, marginBottom: 10 }}>
                  {doc.summary}
                </div>
              )}

              {doc?.decisionsMade?.length && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#555", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.5px" }}>Decisions Made</div>
                  {doc.decisionsMade.slice(0, 3).map((d, i) => (
                    <div key={i} style={{ fontSize: 12, color: "#888", marginBottom: 2 }}>• {d}</div>
                  ))}
                </div>
              )}

              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button
                  style={{
                    background: "#6366f1", border: "none", borderRadius: 6, color: "#fff",
                    cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600,
                    padding: "6px 14px",
                  }}
                  onClick={undefined}
                >
                  Copy to clipboard
                </button>
              </div>
            </div>
          );
        })}

        {!packages?.length && (
          <div style={{ textAlign: "center", color: "#555", padding: "60px 0" }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>⊕</div>
            <div>No Context Packages yet.</div>
            <div style={{ fontSize: 12, marginTop: 6 }}>Use the extension to select conversations and generate a package.</div>
          </div>
        )}
      </div>
    </div>
  );
}
