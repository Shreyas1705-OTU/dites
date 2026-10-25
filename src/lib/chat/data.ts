import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

// Shared by the server (first page) and the browser (older pages, and later
// realtime), so both shape messages the same way. Every query here runs under
// the caller's RLS: a room you can't read simply returns nothing.

export const GENERAL_ROOM_ID = "00000000-0000-4000-8000-000000000001";
export const GLOBAL_CHAT_LABEL = "Global chat";

// The room everyone starts in is shown as "Global chat" (its handle stays
// "general", which keeps the name reserved by the unique index). Other rooms
// show their channel-style name.
export function roomTitle(id: string, name: string | null) {
  return id === GENERAL_ROOM_ID ? GLOBAL_CHAT_LABEL : (name ?? "room");
}

// How a room reads in sentences: "Global chat" or "#book-club".
export function roomMention(id: string, name: string | null) {
  return id === GENERAL_ROOM_ID ? GLOBAL_CHAT_LABEL : `#${name ?? "room"}`;
}
export const PAGE_SIZE = 50;

type Client = SupabaseClient<Database>;

export type RoomType = "public" | "private" | "dm";

export type RoomSummary = {
  id: string;
  type: RoomType;
  // Rooms use roomTitle(); DMs use the other person's name.
  label: string;
  username: string | null;
};

export type ChatMessage = {
  id: string;
  roomId: string;
  userId: string;
  body: string | null;
  imagePath: string | null;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  author: { username: string; displayName: string };
};

const MESSAGE_COLUMNS =
  "id, room_id, user_id, body, image_path, created_at, edited_at, deleted_at, author:profiles(username, display_name)";

type MessageRow = {
  id: string;
  room_id: string;
  user_id: string;
  body: string | null;
  image_path: string | null;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  author: { username: string; display_name: string | null } | null;
};

export function toChatMessage(row: MessageRow): ChatMessage {
  const username = row.author?.username ?? "unknown";
  return {
    id: row.id,
    roomId: row.room_id,
    userId: row.user_id,
    body: row.body,
    imagePath: row.image_path,
    createdAt: row.created_at,
    editedAt: row.edited_at,
    deletedAt: row.deleted_at,
    author: { username, displayName: row.author?.display_name ?? username },
  };
}

// Newest first. `before` is the oldest message currently shown; keyset
// pagination on (created_at, id) uses the messages_room_created_idx index and
// stays fast however deep the history goes (no OFFSET scans).
export async function fetchMessages(
  supabase: Client,
  roomId: string,
  before?: { createdAt: string; id: string },
): Promise<{ messages: ChatMessage[]; hasMore: boolean }> {
  let query = supabase
    .from("messages")
    .select(MESSAGE_COLUMNS)
    .eq("room_id", roomId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(PAGE_SIZE + 1);

  if (before) {
    query = query.or(`created_at.lt.${before.createdAt},and(created_at.eq.${before.createdAt},id.lt.${before.id})`);
  }

  const { data, error } = await query.overrideTypes<MessageRow[], { merge: false }>();
  if (error) throw error;
  const rows = data ?? [];
  return { messages: rows.slice(0, PAGE_SIZE).map(toChatMessage), hasMore: rows.length > PAGE_SIZE };
}

export async function fetchMyRooms(supabase: Client, userId: string): Promise<RoomSummary[]> {
  const { data: memberships, error } = await supabase
    .from("room_members")
    .select("room_id, rooms!inner(id, type, name)")
    .eq("user_id", userId);
  if (error) throw error;

  const rooms = (memberships ?? []).map((m) => m.rooms);
  const dmIds = rooms.filter((r) => r.type === "dm").map((r) => r.id);

  // For each DM, the other member's profile is its name.
  const others = new Map<string, { username: string; displayName: string }>();
  if (dmIds.length > 0) {
    const { data: partners, error: partnerError } = await supabase
      .from("room_members")
      .select("room_id, profile:profiles(username, display_name)")
      .in("room_id", dmIds)
      .neq("user_id", userId);
    if (partnerError) throw partnerError;
    for (const p of partners ?? []) {
      if (p.profile) {
        others.set(p.room_id, {
          username: p.profile.username,
          displayName: p.profile.display_name ?? p.profile.username,
        });
      }
    }
  }

  return rooms
    .map((r): RoomSummary => {
      if (r.type === "dm") {
        const other = others.get(r.id);
        return { id: r.id, type: "dm", label: other?.displayName ?? "Direct message", username: other?.username ?? null };
      }
      return { id: r.id, type: r.type as RoomType, label: roomTitle(r.id, r.name), username: null };
    })
    .sort((a, b) => {
      // Global chat first, then alphabetical.
      if (a.id === GENERAL_ROOM_ID) return -1;
      if (b.id === GENERAL_ROOM_ID) return 1;
      return a.label.localeCompare(b.label);
    });
}

export async function fetchPublicRooms(supabase: Client) {
  const { data, error } = await supabase
    .from("rooms")
    .select("id, name, description")
    .eq("type", "public")
    .order("name");
  if (error) throw error;
  return (data ?? [])
    .map((r) => ({ id: r.id, name: roomTitle(r.id, r.name), description: r.description }))
    .sort((a, b) => (a.id === GENERAL_ROOM_ID ? -1 : b.id === GENERAL_ROOM_ID ? 1 : a.name.localeCompare(b.name)));
}
