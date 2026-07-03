/* ============================================================
   MIGRATION — Seed the traveler's Africa Safari 2026 into Supabase
   
   RUN THIS IN SUPABASE SQL EDITOR after creating your user account.
   
   BEFORE RUNNING:
   1. Sign up in the app first so your user exists in auth.users
   2. Get your user ID from Supabase → Authentication → Users
   3. Replace 'YOUR-USER-ID-HERE' below with your actual UUID
   ============================================================ */

-- ── STEP 1: Set your user ID ─────────────────────────────────
-- Replace this with your actual user UUID from Supabase Auth
do $$
declare
  v_user_id   uuid := 'YOUR-USER-ID-HERE';   -- ← REPLACE THIS
  v_trip_id   uuid;
  v_day_id    uuid;
  v_d0_id     uuid; v_d1_id  uuid; v_d2_id  uuid; v_d3_id  uuid;
  v_d4_id     uuid; v_d5_id  uuid; v_d6_id  uuid; v_d7_id  uuid;
  v_d8_id     uuid; v_d9_id  uuid; v_d10_id uuid; v_d11_id uuid;
  v_d12_id    uuid; v_d13_id uuid; v_d14_id uuid; v_d15_id uuid;
  v_d16_id    uuid; v_d17_id uuid;
begin

-- ── STEP 2: Create the trip ───────────────────────────────────
insert into public.trips (
  name, description, start_date, end_date,
  countries, cover_emoji, status, owner_id,
  features, settings
) values (
  'Africa Safari 2026',
  '15-night luxury safari across Tanzania, Kenya and Uganda. Operated by Wildsenses Holidays.',
  '2026-08-30',
  '2026-09-17',
  array['Tanzania','Kenya','Uganda'],
  '🌍',
  'upcoming',
  v_user_id,
  '{
    "dex": true,
    "dex_type": "wildlife_safari",
    "weather": true,
    "expenses": true,
    "packing": true,
    "phrasebook": true,
    "phrasebook_language": "Swahili",
    "stories": true,
    "map": true
  }'::jsonb,
  '{
    "timezone": "Africa/Nairobi",
    "currency": "USD",
    "budget_usd": 0,
    "travelers": ["Traveler"],
    "operator_name": "Wildsenses Holidays",
    "operator_phone": "+852 2813 8778",
    "operator_website": "www.wildsensesholidays.com"
  }'::jsonb
) returning id into v_trip_id;

raise notice 'Trip created: %', v_trip_id;

-- ── STEP 3: Add owner as trip member ─────────────────────────
insert into public.trip_members (trip_id, user_id, role, status)
values (v_trip_id, v_user_id, 'owner', 'active');

-- ── STEP 4: Create itinerary days ────────────────────────────
insert into public.itinerary_days (trip_id, day_index, day_label, date, title, locality, segment)
values (v_trip_id, 0, 'D0', '2026-08-30', 'Depart KUL — Overnight to Doha', 'KUL', 'transit')
returning id into v_d0_id;

insert into public.itinerary_days (trip_id, day_index, day_label, date, title, locality, segment,
  story_title, story_body)
values (v_trip_id, 1, 'D1', '2026-09-01', 'Kilimanjaro → Ngorongoro', 'Ngorongoro', 'tanzania',
  'The mountain nobody could name',
  '["\"Ngorongoro\" comes from the sound of a cowbell — Maasai herders named it ngoro ngoro, a small domestic detail at the root of one of the most dramatic landscapes on Earth. The crater formed when a volcano once perhaps as tall as Kilimanjaro collapsed in on itself around 2.5 million years ago, leaving the vast walled bowl that exists today — one of the only places where people, wildlife, and deep human history share the same ground.",
   "A short drive away sits Olduvai Gorge, the \"Cradle of Mankind.\" In the 1950s, archaeologists Mary and Louis Leakey spent over thirty years here uncovering fossils of more than 60 early humans — the most continuous known record of human evolution on Earth. Standing at the crater''s rim, you''re on ground that''s been continuously inhabited for nearly four million years.",
   "The descent itself happens before dawn — mist on the rim, ancient forest pressing in, the floor revealing itself below. By morning, the crater may deliver lions resting in the open, elephants crossing the grass, and — if the day cooperates — all of the Big Five in a single sitting, a density of life rarely matched anywhere else in Africa."]'::jsonb)
returning id into v_d1_id;

insert into public.itinerary_days (trip_id, day_index, day_label, date, title, locality, segment)
values (v_trip_id, 2, 'D2', '2026-09-02', 'Full day Ngorongoro Crater', 'Ngorongoro', 'tanzania')
returning id into v_d2_id;

insert into public.itinerary_days (trip_id, day_index, day_label, date, title, locality, segment)
values (v_trip_id, 3, 'D3', '2026-09-03', 'Manyara → Central Serengeti', 'Central Serengeti', 'tanzania')
returning id into v_d3_id;

insert into public.itinerary_days (trip_id, day_index, day_label, date, title, locality, segment,
  story_title, story_body)
values (v_trip_id, 4, 'D4', '2026-09-04', 'Central Serengeti — Big Cats day', 'Central Serengeti', 'tanzania',
  'The place where the land runs on forever',
  '["\"Serengeti\" comes from the Maasai word siringet — \"the place where the land runs on forever.\" It''s not poetry, just description: standing here, the horizon stretches unbroken in every direction, interrupted only by the occasional acacia or granite kopje. The Maasai grazed cattle on these plains for roughly 200 years before the first European explorer arrived in 1892.",
   "Central Serengeti, around the Seronera Valley, is the ecosystem''s reliable heart — permanent rivers mean resident wildlife year-round, which is why this stretch holds some of the highest concentrations of lion and leopard anywhere in Africa. The kopjes scattered across the plains are ancient granite islands that predator families use generation after generation as denning sites and lookout posts.",
   "This is the kind of day where patience pays off slowly rather than all at once — a pride draped across rock in the morning heat, a leopard''s tail hanging from a tree branch, the plains doing what they''ve done for millions of years before anyone arrived to watch."]'::jsonb)
returning id into v_d4_id;

insert into public.itinerary_days (trip_id, day_index, day_label, date, title, locality, segment)
values (v_trip_id, 5, 'D5', '2026-09-05', 'Central → Northern Serengeti', 'Northern Serengeti', 'tanzania')
returning id into v_d5_id;

insert into public.itinerary_days (trip_id, day_index, day_label, date, title, locality, segment,
  story_title, story_body)
values (v_trip_id, 6, 'D6', '2026-09-06', 'Northern Serengeti — Great Migration', 'Northern Serengeti', 'tanzania',
  'The river, the herd, and a sunrise from above',
  '["Each year, around two million wildebeest, zebra, and gazelle move in a vast clockwise loop between Tanzania and Kenya, chasing the rain. The Mara River crossing is the migration''s most brutal bottleneck — crocodiles waiting in the current, the herd massing on the bank for hours or days before something, never quite explainable, triggers thousands to surge across at once. Roughly 250,000 wildebeest die on this journey every year, from exhaustion, drowning, or predation.",
   "And this is also balloon morning. The tradition of a champagne toast after landing actually dates back to 1783, to the very first manned balloon flight in France — pilots reportedly used it to reassure startled farmers they weren''t aliens. Today''s flights launch in darkness, drift in near-total silence over the plains as the sun comes up, low enough at times to startle a hippo or trace a giraffe''s shadow across the grass.",
   "Two ways of seeing the same place in one day — eye-level chaos at the river, and silent, sweeping stillness from above it."]'::jsonb)
returning id into v_d6_id;

insert into public.itinerary_days (trip_id, day_index, day_label, date, title, locality, segment)
values (v_trip_id, 7, 'D7', '2026-09-07', 'Northern Serengeti — River Crossings', 'Northern Serengeti', 'tanzania')
returning id into v_d7_id;

insert into public.itinerary_days (trip_id, day_index, day_label, date, title, locality, segment)
values (v_trip_id, 8, 'D8', '2026-09-08', 'Northern Serengeti — River Crossings', 'Northern Serengeti', 'tanzania')
returning id into v_d8_id;

insert into public.itinerary_days (trip_id, day_index, day_label, date, title, locality, segment,
  story_title, story_body)
values (v_trip_id, 9, 'D9', '2026-09-09', 'Serengeti → Kilimanjaro → Nairobi', 'Nairobi', 'kenya',
  'Cool waters and a railway depot that became a capital',
  '["Nairobi means \"the place of cool waters\" — from the Maasai phrase Enkare Nyirobi, a reference to the cold-water streams that once ran through a swampland here. In 1899, British engineers building a railway from Mombasa to Uganda needed a flat midpoint to rest workers and store supplies — and this unremarkable swamp, at a cool 1,800m elevation free of malarial mosquitoes, fit the brief. Within a decade it had become the capital of British East Africa.",
   "Today it is East Africa''s largest city — notably the only capital in the world that contains a national park within its own boundaries, where lions still roam a few kilometers from the financial district. It grew from a railway depot into a city of nearly five million in under a century.",
   "An overnight stay here is a contrast the rest of the trip won''t prepare you for: city sounds after ten days of near-silence on the plains, a glass of wine in a hotel restaurant, the strange feeling of being very far from anywhere and also right in the middle of everything."]'::jsonb)
returning id into v_d9_id;

insert into public.itinerary_days (trip_id, day_index, day_label, date, title, locality, segment)
values (v_trip_id, 10, 'D10', '2026-09-10', 'Nairobi → Amboseli National Park', 'Amboseli', 'kenya')
returning id into v_d10_id;

insert into public.itinerary_days (trip_id, day_index, day_label, date, title, locality, segment,
  story_title, story_body)
values (v_trip_id, 11, 'D11', '2026-09-11', 'Amboseli — Elephants & Kilimanjaro views', 'Amboseli', 'kenya',
  'Salty dust, and the elephants who remember',
  '["\"Amboseli\" comes from the Maasai word empusel — \"salty, dusty place,\" for the dry, cracked lakebed at its center. Yet the park supports some of Africa''s largest elephant herds, fed by underground water flowing from Kilimanjaro''s snowmelt and surfacing in its swamps — life sustained by a mountain in a different country entirely.",
   "Since 1972, researchers here have run the longest continuous elephant study in the world, tracking nearly 4,000 individuals by name across generations. Their core finding reshaped how we understand elephants: herds are led by older matriarchs who hold the group''s memory — where the water is in a drought, which threats matter, which routes are safe.",
   "With Kilimanjaro often clear in the morning light, it produces one of safari''s most photographed scenes: enormous, unhurried elephants moving beneath Africa''s highest peak."]'::jsonb)
returning id into v_d11_id;

insert into public.itinerary_days (trip_id, day_index, day_label, date, title, locality, segment,
  story_title, story_body)
values (v_trip_id, 12, 'D12', '2026-09-12', 'Amboseli — Maasai & safari activities', 'Amboseli', 'kenya',
  'What cattle mean',
  '["The Maasai believe Enkai — their god — gave all the world''s cattle to them at the beginning of time. Cattle are wealth, yes, but also identity, spiritual duty, and social currency. A man''s standing in his community is counted in cows. Marriages are negotiated in cows. Ceremonies, healings, and rites of passage all involve cattle.",
   "The Adamu jumping dance has a similar weight — it is a warrior tradition in which young men compete to leap as high as possible while singing in a group. What looks celebratory to an outsider carries years of preparation and social meaning behind it.",
   "A Maasai cultural walk in Amboseli offers something the vehicle can''t — the experience of moving through the same landscape on foot, through eyes that have read it for centuries, with a guide pointing to what the game drive would pass without stopping."]'::jsonb)
returning id into v_d12_id;

insert into public.itinerary_days (trip_id, day_index, day_label, date, title, locality, segment,
  story_title, story_body)
values (v_trip_id, 13, 'D13', '2026-09-13', 'Amboseli → Nairobi → Entebbe', 'Entebbe', 'uganda',
  'A seat on the lake',
  '["Entebbe means \"seat\" in Luganda — from e ntebe, the word for a chair — named because a chief of the Mamba clan once sat here to adjudicate disputes. The British chose it in 1893 as their colonial administrative base, drawn by its position on a peninsula jutting into Lake Victoria. It remained Uganda''s capital until 1958, when Kampala took over.",
   "The airport here carries a particular piece of history. In 1952, a young Queen Elizabeth II departed from this runway after learning her father had died and that she was now Queen. In 1976, Israeli commandos landed here in darkness to free over a hundred hostages in one of the most audacious rescue operations of the 20th century.",
   "Arriving here from the Kenyan plains, the shift is immediate: equatorial green replaces dry savannah, the air is warmer and heavier, the lake glitters through the trees. Uganda announces itself differently to Tanzania and Kenya — slower, lusher, less famous, and about to offer something neither of the others can."]'::jsonb)
returning id into v_d13_id;

insert into public.itinerary_days (trip_id, day_index, day_label, date, title, locality, segment,
  story_title, story_body)
values (v_trip_id, 14, 'D14', '2026-09-14', 'Entebbe → Bwindi Impenetrable Forest', 'Bwindi', 'uganda',
  'Into the Pearl of Africa',
  '["Winston Churchill visited Uganda in 1907 and called it \"the Pearl of Africa\" — noting that for sheer beauty of landscape, fertility of soil, and variety of climate, it stood apart from anything else he had seen on the continent. The journey from Entebbe to Bwindi gives a sense of why: the road climbs through banana plantations, terraced hillsides, and tea estates before the landscape shifts entirely into the volcanic hills of southwestern Uganda.",
   "Bwindi Impenetrable Forest sits at between 1,160 and 2,607 meters altitude — an ancient montane rainforest that survived the ice ages when much of Africa''s forest contracted, making it one of the most biodiverse places on Earth: 120 mammal species, 348 birds, half the world''s remaining mountain gorillas.",
   "The drive is long — typically five to six hours — and deliberately arrives in late afternoon, giving a night to rest before the early start tomorrow. It is worth sitting with the journey itself: the gradual disappearance of the savannah world left behind in Tanzania and Kenya, replaced by something older, cooler, and entirely its own."]'::jsonb)
returning id into v_d14_id;

insert into public.itinerary_days (trip_id, day_index, day_label, date, title, locality, segment,
  story_title, story_body)
values (v_trip_id, 15, 'D15', '2026-09-15', 'Mountain Gorilla Habituation Experience', 'Bwindi', 'uganda',
  'The Keepers of the Forest',
  '["The forest had another name first. Long before it was known for gorillas, Bwindi was home to the Batwa — \"the Keepers of the Forest,\" believed to have lived here for 60,000 years, considering the gorillas part of their forest family. In 1991, when Bwindi became a national park to protect the gorillas, the Batwa were evicted without land or compensation — a complicated truth underneath every trek made here since.",
   "This is the habituation experience, not standard trekking — up to four hours, in a small group of four, with a gorilla family still mid-way through the slow process of learning to tolerate humans. It tends to feel rawer and less polished than a typical one-hour visit, because it is.",
   "Then, at some point, a silverback looks directly back. It registers differently than any other wildlife encounter — gorillas share roughly 98% of human evolutionary history, and the moment is rarely remembered as \"I saw gorillas.\" It''s remembered as \"I was seen by one.\""]'::jsonb)
returning id into v_d15_id;

insert into public.itinerary_days (trip_id, day_index, day_label, date, title, locality, segment)
values (v_trip_id, 16, 'D16', '2026-09-16', 'Bwindi → Entebbe → Doha (overnight)', 'Entebbe', 'transit')
returning id into v_d16_id;

insert into public.itinerary_days (trip_id, day_index, day_label, date, title, locality, segment)
values (v_trip_id, 17, 'D17', '2026-09-17', 'Doha → KUL — Arrive home', 'KUL', 'transit')
returning id into v_d17_id;

raise notice 'All days created. Trip ID: %', v_trip_id;

-- ── STEP 5: Seed packing list (key items) ────────────────────
insert into public.packing_items (trip_id, category, item, essential, sort_order) values
  (v_trip_id, 'Documents', 'Passport (valid >6 months)', true, 1),
  (v_trip_id, 'Documents', 'Travel insurance documents', true, 2),
  (v_trip_id, 'Documents', 'Visa (Tanzania, Kenya, Uganda — check requirements)', true, 3),
  (v_trip_id, 'Documents', 'Wildsenses booking confirmation', true, 4),
  (v_trip_id, 'Documents', 'Yellow fever vaccination certificate', true, 5),
  (v_trip_id, 'Documents', 'Emergency card (printed)', true, 6),
  (v_trip_id, 'Documents', 'Gorilla permit confirmation printout', true, 7),
  (v_trip_id, 'Health', 'Anti-malaria medication (prescribed)', true, 1),
  (v_trip_id, 'Health', 'DEET insect repellent 50%+', true, 2),
  (v_trip_id, 'Health', 'Sunscreen SPF 50+', true, 3),
  (v_trip_id, 'Health', 'Basic first aid kit', true, 4),
  (v_trip_id, 'Health', 'Altitude sickness tablets (Ngorongoro 2,300m, Bwindi 2,161m)', true, 5),
  (v_trip_id, 'Health', 'Hand sanitiser', true, 6),
  (v_trip_id, 'Health', 'Rehydration salts', false, 7),
  (v_trip_id, 'Safari Clothing', 'Khaki/beige long-sleeve shirts x 4', true, 1),
  (v_trip_id, 'Safari Clothing', 'Safari trousers x 3 (zip-off recommended)', true, 2),
  (v_trip_id, 'Safari Clothing', 'Fleece or light down jacket (Ngorongoro & Bwindi get cold)', true, 3),
  (v_trip_id, 'Safari Clothing', 'Waterproof rain jacket', true, 4),
  (v_trip_id, 'Safari Clothing', 'Wide-brim hat', true, 5),
  (v_trip_id, 'Safari Clothing', 'Comfortable walking shoes', true, 6),
  (v_trip_id, 'Safari Clothing', 'Waterproof hiking boots (gorilla trek)', true, 7),
  (v_trip_id, 'Safari Clothing', 'Gaiters (gorilla trek)', false, 8),
  (v_trip_id, 'Safari Clothing', 'Neutral-colour swimsuit', false, 9),
  (v_trip_id, 'Safari Clothing', 'Lightweight gloves (Bwindi)', false, 10),
  (v_trip_id, 'Camera & Tech', 'Camera with zoom lens (200mm+ recommended)', false, 1),
  (v_trip_id, 'Camera & Tech', 'Extra memory cards', false, 2),
  (v_trip_id, 'Camera & Tech', 'Spare camera batteries + charger', false, 3),
  (v_trip_id, 'Camera & Tech', 'Universal travel adaptor (UK-type G plugs)', true, 4),
  (v_trip_id, 'Camera & Tech', 'Power bank (large capacity)', true, 5),
  (v_trip_id, 'Money', 'USD cash (small bills for tips)', true, 1),
  (v_trip_id, 'Money', 'Credit card with no foreign transaction fees', true, 2);

raise notice 'Packing list seeded';
raise notice '✓ Migration complete. Trip ID: %', v_trip_id;
raise notice 'Save this Trip ID — you will need it for Session 3.';

end $$;
