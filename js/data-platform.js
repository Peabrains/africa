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
  let BUCKET_ITEMS    = [];   // user-added checklist items, shared shell across every trip
  let JOURNAL_ENTRIES = [];   // magazine-style trip journal — narration + photos, optionally day-tagged
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
    journal:  'sb_journal',
  };

  /* Every cache key except `trips` (the list of all trips, not per-trip
     data) MUST be scoped to the active trip. Without this, switching
     trips while offline — or any time a fetch fails and the app falls
     back to cache — silently shows whatever trip was cached last instead
     of the one that was actually requested, since IndexedDB has no
     concept of "current trip" on its own. CURRENT_TRIP is always set
     before loadTripData()/loadFromCache() run, in every call path
     (init, switchTrip, createTrip), so this is safe to resolve implicitly
     rather than threading a tripId through every single write function. */
  function tripKey(base) {
    return CURRENT_TRIP?.id ? `${base}::${CURRENT_TRIP.id}` : base;
  }

  /* ── Offline write queue ─────────────────────────────────────
     Every mutation applies to local state immediately (optimistic),
     then tries Supabase right away if online. If that attempt fails
     — because we're offline, or a request fails mid-flight even
     while nominally online — the change is queued in IndexedDB
     instead of being silently dropped. flushQueue() replays queued
     changes in order (oldest first) on reconnect and before any
     full data refresh, so a refresh never overwrites local changes
     that haven't made it to the server yet.

     Covers stops, overnight, expenses, packing, bucket items, and
     custom links. Photo uploads (Dex/Food/Stamps/Journal catches)
     are NOT yet covered — they need a different queue-payload shape
     since they carry binary data, not just row fields.

     If a row was itself created offline (temporary 'local_'/'bk_'
     id) and then edited again before ever syncing, the edit's
     target id gets remapped to the real server id once the insert
     ahead of it in the queue resolves — see remapIds(). ────────── */
  function enqueue(type, payload) {
    return DB.queueChange({ type, payload });
  }

  async function getPendingCount() {
    try { return (await DB.loadQueue()).length; } catch (_) { return 0; }
  }

  function remapIds(payload, map) {
    if (!payload) return payload;
    const out = { ...payload };
    if (out.id && map[out.id])    out.id    = map[out.id];
    if (out.dayId && map[out.dayId]) out.dayId = map[out.dayId];
    return out;
  }

  let _flushing = false;
  async function flushQueue() {
    if (_flushing || !navigator.onLine) {
      return { flushed: 0, remaining: await getPendingCount() };
    }
    _flushing = true;
    let flushed = 0;
    const localIdMap = {};
    try {
      const queue = (await DB.loadQueue()).sort((a, b) => a.id - b.id);
      for (const entry of queue) {
        const remapped = remapIds(entry.payload, localIdMap);
        try {
          const result = await replayQueueEntry(entry.type, remapped);
          if (result?.localId && result?.realId) localIdMap[result.localId] = result.realId;
          await DB.dequeueChange(entry.id);
          flushed++;
        } catch (e) {
          console.warn('[Data] flushQueue stopped at', entry.type, '—', e.message || e);
          break; // preserve order — leave this entry and everything after it queued
        }
      }
    } finally {
      _flushing = false;
    }
    return { flushed, remaining: await getPendingCount() };
  }

  async function replayQueueEntry(type, p) {
    switch (type) {
      case 'addStop': {
        const { localId, ...row } = p;
        const { data, error } = await SB.from('stops').insert(row).select().single();
        if (error) throw error;
        const idx = STOPS.findIndex(s => s.id === localId);
        if (idx >= 0) STOPS[idx] = data; else STOPS.push(data);
        await DB.setMeta(tripKey(CACHE_KEYS.stops), STOPS);
        return { localId, realId: data.id };
      }
      case 'updateStop': {
        const { error } = await SB.from('stops').update(p.patch).eq('id', p.id);
        if (error) throw error;
        return null;
      }
      case 'deleteStop': {
        const { error } = await SB.from('stops').delete().eq('id', p.id);
        if (error) throw error;
        return null;
      }
      case 'insertOvernight': {
        const { dayId, localId, row } = p;
        const { data, error } = await SB.from('overnights').insert(row).select().single();
        if (error) throw error;
        if (OVERNIGHTS[dayId]?.id === localId) OVERNIGHTS[dayId] = data;
        await DB.setMeta(tripKey(CACHE_KEYS.overnight), OVERNIGHTS);
        return { localId, realId: data.id };
      }
      case 'updateOvernight': {
        const { error } = await SB.from('overnights').update(p.patch).eq('id', p.id);
        if (error) throw error;
        return null;
      }
      case 'deleteOvernight': {
        const { error } = await SB.from('overnights').delete().eq('id', p.id);
        if (error) throw error;
        return null;
      }
      case 'addExpense': {
        const { localId, row } = p;
        const { data, error } = await SB.from('expenses').insert(row).select().single();
        if (error) throw error;
        EXPENSES = EXPENSES.filter(e => e.id !== localId);
        EXPENSES.push(data);
        await DB.setMeta(tripKey(CACHE_KEYS.expenses), EXPENSES);
        return { localId, realId: data.id };
      }
      case 'updateExpense': {
        const { error } = await SB.from('expenses').update(p.patch).eq('id', p.id);
        if (error) throw error;
        return null;
      }
      case 'deleteExpense': {
        const { error } = await SB.from('expenses').delete().eq('id', p.id);
        if (error) throw error;
        return null;
      }
      case 'addPacking': {
        const { localId, row } = p;
        const { data, error } = await SB.from('packing_items').insert(row).select().single();
        if (error) throw error;
        PACKING = PACKING.filter(i => i.id !== localId);
        PACKING.push(data);
        await DB.setMeta(tripKey(CACHE_KEYS.packing), PACKING);
        return { localId, realId: data.id };
      }
      case 'updatePacking': {
        const { error } = await SB.from('packing_items').update(p.patch).eq('id', p.id);
        if (error) throw error;
        return null;
      }
      case 'deletePacking': {
        const { error } = await SB.from('packing_items').delete().eq('id', p.id);
        if (error) throw error;
        return null;
      }
      case 'addBucketItem': {
        const { localId, row } = p;
        const { data, error } = await SB.from('bucket_items').insert(row).select().single();
        if (error) throw error;
        const idx = BUCKET_ITEMS.findIndex(i => i.id === localId);
        if (idx >= 0) BUCKET_ITEMS[idx] = data; else BUCKET_ITEMS.push(data);
        await DB.saveBucket(BUCKET_ITEMS, tripKey('bucketItems'));
        return { localId, realId: data.id };
      }
      case 'updateBucketItem': {
        const { error } = await SB.from('bucket_items').update(p.patch).eq('id', p.id);
        if (error) throw error;
        return null;
      }
      case 'deleteBucketItem': {
        const { error } = await SB.from('bucket_items').delete().eq('id', p.id);
        if (error) throw error;
        return null;
      }
      case 'addCustomLink': {
        const { localId, row } = p;
        const { data, error } = await SB.from('custom_links').insert(row).select().single();
        if (error) throw error;
        CUSTOM_LINKS = CUSTOM_LINKS.filter(l => l.id !== localId);
        CUSTOM_LINKS.push(data);
        await DB.setMeta(tripKey(CACHE_KEYS.links), CUSTOM_LINKS);
        return { localId, realId: data.id };
      }
      case 'updateCustomLink': {
        const { error } = await SB.from('custom_links').update(p.patch).eq('id', p.id);
        if (error) throw error;
        return null;
      }
      case 'deleteCustomLink': {
        const { error } = await SB.from('custom_links').delete().eq('id', p.id);
        if (error) throw error;
        return null;
      }
      default:
        console.warn('[Data] flushQueue: unknown entry type', type);
        return null;
    }
  }

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

    // Flush any offline-queued changes FIRST — a fresh pull below replaces
    // local state wholesale, so anything still only-local at that point
    // would otherwise be silently lost.
    if (online) {
      try { await flushQueue(); } catch (e) { console.warn('[Data] pre-refresh flushQueue failed:', e.message || e); }
    }

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
          { data: bucketItems },
          { data: journalEntries },
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
          SB.from('bucket_items').select('*').eq('trip_id', tripId).order('created_at'),
          SB.from('journal_entries').select('*, journal_photos(*)').eq('trip_id', tripId).order('created_at'),
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

        // Bucket List — plain array, ordered by creation (own screen, not a lookup map)
        BUCKET_ITEMS = bucketItems || [];
        JOURNAL_ENTRIES = journalEntries || [];

        // Cache everything for offline
        await Promise.all([
          DB.setMeta(tripKey(CACHE_KEYS.days),      DAYS),
          DB.setMeta(tripKey(CACHE_KEYS.stops),     STOPS),
          DB.setMeta(tripKey(CACHE_KEYS.overnight), OVERNIGHTS),
          DB.setMeta(tripKey(CACHE_KEYS.expenses),  EXPENSES),
          DB.setMeta(tripKey(CACHE_KEYS.packing),   PACKING),
          DB.setMeta(tripKey(CACHE_KEYS.dex),       DEX_CATCHES),
          DB.setMeta(tripKey(CACHE_KEYS.food),      FOOD_CATCHES),
          DB.setMeta(tripKey(CACHE_KEYS.links),     CUSTOM_LINKS),
          DB.setMeta(tripKey(CACHE_KEYS.glossary),  GLOSSARY_TERMS),
          DB.saveBucket(BUCKET_ITEMS, tripKey('bucketItems')),
          DB.setMeta(tripKey(CACHE_KEYS.journal), JOURNAL_ENTRIES),
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
    DAYS         = await DB.getMeta(tripKey(CACHE_KEYS.days))     || [];
    STOPS        = await DB.getMeta(tripKey(CACHE_KEYS.stops))    || [];
    OVERNIGHTS   = await DB.getMeta(tripKey(CACHE_KEYS.overnight))|| {};
    EXPENSES     = await DB.getMeta(tripKey(CACHE_KEYS.expenses)) || [];
    PACKING      = await DB.getMeta(tripKey(CACHE_KEYS.packing))  || [];
    DEX_CATCHES  = await DB.getMeta(tripKey(CACHE_KEYS.dex))      || {};
    FOOD_CATCHES = await DB.getMeta(tripKey(CACHE_KEYS.food))     || {};
    CUSTOM_LINKS = await DB.getMeta(tripKey(CACHE_KEYS.links))    || [];
    GLOSSARY_TERMS = await DB.getMeta(tripKey(CACHE_KEYS.glossary)) || {};
    BUCKET_ITEMS = await DB.loadBucket(tripKey('bucketItems')) || [];
    JOURNAL_ENTRIES = await DB.getMeta(tripKey(CACHE_KEYS.journal)) || [];
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
    const fd = s.flight_detail || null;
    // flight_detail.schedule is written by check_flights.py (main branch) —
    // scheduled/revised times are refreshed live on every check, never frozen.
    const sched = fd?.schedule || null;
    // "Retimed" is a pure current-state read: a revised time is present AND
    // differs from the scheduled one right now. No diffing against history.
    const isRetimed = !!sched && (
      (sched.dep_revised_local && sched.dep_revised_local !== sched.dep_scheduled_local) ||
      (sched.arr_revised_local && sched.arr_revised_local !== sched.arr_scheduled_local)
    );
    // A = never checked · B = checked but AeroDataBox has nothing published yet · C = verified
    const flightState = !sched ? 'A' : (sched.published ? 'C' : 'B');

    return {
      ...s,
      // camelCase aliases for snake_case Supabase columns
      dayId:         s.day_id,
      segment:       parentDay?.segment || null,   // country/segment lives on the day, not the stop
      locality:      parentDay?.locality || null,  // for auto-color grouping on the map
      timeZone:      s.timezone || CURRENT_TRIP?.settings?.defaultTimezone || CURRENCY_TZ[CURRENT_TRIP?.currency] || 'EAT',
      transportType: s.transport_type || 'walk',
      needsBooking:  s.needs_booking || false,
      isBooked:      s.is_booked || false,
      featuredOnMap: s.featured_on_map || false,
      hiddenFromMap: s.hidden_from_map || false,
      flightIncluded: fd?.included === true,
      flightExcluded: fd?.included === false,
      trainDetail:   fd?.trainDetail || null,
      booking: {
        // Prefer the full 4-state status stored in flight_detail (new data);
        // fall back to the boolean is_booked column for older rows that
        // predate this. No implicit "Open" default — a stop with no status
        // explicitly set shows no badge at all rather than assuming Open.
        status: fd?.status || (s.is_booked ? 'booked' : ''),
        ref:    fd?.ref || '',
        cost:   fd?.cost ?? null,
        costCurrency: fd?.costCurrency || null,
        deadline: fd?.deadline || null,
        payment: fd?.payment || null,
      },
      // flight detail fields itinerary.js uses
      ...(fd ? {
        airline:    fd.airline || '',
        flightNo:   fd.flight_no || '',
        // Origin/destination actually live under flight_detail.trainDetail
        // (shared with train/boat stops) — this used to read flight_detail.origin
        // directly, which is never where the edit form writes it, so these
        // were silently empty for every real stop. Fixed here.
        origin:      fd.trainDetail?.origin || '',
        destination: fd.trainDetail?.destination || '',
        flightSchedule: sched,   // raw schedule object — see check_flights.py header comment
        flightState,             // 'A' not yet verified · 'B' not yet published · 'C' verified
        isRetimed,
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
    await DB.setMeta(tripKey(CACHE_KEYS.stops), STOPS);
  }

  async function addStop(stop) {
    const newStop = {
      trip_id:        CURRENT_TRIP.id,
      day_id:         stop.dayId,
      sort_order:     STOPS.filter(s => s.day_id === stop.dayId).length,
      name:           stop.name,
      activity:       stop.activity || '',
      time:           stop.time || '',
      timezone:       stop.timeZone || CURRENT_TRIP?.settings?.defaultTimezone || CURRENCY_TZ[CURRENT_TRIP?.currency] || 'EAT',
      transport:      stop.transport || '',
      transport_type: stop.transportType || 'walk',
      notes:          stop.notes || '',
      needs_booking:  stop.needsBooking || false,
      is_booked:      stop.booking?.status === 'booked' || false,
      category:       stop.category || null,
      flight_detail:  (stop.trainDetail || stop.flightNo || stop.airline || stop.booking?.ref || stop.booking?.cost || stop.booking?.deadline || stop.booking?.status || stop.booking?.payment) ? {
        ...(stop.trainDetail ? { trainDetail: stop.trainDetail } : {}),
        ...(stop.flightNo          ? { flight_no: stop.flightNo } : {}),
        ...(stop.airline           ? { airline: stop.airline } : {}),
        ...(stop.booking?.status   ? { status: stop.booking.status } : {}),
        ...(stop.booking?.ref      ? { ref: stop.booking.ref } : {}),
        ...(stop.booking?.cost     != null ? { cost: stop.booking.cost } : {}),
        ...(stop.booking?.costCurrency ? { costCurrency: stop.booking.costCurrency } : {}),
        ...(stop.booking?.deadline ? { deadline: stop.booking.deadline } : {}),
        ...(stop.booking?.payment  ? { payment: stop.booking.payment } : {}),
      } : null,
    };

    if (navigator.onLine) {
      try {
        const { data, error } = await SB.from('stops').insert(newStop).select().single();
        if (error) throw error;
        STOPS.push(data);
        await resortStopsForDay(stop.dayId);
        return data;
      } catch (e) {
        console.warn('[Data] addStop server write failed, queued for retry:', e.message || e);
        const localId = 'local_' + Date.now();
        const localStop = { ...newStop, id: localId };
        STOPS.push(localStop);
        await resortStopsForDay(stop.dayId);
        await enqueue('addStop', { localId, ...newStop });
        return localStop;
      }
    } else {
      const localId = 'local_' + Date.now();
      const localStop = { ...newStop, id: localId };
      STOPS.push(localStop);
      await resortStopsForDay(stop.dayId);
      await enqueue('addStop', { localId, ...newStop });
      return localStop;
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
    if ('featuredOnMap'  in changes) patch.featured_on_map = changes.featuredOnMap;
    if ('hiddenFromMap'  in changes) patch.hidden_from_map = changes.hiddenFromMap;

    if (changes.booking) {
      patch.is_booked = changes.booking.status === 'booked';
    }

    // Fold anything with no dedicated column into flight_detail (merge, don't overwrite)
    const needsFlightDetailMerge = changes.booking || ('trainDetail' in changes) || ('flightNo' in changes) || ('airline' in changes);
    if (needsFlightDetailMerge) {
      const merged = { ...(current.flight_detail || {}) };
      if (changes.booking) {
        // Full 4-state status (open/pending/urgent/booked) — stored here since
        // is_booked is just a boolean and can't represent pending/urgent.
        // normaliseStop() prefers this over the is_booked-derived fallback.
        if ('status'   in changes.booking) merged.status   = changes.booking.status || undefined;
        if ('ref'      in changes.booking) { if (changes.booking.ref)      merged.ref      = changes.booking.ref;      else delete merged.ref; }
        if ('cost'     in changes.booking) { if (changes.booking.cost != null) merged.cost = changes.booking.cost;     else delete merged.cost; }
        if ('costCurrency' in changes.booking) { if (changes.booking.costCurrency) merged.costCurrency = changes.booking.costCurrency; else delete merged.costCurrency; }
        if ('deadline' in changes.booking) { if (changes.booking.deadline) merged.deadline = changes.booking.deadline; else delete merged.deadline; }
        // Payment is independent of booking status — see bottom-sheet.js note.
        if ('payment'  in changes.booking) { if (changes.booking.payment)  merged.payment  = changes.booking.payment;  else delete merged.payment; }
      }
      if ('trainDetail' in changes) {
        if (changes.trainDetail) merged.trainDetail = changes.trainDetail;
        else delete merged.trainDetail;
      }
      if ('flightNo' in changes) {
        if (changes.flightNo) merged.flight_no = changes.flightNo;
        else delete merged.flight_no;
      }
      if ('airline' in changes) {
        if (changes.airline) merged.airline = changes.airline;
        else delete merged.airline;
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
      try {
        const { error } = await SB.from('stops').update(dbPatch).eq('id', id);
        if (error) throw error;
      } catch (e) {
        console.warn('[Data] updateStop server write failed, queued for retry:', e.message || e);
        await enqueue('updateStop', { id, patch: dbPatch });
      }
    } else {
      await enqueue('updateStop', { id, patch: dbPatch });
    }

    if ('time' in dbPatch || 'day_id' in dbPatch) {
      await resortStopsForDay(STOPS[idx].day_id);
    } else {
      await DB.setMeta(tripKey(CACHE_KEYS.stops), STOPS);
    }
  }

  async function deleteStop(id) {
    STOPS = STOPS.filter(s => s.id !== id);
    if (navigator.onLine) {
      try {
        const { error } = await SB.from('stops').delete().eq('id', id);
        if (error) throw error;
      } catch (e) {
        console.warn('[Data] deleteStop server write failed, queued for retry:', e.message || e);
        await enqueue('deleteStop', { id });
      }
    } else {
      await enqueue('deleteStop', { id });
    }
    await DB.setMeta(tripKey(CACHE_KEYS.stops), STOPS);
  }

  /* ── OVERNIGHT API ───────────────────────────────────────── */
  function getOvernight(dayId) {
    return OVERNIGHTS[dayId] || null;
  }

  /* Luggage forwarding is stored on the ORIGIN day's overnight (the hotel
     you're leaving), but the actual drop-off happens the next morning —
     i.e. it belongs, visually, to the following day on the itinerary.
     This resolves "what forwarding, if any, is incoming for dayId's
     morning" so screens don't have to re-derive the day-shift themselves.
     Returns { sourceDay, lf } or null. No entry for the trip's first day
     (nothing precedes it) or when the previous overnight has forwarding
     disabled/unset. */
  function getIncomingLuggageForwarding(dayId) {
    const days = getDays();
    const idx = days.findIndex(d => d.id === dayId);
    if (idx <= 0) return null;
    const sourceDay = days[idx - 1];
    const lf = getOvernight(sourceDay.id)?.luggage_forwarding;
    return lf?.enabled ? { sourceDay, lf } : null;
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
        try {
          let { error } = await SB.from('overnights').update(changes).eq('id', existing.id);
          if (error && /deadline/.test(error.message || '')) {
            const { deadline, ...withoutDeadline } = changes;
            ({ error } = await SB.from('overnights').update(withoutDeadline).eq('id', existing.id));
          }
          if (error) throw error;
        } catch (e) {
          console.warn('[Data] updateOvernight server write failed, queued for retry:', e.message || e);
          await enqueue('updateOvernight', { id: existing.id, patch: changes });
        }
      } else {
        await enqueue('updateOvernight', { id: existing.id, patch: changes });
      }
    } else {
      // No overnight row for this day yet — create one (e.g. first time
      // adding accommodation via the "+ Add overnight" button).
      const newRow = { trip_id: CURRENT_TRIP.id, day_id: dayId, ...changes };
      const localId = 'local_' + Date.now();
      OVERNIGHTS[dayId] = { ...newRow, id: localId }; // optimistic local state so it shows immediately
      if (navigator.onLine) {
        try {
          let { data, error } = await SB.from('overnights').insert(newRow).select().single();
          if (error && /deadline/.test(error.message || '')) {
            const { deadline, ...withoutDeadline } = newRow;
            ({ data, error } = await SB.from('overnights').insert(withoutDeadline).select().single());
          }
          if (error) throw error;
          OVERNIGHTS[dayId] = data;
        } catch (e) {
          console.warn('[Data] updateOvernight (insert) server write failed, queued for retry:', e.message || e);
          await enqueue('insertOvernight', { dayId, localId, row: newRow });
        }
      } else {
        await enqueue('insertOvernight', { dayId, localId, row: newRow });
      }
    }

    await DB.setMeta(tripKey(CACHE_KEYS.overnight), OVERNIGHTS);
  }

  async function deleteOvernight(dayId) {
    const o = OVERNIGHTS[dayId];
    if (!o) return;
    delete OVERNIGHTS[dayId];
    if (o.id) {
      if (navigator.onLine) {
        try {
          const { error } = await SB.from('overnights').delete().eq('id', o.id);
          if (error) throw error;
        } catch (e) {
          console.warn('[Data] deleteOvernight server write failed, queued for retry:', e.message || e);
          await enqueue('deleteOvernight', { id: o.id });
        }
      } else {
        await enqueue('deleteOvernight', { id: o.id });
      }
    }
    await DB.setMeta(tripKey(CACHE_KEYS.overnight), OVERNIGHTS);
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
    await DB.setMeta(tripKey(CACHE_KEYS.days), DAYS);
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
    await DB.setMeta(tripKey(CACHE_KEYS.days), DAYS);
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

    const localId = 'local_' + Date.now();
    EXPENSES.push({ ...newExp, id: localId });

    if (navigator.onLine) {
      try {
        let { data, error } = await SB.from('expenses').insert(newExp).select().single();
        if (error && /day_id/.test(error.message || '')) {
          // Schema patch not run yet — retry without day_id, day_label still carries the day
          const { day_id, ...withoutDayId } = newExp;
          ({ data, error } = await SB.from('expenses').insert(withoutDayId).select().single());
        }
        if (error) throw error;
        EXPENSES = EXPENSES.filter(e => e.id !== localId);
        EXPENSES.push(data);
      } catch (e) {
        console.warn('[Data] addExpense server write failed, queued for retry:', e.message || e);
        await enqueue('addExpense', { localId, row: newExp });
      }
    } else {
      await enqueue('addExpense', { localId, row: newExp });
    }
    await DB.setMeta(tripKey(CACHE_KEYS.expenses), EXPENSES);
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
      try {
        const { error } = await SB.from('expenses').update(patch).eq('id', id);
        if (error) throw error;
      } catch (e) {
        console.warn('[Data] updateExpense server write failed, queued for retry:', e.message || e);
        await enqueue('updateExpense', { id, patch });
      }
    } else {
      await enqueue('updateExpense', { id, patch });
    }
    await DB.setMeta(tripKey(CACHE_KEYS.expenses), EXPENSES);
  }

  async function deleteExpense(id) {
    EXPENSES = EXPENSES.filter(e => e.id !== id);
    if (navigator.onLine) {
      try {
        const { error } = await SB.from('expenses').delete().eq('id', id);
        if (error) throw error;
      } catch (e) {
        console.warn('[Data] deleteExpense server write failed, queued for retry:', e.message || e);
        await enqueue('deleteExpense', { id });
      }
    } else {
      await enqueue('deleteExpense', { id });
    }
    await DB.setMeta(tripKey(CACHE_KEYS.expenses), EXPENSES);
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

  /* Per-traveler packing state, stored as {travelerName: boolean} on the
     item itself — each traveler gets their own pill/checkmark on the same
     row, rather than one shared checkbox or duplicate item rows. */
  async function togglePackingFor(id, travelerName) {
    const item = PACKING.find(p => p.id === id);
    if (!item) return;
    const current = item.checked_by_names || {};
    const next = { ...current, [travelerName]: !current[travelerName] };
    item.checked_by_names = next;

    if (navigator.onLine) {
      try {
        const { error } = await SB.from('packing_items').update({ checked_by_names: next }).eq('id', id);
        if (error) throw error;
      } catch (e) {
        console.warn('[Data] togglePackingFor server write failed, queued for retry:', e.message || e);
        await enqueue('updatePacking', { id, patch: { checked_by_names: next } });
      }
    } else {
      await enqueue('updatePacking', { id, patch: { checked_by_names: next } });
    }
    await DB.setMeta(tripKey(CACHE_KEYS.packing), PACKING);
  }

  function getPackingProgressByTraveler() {
    return TRAVELERS.map(name => ({
      name,
      done: PACKING.filter(p => p.checked_by_names?.[name]).length,
      total: PACKING.length,
    }));
  }

  async function togglePacking(id, checked) {
    const item = PACKING.find(p => p.id === id);
    if (item) item.checked = checked;
    if (navigator.onLine) {
      try {
        const { error } = await SB.from('packing_items').update({ checked }).eq('id', id);
        if (error) throw error;
      } catch (e) {
        console.warn('[Data] togglePacking server write failed, queued for retry:', e.message || e);
        await enqueue('updatePacking', { id, patch: { checked } });
      }
    } else {
      await enqueue('updatePacking', { id, patch: { checked } });
    }
    await DB.setMeta(tripKey(CACHE_KEYS.packing), PACKING);
  }

  async function addPackingItem({ cat, item, essential = false }) {
    const newItem = {
      trip_id:   CURRENT_TRIP.id,
      category:  cat,
      item,
      essential,
      checked:   false,
      checked_by_names: {},
      sort_order: PACKING.filter(p => p.category === cat).length,
    };
    const localId = 'local_' + Date.now();
    PACKING.push({ ...newItem, id: localId });

    if (navigator.onLine) {
      try {
        const { data, error } = await SB.from('packing_items').insert(newItem).select().single();
        if (error) throw error;
        PACKING = PACKING.filter(p => p.id !== localId);
        PACKING.push(data);
      } catch (e) {
        console.warn('[Data] addPackingItem server write failed, queued for retry:', e.message || e);
        await enqueue('addPacking', { localId, row: newItem });
      }
    } else {
      await enqueue('addPacking', { localId, row: newItem });
    }
    await DB.setMeta(tripKey(CACHE_KEYS.packing), PACKING);
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
      try {
        const { error } = await SB.from('packing_items').update(patch).eq('id', id);
        if (error) throw error;
      } catch (e) {
        console.warn('[Data] updatePackingItem server write failed, queued for retry:', e.message || e);
        await enqueue('updatePacking', { id, patch });
      }
    } else {
      await enqueue('updatePacking', { id, patch });
    }
    await DB.setMeta(tripKey(CACHE_KEYS.packing), PACKING);
  }

  async function deletePacking(id) {
    PACKING = PACKING.filter(p => p.id !== id);
    if (navigator.onLine) {
      try {
        const { error } = await SB.from('packing_items').delete().eq('id', id);
        if (error) throw error;
      } catch (e) {
        console.warn('[Data] deletePacking server write failed, queued for retry:', e.message || e);
        await enqueue('deletePacking', { id });
      }
    } else {
      await enqueue('deletePacking', { id });
    }
    await DB.setMeta(tripKey(CACHE_KEYS.packing), PACKING);
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
    await DB.setMeta(tripKey(CACHE_KEYS.dex), DEX_CATCHES);
    return DEX_CATCHES[animalId];
  }

  async function unmarkCaught(animalId) {
    const catchId = DEX_CATCHES[animalId]?.id;
    delete DEX_CATCHES[animalId];
    if (navigator.onLine && catchId) {
      await SB.from('dex_catches').delete().eq('id', catchId);
    }
    await DB.setMeta(tripKey(CACHE_KEYS.dex), DEX_CATCHES);
  }

  async function addDexPhoto(animalId, fileDataUrl) {
    if (!DEX_CATCHES[animalId]) await markCaught(animalId, {});
    const photoId = 'ph_' + Date.now();

    // Save locally first — always works offline, and is the fast-path source
    // for photos taken on this device.
    await DB.saveDexPhoto(photoId, fileDataUrl);
    if (!DEX_CATCHES[animalId].photoIds) DEX_CATCHES[animalId].photoIds = [];
    DEX_CATCHES[animalId].photoIds.push(photoId);
    await DB.setMeta(tripKey(CACHE_KEYS.dex), DEX_CATCHES);

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
    await DB.setMeta(tripKey(CACHE_KEYS.dex), DEX_CATCHES);

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

  /* ── BUCKET LIST API ─────────────────────────────────────────
     User-added checklist, shared shell across every trip. Unlike
     Dex/Stamps/Food this isn't a curated catalog — items are typed
     in by the traveler, so state is just a plain array, not a
     lookup keyed by a fixed id. "done" and "has a photo" are
     deliberately independent — untick never touches the photo,
     and removing a photo never touches the tick. Only one photo
     per item (not an array like Dex/Food/Stamps allow), since a
     checklist item only needs one piece of proof. */

  function getBucketItems() { return BUCKET_ITEMS; }
  function getBucketItem(id) { return BUCKET_ITEMS.find(i => i.id === id); }

  function getBucketCategories() {
    const seen = new Set();
    BUCKET_ITEMS.forEach(i => { if (i.category) seen.add(i.category); });
    return Array.from(seen);
  }

  function getBucketProgress() {
    const done = BUCKET_ITEMS.filter(i => i.done);
    return { total: BUCKET_ITEMS.length, done: done.length };
  }

  async function addBucketItem({ title, location = '', category = '', url = '' } = {}) {
    const entry = {
      trip_id:  CURRENT_TRIP.id,
      title, location, category, url,
      done: false,
    };

    // Optimistic local id — replaced with the real one once Supabase confirms.
    const localId = 'bk_' + Date.now();
    let item = { ...entry, id: localId, created_at: new Date().toISOString() };
    BUCKET_ITEMS.push(item);

    if (navigator.onLine) {
      try {
        const user = (await SB.auth.getUser()).data.user;
        const { data, error } = await SB.from('bucket_items')
          .insert({ ...entry, created_by: user?.id })
          .select().single();
        if (error) throw error;
        const idx = BUCKET_ITEMS.findIndex(i => i.id === localId);
        if (idx >= 0) BUCKET_ITEMS[idx] = data;
        item = data;
      } catch (e) {
        console.warn('[Data] addBucketItem server write failed, queued for retry:', e.message || e);
        const user = (await SB.auth.getUser()).data.user;
        await enqueue('addBucketItem', { localId, row: { ...entry, created_by: user?.id } });
      }
    } else {
      const user = (await SB.auth.getUser()).data.user;
      await enqueue('addBucketItem', { localId, row: { ...entry, created_by: user?.id } });
    }
    await DB.saveBucket(BUCKET_ITEMS, tripKey('bucketItems'));
    return item;
  }

  async function updateBucketItem(id, { title, location, category, url } = {}) {
    const item = getBucketItem(id);
    if (!item) return;
    const patch = {};
    if (title !== undefined) patch.title = title;
    if (location !== undefined) patch.location = location;
    if (category !== undefined) patch.category = category;
    if (url !== undefined) patch.url = url;

    Object.assign(item, patch);
    await DB.saveBucket(BUCKET_ITEMS, tripKey('bucketItems'));

    if (navigator.onLine) {
      try {
        const { error } = await SB.from('bucket_items').update(patch).eq('id', id);
        if (error) throw error;
      } catch (e) {
        console.warn('[Data] updateBucketItem server write failed, queued for retry:', e.message || e);
        await enqueue('updateBucketItem', { id, patch });
      }
    } else {
      await enqueue('updateBucketItem', { id, patch });
    }
  }

  async function deleteBucketItem(id) {
    const item = getBucketItem(id);
    BUCKET_ITEMS = BUCKET_ITEMS.filter(i => i.id !== id);
    await DB.saveBucket(BUCKET_ITEMS, tripKey('bucketItems'));

    if (navigator.onLine) {
      try {
        const { error } = await SB.from('bucket_items').delete().eq('id', id);
        if (error) throw error;
      } catch (e) {
        console.warn('[Data] deleteBucketItem server write failed, queued for retry:', e.message || e);
        await enqueue('deleteBucketItem', { id });
      }
    } else {
      await enqueue('deleteBucketItem', { id });
    }
    // Clean up any attached photo — local cache and Storage.
    if (item?.photo_storage_path) {
      await DB.deleteBucketPhoto(id);
      if (navigator.onLine) {
        await SB.storage.from('bucket-photos').remove([item.photo_storage_path]);
      }
    }
  }

  async function toggleBucketDone(id) {
    const item = getBucketItem(id);
    if (!item) return;
    item.done = !item.done;
    await DB.saveBucket(BUCKET_ITEMS, tripKey('bucketItems'));
    if (navigator.onLine) {
      try {
        const { error } = await SB.from('bucket_items').update({ done: item.done }).eq('id', id);
        if (error) throw error;
      } catch (e) {
        console.warn('[Data] toggleBucketDone server write failed, queued for retry:', e.message || e);
        await enqueue('updateBucketItem', { id, patch: { done: item.done } });
      }
    } else {
      await enqueue('updateBucketItem', { id, patch: { done: item.done } });
    }
    return item.done;
  }

  async function addBucketPhoto(id, fileDataUrl) {
    const item = getBucketItem(id);
    if (!item) return;

    // Save locally first — always works offline, fast-path for this device.
    await DB.saveBucketPhoto(id, fileDataUrl);

    // Sync to Supabase Storage so other devices can see it too.
    // Photo arrives here already compressed (see bucket-list.js compressImage()).
    if (navigator.onLine && CURRENT_TRIP) {
      try {
        const blob = await (await fetch(fileDataUrl)).blob();
        const storagePath = `${CURRENT_TRIP.id}/${id}.jpg`;
        const { error: upErr } = await SB.storage.from('bucket-photos')
          .upload(storagePath, blob, { contentType: 'image/jpeg', upsert: true });
        if (!upErr) {
          item.photo_storage_path = storagePath;
          await SB.from('bucket_items').update({ photo_storage_path: storagePath }).eq('id', id);
        } else {
          console.error('[Data] bucket photo upload error:', upErr);
        }
      } catch (e) {
        console.error('[Data] bucket photo sync error:', e);
      }
    }
    await DB.saveBucket(BUCKET_ITEMS, tripKey('bucketItems'));
  }

  async function removeBucketPhoto(id) {
    const item = getBucketItem(id);
    if (!item) return;
    const storagePath = item.photo_storage_path;
    item.photo_storage_path = null;
    await DB.deleteBucketPhoto(id);
    await DB.saveBucket(BUCKET_ITEMS, tripKey('bucketItems'));

    if (navigator.onLine) {
      await SB.from('bucket_items').update({ photo_storage_path: null }).eq('id', id);
      if (storagePath) await SB.storage.from('bucket-photos').remove([storagePath]);
    }
  }

  async function getBucketPhoto(id) {
    // Fast path: this device has it locally (either taken here, or already synced down)
    const local = await DB.loadBucketPhoto(id);
    if (local) return local;

    // Fallback: synced from another device — fetch via a signed URL from Storage
    const item = getBucketItem(id);
    if (item?.photo_storage_path && navigator.onLine) {
      const { data, error } = await SB.storage.from('bucket-photos').createSignedUrl(item.photo_storage_path, 3600);
      if (!error && data?.signedUrl) return data.signedUrl;
    }
    return null;
  }

  /* ── JOURNAL API ──────────────────────────────────────────────
     Magazine-style trip journal. Entries are written any time, with
     an optional day tag, multiple photos (one marked as hero), and
     a pull_quote — a sentence picked out of the narration to show
     large on the page. Mirrors the dex_catches/dex_photos parent
     + child pattern already used for other multi-photo features. */

  // Ordered by each entry's *effective* date — the tagged day's real
  // calendar date if there is one, otherwise when the entry was written.
  // This matches dateLabelFor() exactly, so the order on screen always
  // agrees with the date printed on each entry. Previously this sorted
  // by created_at alone, so writing a "Day 5" entry before going back to
  // fill in "Day 2" made Day 5 appear first even though its own label
  // read a later date than the entry below it.
  function getJournalEntries() {
    function effectiveDate(entry) {
      if (entry.day_id) {
        const day = DAYS.find(d => d.id === entry.day_id);
        if (day?.date) return new Date(day.date.length <= 10 ? day.date + 'T00:00:00' : day.date);
      }
      return new Date(entry.created_at);
    }
    return JOURNAL_ENTRIES.slice().sort((a, b) => {
      const diff = effectiveDate(a) - effectiveDate(b);
      // same effective date (e.g. two entries tagged to the same day) —
      // fall back to write order so they don't shuffle unpredictably
      return diff !== 0 ? diff : new Date(a.created_at) - new Date(b.created_at);
    });
  }
  function getJournalEntry(id) { return JOURNAL_ENTRIES.find(e => e.id === id); }

  async function addJournalEntry({ dayId = null, narration = '', pullQuote = '' } = {}) {
    const user = (await SB.auth.getUser()).data.user;
    const { data, error } = await SB.from('journal_entries')
      .insert({ trip_id: CURRENT_TRIP.id, day_id: dayId, narration, pull_quote: pullQuote, created_by: user?.id })
      .select().single();
    if (error) throw error;
    const entry = { ...data, journal_photos: [] };
    JOURNAL_ENTRIES.push(entry);
    await DB.setMeta(tripKey(CACHE_KEYS.journal), JOURNAL_ENTRIES);
    return entry;
  }

  async function updateJournalEntry(id, { dayId, narration, pullQuote } = {}) {
    const entry = getJournalEntry(id);
    if (!entry) return;
    const patch = {};
    if (dayId !== undefined)     patch.day_id = dayId;
    if (narration !== undefined) patch.narration = narration;
    if (pullQuote !== undefined) patch.pull_quote = pullQuote;
    Object.assign(entry, {
      day_id: patch.day_id !== undefined ? patch.day_id : entry.day_id,
      narration: patch.narration !== undefined ? patch.narration : entry.narration,
      pull_quote: patch.pull_quote !== undefined ? patch.pull_quote : entry.pull_quote,
    });
    await DB.setMeta(tripKey(CACHE_KEYS.journal), JOURNAL_ENTRIES);
    if (navigator.onLine) await SB.from('journal_entries').update(patch).eq('id', id);
  }

  async function deleteJournalEntry(id) {
    const entry = getJournalEntry(id);
    JOURNAL_ENTRIES = JOURNAL_ENTRIES.filter(e => e.id !== id);
    await DB.setMeta(tripKey(CACHE_KEYS.journal), JOURNAL_ENTRIES);
    if (navigator.onLine) await SB.from('journal_entries').delete().eq('id', id);
    // Clean up local photo cache + Storage for every photo this entry had.
    for (const p of (entry?.journal_photos || [])) {
      await DB.deleteJournalPhoto(p.id);
      if (navigator.onLine && p.storage_path) await SB.storage.from('journal-photos').remove([p.storage_path]);
    }
  }

  /* Adds one photo to an entry. Pass isHero:true to mark it as the
     hero image — any previous hero on the same entry is demoted. */
  async function addJournalPhoto(entryId, fileDataUrl, { isHero = false, sortOrder = 0, focalPosition = 'center' } = {}) {
    const entry = getJournalEntry(entryId);
    if (!entry) return;

    const localId = 'jp_' + Date.now() + '_' + Math.random().toString(36).slice(2,7);
    await DB.saveJournalPhoto(localId, fileDataUrl);

    let photo = { id: localId, entry_id: entryId, storage_path: null, is_hero: isHero, sort_order: sortOrder, focal_position: focalPosition };
    entry.journal_photos = entry.journal_photos || [];
    if (isHero) entry.journal_photos.forEach(p => { p.is_hero = false; });
    entry.journal_photos.push(photo);

    if (navigator.onLine && CURRENT_TRIP) {
      try {
        const blob = await (await fetch(fileDataUrl)).blob();
        const storagePath = `${CURRENT_TRIP.id}/${localId}.jpg`;
        const { error: upErr } = await SB.storage.from('journal-photos')
          .upload(storagePath, blob, { contentType: 'image/jpeg', upsert: true });
        if (!upErr) {
          if (isHero) {
            await SB.from('journal_photos').update({ is_hero: false }).eq('entry_id', entryId);
          }
          const { data, error } = await SB.from('journal_photos')
            .insert({ trip_id: CURRENT_TRIP.id, entry_id: entryId, storage_path: storagePath, is_hero: isHero, sort_order: sortOrder, focal_position: focalPosition })
            .select().single();
          if (!error && data) {
            const idx = entry.journal_photos.findIndex(p => p.id === localId);
            if (idx >= 0) entry.journal_photos[idx] = data;
            photo = data;
          }
        }
      } catch (e) { console.error('[Data] journal photo upload error:', e); }
    }
    await DB.setMeta(tripKey(CACHE_KEYS.journal), JOURNAL_ENTRIES);
    return photo;
  }

  async function setJournalHeroPhoto(entryId, photoId) {
    const entry = getJournalEntry(entryId);
    if (!entry) return;
    (entry.journal_photos || []).forEach(p => { p.is_hero = (p.id === photoId); });
    await DB.setMeta(tripKey(CACHE_KEYS.journal), JOURNAL_ENTRIES);
    if (navigator.onLine) {
      await SB.from('journal_photos').update({ is_hero: false }).eq('entry_id', entryId);
      await SB.from('journal_photos').update({ is_hero: true }).eq('id', photoId);
    }
  }

  // focalPosition is a CSS object-position keyword pair, e.g. 'top left',
  // 'center', 'bottom right' — a 3x3 grid of choices, not free-form
  // coordinates, so there's nothing to validate or clamp.
  async function setJournalPhotoFocal(entryId, photoId, focalPosition) {
    const entry = getJournalEntry(entryId);
    const photo = entry?.journal_photos?.find(p => p.id === photoId);
    if (photo) photo.focal_position = focalPosition;
    await DB.setMeta(tripKey(CACHE_KEYS.journal), JOURNAL_ENTRIES);
    if (navigator.onLine) {
      await SB.from('journal_photos').update({ focal_position: focalPosition }).eq('id', photoId);
    }
  }

  async function removeJournalPhoto(entryId, photoId) {
    const entry = getJournalEntry(entryId);
    if (!entry) return;
    const photo = (entry.journal_photos || []).find(p => p.id === photoId);
    entry.journal_photos = (entry.journal_photos || []).filter(p => p.id !== photoId);
    await DB.deleteJournalPhoto(photoId);
    await DB.setMeta(tripKey(CACHE_KEYS.journal), JOURNAL_ENTRIES);
    if (navigator.onLine) {
      await SB.from('journal_photos').delete().eq('id', photoId);
      if (photo?.storage_path) await SB.storage.from('journal-photos').remove([photo.storage_path]);
    }
  }

  async function getJournalPhotoUrl(photo) {
    if (!photo) return null;
    const local = await DB.loadJournalPhoto(photo.id).catch(() => null);
    if (local) return local;
    if (photo.storage_path && navigator.onLine) {
      const { data, error } = await SB.storage.from('journal-photos').createSignedUrl(photo.storage_path, 3600);
      if (!error && data?.signedUrl) return data.signedUrl;
    }
    return null;
  }

  // Resolves a set of user ids to display names via the profiles table
  // — used for the journal byline and the export's author filter, since
  // journal_entries only stores created_by (a bare user id) itself.
  let _profileCache = {};
  async function getProfilesByIds(ids) {
    const unique = [...new Set(ids)].filter(Boolean);
    const missing = unique.filter(id => !_profileCache[id]);
    if (missing.length && navigator.onLine) {
      const { data } = await SB.from('profiles').select('id, full_name, email').in('id', missing);
      (data || []).forEach(p => { _profileCache[p.id] = p.full_name || p.email || 'Traveler'; });
      missing.forEach(id => { if (!_profileCache[id]) _profileCache[id] = 'Traveler'; });
    }
    const out = {};
    unique.forEach(id => { out[id] = _profileCache[id] || 'Traveler'; });
    return out;
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
    await DB.setMeta(tripKey(CACHE_KEYS.food), FOOD_CATCHES);
    return FOOD_CATCHES[dishId];
  }

  async function unmarkDishCaught(dishId) {
    const catchId = FOOD_CATCHES[dishId]?.id;
    delete FOOD_CATCHES[dishId];
    if (navigator.onLine && catchId) {
      await SB.from('food_catches').delete().eq('id', catchId);
    }
    await DB.setMeta(tripKey(CACHE_KEYS.food), FOOD_CATCHES);
  }

  async function addFoodPhoto(dishId, fileDataUrl) {
    if (!FOOD_CATCHES[dishId]) await markDishCaught(dishId, {});
    const photoId = 'food_ph_' + Date.now();

    await DB.saveDexPhoto(photoId, fileDataUrl); // shared local photo store, distinct id prefix avoids collisions
    if (!FOOD_CATCHES[dishId].photoIds) FOOD_CATCHES[dishId].photoIds = [];
    FOOD_CATCHES[dishId].photoIds.push(photoId);
    await DB.setMeta(tripKey(CACHE_KEYS.food), FOOD_CATCHES);

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
    await DB.setMeta(tripKey(CACHE_KEYS.food), FOOD_CATCHES);

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
    const localId = 'local_' + Date.now();
    CUSTOM_LINKS.push({ ...newLink, id: localId });
    if (navigator.onLine) {
      try {
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
        if (error) throw error;
        CUSTOM_LINKS = CUSTOM_LINKS.filter(l => l.id !== localId);
        CUSTOM_LINKS.push(data);
      } catch (e) {
        console.warn('[Data] addCustomLink server write failed, queued for retry:', e.message || e);
        const user = (await SB.auth.getUser()).data.user;
        await enqueue('addCustomLink', { localId, row: { ...newLink, created_by: user?.id } });
      }
    } else {
      const user = (await SB.auth.getUser()).data.user;
      await enqueue('addCustomLink', { localId, row: { ...newLink, created_by: user?.id } });
    }
    await DB.setMeta(tripKey(CACHE_KEYS.links), CUSTOM_LINKS);
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
      try {
        const { error } = await SB.from('custom_links').update(patch).eq('id', id);
        if (error) throw error;
      } catch (e) {
        console.warn('[Data] updateCustomLink server write failed, queued for retry:', e.message || e);
        await enqueue('updateCustomLink', { id, patch });
      }
    } else {
      await enqueue('updateCustomLink', { id, patch });
    }
    await DB.setMeta(tripKey(CACHE_KEYS.links), CUSTOM_LINKS);
  }

  async function deleteCustomLink(id) {
    CUSTOM_LINKS = CUSTOM_LINKS.filter(l => l.id !== id);
    if (navigator.onLine) {
      try {
        const { error } = await SB.from('custom_links').delete().eq('id', id);
        if (error) throw error;
      } catch (e) {
        console.warn('[Data] deleteCustomLink server write failed, queued for retry:', e.message || e);
        await enqueue('deleteCustomLink', { id });
      }
    } else {
      await enqueue('deleteCustomLink', { id });
    }
    await DB.setMeta(tripKey(CACHE_KEYS.links), CUSTOM_LINKS);
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

  async function createTrip({ name, startDate, endDate, countries, coverEmoji, currency, defaultTimezone }) {
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
      settings: defaultTimezone ? { defaultTimezone } : {},
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
  // Set once at trip creation (see createTrip), used as the default for
  // every new stop/day instead of guessing from currency (which breaks
  // for any country whose currency isn't already in a hardcoded map —
  // see CURRENCY_TZ / CURRENCY_TZ_IANA, which only ever covered JPY/THB).
  function getDefaultTimezone() { return CURRENT_TRIP?.settings?.defaultTimezone || null; }
  async function setDefaultTimezone(tz) {
    if (!CURRENT_TRIP) return;
    const newSettings = { ...(CURRENT_TRIP.settings || {}), defaultTimezone: tz };
    CURRENT_TRIP.settings = newSettings;
    if (navigator.onLine) {
      const { error } = await SB.from('trips').update({ settings: newSettings }).eq('id', CURRENT_TRIP.id);
      if (error) { console.error('[Data] setDefaultTimezone error:', error); throw error; }
    }
  }

  // Total trip budget — was previously Config.BUDGET_MYR, a plain
  // in-memory constant left over from before this app was multi-trip.
  // It was never written to Supabase at all: editing it in Settings only
  // changed a session-local variable, so it silently reset to whatever
  // config.js hardcoded on every reload or trip switch. Moved to the
  // trip's own settings, same pattern as exchangeRates/defaultTimezone.
  function getBudgetTotal() { return CURRENT_TRIP?.settings?.budgetTotal ?? 0; }
  async function setBudgetTotal(amount) {
    if (!CURRENT_TRIP) return;
    const newSettings = { ...(CURRENT_TRIP.settings || {}), budgetTotal: amount };
    CURRENT_TRIP.settings = newSettings;
    if (navigator.onLine) {
      const { error } = await SB.from('trips').update({ settings: newSettings }).eq('id', CURRENT_TRIP.id);
      if (error) { console.error('[Data] setBudgetTotal error:', error); throw error; }
    }
  }

  /* ── EXCHANGE RATES (manual, per-trip) ───────────────────────
     Deliberately not a live FX API — nothing here is transactional,
     it's a reference total on the Payments summary, so a rate you set
     once and can edit any time is simpler and has one less external
     dependency to babysit (same reasoning as EXCHANGE_RATE_JPY already
     used for the flight-price watch). Rate = how many units of the
     trip's default currency one unit of the foreign currency is worth. */
  function getExchangeRates() { return CURRENT_TRIP?.settings?.exchangeRates || {}; }
  async function setExchangeRate(currencyCode, rateToTripCurrency) {
    if (!CURRENT_TRIP) return;
    const rates = { ...(CURRENT_TRIP.settings?.exchangeRates || {}) };
    if (rateToTripCurrency == null || isNaN(rateToTripCurrency)) delete rates[currencyCode];
    else rates[currencyCode] = rateToTripCurrency;
    const newSettings = { ...(CURRENT_TRIP.settings || {}), exchangeRates: rates };
    CURRENT_TRIP.settings = newSettings;
    if (navigator.onLine) {
      const { error } = await SB.from('trips').update({ settings: newSettings }).eq('id', CURRENT_TRIP.id);
      if (error) { console.error('[Data] setExchangeRate error:', error); throw error; }
    }
  }
  // Converts an amount in `currency` to the trip's default currency.
  // Same currency as trip default → passthrough, rate 1. Otherwise uses
  // the manual rate table; returns null (not 0) when no rate is set yet,
  // so the UI can distinguish "worth zero" from "can't convert this".
  function convertToTripCurrency(amount, currency) {
    const tripCur = getTripCurrency();
    if (!currency || currency === tripCur) return amount;
    const rate = getExchangeRates()[currency];
    if (rate == null) return null;
    return amount * rate;
  }

  /* ── PAYMENTS SUMMARY ─────────────────────────────────────────
     Pulls every stop + overnight that has a cost set, groups by
     payment status, and totals paid/outstanding — converting to the
     trip's default currency where the entry's own currency differs. */
  function getPaymentsSummary() {
    const tripCur = getTripCurrency();
    const items = [];

    STOPS.map(normaliseStop).forEach(s => {
      if (!s.booking?.cost) return;
      const cur = s.booking.costCurrency || tripCur;
      const payment = s.booking.payment || { status: 'unpaid' };
      const paidAmt = payment.status === 'paid' ? s.booking.cost
                    : payment.status === 'partial' ? (payment.amountPaid || 0)
                    : 0;
      items.push({
        id: s.id, name: s.name, type: 'stop', dayId: s.dayId,
        cost: s.booking.cost, currency: cur,
        status: payment.status || 'unpaid', paidAmount: paidAmt,
      });
    });

    Object.entries(OVERNIGHTS).forEach(([dayId, o]) => {
      if (!o.cost) return;
      const cur = o.cost_currency || tripCur;
      const status = o.payment_status || 'unpaid';
      const paidAmt = status === 'paid' ? o.cost : status === 'partial' ? (o.amount_paid || 0) : 0;
      items.push({
        id: o.id, name: o.name, type: 'overnight', dayId,
        cost: o.cost, currency: cur,
        status, paidAmount: paidAmt,
      });
    });

    let totalPaidConverted = 0, totalOutstandingConverted = 0;
    let hasUnconvertible = false;
    items.forEach(it => {
      const outstanding = it.cost - it.paidAmount;
      const paidC = convertToTripCurrency(it.paidAmount, it.currency);
      const outC  = convertToTripCurrency(outstanding, it.currency);
      if (paidC == null || outC == null) { hasUnconvertible = true; return; }
      totalPaidConverted += paidC;
      totalOutstandingConverted += outC;
    });

    const dayIds = DAYS.map(d => d.id);
    items.sort((a, b) => dayIds.indexOf(a.dayId) - dayIds.indexOf(b.dayId));

    return {
      items,
      tripCurrency: tripCur,
      totalPaid: totalPaidConverted,
      totalOutstanding: totalOutstandingConverted,
      hasUnconvertible, // true if some item's currency has no exchange rate set yet
    };
  }

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
    // Offline write queue
    flushQueue, getPendingCount,
    // Days
    getDays, updateDay, updateStory, deleteStory, addDay, deleteDay, getDayContents,
    getVisitedCountries, toggleVisitedCountry,
    // Stops
    getStops, getStopsByDay, addStop, updateStop, deleteStop,
    // Overnight
    getOvernight, updateOvernight, deleteOvernight, getUpcomingDeadlines, getIncomingLuggageForwarding,
    // Expenses
    getExpenses, addExpense, updateExpense, deleteExpense, getTotalSpentJPY,
    getTravelers, updateTravelers, calcSettlement, getBalances, setExpenses,
    // Packing
    getPackingItems, getPackingByCategory, togglePacking, addPackingItem, updatePackingItem, deletePacking,
    togglePackingFor, getPackingProgressByTraveler,
    // Dex
    getAnimals, getAnimal, getDexState, setDexState, isCaught, getDexProgress,
    markCaught, unmarkCaught, addDexPhoto, removeDexPhoto, getDexPhoto,
    getDishes, getDish, getFoodState, isDishCaught, getFoodProgress,
    markDishCaught, unmarkDishCaught, addFoodPhoto, removeFoodPhoto, getFoodPhoto,
    getStampStops, getStampState, isStampCollected, getStampProgress,
    markStampCollected, unmarkStampCollected, addStampPhoto, removeStampPhoto, getStampPhoto,
    // Bucket List
    getBucketItems, getBucketItem, getBucketCategories, getBucketProgress,
    addBucketItem, updateBucketItem, deleteBucketItem, toggleBucketDone, addBucketPhoto, removeBucketPhoto, getBucketPhoto,
    // Journal
    getJournalEntries, getJournalEntry, addJournalEntry, updateJournalEntry, deleteJournalEntry,
    addJournalPhoto, setJournalHeroPhoto, removeJournalPhoto, getJournalPhotoUrl, setJournalPhotoFocal, getProfilesByIds,
    // Stories + Glossary
    hasStory, getStory, getGlossary,
    // Links
    getCustomLinks, addCustomLink, updateCustomLink, deleteCustomLink, setCustomLinks,
    getJrPassLegs, getJrPassLegsForDay,
    applyTripTheme,
    // Trips
    getTrips, getCurrentTrip, switchTrip, createTrip, updateTripDetails, getTripCurrency, deleteTrip,
    getDefaultTimezone, setDefaultTimezone, getBudgetTotal, setBudgetTotal,
    getExchangeRates, setExchangeRate, convertToTripCurrency, getPaymentsSummary,
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
