"use client";

import { Loader2, RotateCw } from "lucide-react";
import { Fragment, useEffect, useRef, useSyncExternalStore, type RefObject } from "react";

import type { UiMessage } from "@/lib/chat/use-room-messages";

type Props = {
  currentUserId: string;
  messages: UiMessage[]; // newest first
  hasMore: boolean;
  loadingOlder: boolean;
  loadError: boolean;
  onLoadOlder: () => void;
  onRetry: (id: string) => void;
  emptyText: string;
  scrollRef: RefObject<HTMLDivElement | null>;
};

const GROUP_WINDOW_MS = 5 * 60 * 1000;

const subscribe = () => () => {};
function useHydrated() {
  return useSyncExternalStore(subscribe, () => true, () => false);
}

// Times are formatted in the viewer's own timezone, so they render only after
// hydration (the server doesn't know the timezone). The <time> keeps its
// width reserved, so nothing shifts.
function MessageTime({ iso, className }: { iso: string; className?: string }) {
  const hydrated = useHydrated();
  const date = new Date(iso);
  return (
    <time dateTime={iso} title={hydrated ? date.toLocaleString() : undefined} className={className}>
      {hydrated ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : " "}
    </time>
  );
}

function DayDivider({ iso }: { iso: string }) {
  const hydrated = useHydrated();
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  let label = "";
  if (hydrated) {
    if (date.toDateString() === today.toDateString()) label = "Today";
    else if (date.toDateString() === yesterday.toDateString()) label = "Yesterday";
    else label = date.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
  }
  return (
    <div role="separator" className="flex items-center gap-3 py-2 text-xs font-medium tracking-[0.06em] text-muted-foreground uppercase">
      <span className="h-px flex-1 bg-border" />
      <span className="min-w-[6ch] text-center">{label}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

function sameDay(a: string, b: string) {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

export function MessageList({
  currentUserId,
  messages,
  hasMore,
  loadingOlder,
  loadError,
  onLoadOlder,
  onRetry,
  emptyText,
  scrollRef,
}: Props) {
  const sentinel = useRef<HTMLDivElement>(null);

  // Load the previous page when the top of the history scrolls into view.
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore) return;
    const observer = new IntersectionObserver((entries) => entries[0]?.isIntersecting && onLoadOlder(), {
      rootMargin: "400px 0px 0px 0px",
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, onLoadOlder]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
        <p className="font-heading text-2xl">It&apos;s quiet in here.</p>
        <p className="max-w-sm text-sm text-muted-foreground">{emptyText}</p>
      </div>
    );
  }

  return (
    // column-reverse: the browser anchors scrolling to the newest message,
    // and older pages added at the top don't push what you're reading.
    <div
      ref={scrollRef}
      role="log"
      aria-label="Messages"
      aria-live="polite"
      className="flex min-h-0 flex-1 flex-col-reverse overflow-y-auto px-3 py-4 sm:px-6"
    >
      <ol className="flex flex-col-reverse gap-0.5">
        {messages.map((message, i) => {
          const previous = messages[i + 1]; // the one sent just before this
          const newDay = !previous || !sameDay(previous.createdAt, message.createdAt);
          const grouped =
            !newDay &&
            previous.userId === message.userId &&
            Date.parse(message.createdAt) - Date.parse(previous.createdAt) < GROUP_WINDOW_MS;
          const mine = message.userId === currentUserId;

          return (
            <Fragment key={message.id}>
              <li className={`flex flex-col ${mine ? "items-end" : "items-start"} ${grouped ? "" : "pt-3"}`}>
                {!grouped && (
                  <div className={`flex items-baseline gap-2 pb-1 text-xs ${mine ? "flex-row-reverse" : ""}`}>
                    <span className="font-semibold text-foreground">{mine ? "You" : message.author.displayName}</span>
                    {!mine && <span className="text-muted-foreground">@{message.author.username}</span>}
                    <MessageTime iso={message.createdAt} className="text-muted-foreground tabular-nums" />
                  </div>
                )}
                <div
                  className={`max-w-[82%] rounded-[14px] px-3 py-2 text-[0.9375rem] leading-[1.45] whitespace-pre-wrap [overflow-wrap:anywhere] md:max-w-[68ch] ${
                    mine
                      ? `bg-bubble-mine text-bubble-mine-foreground ${grouped ? "" : "rounded-tr-[4px]"}`
                      : `bg-secondary text-secondary-foreground ${grouped ? "" : "rounded-tl-[4px]"}`
                  } ${message.deletedAt ? "italic opacity-70" : ""} ${message.status ? "opacity-60" : ""}`}
                >
                  {/* Plain text only: user content is never rendered as HTML. */}
                  {message.deletedAt ? "Message deleted" : message.body}
                  {message.editedAt && !message.deletedAt && (
                    <span className="ml-1.5 text-xs opacity-75">(edited)</span>
                  )}
                </div>
                {message.status === "pending" && (
                  <span className="pt-1 text-xs text-muted-foreground">Sending…</span>
                )}
                {message.status === "failed" && (
                  <span role="alert" className="flex items-center gap-2 pt-1 text-xs text-destructive">
                    Not sent. {message.failReason}
                    <button
                      type="button"
                      onClick={() => onRetry(message.id)}
                      className="inline-flex cursor-pointer items-center gap-1 font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      <RotateCw className="size-3" aria-hidden="true" />
                      Retry
                    </button>
                  </span>
                )}
              </li>
              {newDay && (
                <li>
                  <DayDivider iso={message.createdAt} />
                </li>
              )}
            </Fragment>
          );
        })}
      </ol>

      <div ref={sentinel} className="flex justify-center py-3">
        {loadingOlder && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Loading older messages" />}
        {loadError && (
          <button type="button" onClick={onLoadOlder} className="cursor-pointer text-sm text-primary underline-offset-4 hover:underline">
            Couldn&apos;t load older messages. Retry
          </button>
        )}
        {!hasMore && <p className="text-xs text-muted-foreground">This is the beginning of the conversation.</p>}
      </div>
    </div>
  );
}
