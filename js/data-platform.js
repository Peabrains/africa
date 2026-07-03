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
  let CUSTOM_LINKS  = [];
  let GLOSSARY_TERMS = {};    // keyed by term (lowercase)
  let TRAVELERS     = ['Traveler'];

  /* ── Cache keys (IndexedDB via DB module) ────────────────── */
  const CACHE_KEYS = {
    trips:    'sb_trips',
    days:     'sb_days',
    stops:    'sb_stops',
    overnight:'sb_overnight',
    expenses: 'sb_expenses',
    packing:  'sb_packing',
    dex:      'sb_dex',
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
          { data: links },
          { data: glossary },
        ] = await Promise.all([
          SB.from('itinerary_days').select('*').eq('trip_id', tripId).order('day_index'),
          SB.from('stops').select('*').eq('trip_id', tripId).order('sort_order'),
          SB.from('overnights').select('*').eq('trip_id', tripId),
          SB.from('expenses').select('*').eq('trip_id', tripId).order('created_at'),
          SB.from('packing_items').select('*').eq('trip_id', tripId).order('sort_order'),
          SB.from('dex_catches').select('*, dex_photos(*)').eq('trip_id', tripId),
          SB.from('custom_links').select('*').eq('trip_id', tripId).order('created_at'),
          SB.from('glossary_terms').select('*').eq('trip_id', tripId),
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
        (dexCatches || []).forEach(c => {
          DEX_CATCHES[c.animal_id] = {
            ...c,
            photoIds: (c.dex_photos || []).map(p => p.id),
          };
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
    CUSTOM_LINKS = await DB.getMeta(CACHE_KEYS.links)    || [];
    GLOSSARY_TERMS = await DB.getMeta(CACHE_KEYS.glossary) || {};
    console.log('[Data] Loaded from cache:', DAYS.length, 'days');
  }

  /* ── Init ────────────────────────────────────────────────── */
  async function init(tripId) {
    if (!tripId) {
      // Load trips list, pick first active trip
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
    }
  }

  /* ── Normalise a stop row from Supabase to match itinerary.js field names ── */
  function normaliseStop(s) {
    return {
      ...s,
      // camelCase aliases for snake_case Supabase columns
      dayId:         s.day_id,
      timeZone:      s.timezone || 'EAT',
      transportType: s.transport_type || 'walk',
      needsBooking:  s.needs_booking || false,
      isBooked:      s.is_booked || false,
      flightIncluded: s.flight_detail?.included === true,
      flightExcluded: s.flight_detail?.included === false,
      trainDetail:   null,
      booking: {
        status: s.is_booked ? 'booked' : 'open',
        ref:    s.flight_detail?.ref || '',
        cost:   null,
      },
      // flight detail fields itinerary.js uses
      ...(s.flight_detail ? {
        airline:    s.flight_detail.airline || '',
        flightNo:   s.flight_detail.flight_no || '',
        origin:     s.flight_detail.origin || '',
        destination:s.flight_detail.destination || '',
        departTime: s.flight_detail.depart_time || s.time || '',
        arriveTime: s.flight_detail.arrive_time || '',
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
  function getStopsByDay(dayId)     { return STOPS.filter(s => s.day_id === dayId); }

  async function addStop(stop) {
    const newStop = {
      trip_id:        CURRENT_TRIP.id,
      day_id:         stop.dayId,
      sort_order:     STOPS.filter(s => s.day_id === stop.dayId).length,
      name:           stop.name,
      activity:       stop.activity || '',
      time:           stop.time || '',
      timezone:       stop.timeZone || 'EAT',
      transport:      stop.transport || '',
      transport_type: stop.transportType || 'walk',
      notes:          stop.notes || '',
      needs_booking:  stop.needsBooking || false,
      is_booked:      false,
      category:       stop.category || null,
    };

    if (navigator.onLine) {
      const { data, error } = await SB.from('stops').insert(newStop).select().single();
      if (error) throw error;
      STOPS.push(data);
      return data;
    } else {
      // Queue for later sync
      newStop.id = 'local_' + Date.now();
      STOPS.push(newStop);
      await DB.setMeta(CACHE_KEYS.stops, STOPS);
      return newStop;
    }
  }

  async function updateStop(id, changes) {
    const idx = STOPS.findIndex(s => s.id === id);
    if (idx < 0) return;

    Object.assign(STOPS[idx], changes);

    if (navigator.onLine) {
      const { error } = await SB.from('stops').update(changes).eq('id', id);
      if (error) console.error('[Data] updateStop error:', error);
    }
    await DB.setMeta(CACHE_KEYS.stops, STOPS);
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

  async function updateOvernight(dayId, changes) {
    if (!OVERNIGHTS[dayId]) return;
    Object.assign(OVERNIGHTS[dayId], changes);
    if (navigator.onLine) {
      await SB.from('overnights').update(changes).eq('id', OVERNIGHTS[dayId].id);
    }
    await DB.setMeta(CACHE_KEYS.overnight, OVERNIGHTS);
  }

  /* ── EXPENSES API ────────────────────────────────────────── */
  function getExpenses()      { return EXPENSES; }
  function getTotalSpentJPY() { return EXPENSES.reduce((s,e) => s + (e.amount_usd || 0), 0); }
  function getTravelers()     { return TRAVELERS; }
  function getTripName()      { return CURRENT_TRIP?.name || 'Safari App'; }

  async function addExpense(exp) {
    const newExp = {
      trip_id:       CURRENT_TRIP.id,
      description:   exp.description || exp.desc || '',
      amount_usd:    exp.amountJPY || exp.amount_usd || 0,
      category:      exp.category || null,
      paid_by:       exp.paidBy || null,
      split_between: exp.splitBetween || [],
      day_label:     exp.dayLabel || null,
      created_by:    (await SB.auth.getUser()).data.user?.id,
    };

    EXPENSES.push({ ...newExp, id: 'local_' + Date.now() });

    if (navigator.onLine) {
      const { data, error } = await SB.from('expenses').insert(newExp).select().single();
      if (!error && data) {
        // Replace local entry with real one
        EXPENSES = EXPENSES.filter(e => !e.id.startsWith('local_'));
        EXPENSES.push(data);
      }
    }
    await DB.setMeta(CACHE_KEYS.expenses, EXPENSES);
    return newExp;
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
    return PACKING.reduce((acc, item) => {
      if (!acc[item.category]) acc[item.category] = [];
      acc[item.category].push(item);
      return acc;
    }, {});
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

    // Store locally first (always works offline)
    await DB.saveDexPhoto(photoId, fileDataUrl);
    if (!DEX_CATCHES[animalId].photoIds) DEX_CATCHES[animalId].photoIds = [];
    DEX_CATCHES[animalId].photoIds.push(photoId);
    await DB.setMeta(CACHE_KEYS.dex, DEX_CATCHES);
    return photoId;
  }

  async function removeDexPhoto(animalId, photoId) {
    if (!DEX_CATCHES[animalId]) return;
    DEX_CATCHES[animalId].photoIds = (DEX_CATCHES[animalId].photoIds || []).filter(id => id !== photoId);
    await DB.deleteDexPhoto(photoId);
    await DB.setMeta(CACHE_KEYS.dex, DEX_CATCHES);
  }

  async function getDexPhoto(photoId) {
    return await DB.loadDexPhoto(photoId);
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
  function getCustomLinks() { return CUSTOM_LINKS; }

  async function addCustomLink({ title, url }) {
    const newLink = {
      trip_id:    CURRENT_TRIP.id,
      title,
      url,
    };
    CUSTOM_LINKS.push({ ...newLink, id: 'local_' + Date.now() });
    if (navigator.onLine) {
      const user = (await SB.auth.getUser()).data.user;
      const { data, error } = await SB.from('custom_links')
        .insert({ ...newLink, created_by: user?.id })
        .select().single();
      if (!error && data) {
        CUSTOM_LINKS = CUSTOM_LINKS.filter(l => !l.id.startsWith('local_'));
        CUSTOM_LINKS.push(data);
      }
    }
    await DB.setMeta(CACHE_KEYS.links, CUSTOM_LINKS);
  }

  async function deleteCustomLink(id) {
    CUSTOM_LINKS = CUSTOM_LINKS.filter(l => l.id !== id);
    if (navigator.onLine) await SB.from('custom_links').delete().eq('id', id);
    await DB.setMeta(CACHE_KEYS.links, CUSTOM_LINKS);
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
    App.reload();
  }

  /* ── RESERVATIONS (static from trip settings) ────────────── */
  function getActivityReservations()  { return CURRENT_TRIP?.settings?.activities  || []; }
  function getTransportReservations() { return CURRENT_TRIP?.settings?.transport   || []; }
  function getTripInclusions()        { return CURRENT_TRIP?.settings?.inclusions  || []; }
  function getTripExclusions()        { return CURRENT_TRIP?.settings?.exclusions  || []; }
  function getSOS()                   { return CURRENT_TRIP?.settings?.sos         || {}; }

  /* ── STUBS for backward compat ───────────────────────────── */
  function getStampStops()    { return []; }
  function isStampCollected() { return false; }
  async function toggleStamp()  { return false; }
  function getStampProgress() { return { collected:0, total:0 }; }
  function calcSettlement()   { return []; }
  function getBalances()      { return {}; }
  async function resetToSeed() { await loadTripData(CURRENT_TRIP?.id); }
  async function updateTravelers(names) { TRAVELERS = names; }
  function setTripName() {}
  function setCustomLinks(links) { CUSTOM_LINKS = links; }
  function setDexState(state) { DEX_CATCHES = state; }
  function setExpenses(exps)  { EXPENSES = exps; }

  return {
    init, loadTrips,
    // Days
    getDays,
    // Stops
    getStops, getStopsByDay, addStop, updateStop, deleteStop,
    // Overnight
    getOvernight, updateOvernight,
    // Expenses
    getExpenses, addExpense, deleteExpense, getTotalSpentJPY,
    getTravelers, updateTravelers, calcSettlement, getBalances, setExpenses,
    // Packing
    getPackingItems, getPackingByCategory, togglePacking, addPackingItem, deletePacking,
    // Dex
    getAnimals, getAnimal, getDexState, setDexState, isCaught, getDexProgress,
    markCaught, unmarkCaught, addDexPhoto, removeDexPhoto, getDexPhoto,
    // Stories + Glossary
    hasStory, getStory, getGlossary,
    // Links
    getCustomLinks, addCustomLink, deleteCustomLink, setCustomLinks,
    // Trips
    getTrips, getCurrentTrip, switchTrip,
    // Trip info
    getTripName, setTripName,
    getActivityReservations, getTransportReservations,
    getTripInclusions, getTripExclusions, getSOS,
    // Stubs
    getStampStops, isStampCollected, toggleStamp, getStampProgress, resetToSeed,
  };

})();

window.Data = Data;
