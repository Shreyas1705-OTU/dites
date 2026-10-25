"use client";

import { useCallback, useRef, useState } from "react";

import { fetchMessages, sendMessage, type ChatMessage } from "@/lib/chat/data";
import { createClient } from "@/lib/supabase/client";

export type UiMessage = ChatMessage & {
  // Only set on messages this tab sent and the server hasn't confirmed.
  status?: "pending" | "failed";
  failReason?: string;
};

type Options = {
  roomId: string;
  me: { id: string; username: string; displayName: string };
  initialMessages: ChatMessage[]; // newest first
  initialHasMore: boolean;
};

// One owner for a room's messages. Everything (history pages, sends,
// retries, and realtime events later) goes through `upsert`, which replaces a
// message in place by id. A confirmed send therefore swaps its optimistic
// copy where it sits instead of re-sorting the list.
export function useRoomMessages({ roomId, me, initialMessages, initialHasMore }: Options) {
  const [messages, setMessages] = useState<UiMessage[]>(initialMessages);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const supabase = useRef(createClient()).current;

  const upsert = useCallback((message: UiMessage) => {
    setMessages((current) => {
      const index = current.findIndex((m) => m.id === message.id);
      if (index === -1) return [message, ...current];
      const next = current.slice();
      next[index] = message;
      return next;
    });
  }, []);

  const deliver = useCallback(
    async (message: UiMessage, isRetry: boolean) => {
      upsert({ ...message, status: "pending", failReason: undefined });
      const result = await sendMessage(supabase, { id: message.id, roomId, body: message.body ?? "" }, isRetry);
      upsert(result.ok ? result.message : { ...message, status: "failed", failReason: result.reason });
    },
    [roomId, supabase, upsert],
  );

  const send = useCallback(
    (body: string) => {
      const message: UiMessage = {
        // The id is created here, before the request, so retries reuse it.
        id: crypto.randomUUID(),
        roomId,
        userId: me.id,
        body,
        imagePath: null,
        createdAt: new Date().toISOString(),
        editedAt: null,
        deletedAt: null,
        author: { username: me.username, displayName: me.displayName },
      };
      void deliver(message, false);
    },
    [deliver, me, roomId],
  );

  const retry = useCallback(
    (id: string) => {
      const message = messages.find((m) => m.id === id);
      if (message) void deliver(message, true);
    },
    [deliver, messages],
  );

  const loadOlder = useCallback(async () => {
    const oldest = messages.findLast((m) => !m.status);
    if (!oldest || loadingOlder || !hasMore) return;
    setLoadingOlder(true);
    setLoadError(false);
    try {
      const page = await fetchMessages(supabase, roomId, { createdAt: oldest.createdAt, id: oldest.id });
      setMessages((current) => {
        const seen = new Set(current.map((m) => m.id));
        return [...current, ...page.messages.filter((m) => !seen.has(m.id))];
      });
      setHasMore(page.hasMore);
    } catch {
      setLoadError(true);
    } finally {
      setLoadingOlder(false);
    }
  }, [messages, loadingOlder, hasMore, roomId, supabase]);

  return { messages, hasMore, loadingOlder, loadError, send, retry, loadOlder, upsert };
}
