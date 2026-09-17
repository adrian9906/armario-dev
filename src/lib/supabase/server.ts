import { auth } from "@clerk/nextjs/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "./env";

export function createClient() {
  const config = getSupabaseConfig();
  if (!config) throw new Error("Configura las variables públicas de Supabase.");

  return createSupabaseClient(config.url, config.publishableKey, {
    accessToken: async () => (await auth()).getToken(),
  });
}
