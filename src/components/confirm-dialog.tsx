"use client";

import { Loader2 } from "lucide-react";
import { useState, useTransition, type ReactElement, type ReactNode } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type Props = {
  // The button that opens the popup (rendered as the trigger).
  trigger: ReactElement;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  // Extra content, e.g. a "type the name to confirm" field.
  children?: ReactNode;
  confirmDisabled?: boolean;
  // Return an error message to keep the popup open and show it.
  onConfirm: () => Promise<{ error: string } | undefined | void>;
  onOpenChange?: (open: boolean) => void;
};

// For actions with consequences (leaving, removing, deleting): an
// alert dialog states what will happen and waits for an explicit choice.
// Escape or Cancel backs out; focus returns to the trigger.
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  destructive = false,
  children,
  confirmDisabled = false,
  onConfirm,
  onOpenChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function change(next: boolean) {
    setOpen(next);
    if (!next) setError(undefined);
    onOpenChange?.(next);
  }

  return (
    <AlertDialog open={open} onOpenChange={change}>
      <AlertDialogTrigger render={trigger} />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="font-heading text-2xl font-medium">{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {children}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant={destructive ? "destructive" : "default"}
            disabled={pending || confirmDisabled}
            onClick={() =>
              startTransition(async () => {
                const result = await onConfirm();
                if (result && "error" in result) setError(result.error);
                else change(false);
              })
            }
          >
            {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
