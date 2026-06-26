'use strict';

/* ── Day structure (D0–D14, from Kumano Kodo sheet) ─────── */
const DAY_ORDER = ['d0','d1','d2','d3','d4','d5','d6','d7','d8','d9','d10','d11','d12','d13','d14'];

const DAYS = [
  {id:'d0',  label:'D0',  date:'Fri 9 Apr',   title:'Night Flight to Osaka'},
  {id:'d1',  label:'D1',  date:'Sat 10 Apr',  title:'Osaka · Kushimoto · Hayatama Taisha'},
  {id:'d2',  label:'D2',  date:'Sun 11 Apr',  title:'Kushimoto · Kii-Tanabe'},
  {id:'d3',  label:'D3',  date:'Mon 12 Apr',  title:'Kii-Tanabe · Takijiri · Takahara'},
  {id:'d4',  label:'D4',  date:'Tue 13 Apr',  title:'Takahara · Tsugizakura  · 16 km'},
  {id:'d5',  label:'D5',  date:'Wed 14 Apr',  title:'Tsugizakura · Hongu · Yunomine'},
  {id:'d6',  label:'D6',  date:'Thu 15 Apr',  title:'Hongu Taisha rest day'},
  {id:'d7',  label:'D7',  date:'Fri 16 Apr',  title:'Riverboat · Shingu · Kii-Katsuura'},
  {id:'d8',  label:'D8',  date:'Sat 17 Apr',  title:'Nachi · Nagoya · Nagano'},
  {id:'d9',  label:'D9',  date:'Sun 18 Apr',  title:'Togakushi shrine day'},
  {id:'d10', label:'D10', date:'Mon 19 Apr',  title:'Nagano · Alpine Route · Murodo'},
  {id:'d11', label:'D11', date:'Tue 20 Apr',  title:'Murodo · Tateyama · Toyama · Osaka'},
  {id:'d12', label:'D12', date:'Wed 21 Apr',  title:'Osaka'},
  {id:'d13', label:'D13', date:'Thu 22 Apr',  title:'Osaka'},
  {id:'d14', label:'D14', date:'Fri 23 Apr',  title:'Morning flight home'},
];

/* ── Overnight defaults (keyed by dayId) ────────────────── */
const OVERNIGHT_DEFAULTS = {
  d1:  {name:'本州最南端の小さなペンションBranchee',    status:'pending', ref:'',             cost:null, deadline:null},
  d2:  {name:'the cue - hoso back yard house -',        status:'pending', ref:'',             cost:null, deadline:null},
  d3:  {name:'Kiri-no-Sato Takahara Lodge',             status:'pending', ref:'',             cost:null, deadline:'2027-01-15'},
  d4:  {name:'古道の宿 ひよどり (Guest House Hiyodori)',  status:'pending', ref:'',             cost:null, deadline:'2027-01-15'},
  d5:  {name:'Kawayu-Onsen Fujiya',                     status:'pending', ref:'',             cost:null, deadline:'2027-01-15'},
  d6:  {name:'Kawayu-Onsen Fujiya (2nd night)',         status:'pending', ref:'',             cost:null, deadline:null},
  d7:  {name:'Kii-Katsuura (Pending)',                  status:'open',    ref:'',             cost:null, deadline:'2027-02-01'},
  d8:  {name:'Nagano (Pending)',                        status:'open',    ref:'',             cost:null, deadline:null},
  d9:  {name:'Nagano (Pending)',                        status:'open',    ref:'',             cost:null, deadline:null},
  d10: {name:'Murodo Sanso (Pending)',                  status:'urgent',  ref:'',             cost:null, deadline:'2027-01-01'},
  d11: {name:'DEL style 大阪心齋橋 by 大和Roynet飯店',  status:'booked',  ref:'TC45F0809AAD7', cost:null, deadline:null},
  d12: {name:'DEL style 大阪心齋橋 by 大和Roynet飯店',  status:'booked',  ref:'TC45F0809AAD7', cost:null, deadline:null},
  d13: {name:'DEL style 大阪心齋橋 by 大和Roynet飯店',  status:'booked',  ref:'TC45F0809AAD7', cost:null, deadline:null},
};

/* ── Seed stops (from Kumano Kodo sheet, updated Jun 2026) ── */
const T = (s,d,o,seg,name,act,transport,tt,time,tz,lat,lng,stamp,kanji,sanzan,needs,cat,td,bk) => ({
  id:s, dayId:d, order:o, segment:seg, name, activity:act, transport, transportType:tt,
  time, timeZone:tz||'JST', lat, lng,
  hasStamp:!!stamp, stampKanji:kanji||'', isSanzan:!!sanzan,
  needsBooking:!!needs, category:cat||null, trainDetail:td||null,
  notes:'', booking:bk||{status:'open',ref:'',cost:null,deadline:null},
});
const TRN = (svc,jp,sr,orig,dest,arr,num,dur,plat) => ({service:svc,jrPass:!!jp,seatReservation:!!sr,origin:orig||'',destination:dest||'',arriveTime:arr||'',trainNumber:num||'TBD',duration:dur||'',platform:plat||''});

const SEED_STOPS = [
/* D0 — Night flight ──────────────────────────────────────── */
T('sk01','d0',1,'transit','KUL → KIX','Night flight to Osaka Kansai',
  'MH52 · depart ~23:00 MYT · arrive ~06:30+1 JST','plane','23:00','MYT',
  null,null, false,'',false, true,'transport',
  {service:'MH52',jrPass:false,seatReservation:false},
  {status:'pending',ref:'MH52',cost:null,deadline:null}),

/* D1 — Osaka → Kushimoto → Hayatama Taisha ──────────────── */
T('sk02','d1',1,'kumano','KIX → Kushimoto (Haruka + Kuroshio 1)',
  'Collect JR Pass at KIX (allow 30–45 min at JR office)',
  'KIX → Hineno @ Haruka 6 (08:08, 8 min) → Kushimoto @ Kuroshio 1 Ltd Exp (08:16, 2h40m)',
  'train','08:08','JST', 33.4784,135.7834,
  false,'',false, true,'transport',
  TRN('Haruka 6 + Kuroshio 1 Ltd Exp',true,true,'KIX / Hineno','Kushimoto','11:06','Kuroshio 1','~3h'),
  {status:'open',ref:'',cost:null,deadline:null}),

T('sk03','d1',2,'kumano','Kushimoto — arrive & lunch',
  'Check in bags, explore town, lunch near station.',
  '','walk','11:30','JST', 33.4784,135.7834,
  false,'',false, false,null,null,
  {status:'open',ref:'',cost:null,deadline:null}),

T('sk04','d1',3,'kumano','Hayatama Taisha (Sanzan #2)',
  'Grand Shrine #2. 御朱印 stamp. Ancient camphor trees.',
  'Train Kushimoto→Ukui (13:14, 46m) + Bus Ukui→Hayatama Mae (14:13, 22m). Arrive ~14:40. Linger ~2h47m.',
  'walk','14:40','JST', 33.7322,135.9835,
  true,'速玉',true, false,'activity',null,
  {status:'open',ref:'',cost:null,deadline:null}),

T('sk05','d1',4,'kumano','Return — Shingu → Kushimoto (Kuroshio 36)',
  'Evening return to Kushimoto for overnight.',
  'Bus Hayatama → Shingu Stn (17:27, 4m) → Kuroshio 36 Ltd Exp (17:46, 51m)',
  'train','17:46','JST', 33.4784,135.7834,
  false,'',false, true,'transport',
  TRN('Kuroshio 36 Ltd Express',true,true,'Shingu','Kushimoto','18:37','Kuroshio 36','51 min'),
  {status:'open',ref:'',cost:null,deadline:null}),

/* D2 — Kushimoto → Kii-Tanabe ───────────────────────────── */
T('sk06','d2',1,'kumano','Hashigui-iwa & Shionomisaki sightseeing',
  'Southernmost tip of Honshu. Hashigui-iwa rock pillars. Cape Shionomisaki lighthouse.',
  '','walk','08:00','JST', 33.4555,135.7617,
  false,'',false, false,null,null),

T('sk07','d2',2,'kumano','Kushimoto → Kii-Tanabe',
  'Afternoon train south to Kii-Tanabe.',
  'JR Kisei Line · 1h16m · JR Pass ✓',
  'train','14:20','JST', 33.7330,135.3841,
  false,'',false, false,'transport',
  TRN('JR Kisei Line',true,false,'Kushimoto','Kii-Tanabe','15:36','','1h 16min'),
  {status:'open',ref:'',cost:null,deadline:null}),

T('sk08','d2',3,'kumano','Tanabe Tourist Info Center',
  'Collect Kumano Passport (御朱印帳). Pick up trail maps. Ask about conditions.',
  'Walking distance from Kii-Tanabe Station. Open 09:00–18:00.',
  'walk','15:40','JST', 33.7330,135.3841,
  false,'',false, false,null,null),

/* D3 — Kii-Tanabe → Takijiri → Takahara ────────────────── */
T('sk09','d3',1,'kumano','Bus to Takijiri-oji',
  'Ryujin Bus to the Kumano Kodo trailhead.',
  'Bus Kii-Tanabe Stn → Takijiri-oji · 08:30 · ~35 min · Platform 2 · ¥970',
  'bus','08:30','JST', 33.7757,135.5037,
  false,'',false, false,'transport',null,
  {status:'open',ref:'',cost:null,deadline:null}),

T('sk10','d3',2,'kumano','Takijiri-oji (trailhead)',
  'Kumano Kodo trailhead. Tainai-kuguri womb-crawling rock. First stamp.',
  'Arrive from bus. Walk begins here.',
  'walk','09:05','JST', 33.7757,135.5037,
  true,'滝尻',false, false,null,null),

T('sk11','d3',3,'kumano','Arrive Takahara',
  'First overnight on the ridge. Stunning mist views. Onsen at the lodge. ~3.6 km, ~1.5–2 hrs from Takijiri.',
  'On foot.',
  'walk','12:00','JST', 33.7959,135.5321,
  true,'高原',false, false,null,null),

/* D4 — Takahara → Tsugizakura ───────────────────────────── */
T('sk12','d4',1,'kumano','Depart Takahara',
  '16 km · ~7 hrs. Path: Daimon-oji → Jujo-oji → Chikatsuyu-oji → Hisohara-oji → Tsugizakura-oji.',
  'On foot.',
  'walk','08:00','JST', 33.7959,135.5321,
  false,'',false, false,null,null),

T('sk13','d4',2,'kumano','Chikatsuyu-oji (resupply)',
  'Last reliable shop/resupply on this leg. Nonaka-no-Shimizu cold spring nearby.',
  'On foot · ~8.5 km from Takahara · ~4 hrs.',
  'walk','12:00','JST', 33.8314,135.6417,
  true,'近露',false, false,null,null),

T('sk14','d4',3,'kumano','Tsugizakura-oji',
  '800-year-old cedar tree. End of the day. Guest House Hiyodori is 16 min walk from oji.',
  'On foot · ~7.5 km from Chikatsuyu · ~3 hrs.',
  'walk','16:00','JST', 33.8283,135.6342,
  true,'継桜',false, false,null,null),

/* D5 — Tsugizakura → Hongu → Yunomine ──────────────────── */
T('sk15','d5',1,'kumano','Hosshinmon-oji',
  'Traditional outer torii gate of Hongu Taisha. 3-torii gate approach.',
  'On foot.',
  'walk','09:00','JST', 33.8618,135.7207,
  true,'発心',false, false,null,null),

T('sk16','d5',2,'kumano','Kumano Hongu Taisha (Sanzan #1)',
  'Grand Shrine #1 of Kumano Sanzan. Largest torii gate in Japan nearby (Oyunohara). 御朱印 stamp.',
  'On foot from Hosshinmon · ~2 hrs.',
  'walk','12:00','JST', 33.8406,135.7735,
  true,'本宮',true, false,null,null,
  {status:'open',ref:'',cost:null,deadline:null}),

T('sk17','d5',3,'kumano','Yunomine Onsen · Tsuboyu',
  'World\'s only UNESCO heritage hot spring bath. Tsuboyu private bath (30-min slots). Book slot at Yuge-ya Inn.',
  'Bus Hongu → Yunomine · ~15 min · ¥200.',
  'bus','15:00','JST', 33.8293,135.7576,
  true,'湯峯',false, true,'activity',null,
  {status:'urgent',ref:'',cost:null,deadline:'2027-02-01'}),

/* D6 — Hongu Taisha rest day ────────────────────────────── */
T('sk18','d6',1,'kumano','Kawayu Onsen riverside',
  'Free morning. River rock hot spring pools (Sennin Buro). Open to all, no charge.',
  '',
  'walk','08:00','JST', 33.8132,135.7725,
  false,'',false, false,null,null),

T('sk19','d6',2,'kumano','Kumano Hongu Taisha — spring matsuri',
  'Spring matsuri at Hongu Taisha. Confirm exact 2027 festival date with shrine.',
  'Hotel shuttle or local bus · ~20 min.',
  'bus','10:00','JST', 33.8406,135.7735,
  false,'',false, false,null,null),

/* D7 — Riverboat → Shingu → Kii-Katsuura ───────────────── */
T('sk20','d7',1,'kumano','Kumano-gawa Riverboat',
  'Traditional cedar Kumano boat. Hongu riverside → Shingu area. ~90 min. Seasonal (Oct–May).',
  'Board at Hongu riverside. Depart 14:30. Arrive ~16:30.',
  'boat','14:30','JST', 33.8406,135.7735,
  false,'',false, true,'activity',null,
  {status:'urgent',ref:'',cost:null,deadline:'2027-02-01'}),

T('sk21','d7',2,'kumano','Shingu → Kii-Katsuura',
  'Short JR hop to Katsuura for overnight.',
  'JR Kisei Line · Shingu → Kii-Katsuura · ~25 min · JR Pass ✓.',
  'train','17:00','JST', 33.6282,135.9414,
  false,'',false, false,'transport',
  TRN('JR Kisei Line',true,false,'Shingu','Kii-Katsuura','17:25','','25 min'),
  {status:'open',ref:'',cost:null,deadline:null}),

/* D8 — Nachi → Nagoya → Nagano ──────────────────────────── */
T('sk22','d8',1,'kumano','Daimon-zaka → Nachi Taisha',
  'Ancient cedar stone steps (267 steps). Pre-dawn start to beat the crowds.',
  'Taxi Kii-Katsuura Stn → Daimon-zaka (06:00, ~30 min) then walk to Nachi Taisha (~60 min).',
  'walk','06:30','JST', 33.6713,135.8976,
  false,'',false, false,null,null),

T('sk23','d8',2,'kumano','Kumano Nachi Taisha + Nachi Falls (Sanzan #3)',
  'Grand Shrine #3. Sanzan complete! Pagoda + waterfall view. Nachi Falls 133m — Japan\'s tallest. KNT stamp 06:00–16:30, NS 07:30–16:30.',
  'On foot from Daimon-zaka.',
  'walk','07:00','JST', 33.6687,135.8901,
  true,'那智',true, false,null,null),

T('sk24','d8',3,'nagano','Kii-Katsuura → Nagoya',
  'Long transit day begins. 4-hour train to Nagoya. JR Pass ✓. Seat reservation required.',
  'Bus to Kii-Katsuura Stn (10:34, 24 min) · JRW Train → Nagoya (~4h) · depart 12:25.',
  'train','12:25','JST', 33.6282,135.9414,
  false,'',false, true,'transport',
  TRN('JRW Kisei/Nanki Ltd Express',true,true,'Kii-Katsuura','Nagoya','16:08','TBD','~4h'),
  {status:'open',ref:'',cost:null,deadline:null}),

T('sk25','d8',4,'nagano','Nagoya Station (platform transfer)',
  'Transfer at Nagoya. ~46 min to change platforms. Grab a quick bite if needed.',
  '',
  'train','16:08','JST', 35.1709,136.8815,
  false,'',false, false,null,null),

T('sk26','d8',5,'nagano','Nagoya → Nagano',
  'Final leg to Nagano. Arrive 20:40.',
  'JR Shinano Ltd Express · ~3h 29min · JR Pass ✓ · Seat reservation required. Depart 17:11.',
  'train','17:11','JST', 36.6442,138.1880,
  false,'',false, true,'transport',
  TRN('JR Shinano Ltd Express',true,true,'Nagoya','Nagano','20:40','TBD','3h 29min'),
  {status:'open',ref:'',cost:null,deadline:null}),

/* D9 — Togakushi shrine day ─────────────────────────────── */
T('sk27','d9',1,'nagano','Nagano → Togakushi (bus)',
  'Early bus to ancient mountain shrine complex.',
  'Bus Nagano Stn → Togakushi Hokusha · 06:50 · 48 min · BOOK IN ADVANCE (¥10,940 other transport D9).',
  'bus','06:50','JST', 36.6442,138.1880,
  false,'',false, true,'transport',null,
  {status:'open',ref:'',cost:null,deadline:null}),

T('sk28','d9',2,'nagano','Togakushi Shrines (Hokusha → Okusha)',
  'Cedar-lined path through 5 shrines. Ancient cryptomeria forest. Hokusha (1st) → Chusha (3rd) → Okusha (5th). ~4 hrs walk.',
  'Depart bus at Hokusha. Walk begins 07:38.',
  'walk','07:38','JST', 36.7780,137.9870,
  true,'戸隠',false, false,null,null),

T('sk29','d9',3,'nagano','Return bus to Nagano',
  'Bus Togakushi Okusha → Nagano Stn (59 min). Free afternoon in Nagano.',
  'Bus depart 13:34. Arrive Nagano ~14:35.',
  'bus','13:34','JST', 36.7780,137.9870,
  false,'',false, false,null,null),

/* D10 — Nagano → Alpine Route → Murodo ──────────────────── */
T('sk30','d10',1,'alpine','Nagano → Ogizawa (bus)',
  'Book Alpine Route tickets in advance (through-ticket from Ogizawa to Toyama side). Depart Nagano.',
  'Bus Nagano Stn → Ogizawa · 07:50 · 1h45m. BOOK ALPINE ROUTE TICKET IN ADVANCE.',
  'bus','07:50','JST', 36.6442,138.1880,
  false,'',false, true,'transport',null,
  {status:'urgent',ref:'',cost:null,deadline:'2027-01-15'}),

T('sk31','d10',2,'alpine','Ogizawa → Kurobe Dam (Kanden Electric Bus)',
  'Kanden Tunnel Electric Bus through the mountain to Kurobe Dam.',
  'Kanden Tunnel Electric Bus · 16 min · Alpine through-ticket.',
  'cable','09:30','JST', 36.5592,137.7210,
  false,'',false, false,'transport',null),

T('sk32','d10',3,'alpine','Kurobe Dam Observatory',
  'Linger 54 min. Walk across the 186m arch dam. Snow walls (Yuki-no-Otani) visible. Spectacular views.',
  'On foot across the dam.',
  'walk','09:46','JST', 36.5675,137.6650,
  true,'室堂',false, false,null,null),

T('sk33','d10',4,'alpine','Kurobe Dam → Murodo (cable car + ropeway + ebus)',
  'Snow Wall at Murodo — walls 13–18m! Hell Valley (Jigokudani), Mikurigaike Pond, Shomyo Falls.',
  'Kurobeko Cable Car (10:10, 5m) → Kurobedaira Ropeway (7m) → Daikanbo Ebus (11:15, 10m) → Murodo. Arrive ~11:25.',
  'cable','10:10','JST', 36.5732,137.5967,
  false,'',false, false,null,null),

/* D11 — Murodo → Tateyama → Toyama → Osaka ─────────────── */
T('sk34','d11',1,'alpine','Murodo morning',
  'Morning exploration. Hell Valley, Mikurigaike Pond, Shomyo Falls (Japan\'s tallest at 350m), Midagahara Wetlands.',
  '',
  'walk','06:00','JST', 36.5732,137.5967,
  false,'',false, false,null,null),

T('sk35','d11',2,'alpine','Murodo → Tateyama (bus + cable car)',
  'Descend from Murodo via Bijodaira.',
  'Bus Murodo → Bijodaira (13:00, 50m) → Cable Car Bijodaira → Tateyama (14:00, 7m). Arrive Tateyama ~14:07.',
  'cable','13:00','JST', 36.5750,137.4633,
  false,'',false, false,'transport',null),

T('sk36','d11',3,'alpine','Tateyama → Toyama (Toyama Chihou Railway)',
  'Switch to private Toyama Chihou Railway. NOT on JR Pass — buy ticket separately. ¥1,420.',
  'Toyama Chihou Railway Tateyama Line · 14:27 · 1h9m · ¥1,420 · NOT JR Pass.',
  'train','14:27','JST', 36.5833,137.4455,
  false,'',false, true,'transport',
  TRN('Toyama Chihou Railway Tateyama Line',false,false,'Tateyama','Toyama','15:36','','1h 9min'),
  {status:'open',ref:'',cost:null,deadline:null}),

T('sk37','d11',4,'osaka','Toyama → Osaka (Shinkansen + Thunderbird)',
  'Hokuriku Shinkansen Hakutaka 563 → Tsuruga, then Thunderbird 32 → Osaka. Arrive 18:17.',
  'Hokuriku Shinkansen Hakutaka 563 + Thunderbird 32 · 14:55 · 3h22m · JR Pass ✓ · Seat reservation required.',
  'train','14:55','JST', 36.7066,137.2130,
  false,'',false, true,'transport',
  TRN('Hokuriku Shinkansen Hakutaka 563 + Thunderbird 32',true,true,'Toyama','Osaka (Shin-Osaka)','18:17','Hakutaka 563 + Thunderbird 32','3h 22min'),
  {status:'open',ref:'',cost:null,deadline:null}),

/* D12 — Osaka ────────────────────────────────────────────── */
T('sk38','d12',1,'osaka','Osaka free day',
  'Dotonbori, Namba, Osaka Castle, Kuromon Market, Shinsekai.',
  '',
  'walk','','JST', 34.6654,135.5023,
  false,'',false, false,null,null),

/* D13 — Osaka ────────────────────────────────────────────── */
T('sk39','d13',1,'osaka','Osaka free day',
  'Nara day trip (45 min by train), Universal Studios, or more Osaka.',
  '',
  'walk','','JST', 34.6654,135.5023,
  false,'',false, false,null,null),

/* D14 — Morning flight ───────────────────────────────────── */
T('sk40','d14',1,'osaka','KIX — Morning flight home',
  'Morning departure. Allow 2 hrs for check-in. Subway Shinsaibashi → Namba → Nankai Rapid to KIX.',
  'Subway Umeda/Shinsaibashi → Namba Stn, Nankai Rapid to KIX (~45 min, ¥1,500). Depart hotel early.',
  'plane','','JST', 34.4348,135.2440,
  false,'',false, true,'transport',null,
  {status:'open',ref:'',cost:null,deadline:null}),
];

/* ── Packing list ────────────────────────────────────────── */
const SEED_PACKING = [
  {id:'pk01',cat:'Documents',   item:'Passport (valid >6 months)',         checked:false,essential:true},
  {id:'pk02',cat:'Documents',   item:'JR Pass (exchange order)',            checked:false,essential:true},
  {id:'pk03',cat:'Documents',   item:'Travel insurance docs',               checked:false,essential:true},
  {id:'pk04',cat:'Documents',   item:'Hotel bookings printout',             checked:false,essential:false},
  {id:'pk05',cat:'Documents',   item:'Emergency card (printed)',             checked:false,essential:true},
  {id:'pk06',cat:'Trail Gear',  item:'Hiking boots (well broken in)',       checked:false,essential:true},
  {id:'pk07',cat:'Trail Gear',  item:'Trekking poles',                      checked:false,essential:true},
  {id:'pk08',cat:'Trail Gear',  item:'Rain jacket / waterproof shell',      checked:false,essential:true},
  {id:'pk09',cat:'Trail Gear',  item:'Daypack (25–30 L) + rain cover',      checked:false,essential:true},
  {id:'pk10',cat:'Trail Gear',  item:'Water bottles / hydration',           checked:false,essential:true},
  {id:'pk11',cat:'Trail Gear',  item:'Blister plasters & first aid kit',   checked:false,essential:true},
  {id:'pk12',cat:'Trail Gear',  item:'Trekking snacks (trail bars)',        checked:false,essential:false},
  {id:'pk13',cat:'Trail Gear',  item:'Stamp passport pouch (keep dry)',    checked:false,essential:true},
  {id:'pk14',cat:'Trail Gear',  item:'Offline maps downloaded (Maps.me)',  checked:false,essential:true},
  {id:'pk15',cat:'Alpine',      item:'Warm gloves (Murodo plateau)',       checked:false,essential:true},
  {id:'pk16',cat:'Alpine',      item:'Sunglasses (snow glare at Murodo)',  checked:false,essential:true},
  {id:'pk17',cat:'Alpine',      item:'Waterproof boot covers / gaiters',   checked:false,essential:true},
  {id:'pk18',cat:'Clothing',    item:'Moisture-wicking base layers × 3',   checked:false,essential:true},
  {id:'pk19',cat:'Clothing',    item:'Mid-layer fleece or down',           checked:false,essential:true},
  {id:'pk20',cat:'Clothing',    item:'Trekking trousers × 2',              checked:false,essential:true},
  {id:'pk21',cat:'Clothing',    item:'Merino wool socks × 4',              checked:false,essential:true},
  {id:'pk22',cat:'Clothing',    item:'Sandals (onsen / guesthouse)',       checked:false,essential:true},
  {id:'pk23',cat:'Clothing',    item:'Light casual outfit (Osaka)',        checked:false,essential:false},
  {id:'pk24',cat:'Clothing',    item:'Buff / neck gaiter',                 checked:false,essential:false},
  {id:'pk25',cat:'Electronics', item:'Phone + cable + Japan adapter',      checked:false,essential:true},
  {id:'pk26',cat:'Electronics', item:'Power bank (10,000 mAh+)',           checked:false,essential:true},
  {id:'pk27',cat:'Onsen',       item:'Quick-dry travel towel',             checked:false,essential:true},
  {id:'pk28',cat:'Onsen',       item:'Onsen etiquette card (printed EN)',  checked:false,essential:false},
  {id:'pk29',cat:'Toiletries',  item:'Sunscreen SPF 50+',                  checked:false,essential:true},
  {id:'pk30',cat:'Toiletries',  item:'Insect repellent',                   checked:false,essential:true},
  {id:'pk31',cat:'Toiletries',  item:'Wet wipes (trail use)',              checked:false,essential:false},
  {id:'pk32',cat:'Cash',        item:'Small yen cash (stamps / buses / shrines)', checked:false,essential:true},
];

const SOS_DATA = {
  emergency:[
    {label:'Japan Police',              value:'110'},
    {label:'Japan Fire / Ambulance',    value:'119'},
    {label:'JNTO Tourist Helpline (EN)',value:'050-3816-2787'},
    {label:'MY Embassy Tokyo',          value:'+81-3-2080-7700'},
  ],
  lodging:[
    {label:'D1 Kushimoto',   value:'本州最南端の小さなペンションBranchee',jp:'ペンションBranchee'},
    {label:'D2 Kii-Tanabe',  value:'the cue - hoso back yard house',jp:''},
    {label:'D3 Takahara',    value:'Kiri-no-Sato Takahara Lodge',jp:'霧の郷たかはら'},
    {label:'D4 Tsugizakura', value:'古道の宿 ひよどり (Guest House Hiyodori)',jp:'古道の宿 ひよどり'},
    {label:'D5–6 Kawayu',    value:'Kawayu-Onsen Fujiya',jp:'川湯温泉 ふじや'},
    {label:'D11–13 Osaka',   value:'DEL style 大阪心齋橋 by 大和Roynet飯店 (TC45F0809AAD7)',jp:'大阪心齋橋'},
  ],
  passes:[
    {label:'JR Pass ref',           value:'Confirm when collected'},
    {label:'Alpine Route ticket',   value:'Book in advance at Ogizawa or online'},
    {label:'Osaka hotel ref',       value:'TC45F0809AAD7'},
  ],
  addresses:[
    {label:'Kumano Kodo trailhead (Takijiri)',jp:'和歌山県田辺市中辺路町滝尻'},
    {label:'Kumano Hongu Taisha',             jp:'和歌山県田辺市本宮町本宮1110'},
    {label:'Kumano Nachi Taisha',             jp:'和歌山県東牟婁郡那智勝浦町那智山1'},
    {label:'Hayatama Taisha',                 jp:'和歌山県新宮市新宮1'},
    {label:'Togakushi Okusha',                jp:'長野県長野市戸隠3690'},
    {label:'Murodo (Tateyama Kurobe Alpine)', jp:'富山県中新川郡立山町芦峅寺'},
  ],
};

/* ── Runtime state ───────────────────────────────────────── */
let STOPS    = [...SEED_STOPS];
let EXPENSES = [];
let PACKING  = [...SEED_PACKING];
let OVERNIGHT = {};
let TRAVELERS = [];

// Build overnight from OVERNIGHT_DEFAULTS
Object.entries(OVERNIGHT_DEFAULTS).forEach(([k,v]) => { OVERNIGHT[k] = { ...v }; });

const STAMPS_COLLECTED = new Set();
window._STAMPS_COLLECTED = STAMPS_COLLECTED;

/* ── Data API ────────────────────────────────────────────── */
const Data = {
  async init() {
    try {
      /* ── Version migration ────────────────────────────── */
      const localVersion = await DB.getMeta('dataVersion').catch(() => null);
      const targetVersion = Config.DATA_VERSION || 1;
      if (!localVersion || localVersion < targetVersion) {
        // Major data rebuild — clear old stops and re-seed
        await DB.clearStops().catch(()=>{});
        STOPS = JSON.parse(JSON.stringify(SEED_STOPS));
        await DB.saveStops(STOPS);
        OVERNIGHT = {};
        Object.entries(OVERNIGHT_DEFAULTS).forEach(([k,v]) => { OVERNIGHT[k] = { ...v }; });
        await DB.saveOvernight(OVERNIGHT);
        await DB.setMeta('dataVersion', targetVersion);
        console.log('[Data] Migrated to v'+targetVersion);
      } else {
        /* ── Normal load ────────────────────────────────── */
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
    } catch(e) { console.warn('[Data.init]', e); }
  },

  /* ── Setters (called by Sync) ────────────────────────── */
  setStops(s)        { STOPS    = s; },
  setExpenses(e)     { EXPENSES = e; },
  setPackingItems(p) { PACKING  = p; },
  setStampCollected(id, v) { v ? STAMPS_COLLECTED.add(id) : STAMPS_COLLECTED.delete(id); },
  setOvernight(dayId, o) { OVERNIGHT[dayId] = o; },
  setTravelers(names) { TRAVELERS = names; },

  /* ── Getters ─────────────────────────────────────────── */
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

  /* ── Travelers ───────────────────────────────────────── */
  getTravelers: () => TRAVELERS,
  async updateTravelers(names) {
    TRAVELERS = names;
    await DB.saveTravelers(names);
    Sync?.pushTravelers?.(names);
  },

  /* ── Settlement ──────────────────────────────────────── */
  calcSettlement() {
    const travelers = TRAVELERS;
    if (!travelers.length) return {};
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

  getSOS:         () => SOS_DATA,
  getOvernight:   (dayId) => OVERNIGHT[dayId] || null,
  getAllOvernight: () => OVERNIGHT,

  getPackingByCategory() {
    const cats = {};
    PACKING.forEach(i => { if (!cats[i.cat]) cats[i.cat] = []; cats[i.cat].push(i); });
    return cats;
  },

  /* ── Stops ───────────────────────────────────────────── */
  async updateStop(id, patch) {
    const idx = STOPS.findIndex(s => s.id === id);
    if (idx === -1) return null;
    STOPS[idx] = { ...STOPS[idx], ...patch, updatedAt: Date.now() };
    await DB.saveStop(STOPS[idx]);
    Sync?.pushStop?.(STOPS[idx]);
    return STOPS[idx];
  },

  async addStop({ dayId, name, activity='', time='', transport='', transportType='walk', notes='', trainDetail=null, needsBooking=false, category=null }) {
    const existing = STOPS.filter(s => s.dayId === dayId);
    const order = existing.length ? Math.max(...existing.map(s => s.order)) + 1 : 1;
    const kumano  = ['d0','d1','d2','d3','d4','d5','d6','d7'];
    const seg = kumano.includes(dayId) ? 'kumano'
              : ['d8','d9'].includes(dayId) ? 'nagano'
              : ['d10','d11'].includes(dayId) ? 'alpine' : 'osaka';
    const stop = {
      id: 'su_' + Date.now(), dayId, order, segment: seg,
      name, activity, transport, transportType, time, timeZone: 'JST',
      notes, lat: null, lng: null, hasStamp: false, isSanzan: false,
      needsBooking, category, trainDetail,
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

  /* ── Overnight ───────────────────────────────────────── */
  async updateOvernight(dayId, patch) {
    OVERNIGHT[dayId] = { ...(OVERNIGHT[dayId] || {}), ...patch };
    await DB.saveOvernight(OVERNIGHT);
    Sync?.pushSettings?.();
    return OVERNIGHT[dayId];
  },

  /* ── Stamps ──────────────────────────────────────────── */
  getStampStops:    () => STOPS.filter(s => s.hasStamp),
  isStampCollected: (id) => STAMPS_COLLECTED.has(id),

  async toggleStamp(id) {
    const now = STAMPS_COLLECTED.has(id)
      ? (STAMPS_COLLECTED.delete(id), false)
      : (STAMPS_COLLECTED.add(id), true);
    await DB.saveStamp(id, now);
    Sync?.pushStamp?.(id, now);
    return now;
  },

  getStampProgress() {
    const all    = STOPS.filter(s => s.hasStamp);
    const sanzan = all.filter(s => s.isSanzan);
    return {
      collected:       STAMPS_COLLECTED.size,
      total:           all.length,
      sanzanCollected: sanzan.filter(s => STAMPS_COLLECTED.has(s.id)).length,
      sanzanTotal:     sanzan.length,
      sanzanComplete:  sanzan.every(s => STAMPS_COLLECTED.has(s.id)),
    };
  },

  /* ── Expenses ────────────────────────────────────────── */
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

  /* ── Packing ─────────────────────────────────────────── */
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

  /* ── Reservations ────────────────────────────────────── */
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
  getJRSeatReservations() {
    return STOPS
      .filter(s => s.trainDetail?.seatReservation === true)
      .sort((a,b) => DAY_ORDER.indexOf(a.dayId) - DAY_ORDER.indexOf(b.dayId));
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
};

window.Data = Data;
