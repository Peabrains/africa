import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const itemSchema = { type: "object", additionalProperties: false, required: ["date", "type", "name", "location", "startTime", "endTime", "notes", "reference", "confidence"], properties: { date: { type: "string" }, type: { type: "string", enum: ["Day", "Stop", "Accommodation", "Flight"] }, name: { type: "string" }, location: { type: "string" }, startTime: { type: "string" }, endTime: { type: "string" }, notes: { type: "string" }, reference: { type: "string" }, confidence: { type: "string", enum: ["High confidence", "Medium confidence", "Needs review"] } } };

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const gatewayKey = Deno.env.get("AI_GATEWAY_API_KEY");
  if (!gatewayKey) return json({ error: "AI Gateway is not configured" }, 503);
  try {
    const { imageData, fileName } = await req.json();
    if (typeof imageData !== "string" || !imageData.startsWith("data:image/")) return json({ error: "A JPG or PNG image is required" }, 400);
    if (imageData.length > 12_000_000) return json({ error: "Image is too large" }, 413);
    const authorization = req.headers.get("Authorization") || "";
    const supabase = createClient(Deno.env.get("SUPABASE_URL") || "", Deno.env.get("SUPABASE_ANON_KEY") || "", { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
    const auth = await supabase.auth.getUser();
    if (!auth.data.user) return json({ error: "Sign in to import an itinerary" }, 401);
    const response = await fetch("https://ai-gateway.vercel.sh/v1/responses", { method: "POST", headers: { Authorization: `Bearer ${gatewayKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: Deno.env.get("AI_IMPORT_MODEL") || "openai/gpt-4.1-mini", max_output_tokens: 3000, input: [{ role: "developer", content: "Extract only travel itinerary facts visible in the image. Never invent missing dates, times, locations, booking references, or names. Classify each record as Day, Stop, Accommodation, or Flight. Use empty strings when a field is absent and Needs review when uncertain." }, { role: "user", content: [{ type: "input_text", text: `Extract this booking screenshot into itinerary records. Filename: ${String(fileName || "image")}` }, { type: "input_image", image_url: imageData }] }], text: { format: { type: "json_schema", name: "imported_itinerary", strict: true, schema: { type: "object", additionalProperties: false, required: ["items"], properties: { items: { type: "array", maxItems: 30, items: itemSchema } } } } } }) });
    const result = await response.json();
    if (!response.ok) return json({ error: "The screenshot could not be read. Try a clearer image." }, 502);
    const text = result.output_text || result.output?.flatMap((entry: any) => entry.content || []).find((part: any) => part.type === "output_text")?.text || "";
    return json({ result: JSON.parse(text), usage: result.usage || {} });
  } catch (error) { return json({ error: error instanceof Error ? error.message : "Screenshot import failed" }, 502); }
});
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
