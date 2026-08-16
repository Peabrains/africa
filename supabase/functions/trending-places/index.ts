import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const placeSchema = {
  type: "object", additionalProperties: false,
  required: ["name", "location", "why", "bestFor", "sourceUrl", "officialUrl", "mapsUrl", "caveat"],
  properties: {
    name: { type: "string" }, location: { type: "string" }, why: { type: "string" }, bestFor: { type: "string" },
    sourceUrl: { type: "string" }, officialUrl: { type: "string" }, mapsUrl: { type: "string" }, caveat: { type: "string" },
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const key = Deno.env.get("AI_GATEWAY_API_KEY");
  if (!key) return json({ error: "AI Gateway is not configured" }, 503);
  try {
    const { message, location, date, interests } = await req.json();
    if (!message || typeof message !== "string" || message.length > 800) return json({ error: "Invalid discovery request" }, 400);
    const supabase = createClient(Deno.env.get("SUPABASE_URL") || "", Deno.env.get("SUPABASE_ANON_KEY") || "", { global: { headers: { Authorization: req.headers.get("Authorization") || "" } }, auth: { persistSession: false } });
    const { data: user, error: authError } = await supabase.auth.getUser();
    if (authError || !user.user) return json({ error: "Sign in to discover trending places" }, 401);
    const response = await fetch("https://ai-gateway.vercel.sh/v1/responses", {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "perplexity/sonar", max_output_tokens: 3000,
        input: [{ role: "system", content: "Find current, interesting travel places using live web search. Use public sources only; never claim Instagram or Xiaohongshu access unless a public result is actually available. Return five places with source links. Prefer recent posts, local tourism sites, official venue pages, and reputable travel publications. Clearly flag uncertainty and tell the user to verify hours, access, and availability." }, { role: "user", content: JSON.stringify({ request: message, location, date, interests }) }],
        text: { format: { type: "json_schema", name: "trending_places", strict: true, schema: { type: "object", additionalProperties: false, required: ["summary", "places"], properties: { summary: { type: "string" }, places: { type: "array", minItems: 1, maxItems: 5, items: placeSchema } } } } },
      }),
    });
    const result = await response.json();
    if (!response.ok) return json({ error: "Live place search is unavailable right now. Try again shortly." }, 502);
    const text = typeof result.output_text === "string" ? result.output_text : result.output?.flatMap((e: any) => e.content || []).find((p: any) => p.type === "output_text")?.text || "";
    if (!text) return json({ error: "No current places were found. Try a more specific location." }, 502);
    return json({ result: JSON.parse(text), usage: result.usage || {} });
  } catch (error) { return json({ error: error instanceof Error ? error.message : "Trending search failed" }, 502); }
});

function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
