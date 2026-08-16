import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const itemSchema = {
  type: "object",
  additionalProperties: false,
  required: ["dayDate", "startTime", "endTime", "name", "description", "category", "transport", "transportType", "estimatedCost", "bookingRequired", "notes", "referenceUrl", "locationPrecision"],
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
    referenceUrl: { type: "string", description: "A direct https URL with more information about this exact place or activity. Prefer the official venue or tourism website; never invent a URL." },
    locationPrecision: { type: "string", enum: ["exact", "area"], description: "Use exact only for a specific, verifiable venue. Use area for neighborhoods, walks, districts, viewpoints, or broad suggestions." },
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

    const response = await fetch("https://ai-gateway.vercel.sh/v1/responses", {
      method: "POST",
      headers: { "Authorization": `Bearer ${gatewayKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: Deno.env.get("AI_PLANNER_MODEL") || "openai/gpt-5.6-luna",
        max_output_tokens: 5000,
        reasoning: { effort: "low" },
        input: [
          {
            role: "developer",
            content: "You are a careful travel itinerary planner. Suggest 6 useful items when the request and available time allow, mixing primary recommendations with sensible alternatives. Fit everything around fixed itinerary entries and use only dates present in context.days. Never claim availability, live opening hours, prices, or bookings are verified. Keep the plan practical and geographically coherent. Keep each description to 1-2 concise sentences. Every item MUST include a real, direct https referenceUrl for more information; prefer the official venue, attraction, transit, or tourism website. If you cannot verify a specific official URL, return an empty referenceUrl so the app can provide a map search link. Mark locationPrecision as exact only for a specific venue; use area for broad neighborhoods, walks, districts, or unverified suggestions.",
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
                items: { type: "array", minItems: 1, maxItems: 8, items: itemSchema },
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
      const retryable = response.status === 429 || response.status >= 500;
      return json({ error: retryable ? "The planner is busy right now. Please try again." : "The planner could not understand that request. Try rephrasing it." }, 502);
    }
    const outputText = extractOutputText(result);
    if (!outputText) {
      return json({ error: "The planner ran out of room. Try a shorter request or choose one day." }, 502);
    }
    const usage = result.usage || {};
    await supabase.rpc("record_ai_planner_tokens", {
      p_input_tokens: usage.input_tokens || 0,
      p_output_tokens: usage.output_tokens || 0,
    });
    return json({ proposal: JSON.parse(outputText), usage });
  } catch (error) {
    console.error("AI planner failure", error instanceof Error ? error.message : "unknown");
    const message = error instanceof Error ? error.message : "unknown planner error";
    return json({ error: `The planner response could not be read: ${message}` }, 502);
  }
});

function extractOutputText(result: any): string {
  if (typeof result?.output_text === "string" && result.output_text.trim()) return result.output_text;
  if (Array.isArray(result?.output)) {
    const part = result.output
      .flatMap((entry: any) => Array.isArray(entry?.content) ? entry.content : [])
      .find((candidate: any) => candidate?.type === "output_text" && typeof candidate?.text === "string");
    if (part?.text?.trim()) return part.text;
  }
  return "";
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
