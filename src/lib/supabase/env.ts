export function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey || !URL.canParse(url) ||
      url.includes("<project-ref>") || url.includes("your-project") ||
      publishableKey.startsWith("your-")) return null;
  return { url, publishableKey };
}
