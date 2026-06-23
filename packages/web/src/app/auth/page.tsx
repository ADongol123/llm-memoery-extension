"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithGoogle } from "../../lib/firebase";

export default function AuthPage() {
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState("");
  const router = useRouter();

  const handleGoogleSignIn = async () => {
    setStatus("loading");
    try {
      await signInWithGoogle();
      router.push("/conversations");
    } catch (error) {
      setStatus("error");
      setMessage(String(error));
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

        <button
          onClick={handleGoogleSignIn}
          disabled={status === "loading"}
          style={{
            width: "100%", padding: "10px 12px", background: "#fff",
            border: "1px solid #dadce0", borderRadius: 8, color: "#3c4043",
            fontFamily: "inherit", fontSize: 13, fontWeight: 500,
            cursor: status === "loading" ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            boxSizing: "border-box", opacity: status === "loading" ? 0.6 : 1,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
            <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
          </svg>
          {status === "loading" ? "Signing in…" : "Sign in with Google"}
        </button>

        {status === "error" && (
          <div style={{ marginTop: 14, fontSize: 12, textAlign: "center", color: "#ef4444" }}>
            {message}
          </div>
        )}
      </div>
    </div>
  );
}
