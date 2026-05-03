import type { Metadata } from "next";

export const metadata: Metadata = {
  title:       "LLM Memory",
  description: "Your conversations across Claude, ChatGPT, Gemini, Grok and DeepSeek — in one place.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif", background: "#0a0a0a", color: "#f0f0f0" }}>
        {children}
      </body>
    </html>
  );
}
