export const dynamic = "force-dynamic";

import { createServerSupabaseClient } from "../../lib/supabase-server";
import { redirect } from "next/navigation";
import ConversationsClient from "./ConversationsClient";

export default async function ConversationsPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const { data: conversations } = await supabase
    .from("conversations")
    .select("id, platform, title, message_count, summary, topics, processed_at, created_at, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(200);

  return <ConversationsClient conversations={conversations ?? []} />;
}
