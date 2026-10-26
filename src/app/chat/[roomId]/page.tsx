import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import { JoinRoom } from "@/components/chat/join-room";
import { MembersDialog, type RoomMember } from "@/components/chat/members-dialog";
import { RoomConversation } from "@/components/chat/room-conversation";
import { RoomHeader } from "@/components/chat/room-header";
import { getCurrentUser } from "@/lib/auth/current-user";
import { fetchMessages, GENERAL_ROOM_ID, roomMention, roomTitle, type RoomType } from "@/lib/chat/data";
import { createClient } from "@/lib/supabase/server";

// Big rooms show the first members and a count.
const MEMBER_LIST_LIMIT = 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function RoomPage({ params }: PageProps<"/chat/[roomId]">) {
  return (
    <Suspense fallback={<RoomSkeleton />}>
      <Room params={params} />
    </Suspense>
  );
}

async function Room({ params }: Pick<PageProps<"/chat/[roomId]">, "params">) {
  const { roomId } = await params;
  if (!UUID.test(roomId)) notFound();

  const user = await getCurrentUser();
  if (!user) redirect("/auth/reset");
  const supabase = await createClient();

  // RLS decides what exists for this user: a private room or DM they're not
  // in comes back as no row at all, so it 404s exactly like a missing room.
  const [{ data: room }, { data: membership }] = await Promise.all([
    supabase.from("rooms").select("id, type, name, description").eq("id", roomId).maybeSingle(),
    supabase.from("room_members").select("role").eq("room_id", roomId).eq("user_id", user.id).maybeSingle(),
  ]);
  if (!room) notFound();
  const type = room.type as RoomType;

  if (!membership) {
    if (type !== "public") notFound();
    return (
      <>
        <RoomHeader type={type} title={roomTitle(room.id, room.name)} subtitle={room.description} isGlobal={room.id === GENERAL_ROOM_ID} />
        <JoinRoom roomId={room.id} title={roomMention(room.id, room.name)} description={room.description} />
      </>
    );
  }

  let title = roomTitle(room.id, room.name);
  let subtitle = room.description;
  if (type === "dm") {
    const { data: other } = await supabase
      .from("room_members")
      .select("profile:profiles(username, display_name)")
      .eq("room_id", roomId)
      .neq("user_id", user.id)
      .maybeSingle();
    title = other?.profile?.display_name ?? other?.profile?.username ?? "Direct message";
    subtitle = other?.profile ? `@${other.profile.username}` : null;
  }

  const [{ messages, hasMore }, membersResult] = await Promise.all([
    fetchMessages(supabase, roomId),
    type === "dm"
      ? Promise.resolve(null)
      : supabase
          .from("room_members")
          .select("user_id, role, profile:profiles(username, display_name)", { count: "exact" })
          .eq("room_id", roomId)
          .order("role", { ascending: false }) // owner first
          .order("joined_at")
          .limit(MEMBER_LIST_LIMIT),
  ]);

  const members: RoomMember[] = (membersResult?.data ?? []).map((m) => ({
    id: m.user_id,
    username: m.profile?.username ?? "unknown",
    displayName: m.profile?.display_name ?? m.profile?.username ?? "unknown",
    role: m.role === "owner" ? "owner" : "member",
  }));

  return (
    <>
      <RoomHeader
        type={type}
        title={title}
        subtitle={subtitle}
        isGlobal={room.id === GENERAL_ROOM_ID}
        actions={
          type !== "dm" && (
            <MembersDialog
              roomId={roomId}
              title={roomMention(room.id, room.name)}
              isPrivate={type === "private"}
              isOwner={membership.role === "owner"}
              currentUserId={user.id}
              members={members}
              total={membersResult?.count ?? members.length}
              handle={room.name ?? ""}
              canLeave={membership.role === "member"}
              canDelete={membership.role === "owner"}
            />
          )
        }
      />
      <RoomConversation
        key={roomId}
        roomId={roomId}
        me={{ id: user.id, username: user.username, displayName: user.displayName }}
        initialMessages={messages}
        initialHasMore={hasMore}
        emptyText={
          type === "dm"
            ? `This is the start of your conversation with ${title}. Say hello.`
            : `Nobody has said anything in ${roomMention(room.id, room.name)} yet. Be the first.`
        }
        placeholder={type === "dm" ? `Message ${title}` : `Message ${roomMention(room.id, room.name)}`}
      />
    </>
  );
}

function RoomSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-1 flex-col">
      <div className="flex h-14 items-center border-b px-4">
        <div className="h-5 w-32 rounded bg-muted" />
      </div>
      <div className="flex flex-1 flex-col justify-end gap-4 p-6">
        {[60, 40, 72].map((w, i) => (
          <div key={i} className={`flex flex-col gap-1.5 ${i === 1 ? "items-end" : ""}`}>
            <div className="h-3 w-24 rounded bg-muted" />
            <div className="h-9 rounded-[14px] bg-muted" style={{ width: `${w}%` }} />
          </div>
        ))}
      </div>
    </div>
  );
}
