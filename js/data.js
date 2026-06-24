'use strict';

/* Overnight accommodation lives on the DAY, not on individual stops */
const DAYS = [
  {id:'d-1', label:'D-1', date:'Sat 10 Apr',     title:'Night flight',            overnight:null},
  {id:'d0',  label:'D0',  date:'Sun 11 Apr',     title:'Arrive → Kii-Tanabe',     overnight:{name:'Kii-Tanabe (TBD)',                  status:'open',    ref:'',cost:null,  deadline:null}},
  {id:'d1',  label:'D1',  date:'Mon 12 Apr',     title:'Trail begins',             overnight:{name:'Kiri-no-Sato Takahara Lodge',       status:'pending', ref:'',cost:18000, deadline:'2027-01-15'}},
  {id:'d2',  label:'D2',  date:'Tue 13 Apr',     title:'Longest day · 16 km',     overnight:{name:'Tsugizakura area (TBD)',            status:'pending', ref:'',cost:null,  deadline:'2027-01-15'}},
  {id:'d3',  label:'D3',  date:'Wed 14 Apr',     title:'Hongu Taisha + Yunomine', overnight:{name:'Kawayu Onsen (TBD)',                status:'pending', ref:'',cost:null,  deadline:'2027-01-15'}},
  {id:'d4',  label:'D4',  date:'Thu 15 Apr',     title:'Kawayu rest day',         overnight:{name:'Kawayu Onsen (same)',               status:'pending', ref:'',cost:null,  deadline:null}},
  {id:'d5',  label:'D5',  date:'Fri 16 Apr',     title:'Riverboat → Katsuura',    overnight:{name:'Central Katsuura (TBD)',            status:'pending', ref:'',cost:null,  deadline:'2027-02-01'}},
  {id:'d6',  label:'D6',  date:'Sat 17 Apr',     title:'Nachi → Toyama',          overnight:{name:'Toyama (TBD)',                      status:'open',    ref:'',cost:null,  deadline:null}},
  {id:'d7',  label:'D7',  date:'Sun 18 Apr',     title:'Kurobe Alpine Route',     overnight:{name:'Shinano-Omachi (TBD)',              status:'open',    ref:'',cost:null,  deadline:null}},
  {id:'d8',  label:'D8',  date:'Mon 19 Apr',     title:'Alpine Route → Hakuba',   overnight:{name:'The Happo Hakuba / Evo Brand',     status:'pending', ref:'',cost:null,  deadline:'2027-02-01'}},
  {id:'d9',  label:'D9',  date:'Tue 20 Apr',     title:'Snowshoe · Tsugaike',     overnight:{name:'Hakuba (same)',                     status:'pending', ref:'',cost:null,  deadline:null}},
  {id:'d10', label:'D10', date:'Wed 21 Apr',     title:'Cherry blossom · Oide',   overnight:{name:'Hakuba (same)',                     status:'pending', ref:'',cost:null,  deadline:null}},
  {id:'d11', label:'D11', date:'Thu 22 Apr',     title:'Hakuba → Osaka',          overnight:{name:'Osaka (TBD)',                       status:'open',    ref:'',cost:null,  deadline:null}},
  {id:'d12', label:'D12+',date:'Fri 23–Sun 26 Apr',title:'Osaka free block',      overnight:{name:'Osaka (TBD)',                       status:'open',    ref:'',cost:null,  deadline:null}},
];

const SEED_STOPS = [
  {id:'s01',dayId:'d-1',order:1,segment:'kumano',name:'KUL → KIX',activity:'Night flight to Osaka Kansai',transport:'MH714 · depart 23:00 MYT · arrive 06:30+1 JST',transportType:'plane',time:'23:00',timeZone:'MYT',notes:'',lat:null,lng:null,hasStamp:false,isSanzan:false,trainDetail:{service:'MH714'},booking:{status:'booked',ref:'MH714',cost:null,deadline:null}},
  {id:'s02',dayId:'d0',order:1,segment:'kumano',name:'KIX → Kii-Tanabe',activity:'Collect JR Pass · head south by limited express',transport:'Haruka (KIX → Shin-Osaka) then Kuroshio Ltd Express to Kii-Tanabe',transportType:'train',time:'~09:30',timeZone:'JST',notes:'Total ~2.5 hrs',lat:33.7330,lng:135.3841,hasStamp:false,isSanzan:false,trainDetail:{service:'Kuroshio Ltd Express',jrPass:true,platform:'Check board at Shin-Osaka'},booking:{status:'open',ref:'',cost:null,deadline:null}},
  {id:'s03',dayId:'d0',order:2,segment:'kumano',name:'Kumano Kodo Kan',activity:'Collect stamp passport (¥100) · trail maps · last gear',transport:'Walking distance from Kii-Tanabe Station',transportType:'walk',time:'~12:00',timeZone:'JST',notes:'Open 8:30–17:15',lat:33.7748,lng:135.5037,hasStamp:false,isSanzan:false,booking:{status:'open',ref:'',cost:null,deadline:null}},
  {id:'s04',dayId:'d1',order:1,segment:'kumano',name:'Takijiri-oji',activity:'Trailhead start · Tainai-kuguri womb-crawling rock',transport:'Ryujin Bus from Kii-Tanabe Station · ~40 min · Platform 2',transportType:'bus',time:'~09:00',timeZone:'JST',notes:'~3.6 km, 1.5–2 hrs to Takahara',lat:33.7757,lng:135.5037,hasStamp:true,stampKanji:'始点',stampRomaji:'Takijiri',isSanzan:false,booking:{status:'open',ref:'',cost:null,deadline:null}},
  {id:'s05',dayId:'d1',order:2,segment:'kumano',name:'Takahara',activity:'Arrive ridge village · onsen at Kiri-no-Sato Lodge',transport:'On foot · 3.6 km uphill · ~2 hrs',transportType:'walk',time:'~11:30',timeZone:'JST',notes:'Stunning sunrise/mist views',lat:33.7959,lng:135.5321,hasStamp:true,stampKanji:'高原',stampRomaji:'Takahara',isSanzan:false,booking:{status:'open',ref:'',cost:null,deadline:null}},
  {id:'s06',dayId:'d2',order:1,segment:'kumano',name:'Depart Takahara',activity:'Earliest start — longest trekking day (16 km)',transport:'On foot',transportType:'walk',time:'~07:00',timeZone:'JST',notes:'',lat:33.7959,lng:135.5321,hasStamp:false,isSanzan:false,booking:{status:'open',ref:'',cost:null,deadline:null}},
  {id:'s07',dayId:'d2',order:2,segment:'kumano',name:'Chikatsuyu-oji',activity:'Lunch / resupply — last reliable shop',transport:'On foot · ~8.5 km from Takahara · ~4 hrs',transportType:'walk',time:'~12:00',timeZone:'JST',notes:'Nonaka-no-Shimizu spring nearby',lat:33.8314,lng:135.6417,hasStamp:true,stampKanji:'近露',stampRomaji:'Chikatsuyu',isSanzan:false,booking:{status:'open',ref:'',cost:null,deadline:null}},
  {id:'s08',dayId:'d2',order:3,segment:'kumano',name:'Tsugizakura-oji',activity:'800-yr cedar grove · end of day',transport:'On foot · ~7.5 km · ~3 hrs from Chikatsuyu',transportType:'walk',time:'~14:30',timeZone:'JST',notes:'~16 km / 6–7 hrs total from Takahara',lat:33.8283,lng:135.6342,hasStamp:true,stampKanji:'継桜',stampRomaji:'Tsugizakura',isSanzan:false,booking:{status:'open',ref:'',cost:null,deadline:null}},
  {id:'s09',dayId:'d3',order:1,segment:'kumano',name:'Depart Tsugizakura',activity:'Toward Hongu via Hosshinmon',transport:'On foot',transportType:'walk',time:'~07:00',timeZone:'JST',notes:'',lat:33.8283,lng:135.6342,hasStamp:false,isSanzan:false,booking:{status:'open',ref:'',cost:null,deadline:null}},
  {id:'s10',dayId:'d3',order:2,segment:'kumano',name:'Hosshinmon-oji',activity:'Traditional outer torii gate of Hongu Taisha',transport:'On foot',transportType:'walk',time:'~10:30',timeZone:'JST',notes:'',lat:33.8618,lng:135.7207,hasStamp:true,stampKanji:'発心',stampRomaji:'Hosshinmon',isSanzan:false,booking:{status:'open',ref:'',cost:null,deadline:null}},
  {id:'s11',dayId:'d3',order:3,segment:'kumano',name:'Kumano Hongu Taisha',activity:'First Kumano Sanzan stamp · goshuincho main shrine',transport:'On foot from Hosshinmon · ~2 hrs',transportType:'walk',time:'~12:00',timeZone:'JST',notes:'Shrine office 8:00–17:00',lat:33.8406,lng:135.7735,hasStamp:true,stampKanji:'本宮',stampRomaji:'Hongu',isSanzan:true,sanzanNum:1,booking:{status:'open',ref:'',cost:null,deadline:null}},
  {id:'s12',dayId:'d3',order:4,segment:'kumano',name:'Yunomine Onsen',activity:'Foot bath + Tsuboyu private bath (UNESCO listed)',transport:'Hongu bus stop → Yunomine · ~15 min · ¥200',transportType:'bus',time:'~13:30',timeZone:'JST',notes:'Reserve Tsuboyu slot in advance — limited 30-min sessions',lat:33.8293,lng:135.7576,hasStamp:true,stampKanji:'湯峯',stampRomaji:'Yunomine',isSanzan:false,booking:{status:'urgent',ref:'',cost:null,deadline:'2027-02-01'}},
  {id:'s13',dayId:'d4',order:1,segment:'kumano',name:'Kawayu Onsen',activity:'Free morning · riverside hot spring pools',transport:'',transportType:'walk',time:'Morning',timeZone:'JST',notes:'River pools open to all · no charge',lat:33.8132,lng:135.7725,hasStamp:true,stampKanji:'川湯',stampRomaji:'Kawayu',isSanzan:false,booking:{status:'open',ref:'',cost:null,deadline:null}},
  {id:'s14',dayId:'d4',order:2,segment:'kumano',name:'Hongu Spring Matsuri',activity:'Spring festival at Kumano Hongu Taisha',transport:'Hotel shuttle or local bus · ~20 min',transportType:'bus',time:'~14:00',timeZone:'JST',notes:'Confirm exact 2027 festival date with shrine',lat:33.8406,lng:135.7735,hasStamp:false,isSanzan:false,booking:{status:'open',ref:'',cost:null,deadline:null}},
  {id:'s15',dayId:'d5',order:1,segment:'kumano',name:'Kumano-gawa Riverboat',activity:'Traditional cedar boat Hongu → Hayatama Taisha · ~12 km',transport:'Board at Hongu Riverside · Sightseeing boat · ~90 min',transportType:'boat',time:'~09:00',timeZone:'JST',notes:'Seasonal (Oct–May) · limited daily slots — book early',lat:33.8406,lng:135.7735,hasStamp:false,isSanzan:false,booking:{status:'urgent',ref:'',cost:null,deadline:'2027-02-01'}},
  {id:'s16',dayId:'d5',order:2,segment:'kumano',name:'Kumano Hayatama Taisha',activity:'Second Kumano Sanzan stamp',transport:'Boat drops at shrine pier · walk 5 min',transportType:'walk',time:'~10:45',timeZone:'JST',notes:'Shingu city shrine',lat:33.7322,lng:135.9835,hasStamp:true,stampKanji:'速玉',stampRomaji:'Hayatama',isSanzan:true,sanzanNum:2,booking:{status:'open',ref:'',cost:null,deadline:null}},
  {id:'s17',dayId:'d5',order:3,segment:'kumano',name:'Kii-Katsuura',activity:'Coastal onsen town · tuna market visit',transport:'JR Kisei Line Shingu → Kii-Katsuura · ~25 min · JR Pass ✓',transportType:'train',time:'~13:00',timeZone:'JST',notes:'Tuna market best early morning',lat:33.6282,lng:135.9414,hasStamp:false,isSanzan:false,trainDetail:{service:'JR Kisei Line',jrPass:true},booking:{status:'pending',ref:'',cost:null,deadline:'2027-02-01'}},
  {id:'s18',dayId:'d6',order:1,segment:'kumano',name:'Daimon-zaka',activity:'Ancient cedar-lined stone staircase · 267 steps',transport:'Katsuura Station → Nachi bus stop · ~20 min · ~¥420',transportType:'bus',time:'~09:00',timeZone:'JST',notes:'Bus departs Katsuura ~08:30',lat:33.6713,lng:135.8976,hasStamp:true,stampKanji:'大門',stampRomaji:'Daimon-zaka',isSanzan:false,booking:{status:'open',ref:'',cost:null,deadline:null}},
  {id:'s19',dayId:'d6',order:2,segment:'kumano',name:'Kumano Nachi Taisha',activity:'Third Kumano Sanzan stamp · full set complete',transport:'On foot up from Daimon-zaka · ~20 min',transportType:'walk',time:'~10:00',timeZone:'JST',notes:'Pagoda + waterfall view · Nachi Falls nearby',lat:33.6687,lng:135.8901,hasStamp:true,stampKanji:'那智',stampRomaji:'Nachi',isSanzan:true,sanzanNum:3,booking:{status:'open',ref:'',cost:null,deadline:null}},
  {id:'s20',dayId:'d6',order:3,segment:'osaka',name:'Nagoya (transfer)',activity:'Transit — change trains heading north to Toyama',transport:'Kii-Katsuura → Nagoya · JR Kisei + Nanki Ltd Express · ~4 hrs · depart ~12:25 · JR Pass ✓',transportType:'train',time:'~12:25',timeZone:'JST',notes:'Transfer at Nagoya to Wide View Hida · allow 30 min',lat:35.1709,lng:136.8815,hasStamp:false,isSanzan:false,trainDetail:{service:'Nanki Ltd Express',jrPass:true},booking:{status:'open',ref:'',cost:null,deadline:null}},
  {id:'s20a',dayId:'d6',order:4,segment:'alpine',name:'Toyama',activity:'Arrive Toyama — overnight before Alpine Route',transport:'Wide View Hida Ltd Express · ~2h45min · JR Pass ✓ · depart Nagoya ~16:43 · arrive ~19:25',transportType:'train',time:'~19:25',timeZone:'JST',notes:'Early night — Alpine Route requires early start tomorrow',lat:36.6953,lng:137.2136,hasStamp:false,isSanzan:false,trainDetail:{service:'Wide View Hida Ltd Express',jrPass:true,platform:'Check Nagoya board'},booking:{status:'open',ref:'',cost:null,deadline:null}},
  {id:'s20c',dayId:'d7',order:1,segment:'alpine',name:'Toyama → Tateyama',activity:'Switch to private Tateyama Kurobe Alpine Route railway',transport:'Toyama Chiho Tetsudo · ~55 min · ¥1,230 · NOT on JR Pass · depart ~07:10',transportType:'train',time:'07:10',timeZone:'JST',notes:'Buy ticket at Toyama Station · separate from JR Pass',lat:36.5833,lng:137.4455,hasStamp:false,isSanzan:false,trainDetail:{service:'Toyama Chiho Tetsudo',jrPass:false,platform:'Toyama Chiho line at Toyama Station'},booking:{status:'open',ref:'',cost:null,deadline:null}},
  {id:'s21',dayId:'d7',order:2,segment:'alpine',name:'Tateyama · Alpine Route begins',activity:'Cable car to Bijodaira then Highland Bus through snow corridor to Murodo',transport:'Tateyama Cable Car ~7 min then Highland Bus ~50 min · buy full route ticket here',transportType:'cable',time:'~08:10',timeZone:'JST',notes:'Snow walls 13–18 m in April · full route ticket ~¥9,000 pp',lat:36.5833,lng:137.4455,hasStamp:false,isSanzan:false,booking:{status:'open',ref:'',cost:null,deadline:null}},
  {id:'s22',dayId:'d7',order:3,segment:'alpine',name:'Kurobe Dam',activity:'Trolleybus + cable car + dam walk · Japan\'s highest dam at 186 m',transport:'Tateyama → Daikanbo (cable car) → Kurobe (ropeway) → dam',transportType:'cable',time:'~11:00',timeZone:'JST',notes:'Route ticket ~¥9,000 pp',lat:36.5675,lng:137.6650,hasStamp:false,isSanzan:false,booking:{status:'open',ref:'',cost:null,deadline:null}},
  {id:'s23',dayId:'d7',order:4,segment:'alpine',name:'Ogizawa',activity:'Exit point of Alpine Route · electric bus terminal',transport:'Kurobe Dam → Ogizawa · Electric bus · ~16 min · ¥1,340',transportType:'bus',time:'~14:00',timeZone:'JST',notes:'Luggage forwarding available ~¥4,400',lat:36.5592,lng:137.7210,hasStamp:false,isSanzan:false,booking:{status:'open',ref:'',cost:null,deadline:null}},
  {id:'s24',dayId:'d7',order:5,segment:'hakuba',name:'Shinano-Omachi',activity:'Overnight — better dining than Ogizawa',transport:'Ogizawa → Shinano-Omachi · Alpico bus · ~40 min · last bus 17:05 · ~¥1,370',transportType:'bus',time:'~15:10',timeZone:'JST',notes:'Miss the last bus = stuck at Ogizawa',lat:36.4999,lng:137.8613,hasStamp:false,isSanzan:false,booking:{status:'open',ref:'',cost:null,deadline:null}},
  {id:'s25',dayId:'d8',order:1,segment:'hakuba',name:'Shinano-Omachi → Hakuba',activity:'Short hop to Hakuba — check in early afternoon',transport:'JR Oito Line · ~40 min · JR Pass ✓ · depart ~09:05',transportType:'train',time:'~09:05',timeZone:'JST',notes:'',lat:36.6982,lng:137.8619,hasStamp:false,isSanzan:false,trainDetail:{service:'JR Oito Line',jrPass:true,platform:'Platform 1 at Shinano-Omachi'},booking:{status:'pending',ref:'',cost:null,deadline:'2027-02-01'}},
  {id:'s26',dayId:'d9',order:1,segment:'hakuba',name:'Tsugaike Kogen',activity:'Guided snowshoe trek · deep April snowpack',transport:'Hakuba → Tsugaike Gondola · local shuttle ~15 min',transportType:'bus',time:'~09:00',timeZone:'JST',notes:'Book local outdoor operator · gear included',lat:36.7492,lng:137.8661,hasStamp:false,isSanzan:false,booking:{status:'open',ref:'',cost:null,deadline:null}},
  {id:'s27',dayId:'d10',order:1,segment:'hakuba',name:'Oide Park',activity:'Cherry blossom against Shirouma Sanzan peaks',transport:'15 min walk from Hakuba Station',transportType:'walk',time:'~09:00',timeZone:'JST',notes:'Peak bloom typically late April — confirm closer to date',lat:36.6964,lng:137.8737,hasStamp:false,isSanzan:false,booking:{status:'open',ref:'',cost:null,deadline:null}},
  {id:'s28',dayId:'d10',order:2,segment:'hakuba',name:'Hakuba Onsen',activity:'Soak to close the day',transport:'Walk or short taxi',transportType:'walk',time:'~15:00',timeZone:'JST',notes:'Wadano Forest Onsen or Hakuba-no-Yu',lat:36.6982,lng:137.8619,hasStamp:false,isSanzan:false,booking:{status:'open',ref:'',cost:null,deadline:null}},
  {id:'s29',dayId:'d11',order:1,segment:'hakuba',name:'Hakuba → Matsumoto',activity:'Depart south via JR Oito Line',transport:'JR Oito Line · ~70 min · JR Pass ✓ · depart ~09:05 Hakuba',transportType:'train',time:'~09:05',timeZone:'JST',notes:'',lat:36.2308,lng:137.9644,hasStamp:false,isSanzan:false,trainDetail:{service:'JR Oito Line',jrPass:true,platform:'Platform 1'},booking:{status:'open',ref:'',cost:null,deadline:null}},
  {id:'s30',dayId:'d11',order:2,segment:'osaka',name:'Matsumoto → Nagoya',activity:'Transfer at Matsumoto · allow 20 min buffer',transport:'Shinano Ltd Express · ~2 hrs · JR Pass ✓ · depart ~10:49',transportType:'train',time:'~10:49',timeZone:'JST',notes:'Reserve seat recommended',lat:35.1709,lng:136.8815,hasStamp:false,isSanzan:false,trainDetail:{service:'Shinano Ltd Express',jrPass:true,platform:'Platform 2 at Matsumoto'},booking:{status:'open',ref:'',cost:null,deadline:null}},
  {id:'s31',dayId:'d11',order:3,segment:'osaka',name:'Nagoya → Osaka',activity:'Final Shinkansen leg',transport:'Tokaido Shinkansen · ~50 min · JR Pass ✓ · depart ~13:25',transportType:'train',time:'~13:25',timeZone:'JST',notes:'',lat:34.7025,lng:135.4960,hasStamp:false,isSanzan:false,trainDetail:{service:'Tokaido Shinkansen',jrPass:true},booking:{status:'open',ref:'',cost:null,deadline:null}},
  {id:'s32',dayId:'d12',order:1,segment:'osaka',name:'Osaka',activity:'Free block — Nara day trip, Dotonbori, downtime',transport:'',transportType:null,time:'Free',timeZone:'JST',notes:'Open block — plan on the ground',lat:34.7025,lng:135.4960,hasStamp:false,isSanzan:false,booking:{status:'open',ref:'',cost:null,deadline:null}},
];

const SEED_PACKING = [
  {id:'pk01',cat:'Documents',item:'Passport (valid >6 months)',checked:false,essential:true},
  {id:'pk02',cat:'Documents',item:'JR Pass (exchange order)',checked:false,essential:true},
  {id:'pk03',cat:'Documents',item:'Travel insurance docs',checked:false,essential:true},
  {id:'pk04',cat:'Documents',item:'Hotel bookings printout',checked:false,essential:false},
  {id:'pk05',cat:'Documents',item:'Emergency card (printed)',checked:false,essential:true},
  {id:'pk06',cat:'Trail Gear',item:'Hiking boots (worn in)',checked:false,essential:true},
  {id:'pk07',cat:'Trail Gear',item:'Trekking poles',checked:false,essential:true},
  {id:'pk08',cat:'Trail Gear',item:'Rain jacket / poncho',checked:false,essential:true},
  {id:'pk09',cat:'Trail Gear',item:'Daypack (25–30 L)',checked:false,essential:true},
  {id:'pk10',cat:'Trail Gear',item:'Water bottles / hydration',checked:false,essential:true},
  {id:'pk11',cat:'Trail Gear',item:'Blister plasters & first aid',checked:false,essential:true},
  {id:'pk12',cat:'Trail Gear',item:'Trekking snacks (trail bars)',checked:false,essential:false},
  {id:'pk13',cat:'Trail Gear',item:'Headtorch + spare batteries',checked:false,essential:false},
  {id:'pk14',cat:'Clothing',item:'Moisture-wicking base layers × 3',checked:false,essential:true},
  {id:'pk15',cat:'Clothing',item:'Mid-layer fleece or down',checked:false,essential:true},
  {id:'pk16',cat:'Clothing',item:'Trekking trousers × 2',checked:false,essential:true},
  {id:'pk17',cat:'Clothing',item:'Merino wool socks × 4',checked:false,essential:true},
  {id:'pk18',cat:'Clothing',item:'Sandals (onsen/guesthouse)',checked:false,essential:true},
  {id:'pk19',cat:'Clothing',item:'Light casual outfit (Osaka)',checked:false,essential:false},
  {id:'pk20',cat:'Clothing',item:'Buff / neck gaiter',checked:false,essential:false},
  {id:'pk21',cat:'Electronics',item:'Phone + cable + adapter',checked:false,essential:true},
  {id:'pk22',cat:'Electronics',item:'Power bank (10,000 mAh+)',checked:false,essential:true},
  {id:'pk23',cat:'Electronics',item:'Japan power adapter (Type A)',checked:false,essential:false},
  {id:'pk24',cat:'Electronics',item:'Earphones',checked:false,essential:false},
  {id:'pk25',cat:'Toiletries',item:'Sunscreen SPF 50+',checked:false,essential:true},
  {id:'pk26',cat:'Toiletries',item:'Insect repellent',checked:false,essential:true},
  {id:'pk27',cat:'Toiletries',item:'Onsen towel (small)',checked:false,essential:true},
  {id:'pk28',cat:'Toiletries',item:'Wet wipes (trail use)',checked:false,essential:false},
  {id:'pk29',cat:'Pilgrim',item:'Kumano Kodo stamp book (buy at Kodo Kan)',checked:false,essential:true},
  {id:'pk30',cat:'Pilgrim',item:'White pilgrim vest / vest rental',checked:false,essential:false},
  {id:'pk31',cat:'Pilgrim',item:'Small yen cash (stamps / buses / vending)',checked:false,essential:true},
];

const SOS_DATA = {
  emergency:[
    {label:'Japan Police',value:'110'},
    {label:'Japan Fire / Ambulance',value:'119'},
    {label:'JNTO Tourist Helpline (EN)',value:'050-3816-2787'},
    {label:'MY Embassy Tokyo',value:'+81-3-2080-7700'},
  ],
  lodging:[
    {label:'D1 lodge',value:'Kiri-no-Sato Takahara Lodge',jp:'高原ロッジ'},
    {label:'D3–4 onsen',value:'Kawayu Onsen (TBD)',jp:'川湯温泉'},
    {label:'D5 Katsuura',value:'Central Katsuura (TBD)',jp:'勝浦'},
    {label:'D8–11 Hakuba',value:'The Happo Hakuba / Evo Brand',jp:'白馬'},
  ],
  passes:[
    {label:'JR Pass ref',value:'Confirm when collected'},
    {label:'Kumano Kodo Passport',value:'Collect at Kumano Kodo Kan D0'},
  ],
  addresses:[
    {label:'Kumano Kodo trail start',jp:'和歌山県田辺市中辺路町滝尻'},
    {label:'Kumano Hongu Taisha',jp:'和歌山県田辺市本宮町本宮1110'},
    {label:'Kumano Nachi Taisha',jp:'和歌山県東牟婁郡那智勝浦町那智山1'},
  ],
};

let STOPS    = [...SEED_STOPS];
let EXPENSES = [];
let PACKING  = [...SEED_PACKING];
let OVERNIGHT = {}; // dayId → overnight object (mirrors DAYS[].overnight)

// Build overnight map from DAYS
DAYS.forEach(d => { if (d.overnight) OVERNIGHT[d.id] = { ...d.overnight }; });

const STAMPS_COLLECTED = new Set();
window._STAMPS_COLLECTED = STAMPS_COLLECTED;

const Data = {
  async init() {
    try {
      const dbStops = await DB.loadStops();
      // Only use cached stops if count is close to seed (prevents stale partial data)
      if (dbStops?.length >= SEED_STOPS.length * 0.8) {
        STOPS = dbStops;
      } else {
        await DB.saveStops(STOPS);
      }
      const stampIds = await DB.loadStamps();
      stampIds.forEach(id => STAMPS_COLLECTED.add(id));
      const dbExp = await DB.loadExpenses();
      if (dbExp?.length) EXPENSES = dbExp;
      const dbPack = await DB.loadPacking();
      if (dbPack?.length) PACKING = dbPack; else await DB.savePacking(PACKING);
      // Load overnight overrides from DB if any
      const dbOvernight = await DB.loadOvernight().catch(() => null);
      if (dbOvernight) Object.assign(OVERNIGHT, dbOvernight);
    } catch(e) { console.warn('[Data.init]', e); }
  },

  /* ── Setters (called by Sync) ────────────────────────── */
  setStops(s)        { STOPS    = s; },
  setExpenses(e)     { EXPENSES = e; },
  setPackingItems(p) { PACKING  = p; },
  setStampCollected(id, v) { v ? STAMPS_COLLECTED.add(id) : STAMPS_COLLECTED.delete(id); },
  setOvernight(dayId, o) { OVERNIGHT[dayId] = o; },

  /* ── Getters ─────────────────────────────────────────── */
  getDays:        () => DAYS,
  getStops:       () => STOPS,
  getStopsByDay:  (id) => STOPS.filter(s => s.dayId === id).sort((a,b) => a.order - b.order),
  getStop:        (id) => STOPS.find(s => s.id === id),
  getExpenses:    () => EXPENSES,
  getPackingItems:() => PACKING,
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

  async addStop({ dayId, name, activity='', time='', transport='', transportType='walk', notes='' }) {
    const existing = STOPS.filter(s => s.dayId === dayId);
    const order = existing.length ? Math.max(...existing.map(s => s.order)) + 1 : 1;
    const stop = {
      id: 's_' + Date.now(), dayId, order, segment: 'kumano',
      name, activity, transport, transportType, time, timeZone: 'JST',
      notes, lat: null, lng: null, hasStamp: false, isSanzan: false,
      booking: { status: 'open', ref: '', cost: null, deadline: null },
    };
    STOPS.push(stop);
    await DB.saveStop(stop);
    Sync?.pushStop?.(stop);
    return stop;
  },

  async deleteStop(id) {
    STOPS = STOPS.filter(s => s.id !== id);
    Sync?.removeStop?.(id);
  },

  /* ── Overnight ───────────────────────────────────────── */
  async updateOvernight(dayId, patch) {
    OVERNIGHT[dayId] = { ...(OVERNIGHT[dayId] || {}), ...patch };
    await DB.saveOvernight(OVERNIGHT);
    Sync?.pushOvernight?.(dayId, OVERNIGHT[dayId]);
    return OVERNIGHT[dayId];
  },

  /* ── Stamps ──────────────────────────────────────────── */
  getStampStops:      () => STOPS.filter(s => s.hasStamp),
  isStampCollected:   (id) => STAMPS_COLLECTED.has(id),

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
      collected:        STAMPS_COLLECTED.size,
      total:            all.length,
      sanzanCollected:  sanzan.filter(s => STAMPS_COLLECTED.has(s.id)).length,
      sanzanTotal:      sanzan.length,
      sanzanComplete:   sanzan.every(s => STAMPS_COLLECTED.has(s.id)),
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
    Sync?.pushPacking?.(newItem);
    return newItem;
  },
  async deletePacking(id) {
    PACKING = PACKING.filter(p => p.id !== id);
    Sync?.removePacking?.(id);
  },

  /* ── Bookings list ───────────────────────────────────── */
  getBookingsList() {
    const order = { urgent:0, pending:1, booked:2, open:3 };
    return STOPS.filter(s => s.booking.status !== 'open')
      .sort((a, b) => order[a.booking.status] - order[b.booking.status]);
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
