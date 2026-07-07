'use strict';

/* ============================================================
   DATA — Platform version
   Fetches trip data from Supabase. Caches to IndexedDB for
   offline use. Falls back to cache when no internet.
   ============================================================ */

const Data = (() => {

  /* ── In-memory state ─────────────────────────────────────── */
  let CURRENT_TRIP  = null;   // current trip object
  let TRIPS         = [];     // all trips for this user
  let DAYS          = [];     // itinerary days for current trip
  let STOPS         = [];     // stops for current trip
  let OVERNIGHTS    = {};     // keyed by day_id
  let EXPENSES      = [];
  let PACKING       = [];
  let DEX_CATCHES   = {};     // keyed by animal_id
  let STAMP_CATCHES = {};     // keyed by stop_id (Pilgrim Stamps — Japan trip)
  let STAMP_PHOTO_META = {};  // keyed by photo id -> { storage_path }
  let DEX_PHOTO_META = {};    // keyed by photo id -> { storage_path }, for photos synced from other devices
  let FOOD_CATCHES    = {};   // keyed by dish_id (Thailand food tracker)
  let FOOD_PHOTO_META = {};
  let CUSTOM_LINKS  = [];
  let GLOSSARY_TERMS = {};    // keyed by term (lowercase)
  let TRAVELERS     = ['Traveler'];
  const CURRENCY_TZ = { JPY: 'JST', THB: 'ICT' }; // falls back to 'EAT' if no match

  /* ── Cache keys (IndexedDB via DB module) ────────────────── */
  const CACHE_KEYS = {
    trips:    'sb_trips',
    days:     'sb_days',
    stops:    'sb_stops',
    overnight:'sb_overnight',
    expenses: 'sb_expenses',
    packing:  'sb_packing',
    dex:      'sb_dex',
    food:     'sb_food',
    glossary: 'sb_glossary',
    links:    'sb_links',
  };

  /* ── Load all trips for the current user ─────────────────── */
  async function loadTrips() {
    try {
      // Fetch trips where user is owner OR a member
      const { data: ownedTrips, error: e1 } = await SB
        .from('trips')
        .select('*')
        .eq('owner_id', (await SB.auth.getUser()).data.user?.id)
        .order('start_date', { ascending: true });

      if (e1) throw e1;

      const { data: memberTrips, error: e2 } = await SB
        .from('trip_members')
        .select('trip_id, trips(*)')
        .eq('status', 'active');

      if (e2) throw e2;

      // Merge and deduplicate
      const memberTripRecords = (memberTrips || [])
        .map(m => m.trips)
        .filter(Boolean);

      const allTrips = [...(ownedTrips || [])];
      memberTripRecords.forEach(t => {
        if (!allTrips.find(a => a.id === t.id)) allTrips.push(t);
      });

      TRIPS = allTrips.sort((a, b) =>
        new Date(a.start_date) - new Date(b.start_date)
      );

      await DB.setMeta(CACHE_KEYS.trips, TRIPS);
      return TRIPS;
    } catch(e) {
      console.warn('[Data] loadTrips failed, using cache:', e.message);
      const cached = await DB.getMeta(CACHE_KEYS.trips);
      TRIPS = cached || [];
      return TRIPS;
    }
  }

  /* ── Load full data for a specific trip ──────────────────── */
  async function loadTripData(tripId) {
    const online = navigator.onLine;

    if (online) {
      try {
        const [
          { data: days },
          { data: stops },
          { data: overnights },
          { data: expenses },
          { data: packing },
          { data: dexCatches },
          { data: stampCatches },
          { data: links },
          { data: glossary },
          { data: foodCatches },
        ] = await Promise.all([
          SB.from('itinerary_days').select('*').eq('trip_id', tripId).order('day_index'),
          SB.from('stops').select('*').eq('trip_id', tripId).order('sort_order'),
          SB.from('overnights').select('*').eq('trip_id', tripId),
          SB.from('expenses').select('*').eq('trip_id', tripId).order('created_at'),
          SB.from('packing_items').select('*').eq('trip_id', tripId).order('sort_order'),
          SB.from('dex_catches').select('*, dex_photos(*)').eq('trip_id', tripId),
          SB.from('stamp_catches').select('*, stamp_photos(*)').eq('trip_id', tripId),
          SB.from('custom_links').select('*').eq('trip_id', tripId).order('created_at'),
          SB.from('glossary_terms').select('*').eq('trip_id', tripId),
          SB.from('food_catches').select('*, food_photos(*)').eq('trip_id', tripId),
        ]);

        DAYS       = days || [];
        STOPS      = stops || [];
        EXPENSES   = expenses || [];
        PACKING    = packing || [];
        CUSTOM_LINKS = links || [];

        // Build overnight lookup by day_id
        OVERNIGHTS = {};
        (overnights || []).forEach(o => { OVERNIGHTS[o.day_id] = o; });

        // Build dex catches lookup by animal_id
        DEX_CATCHES = {};
        DEX_PHOTO_META = {};
        (dexCatches || []).forEach(c => {
          DEX_CATCHES[c.animal_id] = {
            ...c,
            photoIds: (c.dex_photos || []).map(p => p.id),
          };
          (c.dex_photos || []).forEach(p => {
            DEX_PHOTO_META[p.id] = { storage_path: p.storage_path };
          });
        });

        // Build food catches lookup by dish_id (Thailand food tracker)
        FOOD_CATCHES = {};
        FOOD_PHOTO_META = {};
        (foodCatches || []).forEach(c => {
          FOOD_CATCHES[c.dish_id] = {
            ...c,
            photoIds: (c.food_photos || []).map(p => p.id),
          };
          (c.food_photos || []).forEach(p => {
            FOOD_PHOTO_META[p.id] = { storage_path: p.storage_path };
          });
        });

        // Build stamp catches lookup by stop_id (Pilgrim Stamps)
        STAMP_CATCHES = {};
        STAMP_PHOTO_META = {};
        (stampCatches || []).forEach(c => {
          STAMP_CATCHES[c.stop_id] = {
            ...c,
            photoIds: (c.stamp_photos || []).map(p => p.id),
          };
          (c.stamp_photos || []).forEach(p => {
            STAMP_PHOTO_META[p.id] = { storage_path: p.storage_path };
          });
        });

        // Build glossary lookup by term
        GLOSSARY_TERMS = {};
        (glossary || []).forEach(g => { GLOSSARY_TERMS[g.term.toLowerCase()] = g; });

        // Cache everything for offline
        await Promise.all([
          DB.setMeta(CACHE_KEYS.days,      DAYS),
          DB.setMeta(CACHE_KEYS.stops,     STOPS),
          DB.setMeta(CACHE_KEYS.overnight, OVERNIGHTS),
          DB.setMeta(CACHE_KEYS.expenses,  EXPENSES),
          DB.setMeta(CACHE_KEYS.packing,   PACKING),
          DB.setMeta(CACHE_KEYS.dex,       DEX_CATCHES),
          DB.setMeta(CACHE_KEYS.food,      FOOD_CATCHES),
          DB.setMeta(CACHE_KEYS.links,     CUSTOM_LINKS),
          DB.setMeta(CACHE_KEYS.glossary,  GLOSSARY_TERMS),
        ]);

        console.log('[Data] Loaded from Supabase:', DAYS.length, 'days,', STOPS.length, 'stops');
        return true;

      } catch(e) {
        console.warn('[Data] Supabase fetch failed, falling back to cache:', e.message);
        await loadFromCache();
        return false;
      }
    } else {
      await loadFromCache();
      return false;
    }
  }

  async function loadFromCache() {
    DAYS         = await DB.getMeta(CACHE_KEYS.days)     || [];
    STOPS        = await DB.getMeta(CACHE_KEYS.stops)    || [];
    OVERNIGHTS   = await DB.getMeta(CACHE_KEYS.overnight)|| {};
    EXPENSES     = await DB.getMeta(CACHE_KEYS.expenses) || [];
    PACKING      = await DB.getMeta(CACHE_KEYS.packing)  || [];
    DEX_CATCHES  = await DB.getMeta(CACHE_KEYS.dex)      || {};
    FOOD_CATCHES = await DB.getMeta(CACHE_KEYS.food)     || {};
    CUSTOM_LINKS = await DB.getMeta(CACHE_KEYS.links)    || [];
    GLOSSARY_TERMS = await DB.getMeta(CACHE_KEYS.glossary) || {};
    console.log('[Data] Loaded from cache:', DAYS.length, 'days');
  }

  /* ── Init ────────────────────────────────────────────────── */
  /* ── Per-trip colour theme ────────────────────────────────
     trip.settings.theme = { accent, accentHover, accentPressed, accentSubtle,
                              accentDark, accentDarkHover, accentDarkSubtle }
     Falls back to the default khaki theme from tokens.css when a trip has none. */
  function applyTripTheme() {
    const root = document.documentElement;
    const theme = CURRENT_TRIP?.settings?.theme;
    const props = ['--accent', '--accent-hover', '--accent-pressed', '--accent-subtle'];

    if (!theme) {
      props.forEach(p => root.style.removeProperty(p));
      return;
    }

    const isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.style.setProperty('--accent',         (isDark && theme.accentDark)        || theme.accent);
    root.style.setProperty('--accent-hover',   (isDark && theme.accentDarkHover)   || theme.accentHover || theme.accent);
    root.style.setProperty('--accent-pressed', theme.accentPressed || theme.accentHover || theme.accent);
    root.style.setProperty('--accent-subtle',  (isDark && theme.accentDarkSubtle) || theme.accentSubtle || theme.accent);
  }

  if (typeof window !== 'undefined' && window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTripTheme());
  }

  async function init(tripId) {
    if (!tripId) {
      if (CURRENT_TRIP) {
        // A trip is already active (e.g. just switched via switchTrip/createTrip) —
        // reloading must not silently discard that and reset to a default trip.
        await loadTripData(CURRENT_TRIP.id);
        applyTripTheme();
        return;
      }
      // Genuinely fresh load — load trips list, pick first active trip
      await loadTrips();
      const active = TRIPS.find(t => t.status === 'active') || TRIPS[0];
      if (!active) { console.warn('[Data] No trips found for user'); return; }
      CURRENT_TRIP = active;
    } else {
      CURRENT_TRIP = TRIPS.find(t => t.id === tripId) || null;
    }

    if (CURRENT_TRIP) {
      // Pull travelers from trip settings
      TRAVELERS = CURRENT_TRIP.settings?.travelers || ['Traveler'];
      await loadTripData(CURRENT_TRIP.id);
      applyTripTheme();
    }
  }

  /* ── Normalise a stop row from Supabase to match itinerary.js field names ── */
  function normaliseStop(s) {
    const parentDay = DAYS.find(d => d.id === s.day_id);
    return {
      ...s,
      // camelCase aliases for snake_case Supabase columns
      dayId:         s.day_id,
      segment:       parentDay?.segment || null,   // country/segment lives on the day, not the stop
      locality:      parentDay?.locality || null,  // for auto-color grouping on the map
      timeZone:      s.timezone || CURRENCY_TZ[CURRENT_TRIP?.currency] || 'EAT',
      transportType: s.transport_type || 'walk',
      needsBooking:  s.needs_booking || false,
      isBooked:      s.is_booked || false,
      flightIncluded: s.flight_detail?.included === true,
      flightExcluded: s.flight_detail?.included === false,
      trainDetail:   s.flight_detail?.trainDetail || null,
      booking: {
        status: s.is_booked ? 'booked' : 'open',
        ref:    s.flight_detail?.ref || '',
        cost:   s.flight_detail?.cost ?? null,
        deadline: s.flight_detail?.deadline || null,
      },
      // flight detail fields itinerary.js uses
      ...(s.flight_detail ? {
        airline:    s.flight_detail.airline || '',
        flightNo:   s.flight_detail.flight_no || '',
        origin:     s.flight_detail.origin || '',
        destination:s.flight_detail.destination || '',
        departTime: s.flight_detail.depart_time || s.time || '',
        arriveTime: s.flight_detail.arrive_time || '',
        originalDepartTime: s.flight_detail.original_depart_time || null,
        lastCheckedAt:      s.flight_detail.last_checked_at || null,
        isRetimed: !!(s.flight_detail.original_depart_time &&
                      s.flight_detail.depart_time &&
                      s.flight_detail.original_depart_time !== s.flight_detail.depart_time),
      } : {}),
    };
  }

  /* ── DAYS API ────────────────────────────────────────────── */
  function getDays() {
    return DAYS.map(d => ({
      ...d,
      id:       d.id,
      label:    d.day_label,
      date:     d.date,
      title:    d.title,
      locality: d.locality,
      segment:  d.segment,
      stops:    STOPS
        .filter(s => s.day_id === d.id)
        .sort((a,b) => a.sort_order - b.sort_order)
        .map(normaliseStop),
      weatherPoints: d.weather_points || [],
    }));
  }

  /* ── STOPS API ───────────────────────────────────────────── */
  function getStops()               { return STOPS.map(normaliseStop); }
  function getStopsByDay(dayId)     { return STOPS.filter(s => s.day_id === dayId).sort((a,b) => a.sort_order - b.sort_order).map(normaliseStop); }

  /* Re-sort a day's stops chronologically by `time`, reassigning sort_order.
     Stops with no time keep their relative order and sink after timed stops. */
  async function resortStopsForDay(dayId) {
    const dayStops = STOPS.filter(s => s.day_id === dayId);
    const sorted = [...dayStops].sort((a, b) => {
      const ta = a.time || '', tb = b.time || '';
      if (ta && tb) return ta.localeCompare(tb);
      if (ta && !tb) return -1;
      if (!ta && tb) return 1;
      return (a.sort_order || 0) - (b.sort_order || 0);
    });

    const updates = [];
    sorted.forEach((s, i) => {
      if (s.sort_order !== i) { s.sort_order = i; updates.push({ id: s.id, sort_order: i }); }
    });

    if (updates.length && navigator.onLine) {
      await Promise.all(updates.map(u =>
        SB.from('stops').update({ sort_order: u.sort_order }).eq('id', u.id)
      ));
    }
    await DB.setMeta(CACHE_KEYS.stops, STOPS);
  }

  async function addStop(stop) {
    const newStop = {
      trip_id:        CURRENT_TRIP.id,
      day_id:         stop.dayId,
      sort_order:     STOPS.filter(s => s.day_id === stop.dayId).length,
      name:           stop.name,
      activity:       stop.activity || '',
      time:           stop.time || '',
      timezone:       stop.timeZone || CURRENCY_TZ[CURRENT_TRIP?.currency] || 'EAT',
      transport:      stop.transport || '',
      transport_type: stop.transportType || 'walk',
      notes:          stop.notes || '',
      needs_booking:  stop.needsBooking || false,
      is_booked:      stop.booking?.status === 'booked' || false,
      category:       stop.category || null,
      flight_detail:  (stop.trainDetail || stop.flightNo || stop.booking?.ref || stop.booking?.cost || stop.booking?.deadline) ? {
        ...(stop.trainDetail ? { trainDetail: stop.trainDetail } : {}),
        ...(stop.flightNo          ? { flight_no: stop.flightNo } : {}),
        ...(stop.booking?.ref      ? { ref: stop.booking.ref } : {}),
        ...(stop.booking?.cost     != null ? { cost: stop.booking.cost } : {}),
        ...(stop.booking?.deadline ? { deadline: stop.booking.deadline } : {}),
      } : null,
    };

    if (navigator.onLine) {
      const { data, error } = await SB.from('stops').insert(newStop).select().single();
      if (error) throw error;
      STOPS.push(data);
      await resortStopsForDay(stop.dayId);
      return data;
    } else {
      // Queue for later sync
      newStop.id = 'local_' + Date.now();
      STOPS.push(newStop);
      await resortStopsForDay(stop.dayId);
      return newStop;
    }
  }

  /* Translate a camelCase UI patch into real `stops` table columns.
     Anything with no matching column (booking ref/cost/deadline, trainDetail)
     gets folded into the flight_detail jsonb bucket instead of being dropped. */
  function denormaliseStopPatch(stopId, changes) {
    const current = STOPS.find(s => s.id === stopId) || {};
    const patch = {};

    if ('name'          in changes) patch.name           = changes.name;
    if ('activity'       in changes) patch.activity       = changes.activity;
    if ('time'           in changes) patch.time           = changes.time;
    if ('timeZone'       in changes) patch.timezone       = changes.timeZone;
    if ('dayId'          in changes) patch.day_id         = changes.dayId;
    if ('transport'      in changes) patch.transport      = changes.transport;
    if ('transportType'  in changes) patch.transport_type = changes.transportType;
    if ('notes'          in changes) patch.notes          = changes.notes;
    if ('needsBooking'   in changes) patch.needs_booking  = changes.needsBooking;
    if ('category'       in changes) patch.category       = changes.category;

    if (changes.booking) {
      patch.is_booked = changes.booking.status === 'booked';
    }

    // Fold anything with no dedicated column into flight_detail (merge, don't overwrite)
    const needsFlightDetailMerge = changes.booking || ('trainDetail' in changes) || ('flightNo' in changes);
    if (needsFlightDetailMerge) {
      const merged = { ...(current.flight_detail || {}) };
      if (changes.booking) {
        if ('ref'      in changes.booking) merged.ref      = changes.booking.ref || undefined;
        if ('cost'     in changes.booking) merged.cost     = changes.booking.cost ?? undefined;
        if ('deadline' in changes.booking) merged.deadline = changes.booking.deadline || undefined;
      }
      if ('trainDetail' in changes) {
        if (changes.trainDetail) merged.trainDetail = changes.trainDetail;
        else delete merged.trainDetail;
      }
      if ('flightNo' in changes) {
        if (changes.flightNo) merged.flight_no = changes.flightNo;
        else delete merged.flight_no;
      }
      patch.flight_detail = merged;
    }

    return patch;
  }

  async function updateStop(id, changes) {
    const idx = STOPS.findIndex(s => s.id === id);
    if (idx < 0) return;

    const dbPatch = denormaliseStopPatch(id, changes);
    Object.assign(STOPS[idx], dbPatch);

    if (navigator.onLine) {
      const { error } = await SB.from('stops').update(dbPatch).eq('id', id);
      if (error) { console.error('[Data] updateStop error:', error); throw error; }
    }

    if ('time' in dbPatch || 'day_id' in dbPatch) {
      await resortStopsForDay(STOPS[idx].day_id);
    } else {
      await DB.setMeta(CACHE_KEYS.stops, STOPS);
    }
  }

  async function deleteStop(id) {
    STOPS = STOPS.filter(s => s.id !== id);
    if (navigator.onLine) {
      await SB.from('stops').delete().eq('id', id);
    }
    await DB.setMeta(CACHE_KEYS.stops, STOPS);
  }

  /* ── OVERNIGHT API ───────────────────────────────────────── */
  function getOvernight(dayId) {
    return OVERNIGHTS[dayId] || null;
  }

  /* Anything (overnight or stop) with a booking deadline within `daysAhead` days */
  function getUpcomingDeadlines(daysAhead = 14) {
    const now = Date.now();
    const cutoff = now + daysAhead * 86400000;
    const results = [];

    Object.entries(OVERNIGHTS).forEach(([dayId, o]) => {
      if (!o.deadline) return;
      const t = new Date(o.deadline).getTime();
      if (!isNaN(t) && t >= now && t <= cutoff) {
        results.push({ type: 'accommodation', name: o.name, deadline: o.deadline, dayId });
      }
    });

    STOPS.forEach(s => {
      const deadline = s.flight_detail?.deadline;
      if (!deadline) return;
      const t = new Date(deadline).getTime();
      if (!isNaN(t) && t >= now && t <= cutoff) {
        results.push({ type: 'stop', name: s.name, deadline, dayId: s.day_id });
      }
    });

    return results.sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
  }

  async function updateOvernight(dayId, changes) {
    const existing = OVERNIGHTS[dayId];

    if (existing) {
      Object.assign(existing, changes);
      if (navigator.onLine) {
        let { error } = await SB.from('overnights').update(changes).eq('id', existing.id);
        if (error && /deadline/.test(error.message || '')) {
          const { deadline, ...withoutDeadline } = changes;
          ({ error } = await SB.from('overnights').update(withoutDeadline).eq('id', existing.id));
        }
        if (error) console.error('[Data] updateOvernight error:', error);
      }
    } else {
      // No overnight row for this day yet — create one (e.g. first time
      // adding accommodation via the "+ Add overnight" button).
      const newRow = { trip_id: CURRENT_TRIP.id, day_id: dayId, ...changes };
      OVERNIGHTS[dayId] = newRow; // optimistic local state so it shows immediately
      if (navigator.onLine) {
        let { data, error } = await SB.from('overnights').insert(newRow).select().single();
        if (error && /deadline/.test(error.message || '')) {
          const { deadline, ...withoutDeadline } = newRow;
          ({ data, error } = await SB.from('overnights').insert(withoutDeadline).select().single());
        }
        if (!error && data) {
          OVERNIGHTS[dayId] = data;
        } else if (error) {
          console.error('[Data] updateOvernight (insert) error:', error);
        }
      } else {
        OVERNIGHTS[dayId].id = 'local_' + Date.now();
      }
    }

    await DB.setMeta(CACHE_KEYS.overnight, OVERNIGHTS);
  }

  async function deleteOvernight(dayId) {
    const o = OVERNIGHTS[dayId];
    if (!o) return;
    delete OVERNIGHTS[dayId];
    if (navigator.onLine && o.id) {
      const { error } = await SB.from('overnights').delete().eq('id', o.id);
      if (error) console.error('[Data] deleteOvernight error:', error);
    }
    await DB.setMeta(CACHE_KEYS.overnight, OVERNIGHTS);
  }

  /* Geocode a place name via Open-Meteo's free geocoding API (same provider
     as the weather forecasts already used — no new API key needed).
     Returns { lat, lng, label } or null if no match found. */
  async function geocodeLocality(name) {
    if (!name || !navigator.onLine) return null;
    try {
      const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=en&format=json`;
      const res = await fetch(url);
      const data = await res.json();
      const r = data?.results?.[0];
      if (!r) return null;
      return { lat: r.latitude, lng: r.longitude, label: name };
    } catch (e) {
      console.error('[Data] geocodeLocality error:', e);
      return null;
    }
  }

  /* Keep trip.start_date/end_date in sync with the actual itinerary days,
     so anything reading the trip's own date fields (sorting, fallback UI)
     never drifts from what's really in the itinerary. No-op if there are
     no days yet, or if the range hasn't actually changed. */
  async function syncTripDateRange() {
    if (!CURRENT_TRIP) return;
    const dates = DAYS.map(d => d.date).filter(Boolean).sort();
    if (!dates.length) return;
    const newStart = dates[0];
    const newEnd   = dates[dates.length - 1];
    if (CURRENT_TRIP.start_date === newStart && CURRENT_TRIP.end_date === newEnd) return;

    CURRENT_TRIP.start_date = newStart;
    CURRENT_TRIP.end_date   = newEnd;
    const t = TRIPS.find(t => t.id === CURRENT_TRIP.id);
    if (t) { t.start_date = newStart; t.end_date = newEnd; }

    if (navigator.onLine) {
      const { error } = await SB.from('trips')
        .update({ start_date: newStart, end_date: newEnd })
        .eq('id', CURRENT_TRIP.id);
      if (error) console.error('[Data] syncTripDateRange error:', error);
    }
  }

  async function updateDay(dayId, changes) {
    const day = DAYS.find(d => d.id === dayId);
    if (!day) return;
    const patch = {};
    if ('title'    in changes) patch.title    = changes.title;
    if ('locality' in changes) patch.locality = changes.locality;
    if ('segment'  in changes) patch.segment  = changes.segment;
    if ('date'     in changes) patch.date     = changes.date;

    // Locality changed — re-geocode so weather stays accurate for the new place.
    // Only when a point wasn't already set from a stop-based fallback we'd rather keep.
    if ('locality' in changes && changes.locality && changes.locality !== day.locality) {
      const point = await geocodeLocality(changes.locality);
      if (point) patch.weather_points = [point];
    }

    Object.assign(day, patch);
    if (patch.weather_points) day.weatherPoints = patch.weather_points;
    if (navigator.onLine) {
      const { error } = await SB.from('itinerary_days').update(patch).eq('id', dayId);
      if (error) { console.error('[Data] updateDay error:', error); throw error; }
    }
    await DB.setMeta(CACHE_KEYS.days, DAYS);
    if ('date' in changes) await syncTripDateRange();
  }

  async function updateStory(dayId, { title, paragraphs }) {
    const day = DAYS.find(d => d.id === dayId);
    if (!day) return;
    const patch = {
      story_title: title || null,
      story_body: paragraphs && paragraphs.length ? paragraphs : null,
    };
    Object.assign(day, patch);
    if (navigator.onLine) {
      const { error } = await SB.from('itinerary_days').update(patch).eq('id', dayId);
      if (error) { console.error('[Data] updateStory error:', error); throw error; }
    }
    await DB.setMeta(CACHE_KEYS.days, DAYS);
  }

  async function deleteStory(dayId) {
    await updateStory(dayId, { title: null, paragraphs: null });
  }

  async function getDayContents(dayId) {
    const { data, error } = await SB.rpc('get_day_contents', { p_day_id: dayId });
    if (error) { console.error('[Data] getDayContents error:', error); throw error; }
    return data;
  }

  async function addDay(_afterDayIdUnused, { date, title, locality, segment }) {
    if (!CURRENT_TRIP) throw new Error('No active trip');
    const { data: newDayId, error } = await SB.rpc('add_itinerary_day', {
      p_trip_id: CURRENT_TRIP.id,
      p_date: date || null,
      p_title: title || null,
      p_locality: locality || null,
      p_segment: segment || 'transit',
    });
    if (error) {
      if (/DATE_ALREADY_EXISTS/.test(error.message || '')) {
        throw new Error('That date is already used by another day — pick a different date.');
      }
      console.error('[Data] addDay error:', error);
      throw error;
    }

    if (locality && navigator.onLine) {
      const point = await geocodeLocality(locality);
      if (point) {
        const { error: wpError } = await SB.from('itinerary_days')
          .update({ weather_points: [point] }).eq('id', newDayId);
        if (wpError) console.error('[Data] weather_points update error:', wpError);
      }
    }

    // Renumbering can shift many rows at once — simplest correct approach
    // is to refetch, rather than try to patch every shifted day locally.
    await loadTripData(CURRENT_TRIP.id);
    await syncTripDateRange();
    return newDayId;
  }

  async function deleteDay(dayId) {
    const { error } = await SB.rpc('delete_itinerary_day', { p_day_id: dayId });
    if (error) { console.error('[Data] deleteDay error:', error); throw error; }
    await loadTripData(CURRENT_TRIP.id);
    await syncTripDateRange();
  }

  /* ── VISITED COUNTRIES (personal showcase, not trip-scoped) ── */
  let VISITED_COUNTRIES = null; // lazy-loaded, cached after first fetch

  async function getVisitedCountries() {
    if (VISITED_COUNTRIES) return VISITED_COUNTRIES;
    if (!navigator.onLine) {
      VISITED_COUNTRIES = await DB.getMeta('sb_visited_countries') || [];
      return VISITED_COUNTRIES;
    }
    const { data, error } = await SB.from('visited_countries').select('country_code');
    if (error) { console.error('[Data] getVisitedCountries error:', error); return []; }
    VISITED_COUNTRIES = (data || []).map(r => r.country_code);

    // First-ever visit: auto-suggest from this account's trip countries.
    // Only runs once — if there's already any row, never auto-seed again.
    if (VISITED_COUNTRIES.length === 0 && TRIPS.length) {
      const tripCountryNames = [...new Set(TRIPS.flatMap(t => t.countries || []))];
      if (tripCountryNames.length) {
        try {
          const res = await fetch('data/world-countries.geojson');
          const geo = await res.json();
          const nameToCode = {};
          geo.features.forEach(f => {
            if (f.properties.iso2) nameToCode[f.properties.name.toLowerCase()] = f.properties.iso2;
          });
          const suggestedCodes = tripCountryNames
            .map(n => nameToCode[n.toLowerCase()])
            .filter(Boolean);
          if (suggestedCodes.length) {
            const user = (await SB.auth.getUser()).data.user;
            for (const code of suggestedCodes) {
              await SB.from('visited_countries').insert({ country_code: code, user_id: user?.id }).select();
            }
            VISITED_COUNTRIES = suggestedCodes;
          }
        } catch (e) { console.error('[Data] country auto-suggest failed:', e); }
      }
    }

    await DB.setMeta('sb_visited_countries', VISITED_COUNTRIES);
    return VISITED_COUNTRIES;
  }

  async function toggleVisitedCountry(code) {
    const list = await getVisitedCountries();
    const isVisited = list.includes(code);
    if (isVisited) {
      VISITED_COUNTRIES = list.filter(c => c !== code);
      if (navigator.onLine) {
        const user = (await SB.auth.getUser()).data.user;
        await SB.from('visited_countries').delete().eq('country_code', code).eq('user_id', user?.id);
      }
    } else {
      VISITED_COUNTRIES = [...list, code];
      if (navigator.onLine) {
        const user = (await SB.auth.getUser()).data.user;
        const { error } = await SB.from('visited_countries').insert({ country_code: code, user_id: user?.id });
        if (error) {
          console.error('[Data] toggleVisitedCountry insert error:', error);
          throw error;
        }
      }
    }
    await DB.setMeta('sb_visited_countries', VISITED_COUNTRIES);
    return VISITED_COUNTRIES;
  }

  /* ── EXPENSES API ────────────────────────────────────────── */
  function normaliseExpense(e) {
    return {
      ...e,
      dayId:        e.day_id || null,
      amountJPY:    e.amount_usd || 0,   // field name kept for UI compat (stores USD)
      paidBy:       e.paid_by || '',
      splitBetween: e.split_between || [],
      createdAt:    e.created_at || null,
    };
  }
  function getExpenses()      { return EXPENSES.map(normaliseExpense); }
  function getTotalSpentJPY() { return EXPENSES.reduce((s,e) => s + (e.amount_usd || 0), 0); }
  function getTravelers()     { return TRAVELERS; }
  function getTripName()      { return CURRENT_TRIP?.name || 'Trip Companion'; }

  /* Net balance per traveler: positive = is owed money, negative = owes money */
  function getBalances() {
    const travelers = TRAVELERS.length ? TRAVELERS : ['Traveler'];
    const balances = {};
    travelers.forEach(t => balances[t] = 0);
    getExpenses().forEach(exp => {
      if (!exp.paidBy || !exp.splitBetween?.length) return;
      const validSplit = exp.splitBetween.filter(n => balances[n] !== undefined);
      if (!validSplit.length) return;
      const share = exp.amountJPY / validSplit.length;
      if (balances[exp.paidBy] !== undefined) balances[exp.paidBy] += exp.amountJPY;
      validSplit.forEach(name => { balances[name] -= share; });
    });
    return balances;
  }
  function calcSettlement() { return getBalances(); }

  async function addExpense(exp) {
    const newExp = {
      trip_id:       CURRENT_TRIP.id,
      day_id:        exp.dayId || null,
      description:   exp.description || exp.desc || '',
      amount_usd:    exp.amountJPY || exp.amount_usd || 0,
      category:      exp.category || null,
      paid_by:       exp.paidBy || null,
      split_between: exp.splitBetween || [],
      day_label:     exp.dayLabel || DAYS.find(d => d.id === exp.dayId)?.day_label || null,
      created_by:    (await SB.auth.getUser()).data.user?.id,
    };

    EXPENSES.push({ ...newExp, id: 'local_' + Date.now() });

    if (navigator.onLine) {
      let { data, error } = await SB.from('expenses').insert(newExp).select().single();
      if (error && /day_id/.test(error.message || '')) {
        // Schema patch not run yet — retry without day_id, day_label still carries the day
        const { day_id, ...withoutDayId } = newExp;
        ({ data, error } = await SB.from('expenses').insert(withoutDayId).select().single());
      }
      if (!error && data) {
        // Replace local entry with real one
        EXPENSES = EXPENSES.filter(e => !e.id.startsWith('local_'));
        EXPENSES.push(data);
      } else if (error) {
        console.error('[Data] addExpense error:', error);
      }
    }
    await DB.setMeta(CACHE_KEYS.expenses, EXPENSES);
    return newExp;
  }

  async function updateExpense(id, changes) {
    const idx = EXPENSES.findIndex(e => e.id === id);
    if (idx < 0) return;
    const patch = {};
    if ('description'   in changes) patch.description   = changes.description;
    if ('amountJPY'     in changes) patch.amount_usd     = changes.amountJPY;
    if ('category'      in changes) patch.category       = changes.category;
    if ('paidBy'        in changes) patch.paid_by        = changes.paidBy;
    if ('splitBetween'  in changes) patch.split_between  = changes.splitBetween;
    if ('dayId'         in changes) {
      patch.day_id    = changes.dayId || null;
      patch.day_label = DAYS.find(d => d.id === changes.dayId)?.day_label || null;
    }
    Object.assign(EXPENSES[idx], patch);
    if (navigator.onLine) {
      const { error } = await SB.from('expenses').update(patch).eq('id', id);
      if (error) console.error('[Data] updateExpense error:', error);
    }
    await DB.setMeta(CACHE_KEYS.expenses, EXPENSES);
  }

  async function deleteExpense(id) {
    EXPENSES = EXPENSES.filter(e => e.id !== id);
    if (navigator.onLine) {
      await SB.from('expenses').delete().eq('id', id);
    }
    await DB.setMeta(CACHE_KEYS.expenses, EXPENSES);
  }

  /* ── PACKING API ─────────────────────────────────────────── */
  function getPackingItems()        { return PACKING; }
  function getPackingByCategory()   {
    const grouped = PACKING.reduce((acc, item) => {
      if (!acc[item.category]) acc[item.category] = [];
      acc[item.category].push(item);
      return acc;
    }, {});
    // Pin priority categories to the top regardless of item order
    const PRIORITY_CATEGORIES = ['Entry & Health'];
    const ordered = {};
    PRIORITY_CATEGORIES.forEach(cat => {
      if (grouped[cat]) { ordered[cat] = grouped[cat]; delete grouped[cat]; }
    });
    Object.assign(ordered, grouped);
    return ordered;
  }

  async function togglePacking(id, checked) {
    const item = PACKING.find(p => p.id === id);
    if (item) item.checked = checked;
    if (navigator.onLine) {
      await SB.from('packing_items').update({ checked }).eq('id', id);
    }
    await DB.setMeta(CACHE_KEYS.packing, PACKING);
  }

  async function addPackingItem({ cat, item, essential = false }) {
    const newItem = {
      trip_id:   CURRENT_TRIP.id,
      category:  cat,
      item,
      essential,
      checked:   false,
      sort_order: PACKING.filter(p => p.category === cat).length,
    };
    PACKING.push({ ...newItem, id: 'local_' + Date.now() });

    if (navigator.onLine) {
      const { data, error } = await SB.from('packing_items').insert(newItem).select().single();
      if (!error && data) {
        PACKING = PACKING.filter(p => !p.id.startsWith('local_'));
        PACKING.push(data);
      }
    }
    await DB.setMeta(CACHE_KEYS.packing, PACKING);
  }

  async function updatePackingItem(id, changes) {
    const item = PACKING.find(p => p.id === id);
    if (!item) return;
    const patch = {};
    if ('item'      in changes) patch.item      = changes.item;
    if ('category'  in changes) patch.category  = changes.category;
    if ('essential' in changes) patch.essential = changes.essential;
    Object.assign(item, patch);
    if (navigator.onLine) {
      const { error } = await SB.from('packing_items').update(patch).eq('id', id);
      if (error) console.error('[Data] updatePackingItem error:', error);
    }
    await DB.setMeta(CACHE_KEYS.packing, PACKING);
  }

  async function deletePacking(id) {
    PACKING = PACKING.filter(p => p.id !== id);
    if (navigator.onLine) {
      await SB.from('packing_items').delete().eq('id', id);
    }
    await DB.setMeta(CACHE_KEYS.packing, PACKING);
  }

  /* ── DEX API ─────────────────────────────────────────────── */
  // ANIMALS list stays in code (not personal data)
  const ANIMALS = [
    {id:'lion',      name:'Lion',             tier:'common',    emoji:'🦁', big5:true,  fact:'Only cats that live in social prides. Males roar to mark territory up to 8km away.'},
    {id:'elephant',  name:'African Elephant', tier:'common',    emoji:'🐘', big5:true,  fact:'Largest land mammal. Can detect water sources up to 19km away by smell.'},
    {id:'buffalo',   name:'Cape Buffalo',     tier:'common',    emoji:'🐃', big5:true,  fact:'Considered the most dangerous of the Big Five — unpredictable and powerful.'},
    {id:'leopard',   name:'Leopard',          tier:'rare',      emoji:'🐆', big5:true,  fact:'Solitary and mostly nocturnal. Can drag prey twice its body weight up a tree.'},
    {id:'rhino',     name:'Black Rhino',      tier:'legendary', emoji:'🦏', big5:true,  fact:'Critically endangered — fewer than 6,500 left in the wild today.'},
    {id:'zebra',     name:'Zebra',            tier:'common',    emoji:'🦓', big5:false, fact:'Every zebra\'s stripe pattern is unique — like a fingerprint.'},
    {id:'giraffe',   name:'Giraffe',          tier:'common',    emoji:'🦒', big5:false, fact:'Tallest land animal. Its heart weighs about 11kg to pump blood up that neck.'},
    {id:'wildebeest',name:'Wildebeest',       tier:'common',    emoji:'🐂', big5:false, fact:'Stars of the Great Migration — over 1.5 million cross the Serengeti-Mara yearly.'},
    {id:'hippo',     name:'Hippopotamus',     tier:'common',    emoji:'🦛', big5:false, fact:'Kill more people in Africa each year than lions, despite being herbivores.'},
    {id:'impala',    name:'Impala',           tier:'common',    emoji:'🦌', big5:false, fact:'Can leap up to 3m high and 10m in a single bound to escape predators.'},
    {id:'baboon',    name:'Baboon',           tier:'common',    emoji:'🐒', big5:false, fact:'Live in troops of up to 150, with a strict social hierarchy.'},
    {id:'warthog',   name:'Warthog',          tier:'common',    emoji:'🐗', big5:false, fact:'Often share burrows with other warthogs — and sometimes mongooses too.'},
    {id:'cheetah',   name:'Cheetah',          tier:'rare',      emoji:'🐆', big5:false, fact:'Fastest land animal — 0 to 100km/h in about 3 seconds.'},
    {id:'hyena',     name:'Spotted Hyena',    tier:'rare',      emoji:'🐕', big5:false, fact:'Far better hunters than scavengers — they kill most of their own food.'},
    {id:'crocodile', name:'Nile Crocodile',   tier:'rare',      emoji:'🐊', big5:false, fact:'Ambush predators in the Mara River during wildebeest crossings.'},
    {id:'ostrich',   name:'Ostrich',          tier:'rare',      emoji:'🦤', big5:false, fact:'Largest living bird. Can run at 70km/h — faster than most predators.'},
    {id:'flamingo',  name:'Flamingo',         tier:'rare',      emoji:'🦩', big5:false, fact:'Their pink colour comes entirely from the algae and shrimp they eat.'},
    {id:'serval',    name:'Serval',           tier:'rare',      emoji:'🐈', big5:false, fact:'Has the largest ears relative to body size of any cat — incredible hearing.'},
    {id:'gorilla',   name:'Mountain Gorilla', tier:'legendary', emoji:'🦍', big5:false, fact:'Fewer than 1,100 left in the wild — Bwindi is home to nearly half of them.'},
    {id:'aardvark',  name:'Aardvark',         tier:'legendary', emoji:'🐾', big5:false, fact:'Nocturnal and rarely seen — most safari guides go years without a sighting.'},
  ];

  function getAnimals()   { return ANIMALS; }
  function getAnimal(id)  { return ANIMALS.find(a => a.id === id); }
  function getDexState()  { return DEX_CATCHES; }
  function isCaught(id)   { return !!DEX_CATCHES[id]; }

  function getDexProgress() {
    const caught     = ANIMALS.filter(a => DEX_CATCHES[a.id]);
    const big5       = ANIMALS.filter(a => a.big5);
    const big5Caught = big5.filter(a => DEX_CATCHES[a.id]);
    return {
      total: ANIMALS.length, caught: caught.length,
      big5Total: big5.length, big5Caught: big5Caught.length,
      big5Complete: big5Caught.length === big5.length,
    };
  }

  async function markCaught(animalId, { note = '', dayId = null } = {}) {
    const entry = {
      trip_id:  CURRENT_TRIP.id,
      animal_id: animalId,
      note,
      day_label: dayId,
    };

    DEX_CATCHES[animalId] = { ...entry, photoIds: [], caught_at: new Date().toISOString() };

    if (navigator.onLine) {
      const user = (await SB.auth.getUser()).data.user;
      const { data, error } = await SB.from('dex_catches')
        .insert({ ...entry, user_id: user?.id })
        .select().single();
      if (!error && data) {
        DEX_CATCHES[animalId] = { ...data, photoIds: [] };
      }
    }
    await DB.setMeta(CACHE_KEYS.dex, DEX_CATCHES);
    return DEX_CATCHES[animalId];
  }

  async function unmarkCaught(animalId) {
    const catchId = DEX_CATCHES[animalId]?.id;
    delete DEX_CATCHES[animalId];
    if (navigator.onLine && catchId) {
      await SB.from('dex_catches').delete().eq('id', catchId);
    }
    await DB.setMeta(CACHE_KEYS.dex, DEX_CATCHES);
  }

  async function addDexPhoto(animalId, fileDataUrl) {
    if (!DEX_CATCHES[animalId]) await markCaught(animalId, {});
    const photoId = 'ph_' + Date.now();

    // Save locally first — always works offline, and is the fast-path source
    // for photos taken on this device.
    await DB.saveDexPhoto(photoId, fileDataUrl);
    if (!DEX_CATCHES[animalId].photoIds) DEX_CATCHES[animalId].photoIds = [];
    DEX_CATCHES[animalId].photoIds.push(photoId);
    await DB.setMeta(CACHE_KEYS.dex, DEX_CATCHES);

    // Sync to Supabase Storage so other devices can see it too.
    // Photo arrives here already compressed (see dex.js compressImage()).
    if (navigator.onLine && CURRENT_TRIP) {
      try {
        const blob = await (await fetch(fileDataUrl)).blob();
        const storagePath = `${CURRENT_TRIP.id}/${photoId}.jpg`;
        const { error: upErr } = await SB.storage.from('dex-photos')
          .upload(storagePath, blob, { contentType: 'image/jpeg', upsert: true });
        if (!upErr) {
          const catchId = DEX_CATCHES[animalId].id;
          await SB.from('dex_photos').insert({
            trip_id: CURRENT_TRIP.id,
            catch_id: catchId,
            animal_id: animalId,
            storage_path: storagePath,
          });
          DEX_PHOTO_META[photoId] = { storage_path: storagePath };
        } else {
          console.error('[Data] dex photo upload error:', upErr);
        }
      } catch (e) {
        console.error('[Data] dex photo sync error:', e);
      }
    }

    return photoId;
  }

  async function removeDexPhoto(animalId, photoId) {
    if (!DEX_CATCHES[animalId]) return;
    DEX_CATCHES[animalId].photoIds = (DEX_CATCHES[animalId].photoIds || []).filter(id => id !== photoId);
    await DB.deleteDexPhoto(photoId);
    await DB.setMeta(CACHE_KEYS.dex, DEX_CATCHES);

    const storagePath = DEX_PHOTO_META[photoId]?.storage_path;
    if (navigator.onLine && storagePath) {
      await SB.storage.from('dex-photos').remove([storagePath]);
      await SB.from('dex_photos').delete().eq('storage_path', storagePath);
      delete DEX_PHOTO_META[photoId];
    }
  }

  async function getDexPhoto(photoId) {
    // Fast path: this device has it locally (either taken here, or already synced down)
    const local = await DB.loadDexPhoto(photoId);
    if (local) return local;

    // Fallback: synced from another device — fetch via a signed URL from Storage
    const storagePath = DEX_PHOTO_META[photoId]?.storage_path;
    if (storagePath && navigator.onLine) {
      const { data, error } = await SB.storage.from('dex-photos').createSignedUrl(storagePath, 3600);
      if (!error && data?.signedUrl) return data.signedUrl;
    }
    return null;
  }

  /* ── FOOD API (Thailand dish tracker) ───────────────────────
     Same shape as Dex — a static catalog of dishes to look out for,
     tracked against a Supabase table, with optional photos per catch. */
  const DISHES = [
    {id:'pad_thai',      name:'Pad Thai',            tier:'common',    emoji:'🍜', star:true,  fact:'Stir-fried rice noodles with tamarind, fish sauce, egg and peanuts — became Thailand\'s national dish after a 1930s government campaign.'},
    {id:'tom_yum_goong', name:'Tom Yum Goong',       tier:'common',    emoji:'🍲', star:true,  fact:'Hot-and-sour prawn soup with lemongrass, galangal, kaffir lime leaf and chilli — one of the most iconic flavours of Thai cooking.'},
    {id:'green_curry',   name:'Green Curry (Gaeng Keow Wan)', tier:'common', emoji:'🍛', star:true, fact:'Named for the color of its curry paste — fresh green chillies, not age, give it the heat and hue.'},
    {id:'mango_rice',    name:'Mango Sticky Rice',   tier:'common',    emoji:'🥭', star:true,  fact:'Sweet coconut-milk sticky rice paired with ripe mango — best from March to June, peak mango season.'},
    {id:'som_tam',       name:'Som Tam (Papaya Salad)', tier:'common', emoji:'🥗', star:true,  fact:'Pounded green papaya, chilli, lime and fish sauce — originated in Thailand\'s northeastern Isaan region.'},
    {id:'massaman',      name:'Massaman Curry',      tier:'rare',      emoji:'🍖', star:false, fact:'A rich, mild curry with Persian and Indian roots via old trade routes — often called one of the world\'s best dishes.'},
    {id:'khao_soi',      name:'Khao Soi',            tier:'rare',      emoji:'🍥', star:false, fact:'A Northern Thai curry noodle soup topped with crispy noodles — a Chiang Mai specialty.'},
    {id:'satay',         name:'Moo/Gai Satay',       tier:'common',    emoji:'🍢', star:false, fact:'Grilled skewered pork or chicken with peanut sauce — a classic street-food staple.'},
    {id:'pad_krapow',    name:'Pad Kra Pao',         tier:'common',    emoji:'🌶️', star:false, fact:'Stir-fried holy basil with minced meat and chilli, usually topped with a fried egg — Thailand\'s everyday lunch order.'},
    {id:'boat_noodles',  name:'Boat Noodles',        tier:'rare',      emoji:'🍜', star:false, fact:'Originally sold from boats along Bangkok\'s canals — intensely flavoured broth traditionally served in small bowls so you order many rounds.'},
    {id:'mango_sticky_durian', name:'Durian',        tier:'legendary', emoji:'🟡', star:false, fact:'The "king of fruits" — banned from many hotels and public transport in Thailand because of its intense smell.'},
    {id:'thai_iced_tea', name:'Thai Iced Tea (Cha Yen)', tier:'common', emoji:'🧋', star:false, fact:'Strongly brewed black tea with condensed milk, colored with orange food dye — a street-stall staple.'},
    {id:'khanom_krok',   name:'Khanom Krok',         tier:'rare',      emoji:'🥥', star:false, fact:'Bite-size coconut-rice pancakes cooked in a special cast-iron mold — crispy edges, creamy center.'},
    {id:'larb',          name:'Larb',                tier:'rare',      emoji:'🥬', star:false, fact:'A minced-meat salad with roasted rice powder, lime and herbs — another Isaan classic, often fiery hot.'},
    {id:'roti_thai',     name:'Roti (Sweet)',        tier:'common',    emoji:'🥞', star:false, fact:'Crispy pan-fried flatbread folded around banana and condensed milk — a beloved night-market dessert.'},
    {id:'sticky_bbq',    name:'Moo Ping (Grilled Pork Skewers)', tier:'common', emoji:'🍡', star:false, fact:'Marinated grilled pork skewers sold from carts everywhere — the smell alone will pull you off the street.'},
    {id:'crab_curry',    name:'Poo Pad Pong Curry',  tier:'legendary', emoji:'🦀', star:false, fact:'Stir-fried crab in a golden curry-egg sauce — invented in Bangkok in the 1950s and now a special-occasion classic.'},
    {id:'mangosteen',    name:'Mangosteen',          tier:'rare',      emoji:'🟣', star:false, fact:'Called the "queen of fruits" — its sweet-tart white flesh is often eaten to balance out durian\'s intensity.'},
  ];

  function getDishes()      { return DISHES; }
  function getDish(id)      { return DISHES.find(d => d.id === id); }
  function getFoodState()   { return FOOD_CATCHES; }
  function isDishCaught(id) { return !!FOOD_CATCHES[id]; }

  function getFoodProgress() {
    const caught     = DISHES.filter(d => FOOD_CATCHES[d.id]);
    const starred    = DISHES.filter(d => d.star);
    const starCaught = starred.filter(d => FOOD_CATCHES[d.id]);
    return {
      total: DISHES.length, caught: caught.length,
      starTotal: starred.length, starCaught: starCaught.length,
      starComplete: starCaught.length === starred.length,
    };
  }

  async function markDishCaught(dishId, { note = '', dayId = null } = {}) {
    const entry = {
      trip_id: CURRENT_TRIP.id,
      dish_id: dishId,
      note,
      day_label: dayId,
    };

    FOOD_CATCHES[dishId] = { ...entry, photoIds: [], caught_at: new Date().toISOString() };

    if (navigator.onLine) {
      const user = (await SB.auth.getUser()).data.user;
      const { data, error } = await SB.from('food_catches')
        .insert({ ...entry, user_id: user?.id })
        .select().single();
      if (!error && data) {
        FOOD_CATCHES[dishId] = { ...data, photoIds: [] };
      }
    }
    await DB.setMeta(CACHE_KEYS.food, FOOD_CATCHES);
    return FOOD_CATCHES[dishId];
  }

  async function unmarkDishCaught(dishId) {
    const catchId = FOOD_CATCHES[dishId]?.id;
    delete FOOD_CATCHES[dishId];
    if (navigator.onLine && catchId) {
      await SB.from('food_catches').delete().eq('id', catchId);
    }
    await DB.setMeta(CACHE_KEYS.food, FOOD_CATCHES);
  }

  async function addFoodPhoto(dishId, fileDataUrl) {
    if (!FOOD_CATCHES[dishId]) await markDishCaught(dishId, {});
    const photoId = 'food_ph_' + Date.now();

    await DB.saveDexPhoto(photoId, fileDataUrl); // shared local photo store, distinct id prefix avoids collisions
    if (!FOOD_CATCHES[dishId].photoIds) FOOD_CATCHES[dishId].photoIds = [];
    FOOD_CATCHES[dishId].photoIds.push(photoId);
    await DB.setMeta(CACHE_KEYS.food, FOOD_CATCHES);

    if (navigator.onLine && CURRENT_TRIP) {
      try {
        const blob = await (await fetch(fileDataUrl)).blob();
        const storagePath = `${CURRENT_TRIP.id}/${photoId}.jpg`;
        const { error: upErr } = await SB.storage.from('food-photos')
          .upload(storagePath, blob, { contentType: 'image/jpeg', upsert: true });
        if (!upErr) {
          const catchId = FOOD_CATCHES[dishId].id;
          await SB.from('food_photos').insert({
            trip_id: CURRENT_TRIP.id,
            catch_id: catchId,
            dish_id: dishId,
            storage_path: storagePath,
          });
          FOOD_PHOTO_META[photoId] = { storage_path: storagePath };
        } else {
          console.error('[Data] food photo upload error:', upErr);
        }
      } catch (e) {
        console.error('[Data] food photo sync error:', e);
      }
    }

    return photoId;
  }

  async function removeFoodPhoto(dishId, photoId) {
    if (!FOOD_CATCHES[dishId]) return;
    FOOD_CATCHES[dishId].photoIds = (FOOD_CATCHES[dishId].photoIds || []).filter(id => id !== photoId);
    await DB.deleteDexPhoto(photoId);
    await DB.setMeta(CACHE_KEYS.food, FOOD_CATCHES);

    const storagePath = FOOD_PHOTO_META[photoId]?.storage_path;
    if (navigator.onLine && storagePath) {
      await SB.storage.from('food-photos').remove([storagePath]);
      await SB.from('food_photos').delete().eq('storage_path', storagePath);
      delete FOOD_PHOTO_META[photoId];
    }
  }

  async function getFoodPhoto(photoId) {
    const local = await DB.loadDexPhoto(photoId);
    if (local) return local;

    const storagePath = FOOD_PHOTO_META[photoId]?.storage_path;
    if (storagePath && navigator.onLine) {
      const { data, error } = await SB.storage.from('food-photos').createSignedUrl(storagePath, 3600);
      if (!error && data?.signedUrl) return data.signedUrl;
    }
    return null;
  }

  /* ── PILGRIM STAMPS API (Japan trip — mirrors Dex exactly) ── */
  function getStampStops() {
    return STOPS
      .filter(s => s.flight_detail?.stamp?.has)
      .map(s => ({
        id: s.id,
        name: s.name,
        kanji: s.flight_detail.stamp.kanji || '',
        isSanzan: !!s.flight_detail.stamp.isSanzan,
        dayId: s.day_id,
        sortOrder: s.sort_order || 0,
      }))
      .sort((a, b) => {
        const dayA = DAYS.findIndex(d => d.id === a.dayId);
        const dayB = DAYS.findIndex(d => d.id === b.dayId);
        if (dayA !== dayB) return dayA - dayB;
        return a.sortOrder - b.sortOrder;
      });
  }

  function getStampState() { return STAMP_CATCHES; }
  function isStampCollected(stopId) { return !!STAMP_CATCHES[stopId]; }

  function getStampProgress() {
    const all = getStampStops();
    const sanzan = all.filter(s => s.isSanzan);
    return {
      collected:       Object.keys(STAMP_CATCHES).length,
      total:           all.length,
      sanzanCollected: sanzan.filter(s => isStampCollected(s.id)).length,
      sanzanTotal:     sanzan.length,
      sanzanComplete:  sanzan.length > 0 && sanzan.every(s => isStampCollected(s.id)),
    };
  }

  async function markStampCollected(stopId) {
    const user = (await SB.auth.getUser()).data.user;
    const entry = { trip_id: CURRENT_TRIP?.id, user_id: user?.id, stop_id: stopId };
    STAMP_CATCHES[stopId] = { ...entry, photoIds: [], caught_at: new Date().toISOString() };
    if (navigator.onLine) {
      const { data, error } = await SB.from('stamp_catches').insert(entry).select().single();
      if (!error && data) STAMP_CATCHES[stopId] = { ...data, photoIds: [] };
      else if (error) console.error('[Data] markStampCollected error:', error);
    }
    await DB.setMeta('sb_stamp_catches', STAMP_CATCHES);
    return STAMP_CATCHES[stopId];
  }

  async function unmarkStampCollected(stopId) {
    const catchId = STAMP_CATCHES[stopId]?.id;
    delete STAMP_CATCHES[stopId];
    if (navigator.onLine && catchId) {
      await SB.from('stamp_catches').delete().eq('id', catchId);
    }
    await DB.setMeta('sb_stamp_catches', STAMP_CATCHES);
  }

  async function addStampPhoto(stopId, fileDataUrl) {
    if (!STAMP_CATCHES[stopId]) await markStampCollected(stopId);
    const photoId = 'ph_' + Date.now();

    // Save locally first — always works offline, and is the fast-path source
    await DB.saveDexPhoto(photoId, fileDataUrl); // shared generic photo-blob storage helper
    if (!STAMP_CATCHES[stopId].photoIds) STAMP_CATCHES[stopId].photoIds = [];
    STAMP_CATCHES[stopId].photoIds.push(photoId);
    await DB.setMeta('sb_stamp_catches', STAMP_CATCHES);

    if (navigator.onLine && CURRENT_TRIP) {
      try {
        const blob = await (await fetch(fileDataUrl)).blob();
        const storagePath = `${CURRENT_TRIP.id}/${photoId}.jpg`;
        const { error: upErr } = await SB.storage.from('stamp-photos')
          .upload(storagePath, blob, { contentType: 'image/jpeg', upsert: true });
        if (!upErr) {
          const catchId = STAMP_CATCHES[stopId].id;
          await SB.from('stamp_photos').insert({
            trip_id: CURRENT_TRIP.id,
            catch_id: catchId,
            stop_id: stopId,
            storage_path: storagePath,
          });
          STAMP_PHOTO_META[photoId] = { storage_path: storagePath };
        } else {
          console.error('[Data] stamp photo upload error:', upErr);
        }
      } catch (e) {
        console.error('[Data] stamp photo sync error:', e);
      }
    }
    return photoId;
  }

  async function removeStampPhoto(stopId, photoId) {
    if (!STAMP_CATCHES[stopId]) return;
    STAMP_CATCHES[stopId].photoIds = (STAMP_CATCHES[stopId].photoIds || []).filter(id => id !== photoId);
    await DB.deleteDexPhoto(photoId);
    await DB.setMeta('sb_stamp_catches', STAMP_CATCHES);

    const storagePath = STAMP_PHOTO_META[photoId]?.storage_path;
    if (navigator.onLine && storagePath) {
      await SB.storage.from('stamp-photos').remove([storagePath]);
      await SB.from('stamp_photos').delete().eq('storage_path', storagePath);
      delete STAMP_PHOTO_META[photoId];
    }
  }

  async function getStampPhoto(photoId) {
    const local = await DB.loadDexPhoto(photoId);
    if (local) return local;

    const storagePath = STAMP_PHOTO_META[photoId]?.storage_path;
    if (storagePath && navigator.onLine) {
      const { data, error } = await SB.storage.from('stamp-photos').createSignedUrl(storagePath, 3600);
      if (!error && data?.signedUrl) return data.signedUrl;
    }
    return null;
  }

  /* ── STORY API ───────────────────────────────────────────── */
  function hasStory(dayId) {
    const day = DAYS.find(d => d.id === dayId);
    return !!(day?.story_title && day?.story_body);
  }

  function getStory(dayId) {
    const day = DAYS.find(d => d.id === dayId);
    if (!day?.story_title) return null;
    return {
      title: day.story_title,
      paragraphs: Array.isArray(day.story_body) ? day.story_body : [],
    };
  }

  /* ── GLOSSARY API ────────────────────────────────────────── */
  function getGlossary(term) {
    return GLOSSARY_TERMS[term?.toLowerCase()] || null;
  }

  /* ── CUSTOM LINKS API ────────────────────────────────────── */
  function getCustomLinks() {
    return CUSTOM_LINKS.map(l => ({ ...l, dayId: l.day_id || null, section: l.section || null }));
  }

  async function addCustomLink({ title, url, dayId, section }) {
    const newLink = {
      trip_id:    CURRENT_TRIP.id,
      title,
      url,
      day_id:     dayId || null,
      section:    section || null,
    };
    CUSTOM_LINKS.push({ ...newLink, id: 'local_' + Date.now() });
    if (navigator.onLine) {
      const user = (await SB.auth.getUser()).data.user;
      let payload = { ...newLink, created_by: user?.id };
      let { data, error } = await SB.from('custom_links').insert(payload).select().single();
      // Retry without newer columns if the schema patch hasn't been run yet
      while (error && /(day_id|section)/.test(error.message || '')) {
        const missing = /day_id/.test(error.message) ? 'day_id' : 'section';
        const { [missing]: _, ...rest } = payload;
        payload = rest;
        ({ data, error } = await SB.from('custom_links').insert(payload).select().single());
      }
      if (!error && data) {
        CUSTOM_LINKS = CUSTOM_LINKS.filter(l => !l.id.startsWith('local_'));
        CUSTOM_LINKS.push(data);
      } else if (error) {
        console.error('[Data] addCustomLink error:', error);
      }
    }
    await DB.setMeta(CACHE_KEYS.links, CUSTOM_LINKS);
  }

  async function updateCustomLink(id, { title, url, dayId, section }) {
    const idx = CUSTOM_LINKS.findIndex(l => l.id === id);
    if (idx < 0) return;
    const patch = {};
    if (title   !== undefined) patch.title   = title;
    if (url     !== undefined) patch.url     = url;
    if (dayId   !== undefined) patch.day_id  = dayId || null;
    if (section !== undefined) patch.section = section || null;
    Object.assign(CUSTOM_LINKS[idx], patch);
    if (navigator.onLine) {
      const { error } = await SB.from('custom_links').update(patch).eq('id', id);
      if (error) console.error('[Data] updateCustomLink error:', error);
    }
    await DB.setMeta(CACHE_KEYS.links, CUSTOM_LINKS);
  }

  async function deleteCustomLink(id) {
    CUSTOM_LINKS = CUSTOM_LINKS.filter(l => l.id !== id);
    if (navigator.onLine) await SB.from('custom_links').delete().eq('id', id);
    await DB.setMeta(CACHE_KEYS.links, CUSTOM_LINKS);
  }

  /* ── JR PASS LEGS API ─────────────────────────────────────
     JR Pass legs are NOT a separate table — they're derived directly from
     itinerary stops. Any stop with transportType 'train' and trainDetail.seatReservation
     === true automatically shows up here. Editing/adding a leg just means editing
     the stop itself (via the normal stop edit sheet) — no separate data entry. */
  function getJrPassLegs() {
    return STOPS
      .filter(s => s.transport_type === 'train' && s.flight_detail?.trainDetail?.seatReservation === true)
      .map(s => {
        const td = s.flight_detail.trainDetail;
        return {
          stopId:       s.id,
          dayId:        s.day_id,
          sortOrder:    s.sort_order || 0,
          fromStation:  td.origin || '',
          toStation:    td.destination || '',
          trainName:    s.transport || '',
          trainNo:      td.trainNumber || '',
          departTime:   s.time || '',
          arriveTime:   td.arriveTime || '',
          duration:     td.duration || '',
          jrPass:       td.jrPass !== false,
        };
      })
      .sort((a, b) => {
        const dayA = DAYS.findIndex(d => d.id === a.dayId);
        const dayB = DAYS.findIndex(d => d.id === b.dayId);
        if (dayA !== dayB) return dayA - dayB;
        return a.sortOrder - b.sortOrder;
      });
  }

  function getJrPassLegsForDay(dayId) {
    return getJrPassLegs().filter(l => l.dayId === dayId);
  }

  async function createTrip({ name, startDate, endDate, countries, coverEmoji, currency }) {
    const user = (await SB.auth.getUser()).data.user;
    if (!user) throw new Error('Not signed in');
    const { data, error } = await SB.from('trips').insert({
      name,
      start_date: startDate || null,
      end_date: endDate || null,
      countries: countries || [],
      cover_emoji: coverEmoji || '🧭',
      currency: currency || 'USD',
      status: 'upcoming',
      owner_id: user.id,
    }).select().single();
    if (error) throw error;
    TRIPS.push(data);
    TRIPS.sort((a, b) => new Date(a.start_date || 0) - new Date(b.start_date || 0));
    await DB.setMeta(CACHE_KEYS.trips, TRIPS);
    return data;
  }

  async function deleteTrip(tripId) {
    const { error } = await SB.from('trips').delete().eq('id', tripId);
    if (error) { console.error('[Data] deleteTrip error:', error); throw error; }
    TRIPS = TRIPS.filter(t => t.id !== tripId);
    await DB.setMeta(CACHE_KEYS.trips, TRIPS);
    if (CURRENT_TRIP?.id === tripId) {
      CURRENT_TRIP = TRIPS[0] || null;
      if (CURRENT_TRIP) await loadTripData(CURRENT_TRIP.id);
    }
  }

  /* ── TRIPS API ───────────────────────────────────────────── */
  function getTrips()       { return TRIPS; }
  function getCurrentTrip() { return CURRENT_TRIP; }

  async function switchTrip(tripId) {
    const trip = TRIPS.find(t => t.id === tripId);
    if (!trip) return;
    CURRENT_TRIP = trip;
    TRAVELERS    = trip.settings?.travelers || ['Traveler'];
    await loadTripData(tripId);
    applyTripTheme();
    App.reload();
  }

  /* ── TRIP MEMBERS ─────────────────────────────────────────── */
  async function getTripMembers() {
    if (!CURRENT_TRIP) return [];
    const { data, error } = await SB.from('trip_members').select('*').eq('trip_id', CURRENT_TRIP.id);
    if (error) { console.error('[Data] getTripMembers error:', error); return []; }
    return data || [];
  }

  async function inviteMember(email, role) {
    if (!CURRENT_TRIP) throw new Error('No active trip');
    const { data, error } = await SB.functions.invoke('invite-member', {
      body: { email, role, tripId: CURRENT_TRIP.id },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  }

  async function removeMember(memberId) {
    const { error } = await SB.from('trip_members').delete().eq('id', memberId);
    if (error) throw error;
  }

  /* ── RESERVATIONS (derived from flagged stops, matches main branch) ── */
  function getTransportReservations() {
    return STOPS.map(normaliseStop)
      .filter(s => s.needsBooking && s.category === 'transport')
      .sort((a,b) => (DAYS.findIndex(d=>d.id===a.dayId) - DAYS.findIndex(d=>d.id===b.dayId)) || (a.order||0)-(b.order||0));
  }
  function getActivityReservations() {
    return STOPS.map(normaliseStop)
      .filter(s => s.needsBooking && s.category === 'activity')
      .sort((a,b) => (DAYS.findIndex(d=>d.id===a.dayId) - DAYS.findIndex(d=>d.id===b.dayId)) || (a.order||0)-(b.order||0));
  }
  function getTripInclusions()        { return CURRENT_TRIP?.settings?.inclusions  || []; }
  function getTripExclusions()        { return CURRENT_TRIP?.settings?.exclusions  || []; }
  function getSOS()                   { return CURRENT_TRIP?.settings?.sos         || {}; }
  // itinerary.js calls these shorter names — alias to the trip-info getters above
  function getInclusions()            { return getTripInclusions(); }
  function getExclusions()            { return getTripExclusions(); }
  function getHospitals()             { return CURRENT_TRIP?.settings?.hospitals   || []; }
  function getFirstAid()              { return CURRENT_TRIP?.settings?.first_aid   || []; }

  /* ── STATS (urgent badge) ─────────────────────────────────── */
  function getStats() {
    const allStops = STOPS.map(normaliseStop);
    return {
      urgent:  allStops.filter(s => s.booking.status === 'urgent').length,
      pending: allStops.filter(s => s.booking.status === 'pending').length,
      booked:  allStops.filter(s => s.booking.status === 'booked').length,
      total:   allStops.length,
    };
  }

  /* ── STUBS for backward compat ───────────────────────────── */
  async function resetToSeed() { await loadTripData(CURRENT_TRIP?.id); }
  async function updateTravelers(names) {
    TRAVELERS = names;
    if (!CURRENT_TRIP) return;
    const newSettings = { ...(CURRENT_TRIP.settings || {}), travelers: names };
    CURRENT_TRIP.settings = newSettings;
    if (navigator.onLine) {
      const { error } = await SB.from('trips').update({ settings: newSettings }).eq('id', CURRENT_TRIP.id);
      if (error) { console.error('[Data] updateTravelers error:', error); throw error; }
    }
  }
  function getTripCurrency() { return CURRENT_TRIP?.currency || 'USD'; }

  async function updateTripDetails(changes) {
    if (!CURRENT_TRIP) return;
    const patch = {};
    if ('name'       in changes) patch.name        = changes.name;
    if ('startDate'  in changes) patch.start_date   = changes.startDate || null;
    if ('endDate'    in changes) patch.end_date     = changes.endDate || null;
    if ('countries'  in changes) patch.countries    = changes.countries;
    if ('coverEmoji' in changes) patch.cover_emoji  = changes.coverEmoji;
    if ('currency'   in changes) patch.currency     = changes.currency;
    Object.assign(CURRENT_TRIP, patch);
    const idx = TRIPS.findIndex(t => t.id === CURRENT_TRIP.id);
    if (idx >= 0) TRIPS[idx] = CURRENT_TRIP;
    if (navigator.onLine) {
      const { error } = await SB.from('trips').update(patch).eq('id', CURRENT_TRIP.id);
      if (error) { console.error('[Data] updateTripDetails error:', error); throw error; }
    }
  }

  async function setTripName(name) {
    return updateTripDetails({ name });
  }
  function setCustomLinks(links) { CUSTOM_LINKS = links; }
  function setDexState(state) { DEX_CATCHES = state; }
  function setExpenses(exps)  { EXPENSES = exps; }

  return {
    init, loadTrips,
    // Days
    getDays, updateDay, updateStory, deleteStory, addDay, deleteDay, getDayContents,
    getVisitedCountries, toggleVisitedCountry,
    // Stops
    getStops, getStopsByDay, addStop, updateStop, deleteStop,
    // Overnight
    getOvernight, updateOvernight, deleteOvernight, getUpcomingDeadlines,
    // Expenses
    getExpenses, addExpense, updateExpense, deleteExpense, getTotalSpentJPY,
    getTravelers, updateTravelers, calcSettlement, getBalances, setExpenses,
    // Packing
    getPackingItems, getPackingByCategory, togglePacking, addPackingItem, updatePackingItem, deletePacking,
    // Dex
    getAnimals, getAnimal, getDexState, setDexState, isCaught, getDexProgress,
    markCaught, unmarkCaught, addDexPhoto, removeDexPhoto, getDexPhoto,
    getDishes, getDish, getFoodState, isDishCaught, getFoodProgress,
    markDishCaught, unmarkDishCaught, addFoodPhoto, removeFoodPhoto, getFoodPhoto,
    getStampStops, getStampState, isStampCollected, getStampProgress,
    markStampCollected, unmarkStampCollected, addStampPhoto, removeStampPhoto, getStampPhoto,
    // Stories + Glossary
    hasStory, getStory, getGlossary,
    // Links
    getCustomLinks, addCustomLink, updateCustomLink, deleteCustomLink, setCustomLinks,
    getJrPassLegs, getJrPassLegsForDay,
    applyTripTheme,
    // Trips
    getTrips, getCurrentTrip, switchTrip, createTrip, updateTripDetails, getTripCurrency, deleteTrip,
    getTripMembers, inviteMember, removeMember,
    // Trip info
    getTripName, setTripName,
    getActivityReservations, getTransportReservations,
    getTripInclusions, getTripExclusions, getSOS,
    getInclusions, getExclusions, getHospitals, getFirstAid, getStats,
    resetToSeed,
  };

})();

window.Data = Data;
