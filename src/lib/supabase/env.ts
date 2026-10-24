// Only the project URL and the publishable key ever reach the browser. Both are
// public by design: RLS, not secrecy of these values, is the security boundary.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
export const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
