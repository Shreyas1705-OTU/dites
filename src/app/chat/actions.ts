"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { normalizeRoomName } from "@/lib/chat/room-name";
import { createClient } from "@/lib/supabase/server";

// Server actions are public HTTP endpoints, so every one re-checks the
// session and validates its input. The real enforcement is still the
// database: RLS, column grants, CHECK constraints and rate-limit triggers.

export type ActionResult = { error: string } | undefined;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function requireUserId() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return { supabase, userId: data?.claims?.sub ?? null, isGuest: data?.claims?.is_anonymous === true };
}

function isRateLimited(error: { code?: string } | null) {
  return error?.code === "PT429";
}

export async function joinRoom(roomId: string): Promise<ActionResult> {
  if (!UUID.test(roomId)) return { error: "That room doesn't exist." };
  const { supabase, userId } = await requireUserId();
  if (!userId) return { error: "Your session ended. Sign in again." };

  const { error } = await supabase.from("room_members").insert({ room_id: roomId, user_id: userId });
  // 23505: already a member, which is fine.
  if (error && error.code !== "23505") {
    return { error: "You can't join this room." };
  }
  revalidatePath("/chat", "layout");
  redirect(`/chat/${roomId}`);
}

export async function createRoom(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const name = normalizeRoomName(String(formData.get("name") ?? ""));
  const description = String(formData.get("description") ?? "").trim();
  const type = formData.get("type") === "private" ? "private" : "public";

  if (name.length < 2 || name.length > 30) return { error: "Room names need 2 to 30 letters, numbers or hyphens." };
  if (description.length > 200) return { error: "Keep the description under 200 characters." };

  const { supabase, userId, isGuest } = await requireUserId();
  if (!userId) return { error: "Your session ended. Sign in again." };
  if (isGuest) return { error: "Guests can't create rooms. Link GitHub or Google to keep your account first." };

  // created_by defaults to auth.uid(); a trigger adds you as the owner.
  const { data, error } = await supabase
    .from("rooms")
    .insert({ type, name, description: description || null })
    .select("id")
    .single();

  if (isRateLimited(error)) return { error: "You can create 5 rooms an hour. Try again later." };
  if (error?.code === "23505") return { error: `#${name} already exists. Pick another name.` };
  if (error?.code === "23514") return { error: `#${name} is reserved. Pick another name.` };
  if (error || !data) return { error: "Couldn't create the room. Please try again." };

  revalidatePath("/chat", "layout");
  redirect(`/chat/${data.id}`);
}

export type UserMatch = { id: string; username: string; displayName: string };

export async function searchUsers(query: string): Promise<UserMatch[]> {
  // Usernames are [a-z0-9_]; anything else can't match, and stripping it also
  // keeps LIKE wildcards (% and _) out of the pattern. "_" is escaped below.
  const q = query.trim().toLowerCase().replace(/^@/, "").replace(/[^a-z0-9_]/g, "").slice(0, 20);
  if (q.length < 2) return [];
  const { supabase, userId } = await requireUserId();
  if (!userId) return [];

  const { data } = await supabase
    .from("profiles")
    .select("id, username, display_name")
    .ilike("username", `${q.replace(/_/g, "\\_")}%`)
    .neq("id", userId)
    .order("username")
    .limit(6);

  return (data ?? []).map((p) => ({ id: p.id, username: p.username, displayName: p.display_name ?? p.username }));
}

export async function startDm(otherUserId: string): Promise<ActionResult> {
  if (!UUID.test(otherUserId)) return { error: "That person doesn't exist." };
  const { supabase, userId } = await requireUserId();
  if (!userId) return { error: "Your session ended. Sign in again." };

  // The only way to open a DM: one per pair, blocks and rate limits enforced
  // inside the database function.
  const { data: roomId, error } = await supabase.rpc("get_or_create_dm", { other_user: otherUserId });

  if (isRateLimited(error)) return { error: "You can start 10 new conversations an hour. Try again later." };
  if (error?.code === "42501") return { error: "You can't message this person." };
  if (error || !roomId) return { error: "Couldn't open the conversation. Please try again." };

  revalidatePath("/chat", "layout");
  redirect(`/chat/${roomId}`);
}
