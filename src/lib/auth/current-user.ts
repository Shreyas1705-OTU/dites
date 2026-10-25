import { createClient } from "@/lib/supabase/server";

export type CurrentUser = {
  id: string;
  isGuest: boolean;
  username: string;
  displayName: string;
};

// The one place server code asks "who is this?". getClaims() verifies the
// access token's signature, so the user id cannot be forged by editing the
// cookie. Guest status comes from the signed `is_anonymous` claim, never from
// user_metadata (which users can edit).
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, display_name")
    .eq("id", claims.sub)
    .single();
  if (!profile) return null;

  return {
    id: claims.sub,
    isGuest: claims.is_anonymous === true,
    username: profile.username,
    displayName: profile.display_name ?? profile.username,
  };
}
