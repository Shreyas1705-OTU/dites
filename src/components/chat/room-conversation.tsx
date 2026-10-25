"use client";

import { useRef } from "react";

import { Composer } from "@/components/chat/composer";
import { MessageList } from "@/components/chat/message-list";
import type { ChatMessage } from "@/lib/chat/data";
import { useRoomMessages } from "@/lib/chat/use-room-messages";

type Props = {
  roomId: string;
  me: { id: string; username: string; displayName: string };
  initialMessages: ChatMessage[];
  initialHasMore: boolean;
  emptyText: string;
  placeholder: string;
};

export function RoomConversation({ roomId, me, initialMessages, initialHasMore, emptyText, placeholder }: Props) {
  const room = useRoomMessages({ roomId, me, initialMessages, initialHasMore });
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <>
      <MessageList
        currentUserId={me.id}
        messages={room.messages}
        hasMore={room.hasMore}
        loadingOlder={room.loadingOlder}
        loadError={room.loadError}
        onLoadOlder={room.loadOlder}
        onRetry={room.retry}
        emptyText={emptyText}
        scrollRef={scrollRef}
      />
      <Composer
        placeholder={placeholder}
        onSend={(body) => {
          room.send(body);
          // column-reverse: scrollTop 0 is the newest message.
          scrollRef.current?.scrollTo({ top: 0 });
        }}
      />
    </>
  );
}
