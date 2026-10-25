"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type ProfileFormState = {
  status: "idle" | "saved" | "error";
  message?: string;
  field?: "username" | "displayName";
  values: { username: string; displayName: string };
};

const USERNAME = /^[a-z0-9_]{3,20}$/;

// The database is the real gate: the UPDATE runs under RLS (only your own
// row), the column grant only allows username/display_name/avatar_path, and
// CHECK constraints enforce format and reserved names. These checks just give
// friendlier messages first.
export async function updateProfile(_prev: ProfileFormState, formData: FormData): Promise<ProfileFormState> {
  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  const displayName = String(formData.get("displayName") ?? "").trim();
  const values = { username, displayName };

  if (!USERNAME.test(username)) {
    return {
      status: "error",
      field: "username",
      message: "Use 3 to 20 characters: lowercase letters, numbers and underscores.",
      values,
    };
  }
  if (displayName.length < 1 || displayName.length > 50) {
    return { status: "error", field: "displayName", message: "Display name must be 1 to 50 characters.", values };
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) {
    return { status: "error", message: "Your session ended. Sign in again.", values };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ username, display_name: displayName })
    .eq("id", userId);

  if (error) {
    if (error.code === "23505") {
      return { status: "error", field: "username", message: `@${username} is taken. Try another.`, values };
    }
    if (error.code === "23514") {
      return { status: "error", field: "username", message: `@${username} is reserved. Try another.`, values };
    }
    return { status: "error", message: "Couldn't save your profile. Please try again.", values };
  }

  revalidatePath("/chat");
  return { status: "saved", message: "Profile saved.", values };
}
