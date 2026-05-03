import { createBrowserClient, createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const SUPABASE_URL      = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Client-side (browser components)
export function createClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// Server-side (Server Components, Route Handlers, Server Actions)
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: ()           => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // setAll called from Server Component — cookies will be set by middleware
        }
      },
    },
  });
}
