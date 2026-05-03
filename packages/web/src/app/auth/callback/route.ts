// Handles the magic link / OAuth callback.
// After successful auth, passes the session tokens to the Chrome extension
// (if the user came from the extension) and redirects to the dashboard.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "../../../lib/supabase";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code  = searchParams.get("code");
  const next  = searchParams.get("next") ?? "/conversations";

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.session) {
      const response = NextResponse.redirect(`${origin}${next}`);

      // If the user came from the extension, pass tokens back via a page
      // that uses chrome.runtime.sendMessage to the extension.
      // The extension manifest declares this domain in externally_connectable.
      const fromExtension = searchParams.get("ext") === "1";
      if (fromExtension) {
        const redirectUrl = new URL(`${origin}/auth/extension-callback`);
        redirectUrl.searchParams.set("access_token",  data.session.access_token);
        redirectUrl.searchParams.set("refresh_token", data.session.refresh_token);
        return NextResponse.redirect(redirectUrl.toString());
      }

      return response;
    }
  }

  return NextResponse.redirect(`${origin}/auth?error=callback_failed`);
}
