'use strict';

/* ============================================================
   DATA — Africa Safari 2026
   Vivien · East Africa Safari & Mountain Gorilla · 15 Nights
   KUL → Tanzania → Kenya → Uganda → KUL
   31 Aug – 17 Sep 2026
   Operator: Wildsenses Holidays (+60 28138778)
   www.wildsensesholidays.com
   ============================================================ */

/* ── Day order (d0 = night departure, d1–d16 = in-country) ── */
const DAY_ORDER = [
  'd0','d1','d2','d3','d4','d5','d6','d7','d8',
  'd9','d10','d11','d12','d13','d14','d15','d16','d17'
];

const DAYS = [
  {id:'d0',  label:'D0',  date:'Sun 30 Aug',  title:'Depart KUL — Overnight to Doha',          locality:'KUL'},
  {id:'d1',  label:'D1',  date:'Mon 1 Sep',   title:'Kilimanjaro → Ngorongoro',                 locality:'Ngorongoro',
   weatherPoints:[{label:'Ngorongoro', lat:-3.1740, lng:35.5900}]},
  {id:'d2',  label:'D2',  date:'Tue 2 Sep',   title:'Full day Ngorongoro Crater',               locality:'Ngorongoro',
   weatherPoints:[{label:'Ngorongoro Crater', lat:-3.1740, lng:35.5900}]},
  {id:'d3',  label:'D3',  date:'Wed 3 Sep',   title:'Manyara → Central Serengeti',              locality:'Central Serengeti',
   weatherPoints:[{label:'Central Serengeti', lat:-2.3333, lng:34.8333}]},
  {id:'d4',  label:'D4',  date:'Thu 4 Sep',   title:'Central Serengeti — Big Cats day',         locality:'Central Serengeti',
   weatherPoints:[{label:'Seronera Valley', lat:-2.4500, lng:34.8200}]},
  {id:'d5',  label:'D5',  date:'Fri 5 Sep',   title:'Central → Northern Serengeti',             locality:'Northern Serengeti',
   weatherPoints:[{label:'Northern Serengeti', lat:-1.5000, lng:35.0000}]},
  {id:'d6',  label:'D6',  date:'Sat 6 Sep',   title:'Northern Serengeti — Great Migration',     locality:'Northern Serengeti',
   weatherPoints:[{label:'Mara River', lat:-1.4000, lng:34.9800}]},
  {id:'d7',  label:'D7',  date:'Sun 7 Sep',   title:'Northern Serengeti — River Crossings',     locality:'Northern Serengeti',
   weatherPoints:[{label:'Mara River', lat:-1.4000, lng:34.9800}]},
  {id:'d8',  label:'D8',  date:'Mon 8 Sep',   title:'Northern Serengeti — River Crossings',     locality:'Northern Serengeti',
   weatherPoints:[{label:'Northern Serengeti', lat:-1.5000, lng:35.0000}]},
  {id:'d9',  label:'D9',  date:'Tue 9 Sep',   title:'Serengeti → Kilimanjaro → Nairobi',        locality:'Nairobi',
   weatherPoints:[{label:'Kilimanjaro', lat:-3.0674, lng:37.3556},{label:'Nairobi', lat:-1.2921, lng:36.8219}]},
  {id:'d10', label:'D10', date:'Wed 10 Sep',  title:'Nairobi → Amboseli National Park',         locality:'Amboseli',
   weatherPoints:[{label:'Amboseli', lat:-2.6527, lng:37.2606}]},
  {id:'d11', label:'D11', date:'Thu 11 Sep',  title:'Amboseli — Elephants & Kilimanjaro views', locality:'Amboseli',
   weatherPoints:[{label:'Amboseli', lat:-2.6527, lng:37.2606}]},
  {id:'d12', label:'D12', date:'Fri 12 Sep',  title:'Amboseli — Maasai & safari activities',    locality:'Amboseli',
   weatherPoints:[{label:'Amboseli', lat:-2.6527, lng:37.2606}]},
  {id:'d13', label:'D13', date:'Sat 13 Sep',  title:'Amboseli → Nairobi → Entebbe',             locality:'Entebbe',
   weatherPoints:[{label:'Entebbe', lat:0.0512, lng:32.4637}]},
  {id:'d14', label:'D14', date:'Sun 14 Sep',  title:'Entebbe → Bwindi Impenetrable Forest',     locality:'Bwindi',
   weatherPoints:[{label:'Bwindi', lat:-1.0333, lng:29.7167}]},
  {id:'d15', label:'D15', date:'Mon 15 Sep',  title:'Mountain Gorilla Habituation Experience',  locality:'Bwindi',
   weatherPoints:[{label:'Bwindi Forest', lat:-1.0333, lng:29.7167}]},
  {id:'d16', label:'D16', date:'Tue 16 Sep',  title:'Bwindi → Entebbe → Doha (overnight)',      locality:'Entebbe',
   weatherPoints:[{label:'Entebbe', lat:0.0512, lng:32.4637}]},
  {id:'d17', label:'D17', date:'Wed 17 Sep',  title:'Doha → KUL — Arrive home',                 locality:'KUL'},
];

/* ── Accommodation defaults (keyed by dayId) ─────────────── */
const OVERNIGHT_DEFAULTS = {
  d1:  {name:'Asilia The Highlands',           status:'booked', ref:'', cost:null, deadline:null,
        address:'Ngorongoro Conservation Area, Tanzania'},
  d2:  {name:'Asilia The Highlands',           status:'booked', ref:'', cost:null, deadline:null,
        address:'Ngorongoro Conservation Area, Tanzania'},
  d3:  {name:'Asilia Dunia Camp',              status:'booked', ref:'', cost:null, deadline:null,
        address:'Central Serengeti, Tanzania'},
  d4:  {name:'Asilia Dunia Camp',              status:'booked', ref:'', cost:null, deadline:null,
        address:'Central Serengeti, Tanzania'},
  d5:  {name:'Asilia Olakira Camp',            status:'booked', ref:'', cost:null, deadline:null,
        address:'Northern Serengeti, Tanzania'},
  d6:  {name:'Asilia Olakira Camp',            status:'booked', ref:'', cost:null, deadline:null,
        address:'Northern Serengeti, Tanzania'},
  d7:  {name:'Asilia Olakira Camp',            status:'booked', ref:'', cost:null, deadline:null,
        address:'Northern Serengeti, Tanzania'},
  d8:  {name:'Asilia Olakira Camp',            status:'booked', ref:'', cost:null, deadline:null,
        address:'Northern Serengeti, Tanzania'},
  d9:  {name:'Radisson Blu Nairobi Arboretum', status:'booked', ref:'', cost:null, deadline:null,
        address:'Arboretum Road, Nairobi, Kenya'},
  d10: {name:'Tortilis Camp',                  status:'booked', ref:'', cost:null, deadline:null,
        address:'Amboseli, Kimana Sanctuary, Kenya'},
  d11: {name:'Tortilis Camp',                  status:'booked', ref:'', cost:null, deadline:null,
        address:'Amboseli, Kimana Sanctuary, Kenya'},
  d12: {name:'Tortilis Camp',                  status:'booked', ref:'', cost:null, deadline:null,
        address:'Amboseli, Kimana Sanctuary, Kenya'},
  d13: {name:'No.5 Boutique Hotel',            status:'booked', ref:'', cost:null, deadline:null,
        address:'Entebbe, Uganda'},
  d14: {name:'Nkuringo Gorilla Lodge (Forest Suite)', status:'booked', ref:'', cost:null, deadline:null,
        address:'Nkuringo, Bwindi Impenetrable Forest, Uganda'},
  d15: {name:'Nkuringo Gorilla Lodge (Forest Suite)', status:'booked', ref:'', cost:null, deadline:null,
        address:'Nkuringo, Bwindi Impenetrable Forest, Uganda'},
};

/* ── Stop builder helpers ────────────────────────────────── */
/*  T(id, dayId, order, segment, name, activity, transport, transportType,
      time, tz, lat, lng, flightIncluded, needsBooking, category, booking)  */
const T = (id,dayId,order,seg,name,act,transport,tt,time,tz,lat,lng,flightIncluded,needs,cat,bk) => ({
  id, dayId, order, segment:seg,
  name, activity:act, transport, transportType:tt,
  time, timeZone:tz||'EAT',
  lat, lng,
  flightIncluded: flightIncluded === true,    // true = green badge, false = gold badge
  flightExcluded: flightIncluded === false,   // explicitly excluded
  needsBooking:!!needs, category:cat||null,
  notes:'',
  booking: bk || {status:'open', ref:'', cost:null, deadline:null},
});

/* ── Flight helper ───────────────────────────────────────── */
const FL = (airline,flightNo,from,to,dep,arr,included) => ({
  airline, flightNo, origin:from, destination:to,
  departTime:dep, arriveTime:arr, included:!!included
});

/* ═══════════════════════════════════════════════════════════
   SEED STOPS — all 17 days
   Segments: transit | tanzania | kenya | uganda
   ═══════════════════════════════════════════════════════════ */
const SEED_STOPS = [

/* ── D0 · Sun 30 Aug · KUL → Doha (overnight) ──────────── */
T('af01','d0',1,'transit','KUL → Doha (Qatar Airways)',
  'Depart Kuala Lumpur in the evening. Overnight flight to Doha.',
  'Qatar Airways · KUL → DOH · Depart 22:20 · Arrive 22:45+1',
  'plane','22:20','MYT', null,null, true, true,'transport',
  {status:'booked',ref:'QR KUL-DOH',cost:null,deadline:null,flightDetail:FL('Qatar Airways','QR','KUL','DOH','22:20','22:45',false)}),

/* ── D1 · Mon 1 Sep · Kilimanjaro → Ngorongoro ─────────── */
T('af02','d1',1,'transit','Doha → Kilimanjaro (Qatar Airways)',
  'Overnight connection arrives Kilimanjaro in the morning. Greeted by Wildsenses representative.',
  'Qatar Airways · DOH → JRO · Depart 01:55 · Arrive 07:35',
  'plane','01:55','AST', -3.4295,36.6773, true, true,'transport',
  {status:'booked',ref:'QR DOH-JRO',cost:null,deadline:null,flightDetail:FL('Qatar Airways','QR','DOH','JRO','01:55','07:35',false)}),

T('af03','d1',2,'tanzania','Kilimanjaro → Manyara (light aircraft)',
  'Connect light aircraft to Lake Manyara airstrip. Scenic flight over the Rift Valley.',
  'Light aircraft · JRO → Manyara · ~45 mins · INCLUDED in package',
  'plane','09:00','EAT', -3.3667,35.8167, true, false,'transport',
  {status:'booked',ref:'Included',cost:null,deadline:null,flightDetail:FL('Light Aircraft','','JRO','Manyara','~09:00','~09:45',true)}),

T('af04','d1',3,'tanzania','Masai Village cultural visit',
  'Cultural visit to local Masai village on scenic drive from airstrip to The Highlands camp.',
  'Road transfer with guide · ~1 hr',
  'car','10:00','EAT', -3.2500,35.7000, true, false,'activity',
  {status:'booked',ref:'Included',cost:null,deadline:null}),

T('af05','d1',4,'tanzania','Arrive Asilia The Highlands',
  'Arrive camp in the afternoon. Settle into Dome Suite. Dinner with fireplace — it gets chilly at 2,300m.',
  'Road transfer from Masai village · ~30 min',
  'car','14:00','EAT', -3.2183,35.5167, true, false,null,
  {status:'booked',ref:'Included',cost:null,deadline:null}),

/* ── D2 · Tue 2 Sep · Full day Ngorongoro Crater ────────── */
T('af06','d2',1,'tanzania','Descent into Ngorongoro Crater',
  'Early morning descent to the 300 km² crater floor. One of the Seven Natural Wonders of Africa. 25,000 mammals including the Big Five and 16 endangered black rhino.',
  'Open 4WD safari vehicle with guide · Descent from crater rim',
  'car','06:00','EAT', -3.1740,35.5900, true, false,'activity',
  {status:'booked',ref:'Included',cost:null,deadline:null}),

T('af07','d2',2,'tanzania','Full day Ngorongoro game drive',
  'Lions, hyena packs, zebra, wildebeest, hippo, flamingo at Lake Magadi, elephant and leopard. Bush picnic lunch in the crater.',
  'All-day game drive · Bush lunch included',
  'car','06:30','EAT', -3.1740,35.5900, false, false,'activity',
  {status:'booked',ref:'Included',cost:null,deadline:null}),

T('af08','d2',3,'tanzania','Return to The Highlands',
  'Ascend crater rim. Dinner at camp. Optional hike at Olmoti rim available.',
  'Ascent to crater rim · Return to camp',
  'car','17:00','EAT', -3.2183,35.5167, false, false,null,
  {status:'booked',ref:'Included',cost:null,deadline:null}),

/* ── D3 · Wed 3 Sep · Manyara → Central Serengeti ──────── */
T('af09','d3',1,'tanzania','The Highlands → Manyara airstrip',
  'After breakfast, road transfer to Manyara airstrip for flight to Central Serengeti.',
  'Road transfer to airstrip · ~1 hr',
  'car','08:00','EAT', -3.3667,35.8167, true, false,'transport',
  {status:'booked',ref:'Included',cost:null,deadline:null}),

T('af10','d3',2,'tanzania','Manyara → Central Serengeti (light aircraft)',
  'Scenic flight over the Serengeti ecosystem. Arrive Seronera airstrip.',
  'Light aircraft · Manyara → Seronera · ~1 hour · INCLUDED in package',
  'plane','09:30','EAT', -2.4500,34.8200, true, false,'transport',
  {status:'booked',ref:'Included',cost:null,deadline:null,flightDetail:FL('Light Aircraft','','Manyara','Seronera','~09:30','~10:30',true)}),

T('af11','d3',3,'tanzania','Arrive Asilia Dunia Camp — lunch & afternoon game drive',
  'Road transfer to camp. Leisure lunch. Afternoon game drive in the Seronera Valley — prime big cat country. Lion, cheetah, leopard, elephant, giraffe, zebra.',
  'Open safari vehicle with professional guide',
  'car','12:00','EAT', -2.4500,34.8200, false, false,'activity',
  {status:'booked',ref:'Included',cost:null,deadline:null}),

/* ── D4 · Thu 4 Sep · Central Serengeti Big Cats ────────── */
T('af12','d4',1,'tanzania','Morning game drive — Central Serengeti',
  'Game-rich Seronera Valley. Year-round game viewing due to abundant rivers. Large resident populations of lion, cheetah, leopard. Spectacular predator-prey interactions.',
  'Open safari vehicle · Depart camp at sunrise',
  'car','06:00','EAT', -2.4500,34.8200, false, false,'activity',
  {status:'booked',ref:'Included',cost:null,deadline:null}),

T('af13','d4',2,'tanzania','Afternoon game drive — Moru Kopjes region',
  'Explore the Moru Kopjes area — scenic rocky outcrops offering panoramic views of the Central Serengeti plains. Lion prides frequent these rocks.',
  'Open safari vehicle · Afternoon departure from camp',
  'car','15:30','EAT', -2.5500,34.7000, false, false,'activity',
  {status:'booked',ref:'Included',cost:null,deadline:null}),

/* ── D5 · Fri 5 Sep · Central → Northern Serengeti ─────── */
T('af14','d5',1,'tanzania','Central Serengeti → Northern Serengeti airstrip (light aircraft)',
  'After breakfast, road transfer to airstrip and fly north to the Great Migration territory.',
  'Light aircraft · Central Serengeti → Serengeti North · ~1 hour · INCLUDED in package',
  'plane','08:30','EAT', -1.5000,35.0000, true, false,'transport',
  {status:'booked',ref:'Included',cost:null,deadline:null,flightDetail:FL('Light Aircraft','','Seronera','Kogatende','~08:30','~09:30',true)}),

T('af15','d5',2,'tanzania','Game drive en route to Asilia Olakira Camp',
  'Game drive from airstrip to camp. Millions of wildebeest and zebra in the northern plains. Proximity to the Mara River for river crossing sightings.',
  'Open safari vehicle · Game drive to camp',
  'car','10:00','EAT', -1.5000,35.0000, false, false,'activity',
  {status:'booked',ref:'Included',cost:null,deadline:null}),

T('af16','d5',3,'tanzania','Afternoon game drive — Mara River vicinity',
  'Stay close to the Mara River for crossing sightings. Best season Jul–Oct. Hippos, crocodiles, wildebeest river crossing — the greatest wildlife show on Earth.',
  'Open safari vehicle · Ready to move to river on guide radio call',
  'car','15:30','EAT', -1.4000,34.9800, false, false,'activity',
  {status:'booked',ref:'Included',cost:null,deadline:null}),

/* ── D6 · Sat 6 Sep · Northern Serengeti + Hot Air Balloon ─ */
T('af17','d6',1,'tanzania','🎈 Hot Air Balloon over the Serengeti',
  'Pre-dawn wake up for once-in-a-lifetime hot air balloon experience over the Serengeti at sunrise. Champagne bush breakfast upon landing. USD 590 per person — INCLUDED in package.',
  'Pick up from camp in darkness · ~1 hr flight · Bush breakfast · Return to camp by mid-morning',
  'walk','04:30','EAT', -1.5500,35.0500, true, false,'activity',
  {status:'booked',ref:'Included USD 590/pax',cost:590,deadline:null}),

T('af18','d6',2,'tanzania','Afternoon game drive — Northern Serengeti',
  'Return to the Mara River area. Monitor river crossing activity via guide radio network. Lion, leopard, cheetah, elephant, hyena, ostrich, buffalo across the rolling kopje country.',
  'Open safari vehicle',
  'car','15:30','EAT', -1.4000,34.9800, false, false,'activity',
  {status:'booked',ref:'Included',cost:null,deadline:null}),

/* ── D7 · Sun 7 Sep · Northern Serengeti ───────────────── */
T('af19','d7',1,'tanzania','Morning game drive — Mara River',
  'Full river crossing focus. Radio network with other guides. Lobo Kopje area — beautiful landscape with permanent wildlife populations.',
  'Open safari vehicle · Sunrise departure',
  'car','06:00','EAT', -1.4000,34.9800, false, false,'activity',
  {status:'booked',ref:'Included',cost:null,deadline:null}),

T('af20','d7',2,'tanzania','Afternoon game drive — Northern Serengeti',
  'Continue monitoring for river crossings. Fine linens and fine dining at Olakira Camp each evening — the camp almost disappears into the surrounding African bush.',
  'Open safari vehicle',
  'car','15:30','EAT', -1.5000,35.0000, false, false,'activity',
  {status:'booked',ref:'Included',cost:null,deadline:null}),

/* ── D8 · Mon 8 Sep · Northern Serengeti ───────────────── */
T('af21','d8',1,'tanzania','Morning game drive — Northern Serengeti',
  'Final morning in the Northern Serengeti. Panoramic views from Olakira over the sprawling plains.',
  'Open safari vehicle · Sunrise departure',
  'car','06:00','EAT', -1.5000,35.0000, false, false,'activity',
  {status:'booked',ref:'Included',cost:null,deadline:null}),

T('af22','d8',2,'tanzania','Afternoon game drive — final Serengeti',
  'Last afternoon in Tanzania — savour every moment of the endless plains.',
  'Open safari vehicle',
  'car','15:30','EAT', -1.5000,35.0000, false, false,'activity',
  {status:'booked',ref:'Included',cost:null,deadline:null}),

/* ── D9 · Tue 9 Sep · Serengeti → Kilimanjaro → Nairobi ── */
T('af23','d9',1,'transit','Goodbye Serengeti — transfer to airstrip',
  'After breakfast, road transfer to Northern Serengeti airstrip.',
  'Road transfer · ~30 min',
  'car','08:00','EAT', -1.5000,35.0000, false, false,'transport',
  {status:'booked',ref:'Included',cost:null,deadline:null}),

T('af24','d9',2,'transit','Northern Serengeti → Kilimanjaro (light aircraft)',
  'Long scenic flight south back to Kilimanjaro International Airport.',
  'Light aircraft · Kogatende → JRO · ~2.5 hours · INCLUDED in package',
  'plane','09:00','EAT', -3.4295,36.6773, true, false,'transport',
  {status:'booked',ref:'Included',cost:null,deadline:null,flightDetail:FL('Light Aircraft','','Kogatende','JRO','~09:00','~11:30',true)}),

T('af25','d9',3,'transit','Kilimanjaro → Nairobi Wilson (regional flight)',
  'Connect regional flight from Kilimanjaro to Nairobi Wilson Airport.',
  'Regional flight · JRO → Wilson · ~1 hour · INCLUDED in package',
  'plane','13:00','EAT', -1.3222,36.8148, true, false,'transport',
  {status:'booked',ref:'Included',cost:null,deadline:null,flightDetail:FL('Regional','','JRO','NBO Wilson','~13:00','~14:00',true)}),

T('af26','d9',4,'kenya','Arrive Nairobi — hotel check-in',
  'Arrive Nairobi around 15:30. Private road transfer to Radisson Blu Nairobi Arboretum. Overnight stay (breakfast only included).',
  'Private road transfer from Wilson Airport · ~20 min',
  'car','15:30','EAT', -1.2683,36.8084, false, false,null,
  {status:'booked',ref:'Radisson Blu',cost:null,deadline:null}),

/* ── D10 · Wed 10 Sep · Nairobi → Amboseli ──────────────── */
T('af27','d10',1,'kenya','Nairobi → Wilson Airport',
  'After breakfast, road transfer to Wilson Airport for morning flight to Amboseli.',
  'Private road transfer · Hotel to Wilson Airport · ~20 min',
  'car','08:30','EAT', -1.3222,36.8148, false, false,'transport',
  {status:'booked',ref:'Included',cost:null,deadline:null}),

T('af28','d10',2,'kenya','Nairobi Wilson → Amboseli (light aircraft)',
  'Scenic flight from Nairobi to Amboseli with views of Mt Kilimanjaro on approach.',
  'Light aircraft · NBO Wilson → Amboseli · ~1 hour · INCLUDED in package',
  'plane','09:30','EAT', -2.6527,37.2606, true, false,'transport',
  {status:'booked',ref:'Included',cost:null,deadline:null,flightDetail:FL('Light Aircraft','','NBO Wilson','Amboseli','~09:30','~10:30',true)}),

T('af29','d10',3,'kenya','Arrive Tortilis Camp — lunch & afternoon safari',
  'Road transfer from airstrip to Tortilis Camp. Acacia Tortilis woodland setting with Mt Kilimanjaro as backdrop. Lunch and afternoon game drive.',
  'Open safari vehicle · Game drive from airstrip to camp',
  'car','12:00','EAT', -2.6527,37.2606, false, false,'activity',
  {status:'booked',ref:'Included',cost:null,deadline:null}),

/* ── D11 · Thu 11 Sep · Amboseli ─────────────────────────── */
T('af30','d11',1,'kenya','Morning safari — Amboseli NP',
  'One of the best places in Africa to see big-tusked elephants. 1,500+ elephants in the ecosystem including some of the largest in Africa. Dramatic Kilimanjaro views on clear mornings.',
  'Open safari vehicle · Dawn departure for best elephant light',
  'car','06:00','EAT', -2.6527,37.2606, false, false,'activity',
  {status:'booked',ref:'Included',cost:null,deadline:null}),

T('af31','d11',2,'kenya','Afternoon safari or Maasai cultural walk',
  'Optional Maasai village visit or guided bush walk with local Maasai guide — leave the vehicle and observe micro-ecosystems, tracks, dung beetles. Return to camp for dinner with Kilimanjaro views.',
  'On foot with Maasai guide · or open safari vehicle',
  'walk','15:30','EAT', -2.6527,37.2606, false, false,'activity',
  {status:'booked',ref:'Included',cost:null,deadline:null}),

/* ── D12 · Fri 12 Sep · Amboseli ─────────────────────────── */
T('af32','d12',1,'kenya','Morning safari — Amboseli',
  'Final Amboseli morning. Hippos, gazelles, giraffes, cape buffalo, impala, waterbucks. Good sightings of lion and hyena. Bush meals and sundowners in the private 30,000-acre game area.',
  'Open safari vehicle · Sunrise departure',
  'car','06:00','EAT', -2.6527,37.2606, false, false,'activity',
  {status:'booked',ref:'Included',cost:null,deadline:null}),

T('af33','d12',2,'kenya','Afternoon safari — Kimana Sanctuary',
  'Explore the private conservancy surrounding Tortilis Camp. Outstanding guiding team, extensive range of activities.',
  'Open safari vehicle',
  'car','15:30','EAT', -2.6800,37.3000, false, false,'activity',
  {status:'booked',ref:'Included',cost:null,deadline:null}),

/* ── D13 · Sat 13 Sep · Amboseli → Nairobi → Entebbe ───── */
T('af34','d13',1,'transit','Amboseli → Nairobi Wilson (light aircraft)',
  'After breakfast, fly back to Nairobi. Arrive Wilson around 09:30.',
  'Light aircraft · Amboseli → NBO Wilson · ~1 hour · INCLUDED in package',
  'plane','08:00','EAT', -1.3222,36.8148, true, false,'transport',
  {status:'booked',ref:'Included',cost:null,deadline:null,flightDetail:FL('Light Aircraft','','Amboseli','NBO Wilson','~08:00','~09:00',true)}),

T('af35','d13',2,'transit','Wilson Airport → Nairobi Jomo Kenyatta International',
  'Greeted by driver at Wilson. Private road transfer to JKIA for international departure to Entebbe.',
  'Private road transfer · Wilson Airport → JKIA · ~45 min',
  'car','09:30','EAT', -1.3192,36.9275, false, false,'transport',
  {status:'booked',ref:'Included',cost:null,deadline:null}),

T('af36','d13',3,'transit','Nairobi → Entebbe (Kenya Airways KQ 414)',
  'Regional flight to Uganda. NOT included in package — buy separately.',
  'Kenya Airways · NBO → EBB · KQ 414 · Depart 14:15 · Arrive 15:30 · NOT included',
  'plane','14:15','EAT', 0.0424,32.4432, false, true,'transport',
  {status:'booked',ref:'KQ 414',cost:null,deadline:null,flightDetail:FL('Kenya Airways','KQ 414','NBO','EBB','14:15','15:30',false)}),

T('af37','d13',4,'uganda','Arrive Entebbe — hotel check-in',
  'Private road transfer from Entebbe Airport to No.5 Boutique Hotel for overnight stay (breakfast only included).',
  'Private road transfer · ~10 min from airport',
  'car','16:00','EAT', 0.0512,32.4637, false, false,null,
  {status:'booked',ref:'No.5 Boutique Hotel',cost:null,deadline:null}),

/* ── D14 · Sun 14 Sep · Entebbe → Bwindi ────────────────── */
T('af38','d14',1,'uganda','Entebbe → Bwindi Impenetrable Forest (light aircraft)',
  'Morning flight from Entebbe to Bwindi airstrip. Spectacular flight over the Rift Valley and volcanic mountains.',
  'Light aircraft · EBB → Bwindi · ~1.5 hours · INCLUDED in package',
  'plane','08:00','EAT', -1.0333,29.7167, true, false,'transport',
  {status:'booked',ref:'Included',cost:null,deadline:null,flightDetail:FL('Light Aircraft','','EBB','Bwindi','~08:00','~09:30',true)}),

T('af39','d14',2,'uganda','Arrive Nkuringo Gorilla Lodge',
  'Pick up from airstrip. Road transfer ~1.5–2 hrs to Nkuringo Gorilla Lodge at 2,161m altitude. Stunning views across Virunga Volcanoes chain. Settle into Forest Suite above the Bwindi canopy.',
  'Private road transfer from airstrip · ~1.5–2 hrs',
  'car','10:00','EAT', -1.0500,29.6833, false, false,null,
  {status:'booked',ref:'Included',cost:null,deadline:null}),

T('af40','d14',3,'uganda','Leisure evening at Nkuringo Lodge',
  'Dinner at camp. Settle in and rest before the big day tomorrow. Forest Suite has private viewing deck over the forest canopy and Virunga Volcanoes.',
  '',
  'walk','18:00','EAT', -1.0500,29.6833, false, false,null,
  {status:'booked',ref:'Included',cost:null,deadline:null}),

/* ── D15 · Mon 15 Sep · Mountain Gorilla Habituation ───── */
T('af41','d15',1,'uganda','🦍 Mountain Gorilla Habituation Experience',
  'Early departure from lodge for a full day in Bwindi Impenetrable Forest. 1 x Gorilla Habituation Permit per person — INCLUDED (USD 1,500/pax). Bwindi is home to ~400 mountain gorillas, about half the world\'s total population of this critically endangered ape. Habituated groups in Nkuringo and Rushaga sectors. Expect to return to lodge in the afternoon. 1 x complimentary 30-min massage at lodge included with Forest Suite.',
  'Early morning depart · Full day trek · Afternoon return to lodge',
  'walk','06:00','EAT', -1.0333,29.7167, true, false,'activity',
  {status:'booked',ref:'Gorilla Permit Included USD 1,500/pax',cost:1500,deadline:null}),

T('af42','d15',2,'uganda','Late lunch & celebrate at Nkuringo Lodge',
  'Return from forest, share stories with fellow guests over a late lunch. Optional 30-min complimentary massage at lodge.',
  '',
  'walk','14:00','EAT', -1.0500,29.6833, false, false,null,
  {status:'booked',ref:'Included',cost:null,deadline:null}),

/* ── D16 · Tue 16 Sep · Bwindi → Entebbe → Doha ─────────── */
T('af43','d16',1,'uganda','Bwindi → Entebbe (light aircraft)',
  'After breakfast, road transfer to airstrip for return flight to Entebbe.',
  'Light aircraft · Bwindi → EBB · ~1.5 hours · INCLUDED in package',
  'plane','08:00','EAT', 0.0424,32.4432, true, false,'transport',
  {status:'booked',ref:'Included',cost:null,deadline:null,flightDetail:FL('Light Aircraft','','Bwindi','EBB','~08:00','~09:30',true)}),

T('af44','d16',2,'uganda','Arriving Entebbe — connect international departure',
  'Arrive Entebbe around noon. Transfer to international terminal for afternoon departure to Doha.',
  'Airport road transfer · ~10 min',
  'car','12:00','EAT', 0.0424,32.4432, false, false,'transport',
  {status:'booked',ref:'Included',cost:null,deadline:null}),

T('af45','d16',3,'transit','Entebbe → Doha (Qatar Airways)',
  'International departure. Overnight flight to Doha.',
  'Qatar Airways · EBB → DOH · Depart 17:30 · Arrive 23:35 · NOT included in package',
  'plane','17:30','EAT', 25.2732,51.6080, false, true,'transport',
  {status:'booked',ref:'QR EBB-DOH',cost:null,deadline:null,flightDetail:FL('Qatar Airways','QR','EBB','DOH','17:30','23:35',false)}),

/* ── D17 · Wed 17 Sep · Doha → KUL ──────────────────────── */
T('af46','d17',1,'transit','Doha → Kuala Lumpur (Qatar Airways)',
  'Early morning departure from Doha. Arrive home in the afternoon.',
  'Qatar Airways · DOH → KUL · Depart 02:35 · Arrive 15:10 · NOT included in package',
  'plane','02:35','GST', 3.1319,101.6841, false, true,'transport',
  {status:'booked',ref:'QR DOH-KUL',cost:null,deadline:null,flightDetail:FL('Qatar Airways','QR','DOH','KUL','02:35','15:10',false)}),

T('af47','d17',2,'transit','Arrive home — KUL',
  'Welcome home. We hope to hear your amazing stories from the wilderness!',
  '',
  'walk','15:10','MYT', 3.1319,101.6841, false, false,null,
  {status:'open',ref:'',cost:null,deadline:null}),

]; // end SEED_STOPS

/* ── Inclusions ──────────────────────────────────────────── */
const INCLUSIONS = [
  'Scheduled light aircraft flights within Tanzania, Kenya and Uganda',
  'Regional flight: Kilimanjaro → Nairobi Wilson (D9)',
  'Emergency Bush Evacuation Insurance in Kenya and Tanzania',
  'Transfers to/from nearest airstrip to/from all camps',
  'Private road transfers: Hotel ↔ Airport in Nairobi and Entebbe (both ways)',
  '15 nights accommodation on single occupancy',
  'Daily full board meals at all safari camps',
  'Breakfast only at Radisson Blu Nairobi and No.5 Boutique Hotel Entebbe',
  'Beverages and house wines at all camps',
  'Complimentary laundry service at all camps',
  'Daily safari activities on sharing basis as stated in itinerary',
  'Cultural visit to Masai village at The Highlands (D1)',
  '1 x Hot Air Balloon at Serengeti North — USD 590/person (D6)',
  '1 x Mountain Gorilla Habituation Permit — USD 1,500/person (D15)',
  '1 x Complimentary 30-min massage at Nkuringo Gorilla Lodge (Forest Suite)',
  'All applicable Park and Conservancy fees during stay',
];

const EXCLUSIONS = [
  'International flight tickets to Kilimanjaro and from Entebbe',
  'Regional flight: Nairobi → Entebbe on Day 13 (KQ 414)',
  'Lunch and dinner at Nairobi and Entebbe hotels',
  'Additional excursions not stated in itinerary (e.g. extra massages)',
  'Premium alcohols such as whisky and champagne',
  'Travel visa fees (if required)',
  'Personal travel insurance',
  'Gratuities to safari guides and camp staff (to be paid on site)',
  'Exclusive use of safari vehicle',
  'Unforeseen increases in park fees, levy or fuel surcharges after booking',
];

/* ── Packing list (Africa-specific) ─────────────────────── */
const SEED_PACKING = [
  // Documents
  {id:'pk01',cat:'Documents',    item:'Passport (valid >6 months)',                   checked:false,essential:true},
  {id:'pk02',cat:'Documents',    item:'Travel insurance documents',                    checked:false,essential:true},
  {id:'pk03',cat:'Documents',    item:'Visa (Tanzania, Kenya, Uganda — check requirements)', checked:false,essential:true},
  {id:'pk04',cat:'Documents',    item:'Wildsenses booking confirmation',               checked:false,essential:true},
  {id:'pk05',cat:'Documents',    item:'Yellow fever vaccination certificate',          checked:false,essential:true},
  {id:'pk06',cat:'Documents',    item:'Emergency card (printed)',                      checked:false,essential:true},
  {id:'pk07',cat:'Documents',    item:'Gorilla permit confirmation printout',          checked:false,essential:true},
  // Health
  {id:'pk08',cat:'Health',       item:'Anti-malaria medication (prescribed)',          checked:false,essential:true},
  {id:'pk09',cat:'Health',       item:'DEET insect repellent 50%+',                   checked:false,essential:true},
  {id:'pk10',cat:'Health',       item:'Sunscreen SPF 50+',                            checked:false,essential:true},
  {id:'pk11',cat:'Health',       item:'Basic first aid kit',                          checked:false,essential:true},
  {id:'pk12',cat:'Health',       item:'Altitude sickness tablets (Ngorongoro 2,300m, Bwindi 2,161m)', checked:false,essential:false},
  {id:'pk13',cat:'Health',       item:'Hand sanitiser',                               checked:false,essential:true},
  {id:'pk14',cat:'Health',       item:'Rehydration salts',                            checked:false,essential:false},
  // Safari clothing — muted earth tones only (no bright colours)
  {id:'pk15',cat:'Safari Clothing', item:'Khaki/beige long-sleeve shirts × 4',       checked:false,essential:true},
  {id:'pk16',cat:'Safari Clothing', item:'Safari trousers × 3 (zip-off recommended)',checked:false,essential:true},
  {id:'pk17',cat:'Safari Clothing', item:'Fleece or light down jacket (Ngorongoro & Bwindi get cold)', checked:false,essential:true},
  {id:'pk18',cat:'Safari Clothing', item:'Wide-brimmed sun hat',                     checked:false,essential:true},
  {id:'pk19',cat:'Safari Clothing', item:'Buff / neck gaiter',                       checked:false,essential:true},
  {id:'pk20',cat:'Safari Clothing', item:'Comfortable walking boots (broken in)',    checked:false,essential:true},
  {id:'pk21',cat:'Safari Clothing', item:'Sandals / flip flops (camp use)',          checked:false,essential:false},
  {id:'pk22',cat:'Safari Clothing', item:'Moisture-wicking base layers × 3',        checked:false,essential:true},
  {id:'pk23',cat:'Safari Clothing', item:'Rain jacket / waterproof layer',           checked:false,essential:true},
  {id:'pk24',cat:'Safari Clothing', item:'Merino wool socks × 5 pairs',              checked:false,essential:true},
  // Gorilla trek (D15 — Bwindi is a dense rainforest)
  {id:'pk25',cat:'Gorilla Trek',    item:'Thick gardening gloves (grip tree roots)', checked:false,essential:true},
  {id:'pk26',cat:'Gorilla Trek',    item:'Waterproof trousers (forest mud)',         checked:false,essential:true},
  {id:'pk27',cat:'Gorilla Trek',    item:'Gaiters (for dense undergrowth)',          checked:false,essential:true},
  {id:'pk28',cat:'Gorilla Trek',    item:'Trekking poles (steep terrain)',           checked:false,essential:false},
  {id:'pk29',cat:'Gorilla Trek',    item:'Small daypack for trek (5–10 L)',          checked:false,essential:true},
  {id:'pk30',cat:'Gorilla Trek',    item:'Packed lunch & water for full day',        checked:false,essential:true},
  // Electronics
  {id:'pk31',cat:'Electronics',     item:'Camera + telephoto lens (300mm+)',         checked:false,essential:true},
  {id:'pk32',cat:'Electronics',     item:'Extra memory cards + batteries',           checked:false,essential:true},
  {id:'pk33',cat:'Electronics',     item:'Phone + charging cable',                   checked:false,essential:true},
  {id:'pk34',cat:'Electronics',     item:'Power bank 10,000 mAh+ (camps may limit charging)', checked:false,essential:true},
  {id:'pk35',cat:'Electronics',     item:'Universal travel adapter (East Africa plug types)', checked:false,essential:true},
  {id:'pk36',cat:'Electronics',     item:'Binoculars 8×42 or 10×42',               checked:false,essential:true},
  // Hot air balloon (D6)
  {id:'pk37',cat:'Balloon Day',     item:'Warm layers (cold at altitude pre-dawn)', checked:false,essential:true},
  {id:'pk38',cat:'Balloon Day',     item:'Camera fully charged night before',       checked:false,essential:true},
  // Misc
  {id:'pk39',cat:'Misc',            item:'USD cash (tips, extras, emergencies)',    checked:false,essential:true},
  {id:'pk40',cat:'Misc',            item:'Small padlock for bags (safari vehicles have no lockers)', checked:false,essential:false},
  {id:'pk41',cat:'Misc',            item:'Headtorch (Bwindi pre-dawn gorilla start)',checked:false,essential:true},
];

/* ── SOS Data — Tanzania, Kenya, Uganda ─────────────────── */
const SOS_DATA = {
  emergency:[
    // Tanzania
    {label:'Tanzania Police',            value:'112 or 115'},
    {label:'Tanzania Ambulance',         value:'114'},
    {label:'AMREF Flying Doctors (TZ)',  value:'+255 (0)738 640 640',  note:'Bush evacuation — covered by package'},
    // Kenya
    {label:'Kenya Police',               value:'999 or 112'},
    {label:'Kenya Ambulance',            value:'999'},
    {label:'AMREF Flying Doctors (KE)',  value:'+254 (0)20 699 2000',  note:'Bush evacuation — covered by package'},
    // Uganda
    {label:'Uganda Police',              value:'999 or 112'},
    {label:'Uganda Ambulance',           value:'999'},
    // Malaysian Embassy
    {label:'MY Embassy Nairobi',         value:'+254 20 2697 000'},
    {label:'MY Embassy Kampala',         value:'+256 41 4343 850'},
    // Tour Operator
    {label:'Wildsenses Holidays (24hr)', value:'+60 28138778', note:'Your operator — call first for any trip issue'},
  ],
  lodging:[
    {label:'D1–2 Ngorongoro',  value:'Asilia The Highlands',                  address:'Ngorongoro Conservation Area, Tanzania'},
    {label:'D3–4 C. Serengeti',value:'Asilia Dunia Camp',                     address:'Central Serengeti, Tanzania'},
    {label:'D5–8 N. Serengeti',value:'Asilia Olakira Camp',                   address:'Northern Serengeti, Tanzania'},
    {label:'D9 Nairobi',       value:'Radisson Blu Nairobi Arboretum',        address:'Arboretum Road, Nairobi, Kenya'},
    {label:'D10–12 Amboseli',  value:'Tortilis Camp',                         address:'Kimana Sanctuary, Amboseli, Kenya'},
    {label:'D13 Entebbe',      value:'No.5 Boutique Hotel',                   address:'Entebbe, Uganda'},
    {label:'D14–15 Bwindi',    value:'Nkuringo Gorilla Lodge (Forest Suite)', address:'Nkuringo, Bwindi, Uganda'},
  ],
  passes:[
    {label:'Gorilla Permit',       value:'USD 1,500/pax — included · Confirm with operator'},
    {label:'Hot Air Balloon',      value:'USD 590/pax — included · Confirm with operator'},
    {label:'Bush Evacuation Ins.', value:'Included in Tanzania & Kenya only'},
    {label:'KQ 414 (D13)',         value:'Nairobi → Entebbe · NOT included — buy separately'},
    {label:'Qatar Airways (int\'l)',value:'KUL-DOH-JRO outbound · EBB-DOH-KUL return · NOT included'},
  ],
  addresses:[
    {label:'Asilia The Highlands',          address:'Ngorongoro Conservation Area (NCA), Tanzania'},
    {label:'Asilia Dunia Camp',             address:'Seronera, Central Serengeti NP, Tanzania'},
    {label:'Asilia Olakira Camp',           address:'Northern Serengeti (Kogatende area), Tanzania'},
    {label:'Radisson Blu Arboretum',        address:'Arboretum Road, Nairobi, Kenya'},
    {label:'Tortilis Camp',                 address:'Kimana Sanctuary, Amboseli, Kenya'},
    {label:'No.5 Boutique Hotel',           address:'Entebbe, Uganda'},
    {label:'Nkuringo Gorilla Lodge',        address:'Nkuringo, Bwindi Impenetrable NP, Uganda'},
  ],
};

/* ── Hospitals — nearest by region ──────────────────────── */
const HOSPITALS = [
  {region:'Tanzania (Arusha / Kilimanjaro)',  name:'Arusha Lutheran Medical Centre', tel:'+255 27 2544 295', maps:'https://maps.google.com/?q=-3.3869,36.6830', note:'Best private hospital near Kilimanjaro'},
  {region:'Tanzania (Serengeti emergency)',   name:'AMREF Flying Doctors',           tel:'+255 738 640 640', maps:'', note:'Bush evacuation only — included in package'},
  {region:'Kenya (Nairobi)',                  name:'The Nairobi Hospital',           tel:'+254 20 2845 000', maps:'https://maps.google.com/?q=-1.2993,36.8071', note:'Best private hospital in Nairobi'},
  {region:'Kenya (Amboseli)',                 name:'AMREF Flying Doctors',           tel:'+254 20 699 2000', maps:'', note:'Bush evacuation — fly out to Nairobi'},
  {region:'Uganda (Kampala)',                 name:'International Hospital Kampala', tel:'+256 31 2200 400', maps:'https://maps.google.com/?q=0.3476,32.5825', note:'~3 hrs from Bwindi'},
  {region:'Uganda (Bwindi emergency)',        name:'Bwindi Community Hospital',      tel:'+256 792 964 920', maps:'https://maps.google.com/?q=-0.9892,29.7833', note:'Nearest hospital to Nkuringo Lodge'},
];

/* ── First aid — Africa-specific ────────────────────────── */
const FIRST_AID = [
  {title:'Malaria symptoms',
   content:'Fever, chills, headache, muscle pain 7–30 days after mosquito bite. If you develop flu-like symptoms during or after the trip, seek medical attention immediately and tell the doctor you have been in a malaria zone. Do not self-diagnose.'},
  {title:'Heat exhaustion',
   content:'Move to shade. Remove heavy layers. Sip cool water slowly. Wet skin with cool water. Rest 30+ min. Emergency signs (heatstroke): confusion, no sweating, temperature above 40°C — call for help immediately.'},
  {title:'Altitude (Ngorongoro 2,300m · Bwindi 2,161m)',
   content:'Headache, nausea, dizziness on arrival. Mild: slow down, hydrate, rest. Do not ascend further when symptomatic. Descend if symptoms worsen. Both camps have medical kits and can assist evacuation.'},
  {title:'Animal encounter (safari vehicle)',
   content:'Stay inside the vehicle unless specifically instructed by your guide. Do not stand, shout or make sudden movements. If an animal approaches, stay calm and follow guide instructions exactly.'},
  {title:'Gorilla trek injury (Bwindi forest)',
   content:'Dense forest, steep terrain, roots and mud. If injured: stop and alert your guide immediately. The ranger team carries first aid. Do not attempt to walk out alone. Nkuringo Gorilla Lodge has emergency medical kit.'},
  {title:'Insect bites & stings',
   content:'Apply antiseptic. Watch for allergic reaction (difficulty breathing, swelling of face — use EpiPen if prescribed, call for help). Tsetse fly bites (sharp, day-biting) are common near game areas — use repellent and cover up.'},
];

/* ── Runtime state ───────────────────────────────────────── */
let STOPS    = [...SEED_STOPS];
let EXPENSES = [];
let PACKING  = [...SEED_PACKING];
let OVERNIGHT = {};
let TRAVELERS = ['Vivien'];
let TRIP_NAME = Config.TRIP_NAME;
let CUSTOM_LINKS = [];

// Build overnight lookup from OVERNIGHT_DEFAULTS
Object.entries(OVERNIGHT_DEFAULTS).forEach(([k,v]) => { OVERNIGHT[k] = { ...v }; });

const STAMPS_COLLECTED = new Set();
window._STAMPS_COLLECTED = STAMPS_COLLECTED;

/* ── Data API (same interface as Japan PWA) ──────────────── */
const Data = {
  async init() {
    try {
      const localVersion = await DB.getMeta('dataVersion').catch(() => null);
      const targetVersion = Config.DATA_VERSION || 1;
      if (!localVersion || localVersion < targetVersion) {
        await DB.clearStops().catch(()=>{});
        STOPS = JSON.parse(JSON.stringify(SEED_STOPS));
        await DB.saveStops(STOPS);
        OVERNIGHT = {};
        Object.entries(OVERNIGHT_DEFAULTS).forEach(([k,v]) => { OVERNIGHT[k] = { ...v }; });
        await DB.saveOvernight(OVERNIGHT);
        await DB.setMeta('dataVersion', targetVersion);
        console.log('[Data] Africa v'+targetVersion+' loaded');
      } else {
        const dbStops = await DB.loadStops();
        if (dbStops?.length >= SEED_STOPS.length * 0.8) STOPS = dbStops;
        else await DB.saveStops(STOPS);
        const dbOvernight = await DB.loadOvernight().catch(() => null);
        if (dbOvernight) Object.assign(OVERNIGHT, dbOvernight);
      }
      const stampIds = await DB.loadStamps();
      stampIds.forEach(id => STAMPS_COLLECTED.add(id));
      const dbExp = await DB.loadExpenses();
      if (dbExp?.length) EXPENSES = dbExp;
      const dbPack = await DB.loadPacking();
      if (dbPack?.length) PACKING = dbPack; else await DB.savePacking(PACKING);
      const dbTravelers = await DB.loadTravelers().catch(() => []);
      if (dbTravelers?.length) TRAVELERS = dbTravelers;
      const storedName = await DB.getMeta('tripName').catch(() => null);
      if (storedName) TRIP_NAME = storedName;
      const storedLinks = await DB.loadCustomLinks().catch(() => []);
      if (storedLinks?.length) CUSTOM_LINKS = storedLinks;
    } catch(e) { console.warn('[Data.init]', e); }
  },

  /* ── Setters (called by Sync) ─────────────────────────── */
  setStops(s)        { STOPS    = s; },
  setExpenses(e)     { EXPENSES = e; },
  setPackingItems(p) { PACKING  = p; },
  setStampCollected(id, v) { v ? STAMPS_COLLECTED.add(id) : STAMPS_COLLECTED.delete(id); },
  setOvernight(dayId, o) { OVERNIGHT[dayId] = o; },
  setTravelers(names) { TRAVELERS = names; },

  /* ── Getters ──────────────────────────────────────────── */
  getDays:        () => DAYS,
  getStops:       () => STOPS,
  getStopsByDay(id) {
    function parseTime(t) {
      if (!t) return 9999;
      const clean = String(t).replace(/[~\s]/g,'');
      if (!clean) return 9999;
      const m = clean.match(/^(\d{1,2}):(\d{2})/);
      return m ? parseInt(m[1])*60+parseInt(m[2]) : 9999;
    }
    return STOPS.filter(s => s.dayId === id).sort((a,b) => parseTime(a.time) - parseTime(b.time));
  },
  getStop:        (id) => STOPS.find(s => s.id === id),
  getExpenses:    () => EXPENSES,
  getPackingItems:() => PACKING,
  getTripName:    () => TRIP_NAME,
  getTravelers:   () => TRAVELERS,
  getCustomLinks: () => CUSTOM_LINKS,
  getInclusions:  () => INCLUSIONS,
  getExclusions:  () => EXCLUSIONS,

  getSOS:         () => SOS_DATA,
  getHospitals:   () => HOSPITALS,
  getFirstAid:    () => FIRST_AID,
  getRestrooms:   () => [],             // no restroom layer needed for safari
  getOvernight:   (dayId) => OVERNIGHT[dayId] || null,
  getAllOvernight: () => OVERNIGHT,

  getPackingByCategory() {
    const cats = {};
    PACKING.forEach(i => { if (!cats[i.cat]) cats[i.cat] = []; cats[i.cat].push(i); });
    return cats;
  },

  /* ── Stops ────────────────────────────────────────────── */
  async updateStop(id, patch) {
    const idx = STOPS.findIndex(s => s.id === id);
    if (idx === -1) return null;
    STOPS[idx] = { ...STOPS[idx], ...patch, updatedAt: Date.now() };
    await DB.saveStop(STOPS[idx]);
    Sync?.pushStop?.(STOPS[idx]);
    return STOPS[idx];
  },

  async addStop({ dayId, name, activity='', time='', transport='', transportType='walk', notes='', needsBooking=false, category=null }) {
    const existing = STOPS.filter(s => s.dayId === dayId);
    const order = existing.length ? Math.max(...existing.map(s => s.order)) + 1 : 1;
    const day = DAYS.find(d => d.id === dayId);
    const seg = !day ? 'transit'
      : ['d0','d9','d13','d16','d17'].includes(dayId) ? 'transit'
      : ['d1','d2','d3','d4','d5','d6','d7','d8'].includes(dayId) ? 'tanzania'
      : ['d10','d11','d12'].includes(dayId) ? 'kenya' : 'uganda';
    const stop = {
      id: 'su_' + Date.now(), dayId, order, segment: seg,
      name, activity, transport, transportType, time, timeZone: 'EAT',
      notes, lat: null, lng: null,
      flightIncluded: false, flightExcluded: false,
      needsBooking, category,
      booking: { status: 'open', ref: '', cost: null, deadline: null },
    };
    STOPS.push(stop);
    await DB.saveStop(stop);
    Sync?.pushStop?.(stop);
    return stop;
  },

  async deleteStop(id) {
    STOPS = STOPS.filter(s => s.id !== id);
    await DB.deleteStop(id).catch(()=>{});
    Sync?.removeStop?.(id);
  },

  /* ── Overnight ────────────────────────────────────────── */
  async updateOvernight(dayId, patch) {
    OVERNIGHT[dayId] = { ...(OVERNIGHT[dayId] || {}), ...patch };
    await DB.saveOvernight(OVERNIGHT);
    Sync?.pushSettings?.();
    return OVERNIGHT[dayId];
  },

  /* ── Expenses ─────────────────────────────────────────── */
  async addExpense(exp) {
    exp.id = 'exp_' + Date.now(); exp.ts = Date.now();
    EXPENSES.push(exp);
    await DB.saveExpense(exp);
    Sync?.pushExpense?.(exp);
    return exp;
  },
  async deleteExpense(id) {
    EXPENSES = EXPENSES.filter(e => e.id !== id);
    await DB.deleteExpense(id);
    Sync?.removeExpense?.(id);
  },
  getTotalSpentJPY: () => EXPENSES.reduce((s, e) => s + (e.amountJPY || 0), 0),

  /* ── Packing ──────────────────────────────────────────── */
  async togglePacking(id, checked) {
    const item = PACKING.find(p => p.id === id);
    if (item) item.checked = checked;
    await DB.togglePacking(id, checked);
    Sync?.pushPacking?.(item);
  },
  async addPackingItem({ cat, item, essential = false }) {
    const newItem = { id: 'pk_' + Date.now(), cat, item, checked: false, essential };
    PACKING.push(newItem);
    await DB.savePackingItem(newItem).catch(()=>{});
    Sync?.pushPacking?.(newItem);
    return newItem;
  },
  async deletePacking(id) {
    PACKING = PACKING.filter(p => p.id !== id);
    await DB.deletePacking(id).catch(()=>{});
    Sync?.removePacking?.(id);
  },

  /* ── Reservations ─────────────────────────────────────── */
  getTransportReservations() {
    return STOPS
      .filter(s => s.needsBooking && s.category === 'transport')
      .sort((a,b) => (DAY_ORDER.indexOf(a.dayId) - DAY_ORDER.indexOf(b.dayId)) || (a.order||0)-(b.order||0));
  },
  getActivityReservations() {
    return STOPS
      .filter(s => s.needsBooking && s.category === 'activity')
      .sort((a,b) => (DAY_ORDER.indexOf(a.dayId) - DAY_ORDER.indexOf(b.dayId)) || (a.order||0)-(b.order||0));
  },

  getBookingsList() {
    const order = { urgent:0, pending:1, booked:2, open:3 };
    return STOPS.filter(s => s.booking.status !== 'open')
      .sort((a,b) => order[a.booking.status] - order[b.booking.status]);
  },

  getStats() {
    return {
      urgent:  STOPS.filter(s => s.booking.status === 'urgent').length,
      pending: STOPS.filter(s => s.booking.status === 'pending').length,
      booked:  STOPS.filter(s => s.booking.status === 'booked').length,
      total:   STOPS.length,
    };
  },

  /* ── Custom links ─────────────────────────────────────── */
  async addCustomLink(link) {
    link.id = 'lk_' + Date.now();
    CUSTOM_LINKS.push(link);
    await DB.saveCustomLinks(CUSTOM_LINKS).catch(()=>{});
    Sync?.pushSettings?.();
    return link;
  },
  async deleteCustomLink(id) {
    CUSTOM_LINKS = CUSTOM_LINKS.filter(l => l.id !== id);
    await DB.saveCustomLinks(CUSTOM_LINKS).catch(()=>{});
    Sync?.pushSettings?.();
  },

  /* ── Trip name ────────────────────────────────────────── */
  async setTripName(name) {
    TRIP_NAME = name;
    await DB.setMeta('tripName', name).catch(()=>{});
    Sync?.pushSettings?.();
  },

  /* ── Balance ──────────────────────────────────────────── */
  getBalances() {
    const travelers = TRAVELERS.length ? TRAVELERS : ['Vivien'];
    const balances = {};
    travelers.forEach(t => balances[t] = 0);
    EXPENSES.forEach(exp => {
      if (!exp.paidBy || !exp.splitBetween?.length) return;
      const validSplit = exp.splitBetween.filter(n => balances[n] !== undefined);
      if (!validSplit.length) return;
      const share = exp.amountJPY / validSplit.length;
      if (balances[exp.paidBy] !== undefined) balances[exp.paidBy] += exp.amountJPY;
      validSplit.forEach(name => { balances[name] -= share; });
    });
    return balances;
  },
};

window.Data = Data;

/* ── Compatibility stubs (called by bookings.js) ──────────── */
// These extend the Data API without modifying the core object.
// Using Object.assign to add to the existing window.Data.

Object.assign(Data, {

  /* Expense settlement (used by budget tab) */
  calcSettlement() {
    return this.getBalances();
  },

  /* Travelers update alias */
  async updateTravelers(names) {
    TRAVELERS = names;
    await DB.saveTravelers(names).catch(()=>{});
    Sync?.pushTravelers?.();
  },

  /* Reset to seed data (settings screen) */
  async resetToSeed() {
    STOPS    = JSON.parse(JSON.stringify(SEED_STOPS));
    EXPENSES = [];
    PACKING  = JSON.parse(JSON.stringify(SEED_PACKING));
    OVERNIGHT = {};
    Object.entries(OVERNIGHT_DEFAULTS).forEach(([k,v]) => { OVERNIGHT[k] = { ...v }; });
    await DB.clearStops().catch(()=>{});
    await DB.saveStops(STOPS);
    await DB.saveOvernight(OVERNIGHT);
    await DB.clearExpenses().catch(()=>{});
    await DB.savePacking(PACKING);
    await DB.setMeta('dataVersion', Config.DATA_VERSION || 1);
  },

  /* Stamp stubs — Africa has no stamps but bookings.js may reference these */
  getStampStops:    () => [],
  isStampCollected: () => false,
  toggleStamp:      async () => false,
  getStampProgress: () => ({ collected:0, total:0, sanzanCollected:0, sanzanTotal:0, sanzanComplete:false }),
  getJRSeatReservations: () => [],

  /* Custom links setter (called by sync.js) */
  setCustomLinks(links) { CUSTOM_LINKS = links; },
});
