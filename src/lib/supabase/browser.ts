import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseConfig } from "./env";

export function createClient() {
  const config = getSupabaseConfig();
  if (!config) throw new Error("Configura las variables públicas de Supabase.");
  return createBrowserClient(config.url, config.publishableKey);
}
