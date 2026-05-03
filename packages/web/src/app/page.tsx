import { createServerSupabaseClient } from "../lib/supabase";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/auth");
  redirect("/conversations");
}
