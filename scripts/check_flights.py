#!/usr/bin/env python3
"""
Flight status checker — Africa Safari 2026 platform branch.

For every stop with a flight_detail.flight_no, asks AeroDataBox for the
current scheduled/revised departure time and compares it to what's stored
in Supabase. Updates:
  - flight_detail.depart_time      -> current authoritative time
  - flight_detail.original_depart_time -> set once, first run only, never overwritten
  - flight_detail.last_checked_at  -> updated on every run, changed or not

The app itself (data-platform.js normaliseStop / itinerary.js) reads these
fields to show the "Retimed" badge and strikethrough-old / new-time display.
No email is sent — this is purely a data update; the badge is a normal
read the next time the app loads.
"""

import os
import sys
import json
import urllib.request
import urllib.error
from datetime import datetime, timezone

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SERVICE_KEY  = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
RAPIDAPI_KEY = os.environ["RAPIDAPI_KEY"]
TRIP_ID      = os.environ.get("TRIP_ID", "83891de6-44ee-4ec2-bb95-6726cbd8c370")

AERODB_HOST = "aerodatabox.p.rapidapi.com"


def sb_request(method, path, body=None):
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("apikey", SERVICE_KEY)
    req.add_header("Authorization", f"Bearer {SERVICE_KEY}")
    req.add_header("Content-Type", "application/json")
    if method in ("PATCH", "POST"):
        req.add_header("Prefer", "return=representation")
    try:
        with urllib.request.urlopen(req) as r:
            raw = r.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        print(f"[Supabase] {method} {path} failed: {e.code} {e.read().decode()}", file=sys.stderr)
        raise


def get_flight_stops():
    """Stops with a flight_no set, joined to their day's date."""
    path = (
        f"stops?trip_id=eq.{TRIP_ID}"
        f"&flight_detail=not.is.null"
        f"&select=id,name,flight_detail,itinerary_days(date)"
    )
    rows = sb_request("GET", path) or []
    return [r for r in rows if r.get("flight_detail", {}).get("flight_no")]


def check_flight(flight_no, date_str):
    """Returns the current local departure time string, or None if no data yet."""
    url = f"https://{AERODB_HOST}/flights/number/{flight_no}/{date_str}"
    req = urllib.request.Request(url)
    req.add_header("X-RapidAPI-Key", RAPIDAPI_KEY)
    req.add_header("X-RapidAPI-Host", AERODB_HOST)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            results = json.loads(r.read())
    except urllib.error.HTTPError as e:
        print(f"[AeroDataBox] {flight_no}/{date_str} -> {e.code} {e.read().decode()[:200]}")
        return None
    except Exception as e:
        print(f"[AeroDataBox] {flight_no}/{date_str} -> error: {e}")
        return None

    if not results:
        print(f"[AeroDataBox] {flight_no}/{date_str} -> no schedule data yet (normal if far out)")
        return None

    flight = results[0]
    dep = flight.get("departure", {})
    # Prefer the revised (actual current) time if present, else the original schedule
    time_block = dep.get("revisedTime") or dep.get("scheduledTime")
    if not time_block:
        return None
    local = time_block.get("local", "")
    # AeroDataBox local time format e.g. "2026-09-01 14:20+03:00" -> take HH:MM
    try:
        return local.split(" ")[1][:5]
    except Exception:
        return None


def main():
    stops = get_flight_stops()
    print(f"Checking {len(stops)} flight-carrying stop(s)...")
    now_iso = datetime.now(timezone.utc).isoformat()

    for stop in stops:
        fd = stop["flight_detail"]
        flight_no = fd["flight_no"]
        date_str = (stop.get("itinerary_days") or {}).get("date")
        if not date_str:
            print(f"  {stop['name']}: no day date found, skipping")
            continue

        current_time = check_flight(flight_no, date_str)
        patch = {**fd, "last_checked_at": now_iso}

        if current_time:
            if "original_depart_time" not in fd:
                patch["original_depart_time"] = fd.get("depart_time", current_time)
            if current_time != fd.get("depart_time"):
                print(f"  {stop['name']} ({flight_no}): {fd.get('depart_time')} -> {current_time} — RETIMED")
                patch["depart_time"] = current_time
            else:
                print(f"  {stop['name']} ({flight_no}): unchanged ({current_time})")
        else:
            print(f"  {stop['name']} ({flight_no}): no data this run, just updating checked-at")

        sb_request("PATCH", f"stops?id=eq.{stop['id']}", {"flight_detail": patch})

    print("Done.")


if __name__ == "__main__":
    main()
