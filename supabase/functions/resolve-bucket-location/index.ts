import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { itemId } = await req.json();
    if (!/^[0-9a-f-]{36}$/i.test(String(itemId || ""))) return json({ error: "Invalid item" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_ANON_KEY") || "",
      { global: { headers: { Authorization: req.headers.get("Authorization") || "" } }, auth: { persistSession: false } },
    );
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) return json({ error: "Sign in required" }, 401);

    // RLS proves the caller belongs to the item's trip.
    const { data: item, error: readError } = await supabase
      .from("bucket_items")
      .select("id,title,location,url")
      .eq("id", itemId)
      .single();
    if (readError || !item) return json({ error: "Item not found" }, 404);

    const resolvedUrl = await resolveGoogleUrl(item.url || "");
    const direct = coordinatesFromUrl(resolvedUrl || item.url || "");
    let result = direct ? { ...direct, label: item.location || item.title, status: "resolved" } : null;

    if (!result) {
      const googleQuery = queryFromGoogleUrl(resolvedUrl);
      const query = googleQuery || [item.title, item.location].filter(Boolean).join(", ");
      result = await geocode(query);
    }

    const patch = result
      ? {
          latitude: result.lat,
          longitude: result.lng,
          canonical_maps_url: resolvedUrl || item.url || null,
          location_label: result.label,
          location_status: result.status,
          location_resolved_at: new Date().toISOString(),
        }
      : {
          latitude: null,
          longitude: null,
          canonical_maps_url: resolvedUrl || item.url || null,
          location_label: null,
          location_status: "unresolved",
          location_resolved_at: new Date().toISOString(),
        };

    const { data: updated, error: updateError } = await supabase
      .from("bucket_items")
      .update(patch)
      .eq("id", item.id)
      .select("id,latitude,longitude,canonical_maps_url,location_label,location_status,location_resolved_at")
      .single();
    if (updateError) throw updateError;
    return json({ item: updated });
  } catch (error) {
    console.error("bucket location resolution failed", error);
    return json({ error: "Location resolution failed" }, 502);
  }
});

async function resolveGoogleUrl(value: string) {
  const url = safeGoogleUrl(value);
  if (!url) return "";
  try {
    const response = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; TripBucketMap/1.0)" },
    });
    return safeGoogleUrl(response.url) || url;
  } catch (_) {
    return url;
  }
}

function safeGoogleUrl(value: string) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:") return "";
    const host = url.hostname.toLowerCase();
    if (!(host === "maps.app.goo.gl" || host === "goo.gl" || host === "maps.google.com" || host.endsWith(".google.com"))) return "";
    return url.toString();
  } catch (_) {
    return "";
  }
}

function coordinatesFromUrl(value: string) {
  try {
    const text = decodeURIComponent(value);
    const pairs = [
      text.match(/@(-?\d{1,3}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)/),
      text.match(/[?&](?:q|query|ll)=(-?\d{1,3}(?:\.\d+)?)(?:%2C|,)(-?\d{1,3}(?:\.\d+)?)/i),
    ];
    const d3 = text.match(/!3d(-?\d{1,3}(?:\.\d+)?)/);
    const d4 = text.match(/!4d(-?\d{1,3}(?:\.\d+)?)/);
    if (d3 && d4) pairs.push(["", d3[1], d4[1]] as unknown as RegExpMatchArray);
    for (const pair of pairs) {
      if (!pair) continue;
      const lat = Number(pair[1]); const lng = Number(pair[2]);
      if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng };
    }
  } catch (_) { /* invalid URL */ }
  return null;
}

function queryFromGoogleUrl(value: string) {
  try {
    const url = new URL(value);
    return (url.searchParams.get("q") || url.searchParams.get("query") || "").replace(/\+/g, " ").trim();
  } catch (_) {
    return "";
  }
}

async function geocode(query: string) {
  if (!query.trim()) return null;
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("q", query.slice(0, 500));
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "TripBucketMap/1.0 (contact: app-owner)" },
  });
  if (!response.ok) return null;
  const hit = (await response.json())?.[0];
  if (!hit) return null;
  const lat = Number(hit.lat); const lng = Number(hit.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng, label: String(hit.display_name || query), status: "approximate" };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
