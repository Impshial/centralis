import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createNflService, NflUpstreamError } from "./service.mjs";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const service = createNflService();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "private, no-store" },
});

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  const authorization = req.headers.get("Authorization");
  if (!authorization) return json({ error: "Sign in to view NFL data." }, 401);
  try {
    const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authorization } }, auth: { persistSession: false },
    });
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) return json({ error: "Sign in to view NFL data." }, 401);
    const text = await req.text();
    if (text.length > 2048) return json({ error: "Request is too large." }, 413);
    let body;
    try { body = JSON.parse(text); } catch { return json({ error: "Invalid JSON." }, 400); }
    return json(await service.run(body));
  } catch (error) {
    if (error instanceof NflUpstreamError) {
      console.error("NFL upstream request failed:", { resource: error.resource, message: error.message });
      return json({ error: error.message, code: "NFL_UPSTREAM_ERROR" }, 502);
    }
    if (error instanceof TypeError) return json({ error: error.message }, 400);
    console.error("NFL upstream request failed:", error instanceof Error ? error.message : "Unknown error");
    return json({ error: "NFL data is temporarily unavailable. Please try Refresh." }, 502);
  }
});
