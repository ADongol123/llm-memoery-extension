import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AuthSession } from "../types.js";

declare const __SUPABASE_URL__:      string;
declare const __SUPABASE_ANON_KEY__: string;

let _client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (_client) return _client;

  _client = createClient(__SUPABASE_URL__, __SUPABASE_ANON_KEY__, {
    auth: {
      persistSession: false,  // We manage session in chrome.storage.local
      autoRefreshToken: false,
    },
  });

  return _client;
}

// ── Session management ─────────────────────────────────────────────────────────

export async function getStoredSession(): Promise<AuthSession | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get("llm_auth_session", (result) => {
      resolve(result.llm_auth_session ?? null);
    });
  });
}

export async function storeSession(session: AuthSession): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ llm_auth_session: session }, resolve);
  });
}

export async function clearSession(): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.remove("llm_auth_session", resolve);
  });
}

// Returns an authenticated Supabase client, or null if not signed in.
export async function getAuthenticatedClient(): Promise<SupabaseClient | null> {
  const session = await getStoredSession();
  if (!session) return null;

  if (Date.now() > session.expiresAt * 1000 - 60_000) {
    // Token expiring soon — try to refresh
    const refreshed = await refreshSession(session.refreshToken);
    if (!refreshed) return null;
  }

  const client = getSupabaseClient();
  await client.auth.setSession({
    access_token:  session.accessToken,
    refresh_token: session.refreshToken,
  });

  return client;
}

async function refreshSession(refreshToken: string): Promise<boolean> {
  try {
    const client = getSupabaseClient();
    const { data, error } = await client.auth.refreshSession({ refresh_token: refreshToken });
    if (error || !data.session) return false;

    const session: AuthSession = {
      accessToken:  data.session.access_token,
      refreshToken: data.session.refresh_token,
      userId:       data.session.user.id,
      email:        data.session.user.email ?? "",
      expiresAt:    data.session.expires_at ?? 0,
    };

    await storeSession(session);
    return true;
  } catch {
    return false;
  }
}

export async function signInWithEmail(email: string): Promise<{ error: string | null }> {
  try {
    const client = getSupabaseClient();
    const { error } = await client.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: "https://llmmemory.app/auth/callback",
      },
    });
    return { error: error?.message ?? null };
  } catch (e) {
    return { error: String(e) };
  }
}

export async function signOut(): Promise<void> {
  const client = getSupabaseClient();
  await client.auth.signOut().catch(() => {});
  await clearSession();
}
