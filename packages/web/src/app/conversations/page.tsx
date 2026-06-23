"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, query, where, orderBy, limit, getDocs } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../../lib/useAuth";
import ConversationsClient from "./ConversationsClient";

interface Conversation {
  id: string;
  platform: string;
  title: string;
  message_count: number;
  summary: string | null;
  topics: string[] | null;
  processed_at: string | null;
  created_at: string;
  updated_at: string;
}

export default function ConversationsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace("/auth"); return; }

    const ref = collection(db, "conversations");
    const q = query(ref, where("userId", "==", user.uid), orderBy("updatedAt", "desc"), limit(200));

    getDocs(q).then((snap) => {
      const rows = snap.docs.map((doc) => {
        const d = doc.data();
        return {
          id: doc.id,
          platform: d.platform ?? "Unknown",
          title: d.title ?? "",
          message_count: d.messageCount ?? d.message_count ?? 0,
          summary: d.summary ?? null,
          topics: d.topics ?? null,
          processed_at: d.processedAt ? new Date(d.processedAt).toISOString() : null,
          created_at: d.createdAt?.toDate?.() ? d.createdAt.toDate().toISOString() : new Date(d.createdAt ?? Date.now()).toISOString(),
          updated_at: d.updatedAt?.toDate?.() ? d.updatedAt.toDate().toISOString() : new Date(d.updatedAt ?? Date.now()).toISOString(),
        } satisfies Conversation;
      });
      setConversations(rows);
      setFetching(false);
    }).catch((err) => {
      console.error("Failed to fetch conversations:", err);
      setFetching(false);
    });
  }, [user, loading, router]);

  if (loading || fetching) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", color: "#555" }}>
        Loading...
      </div>
    );
  }

  return <ConversationsClient conversations={conversations} />;
}
