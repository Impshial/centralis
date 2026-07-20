import {
  createAdminClient,
  describeError,
  getAuthUser,
  handleCors,
  jsonResponse,
} from "../_shared/image-storage.ts";

type AdminUser = {
  id: number;
  clerk_user_id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  admin: boolean;
};

async function requireAdmin(authUserId: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("users")
    .select("id,clerk_user_id,email,display_name,avatar_url,admin")
    .eq("clerk_user_id", authUserId)
    .maybeSingle();

  if (error) throw error;
  if (!data || data.admin !== true) throw new Error("Only admins can view purge users.");
  return data as AdminUser;
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const authUser = await getAuthUser(req);
    const actingUser = await requireAdmin(authUser.id);
    const { data, error } = await createAdminClient()
      .from("users")
      .select("id,email,display_name,avatar_url,admin,created_at")
      .order("email", { ascending: true });

    if (error) throw error;

    return jsonResponse({
      actingUserId: actingUser.id,
      users: (data || []).map((user) => ({
        ...user,
        is_current_user: user.id === actingUser.id,
      })),
    });
  } catch (error) {
    console.error(error);
    return jsonResponse(describeError(error, "Could not list purge users."), 500);
  }
});
