import "server-only";

import { createHmac } from "node:crypto";

export function hashInvitationCode(code: string) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("missing_invitation_secret");
  return createHmac("sha256", secret).update(code).digest("hex");
}
