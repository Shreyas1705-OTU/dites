"use client";

import { SendHorizontal } from "lucide-react";
import { useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { MAX_MESSAGE_LENGTH, messageLength } from "@/lib/chat/data";

type Props = {
  placeholder: string;
  onSend: (body: string) => void;
};

const MAX_ROWS_PX = 6 * 24; // about six lines, then the box scrolls

// Enter sends, Shift+Enter adds a line. Plain text only.
export function Composer({ placeholder, onSend }: Props) {
  const [body, setBody] = useState("");
  const textarea = useRef<HTMLTextAreaElement>(null);
  const counterId = useId();

  const length = messageLength(body);
  const tooLong = length > MAX_MESSAGE_LENGTH;
  const canSend = body.trim().length > 0 && !tooLong;

  function resize() {
    const el = textarea.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_ROWS_PX)}px`;
  }

  function submit() {
    if (!canSend) return;
    onSend(body.trim());
    setBody("");
    requestAnimationFrame(() => {
      resize();
      textarea.current?.focus();
    });
  }

  return (
    <form
      className="shrink-0 border-t bg-background px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="flex items-end gap-2 rounded-xl border border-input bg-card p-1.5 pl-3 transition-[border-color] duration-200 focus-within:border-ring focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-ring">
        <textarea
          ref={textarea}
          value={body}
          rows={1}
          name="message"
          autoComplete="off"
          aria-label={placeholder}
          aria-describedby={length > MAX_MESSAGE_LENGTH - 200 ? counterId : undefined}
          aria-invalid={tooLong}
          placeholder={`${placeholder}…`}
          onChange={(e) => {
            setBody(e.target.value);
            resize();
          }}
          onKeyDown={(e) => {
            // Don't send while an input method (Japanese, Chinese, Korean...)
            // is still composing a word.
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          className="max-h-36 min-h-9 flex-1 resize-none bg-transparent py-1.5 text-base leading-6 outline-none placeholder:text-muted-foreground md:text-[0.9375rem]"
        />
        <Button type="submit" size="icon" disabled={!canSend} aria-label="Send message" title="Send (Enter)">
          <SendHorizontal aria-hidden="true" />
        </Button>
      </div>
      <div className="flex min-h-5 justify-between gap-3 pt-1 text-xs text-muted-foreground">
        <span className="hidden sm:inline">Enter to send · Shift+Enter for a new line</span>
        {length > MAX_MESSAGE_LENGTH - 200 && (
          <span id={counterId} className={`ml-auto tabular-nums ${tooLong ? "font-medium text-destructive" : ""}`}>
            {length.toLocaleString()} / {MAX_MESSAGE_LENGTH.toLocaleString()}
          </span>
        )}
      </div>
    </form>
  );
}
