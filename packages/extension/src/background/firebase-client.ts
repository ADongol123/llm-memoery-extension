import { initializeApp } from "firebase/app";
import { getAuth, signInWithCredential, GoogleAuthProvider, signOut as fbSignOut, type Auth, type User } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import type { AuthSession } from "../types.js";

declare const __FIREBASE_API_KEY__: string;
declare const __FIREBASE_AUTH_DOMAIN__: string;
declare const __FIREBASE_PROJECT_ID__: string;
declare const __FIREBASE_STORAGE_BUCKET__: string;
declare const __FIREBASE_MESSAGING_SENDER_ID__: string;
declare const __FIREBASE_APP_ID__: string;
declare const __GOOGLE_CLIENT_ID__: string;

const app = initializeApp({
  apiKey: __FIREBASE_API_KEY__,
  authDomain: __FIREBASE_AUTH_DOMAIN__,
  projectId: __FIREBASE_PROJECT_ID__,
  storageBucket: __FIREBASE_STORAGE_BUCKET__,
  messagingSenderId: __FIREBASE_MESSAGING_SENDER_ID__,
  appId: __FIREBASE_APP_ID__,
});

const auth: Auth = getAuth(app);
const db: Firestore = getFirestore(app);

export function getDb(): Firestore {
  return db;
}

export function getFirebaseAuth(): Auth {
  return auth;
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

// ── Auth helpers ───────────────────────────────────────────────────────────────

function userToSession(user: User): AuthSession {
  return {
    accessToken: (user as unknown as { accessToken?: string }).accessToken ?? "",
    refreshToken: user.refreshToken ?? "",
    userId: user.uid,
    email: user.email ?? "",
    expiresAt: 0,
  };
}

async function sha256(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function signInWithGoogle(): Promise<{ error: string | null }> {
  try {
    const redirectUrl = chrome.identity.getRedirectURL();
    const rawNonce = crypto.randomUUID();
    const hashedNonce = await sha256(rawNonce);

    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", __GOOGLE_CLIENT_ID__);
    authUrl.searchParams.set("redirect_uri", redirectUrl);
    authUrl.searchParams.set("response_type", "id_token");
    authUrl.searchParams.set("scope", "openid email profile");
    authUrl.searchParams.set("nonce", hashedNonce);
    authUrl.searchParams.set("prompt", "select_account");

    const responseUrl = await chrome.identity.launchWebAuthFlow({
      url: authUrl.toString(),
      interactive: true,
    });

    if (!responseUrl) return { error: "Sign-in was cancelled" };

    const hashParams = new URLSearchParams(new URL(responseUrl).hash.substring(1));
    const idToken = hashParams.get("id_token");

    if (!idToken) return { error: "No ID token received from Google" };

    const credential = GoogleAuthProvider.credential(idToken);
    const result = await signInWithCredential(auth, credential);

    const session = userToSession(result.user);

    // Get the actual ID token for Firestore/Cloud Functions auth
    const token = await result.user.getIdToken();
    session.accessToken = token;
    session.expiresAt = Math.floor(Date.now() / 1000) + 3600;

    await storeSession(session);
    return { error: null };
  } catch (e) {
    return { error: String(e) };
  }
}

export async function signOut(): Promise<void> {
  await fbSignOut(auth).catch(() => {});
  await clearSession();
}

export async function getAuthenticatedUser(): Promise<{ user: User; token: string } | null> {
  const session = await getStoredSession();
  if (!session) return null;

  const currentUser = auth.currentUser;
  if (currentUser) {
    const token = await currentUser.getIdToken(true);
    await storeSession({
      ...session,
      accessToken: token,
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    });
    return { user: currentUser, token };
  }

  // Try to restore auth state from stored session
  // Firebase will auto-restore if the refresh token is valid
  return new Promise((resolve) => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      unsubscribe();
      if (user) {
        const token = await user.getIdToken();
        await storeSession({
          ...session,
          accessToken: token,
          expiresAt: Math.floor(Date.now() / 1000) + 3600,
        });
        resolve({ user, token });
      } else {
        await clearSession();
        resolve(null);
      }
    });
    setTimeout(() => resolve(null), 5000);
  });
}
