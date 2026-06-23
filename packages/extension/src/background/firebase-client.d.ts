import { type Auth, type User } from "firebase/auth";
import { type Firestore } from "firebase/firestore";
import type { AuthSession } from "../types.js";
export declare function getDb(): Firestore;
export declare function getFirebaseAuth(): Auth;
export declare function getStoredSession(): Promise<AuthSession | null>;
export declare function storeSession(session: AuthSession): Promise<void>;
export declare function clearSession(): Promise<void>;
export declare function signInWithGoogle(): Promise<{
    error: string | null;
}>;
export declare function signOut(): Promise<void>;
export declare function getAuthenticatedUser(): Promise<{
    user: User;
    token: string;
} | null>;
//# sourceMappingURL=firebase-client.d.ts.map