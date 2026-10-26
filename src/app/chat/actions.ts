"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { GENERAL_ROOM_ID } from "@/lib/chat/data";
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
  // 23505: already a member, which is fine. 42501: RLS refused it, e.g.
  // you were removed, or left less than 5 days ago.
  if (error && error.code !== "23505") {
    return { error: "You can't rejoin this room right now." };
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

export type UserMatch = { id: string; username: string; displayName: string; isGuest: boolean };

const GUEST_USERNAME = /^guest_[0-9a-f]{5}$/;
const SEARCH_LIMIT = 8;

// Escape LIKE wildcards so "%" or "_" in a search mean themselves.
const likePrefix = (q: string) => `${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

// Type-ahead people search: matches the start of a display name or username
// from the first letter. Lists registered users only; a guest shows up only
// when their exact guest_xxxxx name is typed. Runs under RLS (profiles are
// readable by anyone signed in, and hold no emails).
export async function searchUsers(query: string): Promise<UserMatch[]> {
  const q = query.trim().replace(/^@/, "").slice(0, 30);
  if (q.length < 1) return [];
  const { supabase, userId } = await requireUserId();
  if (!userId) return [];

  const columns = "id, username, display_name, is_guest";
  const pattern = likePrefix(q);
  const [byUsername, byName, guest] = await Promise.all([
    supabase.from("profiles").select(columns).eq("is_guest", false).neq("id", userId)
      .ilike("username", pattern).limit(SEARCH_LIMIT),
    supabase.from("profiles").select(columns).eq("is_guest", false).neq("id", userId)
      .ilike("display_name", pattern).limit(SEARCH_LIMIT),
    GUEST_USERNAME.test(q.toLowerCase())
      ? supabase.from("profiles").select(columns).eq("username", q.toLowerCase()).neq("id", userId).limit(1)
      : Promise.resolve({ data: [] }),
  ]);

  const byId = new Map<string, UserMatch>();
  for (const p of [...(byUsername.data ?? []), ...(byName.data ?? []), ...(guest.data ?? [])]) {
    byId.set(p.id, { id: p.id, username: p.username, displayName: p.display_name ?? p.username, isGuest: p.is_guest });
  }
  return [...byId.values()]
    .sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" }))
    .slice(0, SEARCH_LIMIT);
}

export async function addMember(roomId: string, memberId: string): Promise<ActionResult> {
  if (!UUID.test(roomId) || !UUID.test(memberId)) return { error: "Couldn't add that person." };
  const { supabase, userId } = await requireUserId();
  if (!userId) return { error: "Your session ended. Sign in again." };

  // RLS allows this only for the owner of a private room, and only for a
  // registered user. Everyone else is refused by the database.
  const { error } = await supabase.from("room_members").insert({ room_id: roomId, user_id: memberId });
  if (error?.code === "23505") return { error: "They're already in this room." };
  if (error) return { error: "Only the room owner can add people, and guests can't join private rooms." };

  revalidatePath(`/chat/${roomId}`);
}

export async function removeMember(roomId: string, memberId: string): Promise<ActionResult> {
  if (!UUID.test(roomId) || !UUID.test(memberId)) return { error: "Couldn't remove that person." };
  const { supabase, userId } = await requireUserId();
  if (!userId) return { error: "Your session ended. Sign in again." };

  const { data, error } = await supabase
    .from("room_members")
    .delete()
    .eq("room_id", roomId)
    .eq("user_id", memberId)
    .select("user_id");
  // RLS turns a disallowed delete into "0 rows", not an error.
  if (error || !data?.length) return { error: "Only the room owner can remove people." };

  revalidatePath(`/chat/${roomId}`);
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

export async function leaveRoom(roomId: string): Promise<ActionResult> {
  if (!UUID.test(roomId)) return { error: "Couldn't leave that room." };
  const { supabase, userId } = await requireUserId();
  if (!userId) return { error: "Your session ended. Sign in again." };

  // RLS allows members to remove only themselves, never from a DM, and never
  // the owner (that would leave the room without one).
  const { data, error } = await supabase
    .from("room_members")
    .delete()
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .select("user_id");
  if (error || !data?.length) return { error: "You can't leave this room." };

  revalidatePath("/chat", "layout");
  redirect(`/chat/${GENERAL_ROOM_ID}`);
}

export async function deleteRoom(roomId: string, confirmName: string): Promise<ActionResult> {
  if (!UUID.test(roomId)) return { error: "Couldn't delete that room." };
  const { supabase, userId } = await requireUserId();
  if (!userId) return { error: "Your session ended. Sign in again." };

  const { data: room } = await supabase.from("rooms").select("name").eq("id", roomId).maybeSingle();
  if (!room || normalizeRoomName(confirmName) !== room.name) {
    return { error: "Type the room's name exactly to confirm." };
  }

  // Only the owner passes RLS; messages and memberships cascade, and every
  // member is told live through their user channel.
  const { data, error } = await supabase.from("rooms").delete().eq("id", roomId).select("id");
  if (error || !data?.length) return { error: "Only the room's owner can delete it." };

  revalidatePath("/chat", "layout");
  redirect(`/chat/${GENERAL_ROOM_ID}`);
}
