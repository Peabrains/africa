import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const itemSchema = {
  type: "object",
  additionalProperties: false,
  required: ["dayDate", "startTime", "endTime", "name", "description", "category", "transport", "transportType", "estimatedCost", "bookingRequired", "notes"],
  properties: {
    dayDate: { type: "string", description: "An ISO date already present in the supplied trip context" },
    startTime: { type: ["string", "null"], description: "24-hour HH:MM local time" },
    endTime: { type: ["string", "null"], description: "24-hour HH:MM local time" },
    name: { type: "string" },
    description: { type: "string" },
    category: { type: "string", enum: ["activity", "transport"] },
    transport: { type: "string" },
    transportType: { type: "string", enum: ["walk", "car", "bus", "train", "plane", "boat"] },
    estimatedCost: { type: ["number", "null"] },
    bookingRequired: { type: "boolean" },
    notes: { type: "string" },
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const gatewayKey = Deno.env.get("AI_GATEWAY_API_KEY");
  if (!gatewayKey) return json({ error: "AI Gateway is not configured" }, 503);

  try {
    const { message, context } = await req.json();
    if (!message || typeof message !== "string" || message.length > 1200) return json({ error: "Invalid planner request" }, 400);
    if (!context?.trip || !Array.isArray(context?.days)) return json({ error: "Invalid trip context" }, 400);

    const authorization = req.headers.get("Authorization") || "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) return json({ error: "Sign in to use the AI planner" }, 401);

    const { data: allowed, error: quotaError } = await supabase.rpc("claim_ai_planner_request", { p_daily_limit: 5 });
    if (quotaError) {
      console.error("Planner quota check failed", quotaError.code || "unknown");
      return json({ error: "AI quota checking is not configured" }, 503);
    }
    if (!allowed) return json({ error: "You have used today's 5 AI plans. Try again tomorrow." }, 429);

    const response = await fetch("https://ai-gateway.vercel.sh/v1/responses", {
      method: "POST",
      headers: { "Authorization": `Bearer ${gatewayKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: Deno.env.get("AI_PLANNER_MODEL") || "openai/gpt-5-mini",
        max_output_tokens: 1600,
        input: [
          {
            role: "developer",
            content: "You are a careful travel itinerary planner. Suggest only items that fit around fixed itinerary entries. Use only dates present in context.days. Never claim availability, live opening hours, prices, or bookings are verified. Keep the plan practical, geographically coherent, and concise. Return 1 to 6 items.",
          },
          { role: "user", content: JSON.stringify({ request: message, tripContext: context }) },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "itinerary_proposal",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["title", "summary", "currency", "items", "caveats"],
              properties: {
                title: { type: "string" },
                summary: { type: "string" },
                currency: { type: "string" },
                items: { type: "array", minItems: 1, maxItems: 6, items: itemSchema },
                caveats: { type: "array", maxItems: 4, items: { type: "string" } },
              },
            },
          },
        },
      }),
    });

    const result = await response.json();
    if (!response.ok) {
      console.error("AI Gateway planner error", response.status, result?.error?.code || "unknown");
      return json({ error: "The AI planner is temporarily unavailable" }, 502);
    }
    const outputText = result.output?.flatMap((entry: any) => entry.content || []).find((part: any) => part.type === "output_text")?.text;
    if (!outputText) return json({ error: "The planner returned no proposal" }, 502);
    const usage = result.usage || {};
    await supabase.rpc("record_ai_planner_tokens", {
      p_input_tokens: usage.input_tokens || 0,
      p_output_tokens: usage.output_tokens || 0,
    });
    return json({ proposal: JSON.parse(outputText), usage });
  } catch (error) {
    console.error("AI planner failure", error instanceof Error ? error.message : "unknown");
    return json({ error: "The planner request could not be completed" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
