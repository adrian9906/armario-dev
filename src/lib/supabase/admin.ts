import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "./env";

export function createAdminClient() {
  const config = getSupabaseConfig();
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!config || !secret) {
    throw new Error("Falta la configuración del servidor para las invitaciones.");
  }
  return createSupabaseClient(config.url, secret, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
