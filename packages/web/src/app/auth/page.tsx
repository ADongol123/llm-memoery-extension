"use client";

import { useState } from "react";
import { createClient } from "../../lib/supabase";

export default function AuthPage() {
  const [email,   setEmail]   = useState("");
  const [status,  setStatus]  = useState<"idle" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  const supabase = createClient();

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("idle");

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });

    if (error) {
      setStatus("error");
      setMessage(error.message);
    } else {
      setStatus("sent");
      setMessage("Check your email for the magic link.");
    }
  };

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
      <div style={{ width: 360, padding: "40px 32px", background: "#111", border: "1px solid #222", borderRadius: 16 }}>
        <div style={{ fontSize: 32, textAlign: "center", marginBottom: 8 }}>⬡</div>
        <h1 style={{ fontSize: 20, fontWeight: 700, textAlign: "center", marginBottom: 6 }}>LLM Memory</h1>
        <p style={{ fontSize: 13, color: "#666", textAlign: "center", marginBottom: 28 }}>
          Sign in to sync conversations across devices
        </p>

        <form onSubmit={handleSignIn}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            required
            style={{
              width: "100%", padding: "10px 12px", background: "#0a0a0a",
              border: "1px solid #333", borderRadius: 8, color: "#f0f0f0",
              fontFamily: "inherit", fontSize: 13, marginBottom: 10, boxSizing: "border-box",
            }}
          />
          <button
            type="submit"
            style={{
              width: "100%", padding: "10px", background: "#6366f1",
              border: "none", borderRadius: 8, color: "#fff",
              fontFamily: "inherit", fontSize: 13, fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Send magic link
          </button>
        </form>

        {status !== "idle" && (
          <div style={{
            marginTop: 14, fontSize: 12, textAlign: "center",
            color: status === "sent" ? "#10b981" : "#ef4444",
          }}>
            {message}
          </div>
        )}
      </div>
    </div>
  );
}
