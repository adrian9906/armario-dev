import { createServerClient } from "@supabase/ssr";
import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfig } from "@/lib/supabase/env";

export async function GET(request: NextRequest) {
  const config = getSupabaseConfig();
  const code = request.nextUrl.searchParams.get("code");
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type") as EmailOtpType | null;
  const failed = new URL("/login?error=confirm", request.url);
  if (!config || (!code && !(tokenHash && type))) return NextResponse.redirect(failed);

  let response = NextResponse.redirect(new URL("/dashboard", request.url));
  const supabase = createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll() { return request.cookies.getAll(); },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : await supabase.auth.verifyOtp({ token_hash: tokenHash!, type: type! });
  if (error) {
    response = NextResponse.redirect(failed);
  }
  return response;
}
