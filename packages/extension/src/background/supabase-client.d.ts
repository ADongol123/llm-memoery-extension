import { type SupabaseClient } from "@supabase/supabase-js";
import type { AuthSession } from "../types.js";
export declare function getSupabaseClient(): SupabaseClient;
export declare function getStoredSession(): Promise<AuthSession | null>;
export declare function storeSession(session: AuthSession): Promise<void>;
export declare function clearSession(): Promise<void>;
export declare function getAuthenticatedClient(): Promise<SupabaseClient | null>;
export declare function signInWithEmail(email: string): Promise<{
    error: string | null;
}>;
export declare function signOut(): Promise<void>;
//# sourceMappingURL=supabase-client.d.ts.map