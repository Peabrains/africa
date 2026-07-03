/* ============================================================
   STOPS MIGRATION — Seeds all 47 stops for Africa Safari 2026
   Run in Supabase SQL Editor after migrate.sql
   ============================================================ */

do $$
declare
  v_trip_id uuid := '83891de6-44ee-4ec2-bb95-6726cbd8c370';
  v_d0  uuid; v_d1  uuid; v_d2  uuid; v_d3  uuid;
  v_d4  uuid; v_d5  uuid; v_d6  uuid; v_d7  uuid;
  v_d8  uuid; v_d9  uuid; v_d10 uuid; v_d11 uuid;
  v_d12 uuid; v_d13 uuid; v_d14 uuid; v_d15 uuid;
  v_d16 uuid; v_d17 uuid;
begin

-- Get day IDs dynamically by label
select id into v_d0  from public.itinerary_days where trip_id = v_trip_id and day_label = 'D0';
select id into v_d1  from public.itinerary_days where trip_id = v_trip_id and day_label = 'D1';
select id into v_d2  from public.itinerary_days where trip_id = v_trip_id and day_label = 'D2';
select id into v_d3  from public.itinerary_days where trip_id = v_trip_id and day_label = 'D3';
select id into v_d4  from public.itinerary_days where trip_id = v_trip_id and day_label = 'D4';
select id into v_d5  from public.itinerary_days where trip_id = v_trip_id and day_label = 'D5';
select id into v_d6  from public.itinerary_days where trip_id = v_trip_id and day_label = 'D6';
select id into v_d7  from public.itinerary_days where trip_id = v_trip_id and day_label = 'D7';
select id into v_d8  from public.itinerary_days where trip_id = v_trip_id and day_label = 'D8';
select id into v_d9  from public.itinerary_days where trip_id = v_trip_id and day_label = 'D9';
select id into v_d10 from public.itinerary_days where trip_id = v_trip_id and day_label = 'D10';
select id into v_d11 from public.itinerary_days where trip_id = v_trip_id and day_label = 'D11';
select id into v_d12 from public.itinerary_days where trip_id = v_trip_id and day_label = 'D12';
select id into v_d13 from public.itinerary_days where trip_id = v_trip_id and day_label = 'D13';
select id into v_d14 from public.itinerary_days where trip_id = v_trip_id and day_label = 'D14';
select id into v_d15 from public.itinerary_days where trip_id = v_trip_id and day_label = 'D15';
select id into v_d16 from public.itinerary_days where trip_id = v_trip_id and day_label = 'D16';
select id into v_d17 from public.itinerary_days where trip_id = v_trip_id and day_label = 'D17';

raise notice 'Day IDs loaded. D1=%', v_d1;

-- ── D0 ───────────────────────────────────────────────────────
insert into public.stops (trip_id,day_id,sort_order,name,activity,transport,transport_type,time,timezone,lat,lng,is_booked,needs_booking,category,flight_detail) values
(v_trip_id,v_d0,1,'KUL → Doha (Qatar Airways)',
 'Depart Kuala Lumpur in the evening. Overnight flight to Doha.',
 'Qatar Airways · KUL → DOH · Depart 22:20 · Arrive 22:45+1',
 'plane','22:20','MYT',null,null,true,true,'transport',
 '{"airline":"Qatar Airways","flight_no":"QR","origin":"KUL","destination":"DOH","depart_time":"22:20","arrive_time":"22:45","ref":"QR KUL-DOH","included":false}'::jsonb);

-- ── D1 ───────────────────────────────────────────────────────
insert into public.stops (trip_id,day_id,sort_order,name,activity,transport,transport_type,time,timezone,lat,lng,is_booked,needs_booking,category,flight_detail) values
(v_trip_id,v_d1,1,'Doha → Kilimanjaro (Qatar Airways)',
 'Overnight connection arrives Kilimanjaro in the morning. Greeted by operator representative.',
 'Qatar Airways · DOH → JRO · Depart 01:55 · Arrive 07:35',
 'plane','01:55','AST',-3.4295,36.6773,true,true,'transport',
 '{"airline":"Qatar Airways","flight_no":"QR","origin":"DOH","destination":"JRO","depart_time":"01:55","arrive_time":"07:35","ref":"QR DOH-JRO","included":false}'::jsonb),

(v_trip_id,v_d1,2,'Kilimanjaro → Manyara (light aircraft)',
 'Connect light aircraft to Lake Manyara airstrip. Scenic flight over the Rift Valley.',
 'Light aircraft · JRO → Manyara · ~45 mins · INCLUDED in package',
 'plane','09:00','EAT',-3.3667,35.8167,true,false,'transport',
 '{"airline":"Light Aircraft","origin":"JRO","destination":"Manyara","depart_time":"~09:00","arrive_time":"~09:45","included":true}'::jsonb),

(v_trip_id,v_d1,3,'Maasai Village cultural visit',
 'Cultural visit to local Maasai village on scenic drive from airstrip to The Highlands camp.',
 'Road transfer with guide · ~1 hr',
 'car','10:00','EAT',-3.2500,35.7000,true,false,'activity',null),

(v_trip_id,v_d1,4,'Arrive Asilia The Highlands',
 'Arrive camp in the afternoon. Settle into Dome Suite. Dinner with fireplace — it gets chilly at 2,300m.',
 'Road transfer from Maasai village · ~30 min',
 'car','14:00','EAT',-3.2183,35.5167,true,false,null,null);

-- ── D2 ───────────────────────────────────────────────────────
insert into public.stops (trip_id,day_id,sort_order,name,activity,transport,transport_type,time,timezone,lat,lng,is_booked,needs_booking,category,flight_detail) values
(v_trip_id,v_d2,1,'Descent into Ngorongoro Crater',
 'Early morning descent to the 300 km² crater floor. One of the Seven Natural Wonders of Africa. 25,000 mammals including the Big Five and 16 endangered black rhino.',
 'Open 4WD safari vehicle with guide · Descent from crater rim',
 'car','06:00','EAT',-3.1740,35.5900,true,false,'activity',null),

(v_trip_id,v_d2,2,'Full day Ngorongoro game drive',
 'Lions, hyena packs, zebra, wildebeest, hippo, flamingo at Lake Magadi, elephant and leopard. Bush picnic lunch in the crater.',
 'All-day game drive · Bush lunch included',
 'car','06:30','EAT',-3.1740,35.5900,false,false,'activity',null),

(v_trip_id,v_d2,3,'Return to The Highlands',
 'Ascend crater rim. Dinner at camp. Optional hike at Olmoti rim available.',
 'Ascent to crater rim · Return to camp',
 'car','17:00','EAT',-3.2183,35.5167,false,false,null,null);

-- ── D3 ───────────────────────────────────────────────────────
insert into public.stops (trip_id,day_id,sort_order,name,activity,transport,transport_type,time,timezone,lat,lng,is_booked,needs_booking,category,flight_detail) values
(v_trip_id,v_d3,1,'The Highlands → Manyara airstrip',
 'After breakfast, road transfer to Manyara airstrip for flight to Central Serengeti.',
 'Road transfer to airstrip · ~1 hr',
 'car','08:00','EAT',-3.3667,35.8167,true,false,'transport',null),

(v_trip_id,v_d3,2,'Manyara → Central Serengeti (light aircraft)',
 'Scenic flight over the Serengeti ecosystem. Arrive Seronera airstrip.',
 'Light aircraft · Manyara → Seronera · ~1 hour · INCLUDED in package',
 'plane','09:30','EAT',-2.4500,34.8200,true,false,'transport',
 '{"airline":"Light Aircraft","origin":"Manyara","destination":"Seronera","depart_time":"~09:30","arrive_time":"~10:30","included":true}'::jsonb),

(v_trip_id,v_d3,3,'Arrive Asilia Dunia Camp — lunch & afternoon game drive',
 'Road transfer to camp. Leisure lunch. Afternoon game drive in the Seronera Valley — prime big cat country.',
 'Open safari vehicle with professional guide',
 'car','12:00','EAT',-2.4500,34.8200,false,false,'activity',null);

-- ── D4 ───────────────────────────────────────────────────────
insert into public.stops (trip_id,day_id,sort_order,name,activity,transport,transport_type,time,timezone,lat,lng,is_booked,needs_booking,category) values
(v_trip_id,v_d4,1,'Morning game drive — Central Serengeti',
 'Game-rich Seronera Valley. Year-round game viewing. Large resident populations of lion, cheetah, leopard.',
 'Open safari vehicle · Depart camp at sunrise',
 'car','06:00','EAT',-2.4500,34.8200,false,false,'activity'),

(v_trip_id,v_d4,2,'Afternoon game drive — Moru Kopjes region',
 'Explore the Moru Kopjes area — scenic rocky outcrops. Lion prides frequent these rocks.',
 'Open safari vehicle · Afternoon departure from camp',
 'car','15:30','EAT',-2.5500,34.7000,false,false,'activity');

-- ── D5 ───────────────────────────────────────────────────────
insert into public.stops (trip_id,day_id,sort_order,name,activity,transport,transport_type,time,timezone,lat,lng,is_booked,needs_booking,category,flight_detail) values
(v_trip_id,v_d5,1,'Central Serengeti → Northern Serengeti (light aircraft)',
 'After breakfast, fly north to the Great Migration territory.',
 'Light aircraft · Central Serengeti → Serengeti North · ~1 hour · INCLUDED in package',
 'plane','08:30','EAT',-1.5000,35.0000,true,false,'transport',
 '{"airline":"Light Aircraft","origin":"Seronera","destination":"Kogatende","depart_time":"~08:30","arrive_time":"~09:30","included":true}'::jsonb),

(v_trip_id,v_d5,2,'Game drive en route to Asilia Olakira Camp',
 'Game drive from airstrip to camp. Millions of wildebeest and zebra in the northern plains.',
 'Open safari vehicle · Game drive to camp',
 'car','10:00','EAT',-1.5000,35.0000,false,false,'activity'),

(v_trip_id,v_d5,3,'Afternoon game drive — Mara River vicinity',
 'Stay close to the Mara River for crossing sightings. Hippos, crocodiles, wildebeest river crossing.',
 'Open safari vehicle',
 'car','16:00','EAT',-1.4000,34.9800,false,false,'activity');

-- ── D6 ───────────────────────────────────────────────────────
insert into public.stops (trip_id,day_id,sort_order,name,activity,transport,transport_type,time,timezone,lat,lng,is_booked,needs_booking,category) values
(v_trip_id,v_d6,1,'Hot Air Balloon Safari — Serengeti',
 'Pre-dawn wake-up. Balloon launch at sunrise over the Serengeti plains. Champagne breakfast on landing. One of Africa''s most iconic experiences.',
 'Balloon + ground crew transfer · INCLUDED in package',
 'walk','05:00','EAT',-1.5000,35.0000,true,false,'activity'),

(v_trip_id,v_d6,2,'Mara River game drive — Great Migration crossings',
 'Station at the Mara River for wildebeest crossing. Crocodiles, hippos, thousands of wildebeest. Nature''s greatest spectacle.',
 'Open safari vehicle',
 'car','14:00','EAT',-1.4000,34.9800,false,false,'activity');

-- ── D7 ───────────────────────────────────────────────────────
insert into public.stops (trip_id,day_id,sort_order,name,activity,transport,transport_type,time,timezone,lat,lng,is_booked,needs_booking,category) values
(v_trip_id,v_d7,1,'Morning game drive — Mara River crossings',
 'Early morning crossing watch. Best light for photography. Lions and cheetah active at dawn.',
 'Open safari vehicle',
 'car','06:00','EAT',-1.4000,34.9800,false,false,'activity'),

(v_trip_id,v_d7,2,'Afternoon game drive — Northern Serengeti',
 'Explore northern plains. Giraffe, elephant, topi, eland. Sundowner at a scenic kopje.',
 'Open safari vehicle',
 'car','16:00','EAT',-1.5000,35.0000,false,false,'activity');

-- ── D8 ───────────────────────────────────────────────────────
insert into public.stops (trip_id,day_id,sort_order,name,activity,transport,transport_type,time,timezone,lat,lng,is_booked,needs_booking,category) values
(v_trip_id,v_d8,1,'Full day Mara River — crossing watch',
 'Full day at the Mara River. Pack lunch. Witness multiple crossings if timing is right. Crocodiles take their toll.',
 'Open safari vehicle · Full day',
 'car','06:00','EAT',-1.4000,34.9800,false,false,'activity'),

(v_trip_id,v_d8,2,'Evening game drive — final Serengeti sunset',
 'Last evening in the Serengeti. Sundowner at a scenic spot. Celebrate the crossing sightings.',
 'Open safari vehicle',
 'car','17:00','EAT',-1.5000,35.0000,false,false,'activity');

-- ── D9 ───────────────────────────────────────────────────────
insert into public.stops (trip_id,day_id,sort_order,name,activity,transport,transport_type,time,timezone,lat,lng,is_booked,needs_booking,category,flight_detail) values
(v_trip_id,v_d9,1,'Olakira Camp → Kilimanjaro (light aircraft)',
 'After breakfast, fly from Northern Serengeti to Kilimanjaro airport.',
 'Light aircraft · Northern Serengeti → JRO · ~1.5 hours · INCLUDED in package',
 'plane','09:00','EAT',-3.4295,36.6773,true,false,'transport',
 '{"airline":"Light Aircraft","origin":"Kogatende","destination":"JRO","depart_time":"~09:00","arrive_time":"~10:30","included":true}'::jsonb),

(v_trip_id,v_d9,2,'Kilimanjaro → Nairobi (Kenya Airways)',
 'Commercial flight to Nairobi. Check-in Radisson Blu Arboretum. Afternoon at leisure.',
 'Kenya Airways · JRO → NBO · ~45 min',
 'plane','13:00','EAT',-1.2921,36.8219,true,true,'transport',
 '{"airline":"Kenya Airways","origin":"JRO","destination":"NBO","depart_time":"13:00","arrive_time":"13:45","ref":"","included":false}'::jsonb),

(v_trip_id,v_d9,3,'Arrive Radisson Blu Nairobi Arboretum',
 'Check in. Afternoon at leisure in Nairobi. Optional: city tour, Karen Blixen Museum, Giraffe Centre.',
 'Hotel transfer from NBO · ~45 min',
 'car','15:00','EAT',-1.2921,36.8219,false,false,null,null);

-- ── D10 ──────────────────────────────────────────────────────
insert into public.stops (trip_id,day_id,sort_order,name,activity,transport,transport_type,time,timezone,lat,lng,is_booked,needs_booking,category,flight_detail) values
(v_trip_id,v_d10,1,'Nairobi → Amboseli (light aircraft)',
 'Morning flight from Wilson Airport to Amboseli. Views of Kilimanjaro on approach.',
 'Light aircraft · Wilson → Amboseli · ~45 min · INCLUDED in package',
 'plane','09:00','EAT',-2.6527,37.2606,true,false,'transport',
 '{"airline":"Light Aircraft","origin":"Wilson Airport","destination":"Amboseli","depart_time":"~09:00","arrive_time":"~09:45","included":true}'::jsonb),

(v_trip_id,v_d10,2,'Arrive Tortilis Camp — afternoon game drive',
 'Arrive Tortilis Camp in Kimana Sanctuary. Lunch at camp. Afternoon game drive with Kilimanjaro backdrop.',
 'Open safari vehicle',
 'car','13:00','EAT',-2.6527,37.2606,false,false,'activity',null);

-- ── D11 ──────────────────────────────────────────────────────
insert into public.stops (trip_id,day_id,sort_order,name,activity,transport,transport_type,time,timezone,lat,lng,is_booked,needs_booking,category) values
(v_trip_id,v_d11,1,'Morning game drive — Amboseli elephant herds',
 'Amboseli is famous for its large elephant herds and unobstructed views of Kilimanjaro. Best photography light in the morning.',
 'Open safari vehicle · Sunrise departure',
 'car','06:00','EAT',-2.6527,37.2606,false,false,'activity'),

(v_trip_id,v_d11,2,'Afternoon game drive — swamp & Kilimanjaro views',
 'Amboseli swamps fed by Kilimanjaro snowmelt. Hippo, buffalo, waterfowl. Kilimanjaro clear in the late afternoon.',
 'Open safari vehicle',
 'car','16:00','EAT',-2.6527,37.2606,false,false,'activity');

-- ── D12 ──────────────────────────────────────────────────────
insert into public.stops (trip_id,day_id,sort_order,name,activity,transport,transport_type,time,timezone,lat,lng,is_booked,needs_booking,category) values
(v_trip_id,v_d12,1,'Maasai cultural walk — Amboseli',
 'Walk with Maasai guide through the same landscape the herds roam. Learn about cattle culture, medicinal plants, traditional skills. Genuine community engagement.',
 'On foot with Maasai guide · ~2 hrs',
 'walk','08:00','EAT',-2.6527,37.2606,false,false,'activity'),

(v_trip_id,v_d12,2,'Morning game drive — big cats & Kilimanjaro',
 'Final Amboseli game drive. Cheetah, lion, wild dog active in the morning. Elephant herds with Kilimanjaro behind.',
 'Open safari vehicle',
 'car','10:30','EAT',-2.6527,37.2606,false,false,'activity'),

(v_trip_id,v_d12,3,'Afternoon at leisure — Tortilis Camp',
 'Relax at camp. Optional sundowner walk. Tortilis''s wildlife-rich concession allows walking safaris.',
 'At leisure',
 'walk','15:00','EAT',-2.6527,37.2606,false,false,null);

-- ── D13 ──────────────────────────────────────────────────────
insert into public.stops (trip_id,day_id,sort_order,name,activity,transport,transport_type,time,timezone,lat,lng,is_booked,needs_booking,category,flight_detail) values
(v_trip_id,v_d13,1,'Amboseli → Nairobi (light aircraft)',
 'Morning flight back to Nairobi Wilson Airport.',
 'Light aircraft · Amboseli → Wilson · ~45 min · INCLUDED in package',
 'plane','09:00','EAT',-1.2921,36.8219,true,false,'transport',
 '{"airline":"Light Aircraft","origin":"Amboseli","destination":"Wilson Airport","depart_time":"~09:00","arrive_time":"~09:45","included":true}'::jsonb),

(v_trip_id,v_d13,2,'Nairobi → Entebbe (Kenya Airways)',
 'Afternoon flight from JKIA to Entebbe. Arrival Uganda.',
 'Kenya Airways · NBO → EBB · ~1.5 hrs',
 'plane','14:00','EAT',0.0512,32.4637,true,true,'transport',
 '{"airline":"Kenya Airways","origin":"NBO","destination":"EBB","depart_time":"14:00","arrive_time":"15:30","ref":"","included":false}'::jsonb),

(v_trip_id,v_d13,3,'Arrive No.5 Boutique Hotel — Entebbe',
 'Transfer to No.5 Boutique Hotel. Dinner at leisure. Entebbe sits on the shores of Lake Victoria.',
 'Hotel transfer from EBB · ~20 min',
 'car','16:00','EAT',0.0512,32.4637,false,false,null,null);

-- ── D14 ──────────────────────────────────────────────────────
insert into public.stops (trip_id,day_id,sort_order,name,activity,transport,transport_type,time,timezone,lat,lng,is_booked,needs_booking,category,flight_detail) values
(v_trip_id,v_d14,1,'Entebbe → Bwindi (charter flight)',
 'Morning charter flight to Kihihi or Kisoro airstrip, closest to Bwindi. Breathtaking views over the Ugandan hills.',
 'Charter flight · Entebbe → Kihihi/Kisoro · ~1.5 hrs · INCLUDED in package',
 'plane','08:00','EAT',-1.0333,29.7167,true,false,'transport',
 '{"airline":"Charter","origin":"Entebbe","destination":"Kihihi","depart_time":"~08:00","arrive_time":"~09:30","included":true}'::jsonb),

(v_trip_id,v_d14,2,'Road transfer → Nkuringo Gorilla Lodge',
 'Scenic road transfer through Bwindi''s forested hills to Nkuringo Lodge on the southern edge of the park.',
 'Road transfer with guide · ~2 hrs',
 'car','10:00','EAT',-1.0333,29.7167,false,false,'transport',null),

(v_trip_id,v_d14,3,'Briefing & rest at Nkuringo Gorilla Lodge',
 'Arrive lodge. Briefing on gorilla trekking — what to expect, rules, and the family you''ll visit. Early dinner and rest.',
 'At lodge',
 'walk','14:00','EAT',-1.0333,29.7167,false,false,null,null);

-- ── D15 ──────────────────────────────────────────────────────
insert into public.stops (trip_id,day_id,sort_order,name,activity,transport,transport_type,time,timezone,lat,lng,is_booked,needs_booking,category) values
(v_trip_id,v_d15,1,'Mountain Gorilla Habituation Experience — Bwindi',
 'The highlight of the trip. Pre-dawn briefing with rangers. Trek into the impenetrable forest. Up to 4 hours with a partially-habituated gorilla family — a rawer, more intimate experience than standard trekking. Silverback eye contact. Something rarely forgotten.',
 'On foot with ranger team · Full day · INCLUDED (gorilla permit)',
 'walk','07:00','EAT',-1.0333,29.7167,true,false,'activity'),

(v_trip_id,v_d15,2,'Return to Nkuringo — celebratory dinner',
 'Return to lodge after the trek. Hot shower, rest, celebratory dinner. Share the experience.',
 'On foot / vehicle back to lodge',
 'walk','14:00','EAT',-1.0333,29.7167,false,false,null);

-- ── D16 ──────────────────────────────────────────────────────
insert into public.stops (trip_id,day_id,sort_order,name,activity,transport,transport_type,time,timezone,lat,lng,is_booked,needs_booking,category,flight_detail) values
(v_trip_id,v_d16,1,'Nkuringo → Entebbe (charter flight)',
 'Morning transfer to airstrip. Charter flight back to Entebbe.',
 'Charter flight · Kihihi → Entebbe · ~1.5 hrs · INCLUDED in package',
 'plane','09:00','EAT',0.0512,32.4637,true,false,'transport',
 '{"airline":"Charter","origin":"Kihihi","destination":"Entebbe","depart_time":"~09:00","arrive_time":"~10:30","included":true}'::jsonb),

(v_trip_id,v_d16,2,'Entebbe → Doha (Qatar Airways — overnight)',
 'Evening flight from Entebbe to Doha. Overnight connection.',
 'Qatar Airways · EBB → DOH · Overnight',
 'plane','21:00','EAT',25.2854,51.5310,true,true,'transport',
 '{"airline":"Qatar Airways","flight_no":"QR","origin":"EBB","destination":"DOH","depart_time":"21:00","arrive_time":"05:30","ref":"","included":false}'::jsonb);

-- ── D17 ──────────────────────────────────────────────────────
insert into public.stops (trip_id,day_id,sort_order,name,activity,transport,transport_type,time,timezone,lat,lng,is_booked,needs_booking,category,flight_detail) values
(v_trip_id,v_d17,1,'Doha → Kuala Lumpur (Qatar Airways)',
 'Final leg home. Arrive KUL with memories of a lifetime.',
 'Qatar Airways · DOH → KUL · ~8 hrs',
 'plane','08:00','AST',3.1390,101.6869,true,true,'transport',
 '{"airline":"Qatar Airways","flight_no":"QR","origin":"DOH","destination":"KUL","depart_time":"08:00","arrive_time":"21:00","ref":"","included":false}'::jsonb);

-- Verify
raise notice '✓ Stops migration complete';
raise notice 'Total stops: %', (select count(*) from public.stops where trip_id = v_trip_id);

end $$;
