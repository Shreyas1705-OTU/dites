"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  fetchMessages,
  fetchMessagesAfter,
  sendMessage,
  toChatMessage,
  type ChatMessage,
  type MessageEventPayload,
} from "@/lib/chat/data";
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

// Disconnect after this long hidden, to stay inside the free tier's
// concurrent-connection budget; reconnect and catch up when visible again.
const HIDDEN_DISCONNECT_MS = 5 * 60 * 1000;

// One owner for a room's messages. Everything (history pages, sends,
// retries, and realtime events later) goes through `upsert`, which replaces a
// message in place by id. A confirmed send therefore swaps its optimistic
// copy where it sits instead of re-sorting the list.
export function useRoomMessages({ roomId, me, initialMessages, initialHasMore }: Options) {
  const [messages, setMessages] = useState<UiMessage[]>(initialMessages);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [loadError, setLoadError] = useState(false);
  // One browser client for the hook's lifetime (createClient is a singleton anyway).
  const [supabase] = useState(createClient);

  const upsert = useCallback((message: UiMessage) => {
    setMessages((current) => {
      const index = current.findIndex((m) => m.id === message.id);
      if (index !== -1) {
        const next = current.slice();
        next[index] = message;
        return next;
      }
      // New message: place it by time (the list is newest first). Almost
      // always that's the front; a late catch-up may slot in further down.
      // Compare as dates: the server and the browser format timestamps differently.
      const time = Date.parse(message.createdAt);
      const at = current.findIndex((m) => Date.parse(m.createdAt) <= time);
      if (at === -1) return [...current, message];
      return [...current.slice(0, at), message, ...current.slice(at)];
    });
  }, []);

  // Read the latest list inside callbacks without re-subscribing.
  const latest = useRef(messages);
  useEffect(() => {
    latest.current = messages;
  });

  // Realtime: one private channel per open room. Joining it is authorized
  // by the realtime.messages policy (members only). Events are sent by a
  // database trigger, so a message appears here the moment it is saved,
  // from any client.
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let hiddenTimer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    let connecting = false;

    const catchUp = async () => {
      const newest = latest.current.find((m) => !m.status);
      try {
        const missed = newest
          ? await fetchMessagesAfter(supabase, roomId, { createdAt: newest.createdAt, id: newest.id })
          : (await fetchMessages(supabase, roomId)).messages;
        if (!cancelled) missed.forEach(upsert);
      } catch {
        // The next reconnect tries again.
      }
    };

    const connect = async () => {
      if (channel || connecting || cancelled) return;
      connecting = true;
      // Hand the current session token to Realtime for the private join.
      await supabase.realtime.setAuth();
      connecting = false;
      if (cancelled || channel) return;
      channel = supabase
        .channel(`room:${roomId}`, { config: { private: true } })
        .on("broadcast", { event: "message.insert" }, ({ payload }) =>
          upsert(toChatMessage(payload as MessageEventPayload)),
        )
        .on("broadcast", { event: "message.update" }, ({ payload }) =>
          upsert(toChatMessage(payload as MessageEventPayload)),
        )
        .subscribe((status) => {
          // On every (re)join, fetch anything sent while we weren't listening.
          if (status === "SUBSCRIBED") void catchUp();
        });
    };

    const disconnect = () => {
      if (channel) void supabase.removeChannel(channel);
      channel = null;
    };

    const onVisibility = () => {
      clearTimeout(hiddenTimer);
      if (document.visibilityState === "hidden") {
        hiddenTimer = setTimeout(disconnect, HIDDEN_DISCONNECT_MS);
      } else {
        void connect();
      }
    };

    void connect();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      clearTimeout(hiddenTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      disconnect();
    };
  }, [roomId, supabase, upsert]);

  const deliver = useCallback(
    async (message: UiMessage, isRetry: boolean) => {
      upsert({ ...message, status: "pending", failReason: undefined });
      const result = await sendMessage(supabase, { id: message.id, roomId, body: message.body ?? "" }, isRetry);
      if (result.ok) {
        upsert(result.message);
        return;
      }
      // Only mark it failed if it's still unconfirmed: the realtime echo can
      // arrive before a response that then gets lost, and a message everyone
      // can already see must not flip to "Not sent".
      setMessages((current) =>
        current.map((m) => (m.id === message.id && m.status ? { ...m, status: "failed", failReason: result.reason } : m)),
      );
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
