import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "./env";

/** Creates a caller-scoped Supabase client so RLS and auth.jwt() triggers see the MCP user's Clerk token. */
export function createMcpSupabaseClient(accessToken: string) {
  const config = getSupabaseConfig();
  if (!config) throw new Error("supabase_not_configured");
  if (!accessToken) throw new Error("mcp_access_token_missing");

  return createSupabaseClient(config.url, config.publishableKey, {
    accessToken: async () => accessToken,
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
