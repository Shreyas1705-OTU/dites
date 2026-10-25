"use client";

import { Loader2 } from "lucide-react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";

import { updateProfile, type ProfileFormState } from "./actions";

const inputClass =
  "h-11 w-full rounded-lg border border-input bg-card px-3 text-base outline-none transition-[border-color] duration-200 focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring aria-invalid:border-destructive";

export function ProfileForm({ username, displayName }: { username: string; displayName: string }) {
  const [state, action, pending] = useActionState<ProfileFormState, FormData>(updateProfile, {
    status: "idle",
    values: { username, displayName },
  });

  const usernameError = state.status === "error" && state.field === "username" ? state.message : undefined;
  const displayNameError = state.status === "error" && state.field === "displayName" ? state.message : undefined;
  const formError = state.status === "error" && !state.field ? state.message : undefined;

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="displayName" className="text-sm font-medium">
          Display name
        </label>
        <input
          id="displayName"
          name="displayName"
          defaultValue={state.values.displayName}
          maxLength={50}
          autoComplete="nickname"
          aria-invalid={Boolean(displayNameError)}
          aria-describedby={displayNameError ? "displayName-error" : undefined}
          className={inputClass}
        />
        {displayNameError && (
          <p id="displayName-error" className="text-sm text-destructive">
            {displayNameError}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="username" className="text-sm font-medium">
          Username
        </label>
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground">@</span>
          <input
            id="username"
            name="username"
            defaultValue={state.values.username}
            maxLength={20}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            aria-invalid={Boolean(usernameError)}
            aria-describedby="username-hint"
            className={`${inputClass} pl-7`}
          />
        </div>
        <p id="username-hint" className={`text-sm ${usernameError ? "text-destructive" : "text-muted-foreground"}`}>
          {usernameError ?? "3 to 20 characters: lowercase letters, numbers and underscores."}
        </p>
      </div>

      <div className="flex items-center gap-3" aria-live="polite">
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
          {pending ? "Saving…" : "Save profile"}
        </Button>
        {state.status === "saved" && <span className="text-sm text-muted-foreground">{state.message}</span>}
        {formError && (
          <span role="alert" className="text-sm text-destructive">
            {formError}
          </span>
        )}
      </div>
    </form>
  );
}
