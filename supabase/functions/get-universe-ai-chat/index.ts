import {
  describeError,
  getAuthUser,
  handleCors,
  jsonResponse,
  createAdminClient,
} from "../_shared/image-storage.ts";
import {
  cleanUniverseId,
  getAppUser,
  getOrCreateAiChat,
  getOrCreateAiSource,
  loadAiMessages,
  loadAiProposals,
  loadUniverseContext,
  serializeChat,
  serializeMessages,
  serializeSource,
} from "../_shared/universe-ai.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const authUser = await getAuthUser(req);
    const appUser = await getAppUser(authUser.id);
    const body = await req.json().catch(() => ({}));
    const universeId = cleanUniverseId(body.universeId);

    if (!universeId) {
      return jsonResponse({ error: "universeId is required." }, 400);
    }

    const supabase = createAdminClient();
    const context = await loadUniverseContext(supabase, universeId, appUser.id);
    const source = await getOrCreateAiSource(supabase, universeId, appUser.id);
    const chat = await getOrCreateAiChat(supabase, universeId, appUser.id);
    const messages = await loadAiMessages(supabase, String(chat.id), appUser.id);
    const proposals = await loadAiProposals(supabase, String(chat.id), appUser.id);

    return jsonResponse({
      universe: {
        id: context.universe.id,
        name: context.universe.name,
      },
      source: serializeSource(source),
      chat: serializeChat(chat),
      messages: serializeMessages(messages, proposals),
    });
  } catch (error) {
    console.error(error);
    return jsonResponse(describeError(error, "Could not load universe AI chat."), 500);
  }
});
