"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

// Signs out on the server: revokes this session's refresh token in Supabase
// Auth and clears the cookies, so the session cannot be resumed elsewhere.
export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
