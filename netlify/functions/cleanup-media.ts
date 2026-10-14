import { createClient } from "@supabase/supabase-js";
import { cleanupMedia } from "../../server/account.js";
import { required } from "../../server/env.js";

// Netlify does not expose scheduled functions as public request endpoints.
export const config = { schedule: "0 3 * * *" };
export default async function cleanup() {
  const client = createClient(
    required("SUPABASE_URL"),
    required("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  let removed = 0;
  // Bound each run's work and let the next run resume any backlog.
  for (let page = 0; page < 5; page++) {
    const count = await cleanupMedia(client);
    removed += count;
    if (count < 100) break;
  }
  return Response.json({ removed });
}
