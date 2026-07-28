import {
  createAdminClient,
  describeError,
  getAuthUser,
  handleCors,
  jsonResponse,
} from "../_shared/image-storage.ts";
import {
  getImageGenerationUser,
  requireImageGenerationSession,
} from "../_shared/image-generation.ts";

type ImageGenerationMessage = {
  id: string;
  role: "user" | "assistant";
};

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const authUser = await getAuthUser(req);
    const appUser = await getImageGenerationUser(authUser.id);
    const body = await req.json();
    const sessionId = String(body.sessionId || "").trim();
    const messageId = String(body.messageId || "").trim();
    if (!sessionId || !messageId) return jsonResponse({ error: "sessionId and messageId are required." }, 400);

    await requireImageGenerationSession(sessionId, appUser.id);
    const supabase = createAdminClient();
    const { data: messages, error: messagesError } = await supabase
      .from("image_generation_messages")
      .select("id,role")
      .eq("session_id", sessionId)
      .eq("user_id", appUser.id)
      .eq("deleted", false)
      .order("created_at", { ascending: true });
    if (messagesError) throw messagesError;

    const orderedMessages = (messages || []) as ImageGenerationMessage[];
    const targetIndex = orderedMessages.findIndex((message) => message.id === messageId && message.role === "user");
    if (targetIndex < 0) return jsonResponse({ error: "The requested prompt was not found in this session." }, 404);

    // A generation turn is one user prompt plus any assistant messages immediately
    // following it. Stop at the next user prompt so earlier/later chat remains intact.
    const turnMessageIds = [messageId];
    for (let index = targetIndex + 1; index < orderedMessages.length; index += 1) {
      const message = orderedMessages[index];
      if (message.role === "user") break;
      turnMessageIds.push(message.id);
    }

    const deletedAt = new Date().toISOString();
    const deletePayload = { deleted: true, deleted_at: deletedAt, deleted_by: appUser.id };

    const { error: metadataError } = await supabase
      .from("image_generation_assets")
      .update(deletePayload)
      .eq("session_id", sessionId)
      .eq("user_id", appUser.id)
      .eq("deleted", false)
      .eq("message_id", messageId);
    if (metadataError) throw metadataError;

    const { error: deleteMessagesError } = await supabase
      .from("image_generation_messages")
      .update(deletePayload)
      .eq("session_id", sessionId)
      .eq("user_id", appUser.id)
      .eq("deleted", false)
      .in("id", turnMessageIds);
    if (deleteMessagesError) throw deleteMessagesError;

    return jsonResponse({ ok: true, deletedMessageIds: turnMessageIds });
  } catch (error) {
    console.error(error);
    return jsonResponse(describeError(error, "Could not remove this image-generation chat."), 500);
  }
});
