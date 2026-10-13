import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const existing = import.meta.hot?.data.client as SupabaseClient | undefined;
export const supabase = existing ?? (url && key ? createClient(url, key) : null);
if (import.meta.hot) import.meta.hot.dispose((data) => { data.client = supabase; });
