// Friendly text for the auth error codes the callback passes through
// (`?auth_error=<code>`). Unknown codes get the generic message, so a crafted
// URL can never put arbitrary text on the page.
const MESSAGES: Record<string, string> = {
  identity_already_exists:
    "That account is already linked to another Dites profile. Sign out and sign in with it instead. Messages from this guest session stay with the guest.",
  access_denied: "Sign-in was cancelled. Try again whenever you're ready.",
  captcha_failed: "We couldn't confirm you're a person. Refresh the page and try again.",
  sign_in_failed: "Sign-in didn't finish. Please try again.",
};

export function authErrorMessage(code: string | null | undefined): string | null {
  if (!code) return null;
  return MESSAGES[code] ?? MESSAGES.sign_in_failed;
}
