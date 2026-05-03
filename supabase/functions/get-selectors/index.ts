// Edge Function: get-selectors
// Public endpoint — no auth required.
// Returns the full selector registry so extensions can fix broken scraping
// without a new release. Called on extension startup, cached locally.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const CACHE_SECONDS = 3600; // browsers/extensions cache for 1 hour

Deno.serve(async (req) => {
  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const { data, error } = await supabase
      .from("selector_registry")
      .select("platform, version, selectors, updated_at")
      .order("platform");

    if (error) throw error;

    const registry: Record<string, unknown> = {};
    for (const row of data ?? []) {
      registry[row.platform] = {
        version:   row.version,
        selectors: row.selectors,
        updatedAt: row.updated_at,
      };
    }

    return new Response(JSON.stringify(registry), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": `public, max-age=${CACHE_SECONDS}`,
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
