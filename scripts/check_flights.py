#!/usr/bin/env python3
"""
Flight status checker — Trip Companion platform branch.

For every stop with a flight_detail.flight_no, asks AeroDataBox for the
current scheduled AND revised times for departure and arrival, and writes
them straight into flight_detail.schedule on every run — nothing is ever
frozen as a permanent "original" value.

  flight_detail.schedule = {
    checked:              true once we've ever gotten a real API response
    published:            true if AeroDataBox currently has schedule data
    last_checked_at:      updated on every run, changed or not
    dep_scheduled_local:  "HH:MM", refreshed every run
    dep_revised_local:    "HH:MM" or absent — only present if AeroDataBox
                           is *currently* reporting an active delay
    dep_terminal:         e.g. "1A", or absent if unknown
    dep_iata / dep_airport_name:  from AeroDataBox, for display
    arr_scheduled_local / arr_revised_local / arr_terminal /
    arr_iata / arr_airport_name:  same, for the arrival side
    duration_minutes:     scheduled (or revised, if delayed) flight time
  }

"Retimed" is a pure current-state read: revised present + differs from
scheduled right now. There is no diffing against any previous run's data,
so a flight that was wrongly reported once and later corrects itself does
not stay stuck showing a false delay forever (the old bug).

If a run gets no data at all (AeroDataBox has nothing for that flight/date
yet, or a transient lookup failure), only last_checked_at is updated —
whatever schedule data we already have from a previous successful run is
left untouched rather than wiped.

The app (data-platform.js normaliseStop / itinerary.js flight card) reads
flight_detail.schedule directly. No email is sent — this is purely a data
update; the card is a normal read the next time the app loads.
"""

import os
import sys
import json
import time
import urllib.request
import urllib.error
from datetime import datetime, timezone

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SERVICE_KEY  = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
RAPIDAPI_KEY = os.environ["RAPIDAPI_KEY"]

# Trip list is fetched dynamically at runtime (see get_all_trip_ids) so new
# trips are checked automatically — nothing to edit here when a trip is created.

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


def get_all_trip_ids():
    """Every trip in the database — new trips get flight-checked automatically,
       nothing to add here by hand."""
    rows = sb_request("GET", "trips?select=id,name") or []
    for r in rows:
        print(f"[trips] found {r['id']} ({r.get('name','?')})")
    return [r["id"] for r in rows]


def get_flight_stops(trip_id):
    """Stops with a flight_no set for one trip, joined to their day's date."""
    path = (
        f"stops?trip_id=eq.{trip_id}"
        f"&flight_detail=not.is.null"
        f"&select=id,name,flight_detail,itinerary_days(date)"
    )
    rows = sb_request("GET", path) or []
    out = []
    for r in rows:
        fd = r.get("flight_detail") or {}
        if fd.get("flight_no"):
            # Normalize: the app field is free text, so don't trust exact formatting
            # (strip spaces/dashes, uppercase) — "QR 648" / "qr-648" -> "QR648"
            fd["flight_no"] = fd["flight_no"].strip().upper().replace(" ", "").replace("-", "")
            r["flight_detail"] = fd
            out.append(r)
    return out


def _hhmm(time_block):
    """AeroDataBox local time format e.g. '2026-09-01 14:20+03:00' -> 'HH:MM'."""
    if not time_block:
        return None
    local = time_block.get("local", "")
    try:
        return local.split(" ")[1][:5]
    except Exception:
        return None


def _parse_utc(time_block):
    """Returns a datetime for duration math, or None."""
    if not time_block:
        return None
    s = time_block.get("utc", "")
    if not s:
        return None
    s = s.replace("Z", "+00:00").replace(" ", "T", 1) if " " in s and "T" not in s else s.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(s)
    except Exception:
        return None


def check_flight(flight_no, date_str, retries=1):
    """Returns a dict of parsed schedule fields, or None if no data at all yet."""
    url = f"https://{AERODB_HOST}/flights/number/{flight_no}/{date_str}"
    results = None

    for attempt in range(retries + 1):
        req = urllib.request.Request(url)
        req.add_header("X-RapidAPI-Key", RAPIDAPI_KEY)
        req.add_header("X-RapidAPI-Host", AERODB_HOST)
        req.add_header("User-Agent", "Mozilla/5.0 (compatible; TripCompanion-FlightCheck/2.0)")
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                results = json.loads(r.read())
            break
        except urllib.error.HTTPError as e:
            body = e.read().decode()[:200]
            print(f"[AeroDataBox] {flight_no}/{date_str} -> {e.code} {body}")
            if e.code in (403, 429) and attempt < retries:
                wait = 5 if e.code == 429 else 3
                print(f"  retrying in {wait}s...")
                time.sleep(wait)
                continue
            return None
        except Exception as e:
            print(f"[AeroDataBox] {flight_no}/{date_str} -> error: {e}")
            return None

    if not results:
        print(f"[AeroDataBox] {flight_no}/{date_str} -> no schedule data yet (normal if far out)")
        return None

    if len(results) > 1:
        print(f"[AeroDataBox] {flight_no}/{date_str} -> WARNING: {len(results)} results returned, using first")

    flight = results[0]
    dep = flight.get("departure", {}) or {}
    arr = flight.get("arrival", {}) or {}

    dep_sched_block = dep.get("scheduledTime")
    dep_rev_block   = dep.get("revisedTime")
    arr_sched_block = arr.get("scheduledTime")
    arr_rev_block   = arr.get("revisedTime")

    print(f"[AeroDataBox] {flight_no}/{date_str}: "
          f"from={dep.get('airport', {}).get('iata')} to={arr.get('airport', {}).get('iata')} "
          f"dep_sched={dep_sched_block} dep_revised={dep_rev_block}")

    dep_scheduled_local = _hhmm(dep_sched_block)
    if not dep_scheduled_local:
        # No usable departure schedule at all — treat as not-yet-published.
        return None

    dep_revised_local = _hhmm(dep_rev_block)
    if dep_revised_local == dep_scheduled_local:
        dep_revised_local = None  # only report a revised time if it's actually different

    arr_scheduled_local = _hhmm(arr_sched_block)
    arr_revised_local = _hhmm(arr_rev_block)
    if arr_revised_local == arr_scheduled_local:
        arr_revised_local = None

    # Duration from whichever pair of UTC timestamps is most current
    dep_dt = _parse_utc(dep_rev_block) or _parse_utc(dep_sched_block)
    arr_dt = _parse_utc(arr_rev_block) or _parse_utc(arr_sched_block)
    duration_minutes = None
    if dep_dt and arr_dt and arr_dt > dep_dt:
        duration_minutes = int((arr_dt - dep_dt).total_seconds() // 60)

    return {
        "published": True,
        "dep_scheduled_local": dep_scheduled_local,
        "dep_revised_local":   dep_revised_local,
        "dep_terminal":        dep.get("terminal") or None,
        "dep_iata":            dep.get("airport", {}).get("iata") or None,
        "dep_airport_name":    dep.get("airport", {}).get("name") or None,
        "arr_scheduled_local": arr_scheduled_local,
        "arr_revised_local":   arr_revised_local,
        "arr_terminal":        arr.get("terminal") or None,
        "arr_iata":            arr.get("airport", {}).get("iata") or None,
        "arr_airport_name":    arr.get("airport", {}).get("name") or None,
        "duration_minutes":    duration_minutes,
    }


def main():
    now_iso = datetime.now(timezone.utc).isoformat()
    total_checked = 0

    trip_ids = get_all_trip_ids()
    for trip_id in trip_ids:
        stops = get_flight_stops(trip_id)
        print(f"\n=== Trip {trip_id}: checking {len(stops)} flight-carrying stop(s) ===")

        for i, stop in enumerate(stops):
            if total_checked > 0 or i > 0:
                time.sleep(2)  # stay under the BASIC plan's per-second rate limit
            total_checked += 1
            fd = stop["flight_detail"]
            flight_no = fd["flight_no"]
            date_str = (stop.get("itinerary_days") or {}).get("date")
            if not date_str:
                print(f"  {stop['name']}: no day date found, skipping")
                continue

            result = check_flight(flight_no, date_str)
            prev_schedule = fd.get("schedule") or {}
            schedule = {**prev_schedule, "checked": True, "last_checked_at": now_iso}
            stop_patch = {}

            if result:
                schedule.update(result)  # fresh values every run, nothing frozen
                current_dep = result["dep_revised_local"] or result["dep_scheduled_local"]
                prev_dep = prev_schedule.get("dep_revised_local") or prev_schedule.get("dep_scheduled_local")
                if result.get("dep_revised_local"):
                    print(f"  {stop['name']} ({flight_no}): {result['dep_scheduled_local']} -> "
                          f"{result['dep_revised_local']} — currently reporting a delay")
                elif current_dep != prev_dep:
                    print(f"  {stop['name']} ({flight_no}): schedule now {current_dep} (was {prev_dep or 'unset'})")
                else:
                    print(f"  {stop['name']} ({flight_no}): unchanged ({current_dep})")
                stop_patch["time"] = current_dep  # keep timeline sort order correct
            else:
                schedule["published"] = prev_schedule.get("published", False)
                print(f"  {stop['name']} ({flight_no}): no data this run "
                      f"({'kept prior verified data' if prev_schedule.get('published') else 'still unpublished'})")

            patch = {**fd, "schedule": schedule}
            sb_request("PATCH", f"stops?id=eq.{stop['id']}", {"flight_detail": patch, **stop_patch})

    print("\nDone.")


if __name__ == "__main__":
    main()
