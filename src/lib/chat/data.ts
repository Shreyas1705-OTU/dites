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

export const MAX_MESSAGE_LENGTH = 2000;

// Postgres char_length counts code points; JS .length counts UTF-16 units
// (an emoji is 2). Count the way the database does.
export function messageLength(body: string) {
  return [...body].length;
}

export type SendResult = { ok: true; message: ChatMessage } | { ok: false; reason: string };

async function fetchOwnMessage(supabase: Client, id: string): Promise<ChatMessage | null> {
  const { data } = await supabase
    .from("messages")
    .select(MESSAGE_COLUMNS)
    .eq("id", id)
    .maybeSingle()
    .overrideTypes<MessageRow, { merge: false }>();
  return data ? toChatMessage(data) : null;
}

function sendErrorReason(error: { code?: string; message?: string }): string {
  if (error.code === "PT429") return "Slow down: you can send 20 messages a minute.";
  if (error.code === "42501") return "You can't send messages here.";
  if (error.code === "23514") return `Messages can be up to ${MAX_MESSAGE_LENGTH.toLocaleString()} characters.`;
  if (!error.code) return "Couldn't send. Check your connection.";
  return "Couldn't send. Please try again.";
}

// Sends with a client-generated id, so a retry of the same message can never
// create a duplicate: the id is the primary key. `isRetry` checks first
// whether an earlier attempt already landed (its response may have been
// lost); this matters because the rate-limit trigger runs before the
// primary-key check, so a blind re-insert near the limit would report
// "slow down" for a message that was actually sent.
export async function sendMessage(
  supabase: Client,
  input: { id: string; roomId: string; body: string },
  isRetry = false,
): Promise<SendResult> {
  if (isRetry) {
    const existing = await fetchOwnMessage(supabase, input.id);
    if (existing) return { ok: true, message: existing };
  }

  const { data, error } = await supabase
    .from("messages")
    .insert({ id: input.id, room_id: input.roomId, body: input.body })
    .select(MESSAGE_COLUMNS)
    .single()
    .overrideTypes<MessageRow, { merge: false }>();

  if (data) return { ok: true, message: toChatMessage(data) };
  if (error?.code === "23505") {
    const existing = await fetchOwnMessage(supabase, input.id);
    if (existing) return { ok: true, message: existing };
  }
  return { ok: false, reason: sendErrorReason(error ?? {}) };
}

// Everything after the newest message a client has, oldest first. Used to
// catch up whenever the realtime channel (re)connects, so nothing sent while
// the tab was offline, asleep or still connecting is missed.
export async function fetchMessagesAfter(
  supabase: Client,
  roomId: string,
  after: { createdAt: string; id: string },
): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from("messages")
    .select(MESSAGE_COLUMNS)
    .eq("room_id", roomId)
    .or(`created_at.gt.${after.createdAt},and(created_at.eq.${after.createdAt},id.gt.${after.id})`)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(200)
    .overrideTypes<MessageRow[], { merge: false }>();
  if (error) throw error;
  return (data ?? []).map(toChatMessage);
}

// Shape of the message events sent by private.broadcast_message().
export type MessageEventPayload = MessageRow;

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

export const REJOIN_WAIT_DAYS = 5;

// Why you can't (re)join a public room yourself: the owner removed you, or
// you left less than 5 days ago. Mirrors private.can_self_join(), which is
// what the database actually enforces.
export type Departure = { kind: "removed" } | { kind: "left"; rejoinAt: string };

export async function fetchMyDepartures(supabase: Client, userId: string): Promise<Record<string, Departure>> {
  const { data } = await supabase.from("room_departures").select("room_id, kind, departed_at").eq("user_id", userId);
  const result: Record<string, Departure> = {};
  for (const d of data ?? []) {
    if (d.kind === "removed") {
      result[d.room_id] = { kind: "removed" };
    } else {
      const rejoinAt = new Date(Date.parse(d.departed_at) + REJOIN_WAIT_DAYS * 24 * 60 * 60 * 1000);
      if (rejoinAt.getTime() > Date.now()) result[d.room_id] = { kind: "left", rejoinAt: rejoinAt.toISOString() };
    }
  }
  return result;
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
