import {
  createClient,
  type SupabaseClient,
  type User,
} from "@supabase/supabase-js";
import { ApiError } from "./validation.js";
import { required } from "./env.js";

export async function cleanupMedia(client: SupabaseClient, userId?: string) {
  let query = client
    .from("media_cleanup_jobs")
    .select("id,image_path")
    .order("attempted_at", { ascending: true, nullsFirst: true })
    .order("created_at")
    .limit(100);
  if (userId) query = query.eq("user_id", userId);
  const { data: jobs, error } = await query;
  if (error) throw new Error("cleanup_queue_unavailable");
  if (!jobs?.length) return 0;
  const ids = jobs.map((j) => j.id);
  const { error: touchError } = await client
    .from("media_cleanup_jobs")
    .update({ attempted_at: new Date().toISOString() })
    .in("id", ids);
  if (touchError) throw new Error("cleanup_queue_unavailable");
  const { error: storageError } = await client.storage
    .from("captures")
    .remove(jobs.map((j) => j.image_path));
  if (storageError) throw new Error("cleanup_storage_unavailable");
  const { error: ackError } = await client
    .from("media_cleanup_jobs")
    .delete()
    .in("id", ids);
  if (ackError) throw new Error("cleanup_ack_failed");
  return jobs.length;
}

export async function deleteAccount(
  client: SupabaseClient,
  user: User,
  body: Record<string, unknown>,
  reauthenticate: (
    email: string,
    password: string,
  ) => Promise<string | undefined> = async (email, password) => {
    // Separate client: password verification must not replace the admin client's session.
    const auth = createClient(
      required("SUPABASE_URL"),
      required("SUPABASE_SERVICE_ROLE_KEY"),
      {
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );
    const { data, error } = await auth.auth.signInWithPassword({
      email,
      password,
    });
    return error ? undefined : data.user?.id;
  },
) {
  if (
    body.confirmation !== "DELETE" ||
    typeof body.password !== "string" ||
    !body.password ||
    body.password.length > 1024 ||
    !user.email
  )
    throw new ApiError(
      400,
      "현재 비밀번호와 DELETE 확인 문구를 입력해 주세요.",
    );
  if ((await reauthenticate(user.email, body.password)) !== user.id)
    throw new ApiError(
      403,
      "비밀번호를 확인해 주세요. 다시 로그인한 뒤 시도할 수도 있어요.",
    );
  // Auth removal cascades through the profile, posts and conversations. The DB
  // trigger queues photos in the same transaction; a failed deletion queues nothing.
  const { error } = await client.auth.admin.deleteUser(user.id);
  if (error)
    throw new ApiError(
      503,
      "탈퇴를 완료하지 못했어요. 잠시 후 다시 시도해 주세요.",
    );
  try {
    await cleanupMedia(client, user.id);
  } catch {
    console.error("account_media_cleanup_queued");
  }
  return { deleted: true };
}
