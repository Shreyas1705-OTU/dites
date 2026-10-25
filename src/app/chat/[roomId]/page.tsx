import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import { JoinRoom } from "@/components/chat/join-room";
import { MessageList } from "@/components/chat/message-list";
import { RoomHeader } from "@/components/chat/room-header";
import { getCurrentUser } from "@/lib/auth/current-user";
import { fetchMessages, type RoomType } from "@/lib/chat/data";
import { createClient } from "@/lib/supabase/server";

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
        <RoomHeader type={type} title={room.name ?? "room"} subtitle={room.description} />
        <JoinRoom roomId={room.id} name={room.name ?? "room"} description={room.description} />
      </>
    );
  }

  let title = room.name ?? "room";
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

  const { messages, hasMore } = await fetchMessages(supabase, roomId);

  return (
    <>
      <RoomHeader type={type} title={title} subtitle={subtitle} />
      <MessageList
        key={roomId}
        roomId={roomId}
        currentUserId={user.id}
        initialMessages={messages}
        initialHasMore={hasMore}
        emptyText={type === "dm" ? `This is the start of your conversation with ${title}.` : `Nobody has said anything in #${title} yet.`}
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
