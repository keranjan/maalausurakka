/* =============================================================
   Maalausurakka — sovelluslogiikka
   Käännetään selaimessa Babel Standalonella (ks. index.html).
   HUOM: ulkoinen JSX ladataan fetchillä, joten sivu on avattava
   HTTP:n yli (GitHub Pages tai `python3 -m http.server`),
   ei suoraan file://-osoitteesta.
   ============================================================= */

const { useState, useEffect, useRef, useMemo } = React;

/* ============================================================
   ASETUKSET — Supabase-projekti
   (publishable/anon-avain on tarkoitettu julkiseksi; RLS suojaa datan)
   ============================================================ */
const SUPABASE_URL = "https://lqrtsfahnujwagnldnkg.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_cNgYWoHiENmC-2btZ6cROQ_HE_gV6xM";

const supa = (SUPABASE_URL && SUPABASE_ANON_KEY)
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

/* ---- mallit ja hakubudjetti ----
   Haiku 4.5 maksaa noin kolmasosan Sonnetin hinnasta ($1/$5 vs $3/$15 per Mtok).
   Jos tuotelistat tai minimäärät osuvat huonosti, vaihda MODEL_CONTENTS
   (tai molemmat) takaisin arvoon "claude-sonnet-4-6".
   MAX_SEARCHES on kova katto web-hauille per kutsu — pienempi = halvempi. */
const MODEL_SEARCH = "claude-haiku-4-5-20251001";
const MODEL_CONTENTS = "claude-haiku-4-5-20251001";
const MAX_SEARCHES = 2;

/* Taustamuistutusten VAPID-julkinen avain (turvallinen paljastaa).
   Tyhjä = taustapush ei käytössä, vain paikallinen muistutus toimii.
   Sama avainpari kuin Edge Functionin salaisuuksissa. */
const VAPID_PUBLIC_KEY = "BGj0o9zfUS6MirJfp4y-lOwM-IAekSK4y2SfebJ6XoHX-oHZLHmZ30LKa17PovTdqUDICZqzUE5P9v_AyILROko";

const STAGES = [
  { key: 0, name: "To-do",             short: "TD", color: "var(--s0)", bg: "var(--s0-bg)", desc: "Harmaata muovia",   verb: "kasausta",             min: 6 },
  { key: 1, name: "Kasattu",           short: "KA", color: "var(--s1)", bg: "var(--s1-bg)", desc: "Kasattu, ei maalia", verb: "pohjamaalia",          min: 2 },
  { key: 2, name: "Pohjamaalattu",     short: "PM", color: "var(--s2)", bg: "var(--s2-bg)", desc: "Primeri päällä",     verb: "maalauksen aloitusta", min: 10 },
  { key: 3, name: "Maalaus aloitettu", short: "MA", color: "var(--s3)", bg: "var(--s3-bg)", desc: "Työn alla",          verb: "viimeistelyä",         min: 15 },
  { key: 4, name: "Valmis",            short: "OK", color: "var(--gold)", bg: "var(--gold-deep)", desc: "Maalattu ja valmis!", verb: null,                  min: 0 },
];

const SYSTEMS = [
  "Warhammer 40,000", "Warhammer: Age of Sigmar", "Warhammer: The Old World",
  "Horus Heresy", "Kill Team", "Warcry", "Warhammer Underworlds",
  "Necromunda", "Blood Bowl", "Legions Imperialis", "Middle-earth", "Muu",
];

/* ============================================================
   SAAVUTUKSET
   Kumulatiiviset luvut lasketaan NYKYTILASTA (products), ei lokista:
   stage>=1 = kasattu, >=2 = pohjamaalattu, >=3 = aloitettu, 4 = valmis.
   Loki on katkaistu 4000 merkintään, joten se ei kelpaa elinikäisiin
   summiin — mutta aikaan sidotut saavutukset (putki, vuorokaudenaika,
   päiväennätys, paluu tauolta) tulevat lokista.
   ============================================================ */
const TIERS = {
  common: { name: "Tavallinen",  color: "var(--s0)", bg: "var(--surface-3)" },
  rare:   { name: "Harvinainen", color: "var(--s1)", bg: "var(--s1-bg)" },
  epic:   { name: "Eeppinen",    color: "#B98AD6", bg: "#2C2038" },
  legend: { name: "Legenda",     color: "var(--gold)", bg: "var(--s4-bg)" },
};

const ACHIEVEMENTS = [
  // --- ensiaskeleet ---
  { id: "step1",    icon: "👣", tier: "common", name: "Ensimmäinen sivellinveto", desc: "Siirrä yksi mini eteenpäin",            target: 1,   get: m => m.totalSteps },
  { id: "asm1",     icon: "🔧", tier: "common", name: "Harmaa murtuu",            desc: "Kasaa ensimmäinen mini",                target: 1,   get: m => m.assembled },
  { id: "prime1",   icon: "🥫", tier: "common", name: "Pohjaa myöten",            desc: "Pohjamaalaa ensimmäinen mini",          target: 1,   get: m => m.primed },
  { id: "paint1",   icon: "🖌️", tier: "common", name: "Väriä harmauteen",         desc: "Aloita ensimmäisen minin maalaus",      target: 1,   get: m => m.started },
  { id: "done1",    icon: "⭐", tier: "common", name: "Ensimmäinen valmis",       desc: "Saata yksi mini valmiiksi",             target: 1,   get: m => m.finished },
  { id: "box1",     icon: "📦", tier: "rare",   name: "Laatikko tyhjä",           desc: "Saata koko tuote valmiiksi",            target: 1,   get: m => m.prodDone },

  // --- valmiita minejä ---
  { id: "done10",   icon: "🔟", tier: "common", name: "Kymmenen kärki",     desc: "10 miniä valmiina",   target: 10,   get: m => m.finished },
  { id: "done25",   icon: "🛡️", tier: "rare",   name: "Partio",             desc: "25 miniä valmiina",   target: 25,   get: m => m.finished },
  { id: "done50",   icon: "⚔️", tier: "rare",   name: "Puolensadan mies",   desc: "50 miniä valmiina",   target: 50,   get: m => m.finished },
  { id: "done100",  icon: "🏰", tier: "epic",   name: "Sadan armeija",      desc: "100 miniä valmiina",  target: 100,  get: m => m.finished },
  { id: "done250",  icon: "👑", tier: "epic",   name: "Ruhtinaskunta",      desc: "250 miniä valmiina",  target: 250,  get: m => m.finished },
  { id: "done500",  icon: "🌟", tier: "legend", name: "Legioona",           desc: "500 miniä valmiina",  target: 500,  get: m => m.finished },
  { id: "done1000", icon: "🔱", tier: "legend", name: "Tuhannen ylivoima",  desc: "1000 miniä valmiina", target: 1000, get: m => m.finished },

  // --- kasaus ---
  { id: "asm25",  icon: "🪛", tier: "common", name: "Liimasormet",   desc: "25 miniä kasattu",  target: 25,  get: m => m.assembled },
  { id: "asm100", icon: "🧰", tier: "rare",   name: "Kokoonpanija",  desc: "100 miniä kasattu", target: 100, get: m => m.assembled },
  { id: "asm250", icon: "🏭", tier: "epic",   name: "Tehdas",        desc: "250 miniä kasattu", target: 250, get: m => m.assembled },

  // --- pohjamaali ---
  { id: "prime25",  icon: "💨", tier: "common", name: "Suihkupullo",    desc: "25 miniä pohjamaalattu",  target: 25,  get: m => m.primed },
  { id: "prime100", icon: "☁️", tier: "rare",   name: "Primerin herra", desc: "100 miniä pohjamaalattu", target: 100, get: m => m.primed },
  { id: "prime250", icon: "🌫️", tier: "epic",   name: "Harmaa meri",    desc: "250 miniä pohjamaalattu", target: 250, get: m => m.primed },

  // --- maalaus aloitettu ---
  { id: "paint50",  icon: "🎨", tier: "rare", name: "Paletti auki",  desc: "50 minin maalaus aloitettu",  target: 50,  get: m => m.started },
  { id: "paint200", icon: "🖼️", tier: "epic", name: "Värien mestari", desc: "200 minin maalaus aloitettu", target: 200, get: m => m.started },

  // --- putki ---
  { id: "streak3",   icon: "🔥", tier: "common", name: "Alku on tehty",  desc: "3 päivän putki",   target: 3,   get: m => m.bestStreak },
  { id: "streak7",   icon: "📅", tier: "rare",   name: "Viikko putkeen", desc: "7 päivän putki",   target: 7,   get: m => m.bestStreak },
  { id: "streak14",  icon: "🗓️", tier: "rare",   name: "Kaksi viikkoa",  desc: "14 päivän putki",  target: 14,  get: m => m.bestStreak },
  { id: "streak30",  icon: "🌙", tier: "epic",   name: "Kuukausi",       desc: "30 päivän putki",  target: 30,  get: m => m.bestStreak },
  { id: "streak60",  icon: "💎", tier: "epic",   name: "Kaksi kuuta",    desc: "60 päivän putki",  target: 60,  get: m => m.bestStreak },
  { id: "streak100", icon: "🏆", tier: "legend", name: "Sata päivää",    desc: "100 päivän putki", target: 100, get: m => m.bestStreak },

  // --- päiväennätykset ---
  { id: "day10", icon: "💪", tier: "common", name: "Uurastaja",   desc: "10 askelta yhtenä päivänä", target: 10, get: m => m.maxDay },
  { id: "day25", icon: "🚀", tier: "rare",   name: "Urakkapäivä", desc: "25 askelta yhtenä päivänä", target: 25, get: m => m.maxDay },
  { id: "day50", icon: "⚡", tier: "epic",   name: "Maratoni",    desc: "50 askelta yhtenä päivänä", target: 50, get: m => m.maxDay },

  // --- vuorokaudenaika ---
  { id: "night1",  icon: "🦉", tier: "common", name: "Yömaalari",       desc: "Sivellinveto klo 23–05",       target: 1,  get: m => m.night },
  { id: "night25", icon: "🌃", tier: "rare",   name: "Yön ritari",      desc: "25 askelta klo 23–05",         target: 25, get: m => m.night },
  { id: "early1",  icon: "🐓", tier: "common", name: "Aamuvirkku",      desc: "Sivellinveto klo 05–08",       target: 1,  get: m => m.early },
  { id: "weekend", icon: "🛋️", tier: "rare",   name: "Viikonloppusoturi", desc: "20 askelta viikonloppuisin", target: 20, get: m => m.weekend },

  // --- valmiit tuotteet ---
  { id: "box3",  icon: "📚", tier: "rare",   name: "Kolme kaapista",  desc: "3 tuotetta valmiina",  target: 3,  get: m => m.prodDone },
  { id: "box10", icon: "🏛️", tier: "epic",   name: "Kymmenen kaatui", desc: "10 tuotetta valmiina", target: 10, get: m => m.prodDone },
  { id: "box25", icon: "🗿", tier: "legend", name: "Kaapin kuningas", desc: "25 tuotetta valmiina", target: 25, get: m => m.prodDone },

  // --- armeijat ---
  { id: "fac1",  icon: "🎌", tier: "epic",   name: "Armeija seisoo",  desc: "Yksi rotu kokonaan valmiina",     target: 1, get: m => m.facDone },
  { id: "fac3",  icon: "🌍", tier: "legend", name: "Kolme armeijaa",  desc: "3 rotua kokonaan valmiina",       target: 3, get: m => m.facDone },
  { id: "sys1",  icon: "♟️", tier: "legend", name: "Pelijärjestelmä haltuun", desc: "Yksi pelijärjestelmä kokonaan valmiina", target: 1, get: m => m.sysDone },

  // --- leveys ---
  { id: "sys2r", icon: "🎲", tier: "common", name: "Kahden pelin mies", desc: "Tuotteita 2 pelijärjestelmässä", target: 2, get: m => m.sysCount },
  { id: "sys4r", icon: "🎭", tier: "rare",   name: "Monilahjakkuus",    desc: "Tuotteita 4 pelijärjestelmässä", target: 4, get: m => m.sysCount },
  { id: "fac5r", icon: "🧬", tier: "rare",   name: "Rotujen kirjo",     desc: "Tuotteita 5 eri rodusta",        target: 5, get: m => m.facCount },

  // --- erikoiset ---
  { id: "regiment", icon: "🎺", tier: "epic",   name: "Rykmentti",     desc: "20+ minin yksikkö kokonaan valmiina",  target: 1,   get: m => m.bigUnit >= 20 ? 1 : 0 },
  { id: "horde",    icon: "🐀", tier: "legend", name: "Lauma",         desc: "40+ minin yksikkö kokonaan valmiina",  target: 1,   get: m => m.bigUnit >= 40 ? 1 : 0 },
  { id: "comeback", icon: "🔄", tier: "rare",   name: "Paluu",         desc: "Jatka urakkaa yli 30 päivän tauon jälkeen", target: 1, get: m => m.maxGap >= 30 ? 1 : 0 },
  { id: "days50",   icon: "🧭", tier: "epic",   name: "Uskollinen",    desc: "50 aktiivista päivää",                target: 50,  get: m => m.daysActive },
  { id: "days150",  icon: "🕰️", tier: "legend", name: "Elämäntapa",    desc: "150 aktiivista päivää",               target: 150, get: m => m.daysActive },
  { id: "nogrey",   icon: "🧹", tier: "legend", name: "Ei enää harmaata", desc: "Yhtään minia ei ole enää to-dossa", target: 1,   get: m => (m.total > 0 && m.perStage[0] === 0) ? 1 : 0 },
  { id: "alldone",  icon: "🥇", tier: "legend", name: "Urakka valmis",    desc: "Kaikki miniatyyrit valmiina",       target: 1,   get: m => (m.total > 0 && m.finished === m.total) ? 1 : 0 },
];

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

/* Rotu/armeija on vapaata tekstiä. Ryhmittelyssä "High Elves", "high elves " ja
   "High Elves" ovat sama ryhmä; näytettävä nimi otetaan ensimmäisestä osumasta. */
const NO_FACTION = "Määrittelemätön";
const facKey = (f) => (f || "").trim().toLowerCase();

/* Placeholderien turvamuunnin: NaN tai undefined ei saa koskaan päätyä
   käyttäjälle näkyvään ilmoitukseen. Palauttaa aina kelvollisen luvun. */
const safeNum = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);

/* VAPID-avaimen muunnos push-tilausta varten */
function urlB64ToU8(base64) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

/* ---- muistutusviestit: eri Warhammer-hahmoilta ----
   who = hahmo (näytetään ilmoituksen otsikkona), b = viesti hänen äänellään.
   Korit tauon mukaan: lempeä primarkki päivänä 1, kaaosjumala päivänä 5+.
   {name}=profiili, {grey}=maalaamatta, {next}=seuraava siirto, {streak}=paras putki. */
const NOTIFY = {
  soft: [ // 1 päivä — jalot, kannustavat
    { who: "The Emperor of Mankind", b: "Kultainen valtaistuin näkee kaiken, {name} — myös {grey} maalaamatonta lastasi. Yksi sivellinveto ilahduttaisi Isää." },
    { who: "Sanguinius", b: "Älä anna epätoivon voittaa, {name}. Jokainen mini on kaunis loppuun saatettuna. Aloita yhdestä." },
    { who: "Roboute Guilliman", b: "Olen laatinut sinulle suunnitelman: {next}. Tehokkuus alkaa yhdestä vedosta. Ryhdytään töihin." },
    { who: "Saint Celestine", b: "Valo palaa yhä sinussa, {name}. Anna sen loistaa {grey} odottavalle sielulle. Tartu siveltimeen." },
    { who: "Belisarius Cawl", b: "Laskelmieni mukaan {next} valmistuisi kymmenessä minuutissa. Kiehtovaa! Kokeillaanko?" },
    { who: "Ciaphas Cain", b: "Jos minä selvisin hengissä, sinä selviät yhdestä pohjamaalauksesta. {next} odottaa, usko pois." },
    { who: "Leman Russ", b: "Ei kannata märehtiä, poikaseni. {grey} miniä. Yksi sivellin. Hoida homma." },
    { who: "Tech-Priest Enginseer", b: "01001101 — Omnissiah suosii ahkeria käsiä. Voitele siveltimesi, {name}. {next} kaipaa huomiota." },
    { who: "Aun'shi", b: "Suurempi hyvä kutsuu, {name}. Pieni askel kohti valmista armeijaa palvelee kaikkia. Tänään: {next}." },
    { who: "Lord Castellan Creed", b: "Minä piilotin kokonaisen Baneblade-rykmentin. Sinä et piilota {grey} maalaamatonta miniä. Taktinen isku, nyt." },
    { who: "Yvraine", b: "Kuolema kuiskaa, mutta väri elää. Herätä {next} henkiin tänään, {name}." },
  ],
  mid: [ // 2–4 päivää — ankarat, pilkalliset
    { who: "Roboute Guilliman", b: "Kaksi päivää ilman edistystä. Tämä tehottomuus olisi raivostuttanut veljeni. {grey} miniä odottaa, {name}." },
    { who: "Commissar Yarrick", b: "Perääntyminen ei ole vaihtoehto. {grey} sotilasta seisoo harmaana. Palaa riviin — tällä hetkellä." },
    { who: "Inquisitor Greyfax", b: "Havaitsen laiminlyöntiä. {streak} päivän putkesi katkesi. Selitä itsesi — tai tartu siveltimeen." },
    { who: "Abaddon the Despoiler", b: "Kolmetoista sotaretkeä minä johdin. Sinä et saa edes {next} valmiiksi. Todista minun olevan väärässä." },
    { who: "Trazyn the Infinite", b: "Nuo {grey} maalaamatonta yksilöäsi näyttäisivät upeilta kokoelmassani. Ellet maalaa niitä ensin itse..." },
    { who: "Ghazghkull Thraka", b: "WAAAGH! Vähemmän vändäämistä, enemmän värkkäämistä! {next} ei mäläjää itte! DAKKA!" },
    { who: "Kharn the Betrayer", b: "En muista ketä vihaan enää. Mutta muistan että {grey} miniäsi ovat yhä harmaita. Korjaa se." },
    { who: "Typhus", b: "Ruttopadot leviävät hitaudessa. {grey} miniä mätänee harmaudessa. Herätä ne — tai Isoisä tekee sen puolestasi." },
    { who: "Illuminor Szeras", b: "Edistymisesi on epätyydyttävää dataa. Optimoi. {next} ensin, {name}." },
    { who: "Eldrad Ulthran", b: "Näen tulevaisuuden: {grey} miniä yhä maalaamatta. Muuta se kohtalo. Tänään." },
  ],
  hard: [ // 5+ päivää — grimdark, dramaattiset
    { who: "Be'lakor", b: "Minut unohdettiin tuhanneksi vuodeksi. Aivan kuten sinä unohdit {grey} sotilastasi. Palaa, {name}." },
    { who: "Horus Lupercal", b: "Isä hylkäsi minut. Sinä hylkäsit armeijasi. Mutta toisin kuin minä, sinä voit vielä kääntyä takaisin. {next}." },
    { who: "Bloodthirster of Khorne", b: "VERTA VERENJUMALALLE! Vai… väriä väripöydälle. Kelpaa sekin. NOSTA SIVELLIN, {name}!" },
    { who: "Grandfather Nurgle", b: "Voi lapsonen, {grey} pientä miniäsi kuihtuvat rakkaudetta. Anna niille väriä — hellästi ja runsaasti." },
    { who: "Tzeentch", b: "Kaikki on osa suunnitelmaa. Myös se, että maalaat {next} tänään. Vastusta jos uskallat — et voi." },
    { who: "Magnus the Red", b: "Ylpeys tuhosi minut. Älä anna laiskuuden tuhota sinua. {grey} miniä. Tietosi riittää. Toimi." },
    { who: "Konrad Curze", b: "Näin ennustuksen: sivellin kuivuu, harmaus voittaa. Pelkäätkö sitä tarpeeksi toimiaksesi, {name}?" },
    { who: "Mortarion", b: "Kuolema on velvollisuus — niin on maalaaminenkin. {grey} miniä odottaa käsiäsi. Älä petä niitä." },
    { who: "Angron", b: "RAIVO! Sinun pitäisi olla vihainen noille {grey} maalaamattomalle minille! Kanavoi se siveltimeen!" },
    { who: "The Void Dragon", b: "Nukuin eoneja planeetan sydämessä. Sinä nukut sohvalla samalla kun {grey} sotilastasi odottaa. Herää." },
    { who: "Fabius Bile", b: "Armeijasi on raakamateriaalia. Epätäydellistä. Jalosta sitä, {name}. {next} ensin." },
    { who: "Lucius the Eternal", b: "Niin tylsää, niin harmaata. Nuo {grey} miniäsi eivät tuota minulle nautintoa. Väriä. Heti." },
  ],
};

/* laskee vaihejakauman ja prosentin mille tahansa tuotejoukolle */
function tally(items) {
  const perStage = [0, 0, 0, 0, 0];
  let total = 0, sum = 0, done = 0;
  items.forEach(p => p.units.forEach(u => u.minis.forEach(s => {
    total++; sum += s; perStage[s]++; if (s === 4) done++;
  })));
  return { total, done, perStage, pct: total ? Math.round((sum / (total * 4)) * 100) : 0 };
}

const KNOWN_EMAILS_KEY = "maalausurakka-profiilit";
const LOG_CAP = 4000;
const HEATMAP_WEEKS = 13;   // ~3 kuukautta; mahtuu puhelimen leveyteen ilman vieritystä

/* ---------- päivämääräapurit (paikallinen aika, viikko alkaa maanantaista) ---------- */
const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const startOfWeek = (d) => { const x = startOfDay(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const fiDate = (d) => `${d.getDate()}.${d.getMonth() + 1}.`;
const MONTHS_FI = ["tammi", "helmi", "maalis", "huhti", "touko", "kesä", "heinä", "elo", "syys", "loka", "marras", "joulu"];

/* ---------- tyylipohjat ---------- */
const S = {
  /* Inline-tyylit on korvattu pääosin styles.css:n luokilla (.panel, .field,
     .btn, .card jne). Nämä jäljelle jääneet ovat harvoja poikkeuksia. */
  panel: {},
  input: {},
  gold: {},
  ghost: {},
};

/* ---------- Anthropic API ---------- */
async function callClaude(apiKey, prompt, model) {
  if (!apiKey) throw new Error("NO_API_KEY");
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model,
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: MAX_SEARCHES }],
    }),
  });
  if (response.status === 401 || response.status === 403) throw new Error("BAD_API_KEY");
  if (!response.ok) throw new Error("API_ERROR");
  const data = await response.json();
  const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
  const clean = text.replace(/```json|```/g, "").trim();
  const start = clean.indexOf("{"), end = clean.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("PARSE_ERROR");
  return JSON.parse(clean.slice(start, end + 1));
}

const searchProducts = (apiKey, query) => callClaude(apiKey, `You are a Games Workshop / Warhammer product catalog search. The user gives a search term, possibly partial, possibly in Finnish. List ALL current and recent Games Workshop boxed miniature products that match the term (e.g. "High Elf" should list every High Elves box you can find: battalion boxes, unit boxes, characters, etc.). Use web search to check the current Games Workshop catalog if needed.

Search term: "${query}"

Respond ONLY with valid JSON, no markdown fences, no other text. Schema:
{"found": true, "matches": [{"product": "Official product name", "system": "...", "faction": "Faction name"}]}

Rules:
- List up to 12 matches, most relevant first.
- "system" MUST be exactly one of: ${SYSTEMS.filter(s => s !== "Muu").map(s => `"${s}"`).join(", ")}. If unsure, pick the closest.
- "faction" MUST be the official army/faction name in English, spelled consistently across all matches (e.g. always "High Elves", never "High Elf" or "Elves"; always "Orc & Goblin Tribes", "Space Marines", "Adeptus Mechanicus", "Dwarfen Mountain Holds"). Use the faction name the product is sold under, not a sub-chapter or clan.
- Only physical miniature products (boxes, blisters), not paints, books or accessories.
- If nothing matches: {"found": false}`, MODEL_SEARCH);

const fetchProductContents = (apiKey, productName, system) => callClaude(apiKey, `You are a Games Workshop / Warhammer product content lookup. Find EXACTLY what individual miniatures the following boxed product contains. Use web search to verify the box contents.

Product: "${productName}" (game system: ${system})

Respond ONLY with valid JSON, no markdown fences, no other text. Schema:
{"found": true, "units": [{"name": "Unit or model name", "count": 10}]}

Rules:
- "count" is the number of individual physical miniatures of that type in the box.
- Split different model types into separate entries (e.g. 1 character + 10 infantry + 3 bikes = 3 entries).
- Unit names in English (official names).
- If contents cannot be determined: {"found": false}`, MODEL_CONTENTS);

/* ============================================================
   KIRJAUTUMISNÄKYMÄ
   ============================================================ */
function AuthScreen() {
  const [mode, setMode] = useState("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);
  const [known, setKnown] = useState([]);

  useEffect(() => {
    try { setKnown(JSON.parse(localStorage.getItem(KNOWN_EMAILS_KEY) || "[]")); } catch (e) {}
  }, []);

  const rememberEmail = (e) => {
    try {
      const list = JSON.parse(localStorage.getItem(KNOWN_EMAILS_KEY) || "[]");
      if (!list.includes(e)) localStorage.setItem(KNOWN_EMAILS_KEY, JSON.stringify([...list, e]));
    } catch (x) {}
  };

  const forgetEmail = (e) => {
    const list = known.filter(x => x !== e);
    setKnown(list);
    localStorage.setItem(KNOWN_EMAILS_KEY, JSON.stringify(list));
  };

  const submit = async () => {
    if (busy || !email.trim() || !password) return;
    setBusy(true); setErr(null); setMsg(null);
    try {
      if (mode === "up") {
        const { data, error } = await supa.auth.signUp({
          email: email.trim(), password,
          options: { data: { display_name: name.trim() || email.split("@")[0] } },
        });
        if (error) throw error;
        rememberEmail(email.trim());
        if (!data.session) setMsg("Profiili luotu. Vahvista sähköpostiosoite viestistä ja kirjaudu sitten sisään.");
      } else {
        const { error } = await supa.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        rememberEmail(email.trim());
      }
    } catch (e) {
      const m = (e.message || "").toLowerCase();
      if (m.includes("invalid login")) setErr("Sähköposti tai salasana ei täsmää.");
      else if (m.includes("already registered")) setErr("Tällä sähköpostilla on jo profiili. Kirjaudu sisään.");
      else if (m.includes("password")) setErr("Salasanan pitää olla vähintään 6 merkkiä.");
      else setErr(e.message || "Kirjautuminen epäonnistui.");
    }
    setBusy(false);
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", fontFamily: "var(--body)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div className="rise" style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ textAlign: "center", marginBottom: 22 }}>
          <div style={{ fontFamily: "var(--display)", fontSize: 12, letterSpacing: "0.35em", color: "var(--gold-dim)", textTransform: "uppercase" }}>Maalausurakka</div>
          <h1 style={{ fontFamily: "var(--display)", fontSize: 26, fontWeight: 700, color: "var(--text)", margin: "4px 0 0" }}>
            {mode === "in" ? "Kirjaudu sisään" : "Luo profiili"}
          </h1>
        </div>

        <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {mode === "up" && <input value={name} onChange={e => setName(e.target.value)} placeholder="Profiilin nimi (esim. Jani)" className="field" />}
          <input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} placeholder="Sähköposti" className="field" />
          <input type="password" autoComplete={mode === "up" ? "new-password" : "current-password"} value={password}
            onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()} placeholder="Salasana" className="field" />
          <button onClick={submit} disabled={busy} className="btn btn-gold" style={{ opacity: busy ? 0.6 : 1, cursor: busy ? "wait" : "pointer" }}>
            {busy ? "Hetki…" : mode === "in" ? "Kirjaudu" : "Luo profiili"}
          </button>
          {err && <p style={{ color: "var(--err)", fontSize: 13, margin: 0 }}>{err}</p>}
          {msg && <p style={{ color: "var(--ok)", fontSize: 13, margin: 0 }}>{msg}</p>}
          <button onClick={() => { setMode(mode === "in" ? "up" : "in"); setErr(null); setMsg(null); }} className="btn-ghost" style={{ alignSelf: "center" }}>
            {mode === "in" ? "Ei vielä profiilia? Luo uusi" : "Onko jo profiili? Kirjaudu sisään"}
          </button>
        </div>

        {mode === "in" && known.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 11, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Tämän selaimen profiilit</div>
            {known.map(k => (
              <div key={k} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                <button onClick={() => setEmail(k)} style={{
                  flex: 1, textAlign: "left", background: "var(--surface)", border: `1px solid ${email === k ? "var(--gold-dim)" : "var(--line-soft)"}`,
                  borderRadius: "var(--r2)", padding: "8px 10px", color: "var(--text-2)", fontSize: 13, cursor: "pointer",
                }}>{k}</button>
                <button onClick={() => forgetEmail(k)} title="Poista listalta" style={{ background: "none", border: "none", color: "var(--text-3)", fontSize: 14, cursor: "pointer", padding: 6 }}>×</button>
              </div>
            ))}
          </div>
        )}

        <p style={{ fontSize: 11, color: "var(--text-3)", textAlign: "center", marginTop: 16, lineHeight: 1.5 }}>
          Jokaisella profiililla on oma maalausurakkansa ja oma Anthropic-avaimensa.
        </p>
      </div>
    </div>
  );
}

/* ============================================================
   PIENET KOMPONENTIT
   ============================================================ */
function Chevron({ open }) {
  return <span aria-hidden="true" className={"chev" + (open ? " is-open" : "")} />;
}

/* Putkilinja: näyttää miten minit virtaavat harmaasta kultaan.
   Tämä on sovelluksen signature-elementti — se kertoo missä työ seisoo,
   ei pelkkää prosenttia. `slim` on ohut versio korteille. */
function StageBar({ perStage, total, slim = false, showCounts = false }) {
  if (!total) return null;
  return (
    <div className={"pipeline" + (slim ? " slim" : "")}>
      {STAGES.map(st => {
        const n = perStage[st.key];
        if (!n) return null;
        const pct = (n / total) * 100;
        return (
          <div key={st.key}
            className={"pipe-seg pipe-" + st.key}
            style={{ flex: `${n} 1 0` }}
            title={`${st.name}: ${n}`}>
            {showCounts && pct > 7 ? n : ""}
          </div>
        );
      })}
    </div>
  );
}

/* Rotukenttä. Tallentaa vasta kun fokus poistuu, Enteriä painetaan tai
   ✓-nappia klikataan. Syy: jokainen tallennus siirtää tuotteen toiseen
   roturyhmään, jolloin React purkaa kortin ja rakentaa sen uudelleen eri
   vanhemman alle — kirjoittaminen olisi mahdotonta jos tallennus tapahtuisi
   joka näppäimen painalluksella. Esc peruu. */
function FactionInput({ value, onCommit, listId, options, style }) {
  const [draft, setDraft] = useState(value || "");
  const [focused, setFocused] = useState(false);
  const ref = useRef(null);

  // ulkopuolelta tullut muutos näkyy vain jos kenttää ei olla juuri muokkaamassa
  useEffect(() => { if (!focused) setDraft(value || ""); }, [value, focused]);

  const dirty = draft.trim() !== (value || "").trim();
  const commit = () => { if (dirty) onCommit(draft.trim()); };

  return (
    <span style={{ position: "relative", display: "flex", alignItems: "center", flex: "1 1 130px", minWidth: 0 }}>
      <input
        ref={ref}
        value={draft}
        list={listId}
        placeholder="Rotu / armeija"
        aria-label="Rotu tai armeija"
        onChange={e => setDraft(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => { setFocused(false); commit(); }}
        onKeyDown={e => {
          if (e.key === "Enter") { e.preventDefault(); ref.current.blur(); }
          if (e.key === "Escape") { setDraft(value || ""); setFocused(false); ref.current.blur(); }
        }}
        style={{
          ...style, width: "100%", paddingRight: dirty ? 26 : 8,
          borderColor: dirty ? "var(--gold-dim)" : "var(--line-soft)",
          color: dirty ? "var(--text-2)" : "var(--text-3)",
        }}
      />
      {dirty && (
        <button
          onMouseDown={e => e.preventDefault()}  /* älä vie fokusta ennen klikkausta */
          onClick={commit}
          title="Tallenna rotu (tai paina Enter)"
          aria-label="Tallenna rotu"
          style={{
            position: "absolute", right: 4, background: "none", border: "none",
            color: "var(--gold)", fontSize: 13, lineHeight: 1, cursor: "pointer", padding: 3,
          }}>✓</button>
      )}
      <datalist id={listId}>
        {options.map(f => <option key={f} value={f} />)}
      </datalist>
    </span>
  );
}

/* Maaliohje yksikölle. Tallentaa vasta kun fokus poistuu — muuten jokainen
   näppäimen painallus kirjoittaisi tietokantaan. Esc peruu. */
function RecipeEditor({ value, onCommit }) {
  const [draft, setDraft] = useState(value || "");
  const [focused, setFocused] = useState(false);
  const ref = useRef(null);
  useEffect(() => { if (!focused) setDraft(value || ""); }, [value, focused]);
  const dirty = draft !== (value || "");
  return (
    <div style={{ marginTop: 6 }}>
      <textarea
        ref={ref}
        value={draft}
        rows={3}
        placeholder={"Miten tämä maalataan?\nEsim. Pohja: Zandri Dust\nVarjostus: Agrax Earthshade\nKuivaharjaus: Ushabti Bone"}
        onChange={e => setDraft(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => { setFocused(false); if (dirty) onCommit(draft); }}
        onKeyDown={e => { if (e.key === "Escape") { setDraft(value || ""); setFocused(false); ref.current.blur(); } }}
        style={{
          width: "100%", boxSizing: "border-box", resize: "vertical",
          background: "var(--bg)", border: `1px solid ${dirty ? "var(--gold-dim)" : "var(--line-soft)"}`,
          borderRadius: "var(--r2)", padding: "8px 10px", color: "var(--text-2)",
          fontSize: 13, lineHeight: 1.5,
        }}
      />
      <div style={{ fontSize: 10.5, color: dirty ? "var(--gold-dim)" : "var(--text-4)", marginTop: 2 }}>
        {dirty ? "Tallentuu kun siirryt pois kentästä (Esc peruu)" : "Näkyy myös Seuraava siirto -kortissa"}
      </div>
    </div>
  );
}

/* Yksikön muokkausrivi. Nimi ja määrä tallentuvat vasta kun fokus poistuu tai
   Enteriä painetaan. Määrän kohdalla tämä ei ole kosmetiikkaa: jos 20 -> 15
   tallentuisi joka näppäimestä, kenttä näkisi välillä arvon "1" ja 19 miniä
   edistymisineen katoaisi ennen kuin "5" ehtii perään. Esc peruu. */
function UnitEditRow({ unit, onRename, onResize, onRemove, canRemove }) {
  const [name, setName] = useState(unit.name);
  const [count, setCount] = useState(String(unit.minis.length));
  const [fName, setFName] = useState(false);
  const [fCount, setFCount] = useState(false);
  const nameRef = useRef(null), countRef = useRef(null);

  useEffect(() => { if (!fName) setName(unit.name); }, [unit.name, fName]);
  useEffect(() => { if (!fCount) setCount(String(unit.minis.length)); }, [unit.minis.length, fCount]);

  const commitName = () => { const v = name.trim(); if (v && v !== unit.name) onRename(v); else setName(unit.name); };
  const commitCount = () => {
    const n = Math.max(1, Math.min(200, parseInt(count) || 0));
    if (n !== unit.minis.length) onResize(n);
    setCount(String(n));
  };

  const nameDirty = name.trim() !== unit.name;
  const countDirty = String(count) !== String(unit.minis.length);
  const field = (dirty) => ({
    background: "var(--bg)", border: `1px solid ${dirty ? "var(--gold-dim)" : "var(--line)"}`,
    borderRadius: "var(--r1)", padding: "6px 8px", color: "var(--text-2)", fontSize: 13, boxSizing: "border-box",
  });

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
      <input
        ref={countRef} type="number" min="1" max="200" value={count} aria-label="Määrä"
        onChange={e => setCount(e.target.value)}
        onFocus={() => setFCount(true)}
        onBlur={() => { setFCount(false); commitCount(); }}
        onKeyDown={e => {
          if (e.key === "Enter") { e.preventDefault(); countRef.current.blur(); }
          if (e.key === "Escape") { setCount(String(unit.minis.length)); setFCount(false); countRef.current.blur(); }
        }}
        style={{ ...field(countDirty), width: 62, flexShrink: 0 }}
      />
      <input
        ref={nameRef} value={name} aria-label="Miniatyyrin nimi"
        onChange={e => setName(e.target.value)}
        onFocus={() => setFName(true)}
        onBlur={() => { setFName(false); commitName(); }}
        onKeyDown={e => {
          if (e.key === "Enter") { e.preventDefault(); nameRef.current.blur(); }
          if (e.key === "Escape") { setName(unit.name); setFName(false); nameRef.current.blur(); }
        }}
        style={{ ...field(nameDirty), flex: 1, minWidth: 0 }}
      />
      <button
        onClick={onRemove} disabled={!canRemove}
        title={canRemove ? "Poista miniatyyri tuotteesta" : "Viimeistä ei voi poistaa — poista koko tuote"}
        aria-label="Poista miniatyyri"
        style={{
          background: "none", border: "none", flexShrink: 0, padding: "6px 4px",
          color: canRemove ? "#C05050" : "var(--line-soft)", fontSize: 17, lineHeight: 1,
          cursor: canRemove ? "pointer" : "default",
        }}>×</button>
    </div>
  );
}

/* Uuden miniatyyrin lisäys olemassa olevaan tuotteeseen */
function AddUnitForm({ onAdd }) {
  const [name, setName] = useState("");
  const [count, setCount] = useState(5);
  const valid = name.trim().length > 0;
  const submit = () => {
    if (!valid) return;
    onAdd(name.trim(), Math.max(1, Math.min(200, parseInt(count) || 1)));
    setName(""); setCount(5);
  };
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 8 }}>
      <input type="number" min="1" max="200" value={count} aria-label="Määrä"
        onChange={e => setCount(e.target.value)}
        style={{ background: "var(--bg)", border: "1px dashed var(--line)", borderRadius: "var(--r1)", padding: "6px 8px", color: "var(--text-2)", fontSize: 13, width: 62, flexShrink: 0, boxSizing: "border-box" }} />
      <input value={name} placeholder="Uusi miniatyyri…" aria-label="Uuden miniatyyrin nimi"
        onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") submit(); }}
        style={{ background: "var(--bg)", border: "1px dashed var(--line)", borderRadius: "var(--r1)", padding: "6px 8px", color: "var(--text-2)", fontSize: 13, flex: 1, minWidth: 0, boxSizing: "border-box" }} />
      <button onClick={submit} disabled={!valid} aria-label="Lisää miniatyyri" style={{
        background: valid ? "var(--line-soft)" : "transparent", border: `1px solid ${valid ? "var(--surface-3)" : "var(--line-soft)"}`,
        borderRadius: "var(--r1)", padding: "6px 10px", color: valid ? "var(--gold)" : "var(--line-soft)",
        fontSize: 13, fontWeight: 700, cursor: valid ? "pointer" : "default", flexShrink: 0,
      }}>+</button>
    </div>
  );
}

/* ============================================================
   LÄMPÖKARTTA
   ============================================================ */
function Heatmap({ byDay }) {
  const today = startOfDay(new Date());
  const firstCol = addDays(startOfWeek(today), -(HEATMAP_WEEKS - 1) * 7);

  const shade = (n) => {
    if (!n) return "var(--surface-2)";
    if (n <= 2) return "#5A4520";
    if (n <= 5) return "#8A6B2C";
    if (n <= 10) return "var(--gold-mid)";
    return "var(--gold)";
  };

  const cols = [];
  for (let w = 0; w < HEATMAP_WEEKS; w++) {
    const weekStart = addDays(firstCol, w * 7);
    const cells = [];
    for (let d = 0; d < 7; d++) {
      const date = addDays(weekStart, d);
      const future = date > today;
      const n = byDay.get(dayKey(date)) || 0;
      cells.push(
        <div key={d} className="hm-cell"
          title={future ? "" : `${fiDate(date)} — ${n} ${n === 1 ? "askel" : "askelta"}`}
          style={{
            width: 15, height: 15,
            background: future ? "transparent" : shade(n),
            border: future ? "none" : `1px solid ${n ? "transparent" : "var(--surface-2)"}`,
            boxSizing: "border-box",
          }} />
      );
    }
    // kuukauden vaihtuminen -> otsikko sarakkeen päälle
    const label = weekStart.getDate() <= 7 ? MONTHS_FI[weekStart.getMonth()] : "";
    cols.push(
      <div key={w} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ height: 11, fontSize: 9, color: "var(--text-3)", whiteSpace: "nowrap", lineHeight: "11px" }}>{label}</div>
        {cells}
      </div>
    );
  }

  return (
    <div className="hm" style={{ overflowX: "auto", paddingBottom: 4 }}>
      <div style={{ display: "flex", gap: 4, minWidth: "min-content" }}>{cols}</div>
    </div>
  );
}

/* ============================================================
   PÄÄNÄKYMÄ
   ============================================================ */
function Tracker({ session, online, onSignOut }) {
  const userId = session.user.id;
  const [products, setProducts] = useState([]);
  const [log, setLog] = useState([]);
  const [profileName, setProfileName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [syncState, setSyncState] = useState("loading");
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [matches, setMatches] = useState(null);
  const [selected, setSelected] = useState([]);   // valitut hakutulokset
  const [batch, setBatch] = useState(null);       // {done, total, name} kun sisältöjä haetaan
  const [queue, setQueue] = useState([]);         // vahvistusjono
  const [queueIdx, setQueueIdx] = useState(0);
  const [failed, setFailed] = useState([]);       // tuotteet joiden sisältö ei selvinnyt
  const [brush, setBrush] = useState(null);
  const [celebrate, setCelebrate] = useState(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manual, setManual] = useState({ product: "", faction: "", system: SYSTEMS[0], units: [{ id: uid(), name: "", count: 5 }] });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draftKey, setDraftKey] = useState("");
  const [draftName, setDraftName] = useState("");
  const [settingsMsg, setSettingsMsg] = useState(null);
  const [suggIdx, setSuggIdx] = useState(0);
  const [flash, setFlash] = useState(null);
  const [openCats, setOpenCats] = useState([]);     // tyhjä = kaikki kiinni
  const [achieved, setAchieved] = useState({});     // saavutus-id -> ansaintahetki (ISO)
  const [achOpen, setAchOpen] = useState(false);
  const [popup, setPopup] = useState(null);         // juuri ansaitut saavutukset
  const firstAch = useRef(true);
  const [openFacs, setOpenFacs] = useState([]);     // tyhjä = kaikki kiinni
  const [openProds, setOpenProds] = useState([]);   // tyhjä = kaikki tuotteet kiinni
  const [openRecipes, setOpenRecipes] = useState([]); // avatut maaliohjeet (unit-id)
  const [editProds, setEditProds] = useState([]);    // tuotteet muokkaustilassa (ei tallenneta)
  const [notifyPerm, setNotifyPerm] = useState(typeof Notification !== "undefined" ? Notification.permission : "unsupported");
  const [retry, setRetry] = useState(0);
  const skipSave = useRef(true);
  const saveTimer = useRef(null);
  const uiKey = "maalausurakka-ui-" + userId;

  /* ---- lataus ---- */
  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supa.from("profiles")
          .select("display_name, anthropic_key, data, log, achievements").eq("id", userId).maybeSingle();
        if (error) throw error;
        if (data) {
          setProducts(Array.isArray(data.data) ? data.data : []);
          setLog(Array.isArray(data.log) ? data.log : []);
          setAchieved(data.achievements && typeof data.achievements === "object" ? data.achievements : {});
          setProfileName(data.display_name || session.user.email);
          setApiKey(data.anthropic_key || "");
          setDraftKey(data.anthropic_key || "");
          setDraftName(data.display_name || "");
        } else {
          const fallback = session.user.user_metadata?.display_name || session.user.email.split("@")[0];
          await supa.from("profiles").insert({ id: userId, display_name: fallback, data: [], log: [], achievements: {} });
          setProfileName(fallback);
          setDraftName(fallback);
        }
        setSyncState("synced");
      } catch (e) {
        console.error("Lataus epäonnistui", e);
        setSyncState("error");
      }
      skipSave.current = true;
      setLoaded(true);
    })();
  }, [userId]);

  /* ---- haitareiden tila: paikallinen käyttöliittymämuisti, ei osa dataa ---- */
  useEffect(() => {
    try {
      const ui = JSON.parse(localStorage.getItem(uiKey) || "{}");
      if (Array.isArray(ui.openCats)) setOpenCats(ui.openCats);
      if (Array.isArray(ui.openFacs)) setOpenFacs(ui.openFacs);
      if (Array.isArray(ui.openProds)) setOpenProds(ui.openProds);
      if (typeof ui.achOpen === "boolean") setAchOpen(ui.achOpen);
    } catch (e) {}
  }, [uiKey]);

  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem(uiKey, JSON.stringify({ openCats, openFacs, openProds, achOpen })); } catch (e) {}
  }, [openCats, openFacs, openProds, achOpen, loaded, uiKey]);

  const catOpen = (sys) => openCats.includes(sys);
  const facOpen = (id) => openFacs.includes(id);
  const prodOpen = (pid) => openProds.includes(pid);
  const toggleCat = (sys) => setOpenCats(prev => prev.includes(sys) ? prev.filter(x => x !== sys) : [...prev, sys]);
  const toggleFac = (id) => setOpenFacs(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleProd = (pid) => setOpenProds(prev => prev.includes(pid) ? prev.filter(x => x !== pid) : [...prev, pid]);

  /* ---- tallennus (debounce) ----
     retry-laskuri ajaa efektin uudelleen kun yhteys palaa, jolloin
     nykyinen tila kirjoitetaan — epäonnistunut tallennus ei jää roikkumaan */
  useEffect(() => {
    if (!loaded) return;
    if (skipSave.current) { skipSave.current = false; return; }
    setSyncState("saving");
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        const { error } = await supa.from("profiles")
          .update({ data: products, log, achievements: achieved, updated_at: new Date().toISOString() }).eq("id", userId);
        if (error) throw error;
        setSyncState("synced");
      } catch (e) {
        console.error("Tallennus epäonnistui", e);
        setSyncState("error");
      }
    }, 800);
    return () => clearTimeout(saveTimer.current);
  }, [products, log, achieved, loaded, userId, retry]);

  /* yhteyden palatessa: jos tallennus oli jäänyt virheeseen, yritä heti uudelleen */
  useEffect(() => {
    if (online && syncState === "error") setRetry(n => n + 1);
  }, [online]);

  const saveSettings = async () => {
    setSettingsMsg(null);
    try {
      const { error } = await supa.from("profiles")
        .update({ anthropic_key: draftKey.trim() || null, display_name: draftName.trim() || null, updated_at: new Date().toISOString() })
        .eq("id", userId);
      if (error) throw error;
      setApiKey(draftKey.trim());
      setProfileName(draftName.trim() || session.user.email);
      setSettingsMsg("Tallennettu.");
      setTimeout(() => setSettingsMsg(null), 2500);
    } catch (e) { setSettingsMsg("Tallennus epäonnistui."); }
  };

  /* ---- push-tilaus: rekisteröi tämä laite palvelimen muistutuksille ---- */
  const subscribePush = async () => {
    if (!VAPID_PUBLIC_KEY || !("serviceWorker" in navigator) || !("PushManager" in window)) return;
    try {
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlB64ToU8(VAPID_PUBLIC_KEY),
        });
      }
      const json = sub.toJSON();
      await supa.from("push_subscriptions").upsert(
        { user_id: userId, endpoint: sub.endpoint, subscription: json },
        { onConflict: "endpoint" }
      );
    } catch (e) {
      console.warn("Push-tilaus epäonnistui", e);
    }
  };

  /* ---- ilmoitusluvan pyyntö ja testi ---- */
  const enableNotifications = async () => {
    if (typeof Notification === "undefined") { setNotifyPerm("unsupported"); return; }
    try {
      const p = await Notification.requestPermission();
      setNotifyPerm(p);
      if (p === "granted") subscribePush();
    } catch (e) { setNotifyPerm(Notification.permission); }
  };

  /* jos lupa on jo myönnetty, varmista että tämä laite on tilattuna */
  useEffect(() => {
    if (loaded && notifyPerm === "granted") subscribePush();
    // eslint-disable-next-line
  }, [loaded]);

  const testNotification = async () => {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const pool = [...NOTIFY.soft, ...NOTIFY.mid, ...NOTIFY.hard];
    const msg = pool[Math.floor(Math.random() * pool.length)];
    const grey = Math.max(0, stats.total - stats.done);
    const fill = (s) => s
      .replace(/{name}/g, profileName || "soturi")
      .replace(/{grey}/g, safeNum(grey))
      .replace(/{streak}/g, safeNum(momentum.best, 3))
      .replace(/{next}/g, suggestion ? `${suggestion.n} × ${suggestion.unit}` : "Clanrats");
    const opts = { body: fill(msg.b), icon: "icon-192.png", badge: "icon-192.png", tag: "maalausurakka-test", lang: "fi" };
    navigator.serviceWorker?.ready
      .then(reg => reg.showNotification(fill(msg.who), opts))
      .catch(() => { try { new Notification(fill(msg.who), opts); } catch (e) {} });
  };

  /* ---- tilastot ---- */
  const stats = useMemo(() => {
    let total = 0, sum = 0, done = 0;
    const perStage = [0, 0, 0, 0, 0];
    products.forEach(p => p.units.forEach(u => u.minis.forEach(s => {
      total++; sum += s; perStage[s]++; if (s === 4) done++;
    })));
    return { total, done, pct: total ? Math.round((sum / (total * 4)) * 100) : 0, perStage };
  }, [products]);

  /* ---- momentum: lokista laskettu ---- */
  const momentum = useMemo(() => {
    const byDay = new Map();
    let thisWeek = 0, lastWeek = 0, today = 0;
    const now = new Date();
    const wk0 = startOfWeek(now).getTime();
    const wkPrev = addDays(startOfWeek(now), -7).getTime();
    const todayKey = dayKey(now);

    log.forEach(e => {
      if (!(e.s > e.f)) return;           // vain eteenpäin, ei korjauksia eikä 4→0-kiertoa
      const n = e.n || 1;
      const d = new Date(e.t);
      const k = dayKey(d);
      byDay.set(k, (byDay.get(k) || 0) + n);
      if (k === todayKey) today += n;
      if (e.t >= wk0) thisWeek += n;
      else if (e.t >= wkPrev) lastWeek += n;
    });

    // putki
    const cur = startOfDay(now);
    if (!byDay.has(dayKey(cur))) cur.setDate(cur.getDate() - 1);
    let streak = 0;
    while (byDay.has(dayKey(cur))) { streak++; cur.setDate(cur.getDate() - 1); }

    // pisin putki
    const keys = [...byDay.keys()].sort();
    let best = 0, run = 0, prev = null;
    keys.forEach(k => {
      const d = new Date(k + "T00:00:00");
      run = (prev && (d - prev) === 86400000) ? run + 1 : 1;
      if (run > best) best = run;
      prev = d;
    });

    const totalSteps = [...byDay.values()].reduce((a, b) => a + b, 0);
    return { byDay, thisWeek, lastWeek, today, streak, best, totalSteps, activeToday: today > 0 };
  }, [log]);

  /* ---- saavutusten mittarit ---- */
  const metrics = useMemo(() => {
    const perStage = [0, 0, 0, 0, 0];
    let total = 0;
    products.forEach(p => p.units.forEach(u => u.minis.forEach(s => { perStage[s]++; total++; })));

    const complete = (u) => u.minis.length > 0 && u.minis.every(s => s === 4);
    const prodComplete = (p) => p.units.length > 0 && p.units.every(complete);

    let bigUnit = 0;
    products.forEach(p => p.units.forEach(u => { if (complete(u)) bigUnit = Math.max(bigUnit, u.minis.length); }));

    // rodut ja järjestelmät: montako on kokonaan valmiina
    const sysSet = new Set(), facSet = new Set();
    const sysAll = new Map(), facAll = new Map();
    products.forEach(p => {
      const sys = SYSTEMS.includes(p.system) ? p.system : "Muu";
      const fk = sys + "::" + facKey(p.faction);
      sysSet.add(sys); facSet.add(fk);
      sysAll.set(sys, (sysAll.get(sys) ?? true) && prodComplete(p));
      facAll.set(fk, (facAll.get(fk) ?? true) && prodComplete(p));
    });

    // aikaan sidotut: lokista
    let night = 0, early = 0, weekend = 0;
    log.forEach(e => {
      if (!(e.s > e.f)) return;
      const n = e.n || 1;
      const d = new Date(e.t), h = d.getHours(), wd = d.getDay();
      if (h >= 23 || h < 5) night += n;
      if (h >= 5 && h < 8) early += n;
      if (wd === 0 || wd === 6) weekend += n;
    });

    const dayKeys = [...momentum.byDay.keys()].sort();
    let maxGap = 0;
    for (let i = 1; i < dayKeys.length; i++) {
      const g = (new Date(dayKeys[i] + "T00:00:00") - new Date(dayKeys[i - 1] + "T00:00:00")) / 86400000;
      if (g > maxGap) maxGap = g;
    }

    return {
      total, perStage,
      assembled: perStage[1] + perStage[2] + perStage[3] + perStage[4],
      primed: perStage[2] + perStage[3] + perStage[4],
      started: perStage[3] + perStage[4],
      finished: perStage[4],
      prodDone: products.filter(prodComplete).length,
      sysCount: sysSet.size,
      facCount: facSet.size,
      sysDone: [...sysAll.values()].filter(Boolean).length,
      facDone: [...facAll.values()].filter(Boolean).length,
      bigUnit, night, early, weekend, maxGap,
      totalSteps: momentum.totalSteps,
      bestStreak: Math.max(momentum.best, momentum.streak),
      maxDay: momentum.byDay.size ? Math.max(...momentum.byDay.values()) : 0,
      daysActive: momentum.byDay.size,
    };
  }, [products, log, momentum]);

  /* saavutusten tila: kerran ansaittu pysyy ansaittuna, vaikka lukema myöhemmin laskisi */
  const achList = useMemo(() => ACHIEVEMENTS.map(a => {
    const cur = Math.max(0, a.get(metrics) || 0);
    return { ...a, cur: Math.min(cur, a.target), earnedAt: achieved[a.id] || null, unlocked: !!achieved[a.id] };
  }), [metrics, achieved]);

  const earnedCount = achList.filter(a => a.unlocked).length;

  /* seuraava saavutus = lähimpänä aukeamista oleva lukittu */
  const nextAch = useMemo(() => achList
    .filter(a => !a.unlocked && a.cur > 0 && a.cur < a.target)
    .sort((x, y) => (y.cur / y.target) - (x.cur / x.target))[0] || null, [achList]);

  /* uusien saavutusten havaitseminen */
  useEffect(() => {
    if (!loaded) return;
    const newly = ACHIEVEMENTS.filter(a => !achieved[a.id] && (a.get(metrics) || 0) >= a.target);
    if (!newly.length) { firstAch.current = false; return; }
    const now = new Date().toISOString();
    setAchieved(prev => ({ ...prev, ...Object.fromEntries(newly.map(a => [a.id, now])) }));
    // ensimmäisellä laskennalla vanhat suoritukset kirjataan hiljaa, ei 30 ilmoitusta
    if (!firstAch.current) {
      setPopup(newly);
      setTimeout(() => setPopup(null), 5000);
    }
    firstAch.current = false;
  }, [metrics, loaded]);

  const grouped = useMemo(() => {
    const bySys = new Map();
    products.forEach(p => {
      const sys = SYSTEMS.includes(p.system) ? p.system : "Muu";
      if (!bySys.has(sys)) bySys.set(sys, new Map());
      const facs = bySys.get(sys);
      const fk = facKey(p.faction);
      if (!facs.has(fk)) facs.set(fk, { key: fk, name: (p.faction || "").trim() || NO_FACTION, items: [] });
      facs.get(fk).items.push(p);
    });
    return SYSTEMS.filter(s => bySys.has(s)).map(system => ({
      system,
      factions: [...bySys.get(system).values()].sort((a, b) =>
        (a.key === "" ? 1 : 0) - (b.key === "" ? 1 : 0) ||   // määrittelemättömät viimeiseksi
        a.name.localeCompare(b.name, "fi")),
    }));
  }, [products]);

  /* jo käytetyt rodut järjestelmittäin -> ehdotukset kirjoituskenttiin */
  const factionsBySystem = useMemo(() => {
    const m = new Map();
    products.forEach(p => {
      const sys = SYSTEMS.includes(p.system) ? p.system : "Muu";
      const fac = (p.faction || "").trim();
      if (!fac) return;
      if (!m.has(sys)) m.set(sys, new Set());
      m.get(sys).add(fac);
    });
    // aakkosjärjestykseen
    return new Map([...m].map(([k, v]) => [k, [...v].sort((a, b) => a.localeCompare(b, "fi"))]));
  }, [products]);

  /* ---- ehdotukset: pienin keskeneräinen erä ---- */
  const suggestions = useMemo(() => {
    const cands = [];
    products.forEach(p => p.units.forEach(u => {
      const counts = [0, 0, 0, 0];
      u.minis.forEach(s => { if (s < 4) counts[s]++; });
      counts.forEach((n, stage) => {
        if (!n) return;
        const est = Math.max(5, Math.round((n * STAGES[stage].min) / 5) * 5);
        cands.push({ pid: p.id, uid2: u.id, product: p.name, unit: u.name, recipe: u.recipe || "", stage, n, est });
      });
    }));
    // kesken olevat ennen koskemattomia, sitten nopein ensin
    cands.sort((a, b) => (a.stage === 0) - (b.stage === 0) || a.est - b.est);
    return cands;
  }, [products]);

  const suggestion = suggestions.length ? suggestions[suggIdx % suggestions.length] : null;

  /* ---- paikallinen muistutus ----
     Ei taustapushia (staattinen hosting ei voi ajaa ajastimia). Sen sijaan:
     kun sovellus avataan, tarkista onko koko päivä mennyt edellisestä
     edistyksestä. Jos on, näytä yksi Warhammer-henkinen muistutus — enintään
     kerran vuorokaudessa, ei ikinä samana päivänä kun on jo maalattu. */
  useEffect(() => {
    if (!loaded || products.length === 0) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;

    const now = new Date();
    const todayK = dayKey(now);
    if (momentum.byDay.has(todayK)) return; // tänään on jo edistytty

    const lastNotifyKey = "maalausurakka-notify-" + userId;
    if (localStorage.getItem(lastNotifyKey) === todayK) return; // jo muistutettu tänään

    const keys = [...momentum.byDay.keys()].sort();
    const last = keys.length ? new Date(keys[keys.length - 1] + "T00:00:00") : null;
    const gap = last ? Math.floor((startOfDay(now) - last) / 86400000) : 1;
    if (gap < 1) return;

    const pool = gap >= 5 ? NOTIFY.hard : gap >= 2 ? NOTIFY.mid : NOTIFY.soft;
    const msg = pool[Math.floor(Math.random() * pool.length)];
    const grey = Math.max(0, stats.total - stats.done);
    const fill = (s) => s
      .replace(/{name}/g, profileName || "soturi")
      .replace(/{grey}/g, safeNum(grey))
      .replace(/{streak}/g, safeNum(momentum.best, safeNum(gap, 1)))
      .replace(/{next}/g, suggestion ? `${suggestion.n} × ${suggestion.unit}` : "urakka");

    const title = fill(msg.who);
    const opts = { body: fill(msg.b), icon: "icon-192.png", badge: "icon-192.png", tag: "maalausurakka-reminder", lang: "fi" };

    navigator.serviceWorker?.ready
      .then(reg => reg.showNotification(title, opts))
      .catch(() => { try { new Notification(title, opts); } catch (e) {} });

    localStorage.setItem(lastNotifyKey, todayK);
    // eslint-disable-next-line
  }, [loaded]);

  const goToProduct = (pid) => {
    // avaa kategoria, rotu ja tuote ennen vieritystä
    const p = products.find(x => x.id === pid);
    const sys = p && SYSTEMS.includes(p.system) ? p.system : "Muu";
    const fid = sys + "::" + facKey(p?.faction);
    setOpenCats(prev => prev.includes(sys) ? prev : [...prev, sys]);
    setOpenFacs(prev => prev.includes(fid) ? prev : [...prev, fid]);
    setOpenProds(prev => prev.includes(pid) ? prev : [...prev, pid]);
    setFlash(pid);
    setTimeout(() => setFlash(null), 2100);
    // odota renderöinti, vieritä vasta sitten
    requestAnimationFrame(() => requestAnimationFrame(() => {
      document.getElementById("prod-" + pid)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }));
  };

  /* ---- haku ---- */
  const humanError = (e) => {
    if (e.message === "NO_API_KEY") return "Tältä profiililta puuttuu Anthropic API -avain. Lisää se asetuksista (⚙).";
    if (e.message === "BAD_API_KEY") return "API-avain ei kelpaa. Tarkista se asetuksista (⚙).";
    return "Haku epäonnistui. Yritä uudelleen tai lisää tuote käsin.";
  };

  const doSearch = async () => {
    if (!query.trim() || searching) return;
    setSearching(true); setSearchError(null); setMatches(null); setSelected([]); setFailed([]); setQueue([]);
    try {
      const result = await searchProducts(apiKey, query.trim());
      if (result.found && Array.isArray(result.matches) && result.matches.length) {
        setMatches(result.matches.slice(0, 12).map(m => ({
          id: uid(), product: m.product || "?",
          system: SYSTEMS.includes(m.system) ? m.system : "Muu", faction: m.faction || "",
        })));
      } else setSearchError("Tuotteita ei löytynyt. Kokeile toista hakusanaa tai lisää tuote käsin.");
    } catch (e) { setSearchError(humanError(e)); }
    setSearching(false);
  };

  const clampCount = (v) => Math.max(1, Math.min(200, parseInt(v) || 1));
  const toggleSelect = (id) => setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const allSelected = matches && selected.length === matches.length;

  /* ---- hae kaikkien valittujen sisältö, yksi kerrallaan ---- */
  const fetchSelected = async () => {
    if (!matches || !selected.length || batch) return;
    const picks = matches.filter(m => selected.includes(m.id));
    setSearchError(null); setFailed([]);
    const got = [], bad = [];
    for (let i = 0; i < picks.length; i++) {
      const m = picks[i];
      setBatch({ done: i, total: picks.length, name: m.product });
      try {
        const r = await fetchProductContents(apiKey, m.product, m.system);
        if (r.found && Array.isArray(r.units) && r.units.length) {
          got.push({
            product: m.product, system: m.system, faction: m.faction,
            units: r.units.map(u => ({ id: uid(), name: u.name || "Miniatyyri", count: clampCount(u.count) })),
          });
        } else bad.push(m.product);
      } catch (e) {
        bad.push(m.product);
        if (e.message === "NO_API_KEY" || e.message === "BAD_API_KEY") {
          setSearchError(humanError(e));
          break; // avainvika ei korjaannu yrittämällä loput
        }
      }
    }
    setBatch(null);
    setFailed(bad);
    if (got.length) { setQueue(got); setQueueIdx(0); setMatches(null); setSelected([]); }
  };

  /* ---- vahvistusjono ---- */
  const current = queue[queueIdx] || null;
  const advance = () => {
    if (queueIdx + 1 >= queue.length) { setQueue([]); setQueueIdx(0); }
    else setQueueIdx(i => i + 1);
  };
  const patchQueueUnit = (rowId, patch) => setQueue(q => q.map((it, i) =>
    i !== queueIdx ? it : { ...it, units: it.units.map(u => u.id === rowId ? { ...u, ...patch } : u) }));
  const removeQueueUnit = (rowId) => setQueue(q => q.map((it, i) =>
    i !== queueIdx ? it : { ...it, units: it.units.filter(u => u.id !== rowId) }));
  const addQueueUnit = () => setQueue(q => q.map((it, i) =>
    i !== queueIdx ? it : { ...it, units: [...it.units, { id: uid(), name: "", count: 1 }] }));

  const confirmCurrent = () => {
    if (!current) return;
    const units = current.units
      .map(u => ({ name: u.name.trim(), count: clampCount(u.count) }))
      .filter(u => u.name);
    if (units.length) {
      setProducts(prev => [{
        id: uid(), name: current.product, faction: current.faction, system: current.system,
        units: units.map(u => ({ id: uid(), name: u.name, minis: Array(u.count).fill(0) })),
      }, ...prev]);
      setSuggIdx(0);
    }
    advance();
  };

  /* ---- käsinlisäys: useita miniatyyririvejä ---- */
  const blankRow = () => ({ id: uid(), name: "", count: 5 });
  const setManualRow = (id, patch) => setManual(m => ({ ...m, units: m.units.map(u => u.id === id ? { ...u, ...patch } : u) }));
  const addManualRow = () => setManual(m => ({ ...m, units: [...m.units, blankRow()] }));
  const removeManualRow = (id) => setManual(m => m.units.length > 1 ? { ...m, units: m.units.filter(u => u.id !== id) } : m);

  const manualRows = manual.units
    .map(u => ({ name: u.name.trim(), count: Math.max(1, Math.min(200, parseInt(u.count) || 1)) }))
    .filter(u => u.name);
  const manualTotal = manualRows.reduce((a, u) => a + u.count, 0);
  const manualValid = manual.product.trim() && manualRows.length > 0;

  const addManual = () => {
    if (!manualValid) return;
    setProducts(prev => [{
      id: uid(), name: manual.product.trim(), faction: manual.faction.trim(), system: manual.system,
      units: manualRows.map(u => ({ id: uid(), name: u.name, minis: Array(u.count).fill(0) })),
    }, ...prev]);
    setManual({ product: "", faction: manual.faction, system: manual.system, units: [blankRow()] });
    setManualOpen(false); setSuggIdx(0);
  };

  /* ---- ydin: vaiheen muutos + lokitus ---- */
  const applyChanges = (pid, unitId, changes) => {
    // changes: [{ idx, from, to }]
    const real = changes.filter(c => c.to !== c.from);
    if (!real.length) return;
    const p = products.find(x => x.id === pid);
    const u = p.units.find(x => x.id === unitId);

    const wasDone = p.units.every(x => x.minis.every(s => s === 4));
    const nextProducts = products.map(x => x.id !== pid ? x : {
      ...x, units: x.units.map(y => {
        if (y.id !== unitId) return y;
        const minis = [...y.minis];
        real.forEach(c => { minis[c.idx] = c.to; });
        return { ...y, minis };
      }),
    });
    const np = nextProducts.find(x => x.id === pid);
    const isDone = np.units.every(x => x.minis.every(s => s === 4));

    // ryhmitä lokimerkinnät (from,to)-pareittain
    const t = Date.now();
    const groups = new Map();
    real.forEach(c => {
      const k = c.from + ">" + c.to;
      groups.set(k, (groups.get(k) || 0) + 1);
    });
    const entries = [...groups.entries()].map(([k, n]) => {
      const [f, s] = k.split(">").map(Number);
      return { t, p: p.name, u: u.name, f, s, n };
    });

    setProducts(nextProducts);
    setLog(prev => [...prev, ...entries].slice(-LOG_CAP));
    setSuggIdx(0);
    if (isDone && !wasDone) {
      setCelebrate(p.name);
      setTimeout(() => setCelebrate(null), 4000);
    }
  };

  const setMini = (pid, unitId, idx) => {
    const p = products.find(x => x.id === pid);
    const u = p?.units.find(x => x.id === unitId);
    if (!u) return;
    const from = u.minis[idx];
    const to = brush === null ? (from + 1) % 5 : brush;
    applyChanges(pid, unitId, [{ idx, from, to }]);
  };

  const setAllInUnit = (pid, unitId) => {
    const p = products.find(x => x.id === pid);
    const u = p?.units.find(x => x.id === unitId);
    if (!u) return;
    const target = brush === null ? Math.min(4, Math.min(...u.minis) + 1) : brush;
    applyChanges(pid, unitId, u.minis.map((from, idx) => ({ idx, from, to: target })));
  };

  const setSystem = (pid, system) => setProducts(prev => prev.map(p => (p.id === pid ? { ...p, system } : p)));
  const setFaction = (pid, faction) => setProducts(prev => prev.map(p => (p.id === pid ? { ...p, faction } : p)));
  const setRecipe = (pid, unitId, recipe) => setProducts(prev => prev.map(p => p.id !== pid ? p : {
    ...p, units: p.units.map(u => u.id !== unitId ? u : { ...u, recipe }),
  }));

  /* ---- yksikön muokkaus ---- */
  const renameUnit = (pid, unitId, name) => setProducts(prev => prev.map(p => p.id !== pid ? p : {
    ...p, units: p.units.map(u => u.id !== unitId ? u : { ...u, name }),
  }));

  /* Määrän muutos. Kasvatus lisää to-do-minejä perään. Pienennys poistaa
     VÄHITEN edistyneet ensin, jotta tehty työ säilyy: jos 20:stä on 5 valmiina
     ja pudotat 15:een, ne 5 eivät katoa. Jäljelle jäävien keskinäinen
     järjestys säilyy. */
  const resizeUnit = (pid, unitId, n) => {
    const p = products.find(x => x.id === pid);
    const u = p?.units.find(x => x.id === unitId);
    if (!u) return;
    const cur = u.minis.length;
    if (n === cur) return;

    let minis;
    if (n > cur) {
      minis = [...u.minis, ...Array(n - cur).fill(0)];
    } else {
      const removing = cur - n;
      const order = u.minis.map((s, i) => ({ s, i })).sort((a, b) => a.s - b.s || a.i - b.i);
      const kill = new Set(order.slice(0, removing).map(x => x.i));
      const lost = order.slice(0, removing).filter(x => x.s > 0).length;
      if (lost > 0 && !window.confirm(
        `Poistetaan ${removing} miniä yksiköstä "${u.name}".\n\n` +
        `${lost} niistä on jo aloitettu tai valmis — se edistyminen menetetään. Jatketaanko?`
      )) return;
      minis = u.minis.filter((_, i) => !kill.has(i));
    }
    setProducts(prev => prev.map(x => x.id !== pid ? x : {
      ...x, units: x.units.map(y => y.id !== unitId ? y : { ...y, minis }),
    }));
    setSuggIdx(0);
  };

  const removeUnit = (pid, unitId) => {
    const p = products.find(x => x.id === pid);
    const u = p?.units.find(x => x.id === unitId);
    if (!u || p.units.length <= 1) return;
    const adv = u.minis.filter(s => s > 0).length;
    const warn = adv > 0 ? `\n\n${adv} minin edistyminen menetetään.` : "";
    if (!window.confirm(`Poistetaanko "${u.name}" (${u.minis.length} miniä) tuotteesta?${warn}`)) return;
    setProducts(prev => prev.map(x => x.id !== pid ? x : { ...x, units: x.units.filter(y => y.id !== unitId) }));
    setOpenRecipes(prev => prev.filter(x => x !== unitId));
    setSuggIdx(0);
  };

  const addUnit = (pid, name, count) => {
    setProducts(prev => prev.map(p => p.id !== pid ? p : {
      ...p, units: [...p.units, { id: uid(), name, minis: Array(count).fill(0) }],
    }));
    setSuggIdx(0);
  };

  const removeProduct = (pid) => {
    if (!window.confirm("Poistetaanko tuote ja sen miniatyyrit seurannasta? Loki ja putki säilyvät.")) return;
    setProducts(prev => prev.filter(p => p.id !== pid));
    setOpenProds(prev => prev.filter(x => x !== pid));
    setSuggIdx(0);
  };

  const syncLabel = {
    loading: { txt: "Ladataan…", color: "var(--text-2)" },
    synced:  { txt: "● Tallennettu", color: "var(--ok)" },
    saving:  { txt: "● Tallennetaan…", color: "var(--warn)" },
    error:   { txt: "● Tallennus ei onnistu — tarkista yhteys", color: "var(--err)" },
  }[syncState];

  const weekDelta = momentum.thisWeek - momentum.lastWeek;

  /* ============================ UI ============================ */
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", fontFamily: "var(--body)" }}>
      {celebrate && (
        <div className="toast" style={{
          top: 12,
          background: "linear-gradient(180deg, #7A6224, #4D3D18)",
          border: "1px solid var(--gold)", padding: "11px 18px",
          color: "var(--gold)", fontWeight: 600, textAlign: "center",
        }}>🏆 {celebrate} — kokonaan valmis!</div>
      )}

      {popup && popup.length > 0 && (
        <div className="toast" style={{
          top: celebrate ? 66 : 12,
          background: TIERS[popup[0].tier].bg,
          border: `1px solid ${TIERS[popup[0].tier].color}`,
          padding: "11px 16px", display: "flex", alignItems: "center", gap: 11,
        }}>
          <span style={{ fontSize: 22, flexShrink: 0 }}>{popup[0].icon}</span>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: TIERS[popup[0].tier].color, opacity: 0.8 }}>
              Uusi saavutus · {TIERS[popup[0].tier].name}
            </span>
            <span style={{ display: "block", fontWeight: 700, color: "var(--text)", fontSize: 14 }}>
              {popup[0].name}
              {popup.length > 1 && <span style={{ color: "var(--text-3)", fontWeight: 400 }}> +{popup.length - 1} muuta</span>}
            </span>
          </span>
        </div>
      )}

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "16px 14px 60px" }}>

        {/* ---------- PROFIILIPALKKI ---------- */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <div style={{
              width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
              background: "linear-gradient(135deg,var(--gold-deep),var(--gold-dim))", border: "1px solid var(--gold)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: "var(--display)", fontWeight: 700, color: "#1A1408", fontSize: 13,
            }}>{(profileName || "?").charAt(0).toUpperCase()}</div>
            <span style={{ fontSize: 14, color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{profileName}</span>
          </div>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <button onClick={() => setSettingsOpen(v => !v)} aria-label="Asetukset" style={{
              background: settingsOpen ? "var(--line-soft)" : "none", border: "1px solid var(--line-soft)", borderRadius: "var(--r2)",
              color: "var(--gold-dim)", fontSize: 15, padding: "5px 10px", cursor: "pointer",
            }}>⚙</button>
            <button onClick={onSignOut} style={{
              background: "none", border: "1px solid var(--line-soft)", borderRadius: "var(--r2)",
              color: "var(--text-3)", fontSize: 13, padding: "5px 10px", cursor: "pointer",
            }}>Kirjaudu ulos</button>
          </div>
        </div>

        {/* ---------- OTSAKE ---------- */}
        <header style={{ textAlign: "center", marginBottom: 6 }}>
          <div className="eyebrow" style={{ color: "var(--gold-dim)" }}>Maalausurakka</div>
          <h1 className="display" style={{
            fontSize: "clamp(24px, 7vw, 34px)", fontWeight: 600, color: "var(--text)",
            margin: "4px 0 0", lineHeight: 1.1, letterSpacing: "-.01em",
          }}>
            Harmaasta legioonasta<br />
            <span style={{ color: "var(--gold)" }}>kultaiseen armeijaan</span>
          </h1>
        </header>
        <div style={{ textAlign: "center", fontSize: 12, color: syncLabel.color, marginBottom: 14 }}>{syncLabel.txt}</div>

        {/* ---------- ASETUKSET ---------- */}
        {settingsOpen && (
          <section className="rise panel" style={{ borderColor: "var(--line)", marginBottom: 16 }}>
            <h2 style={{ fontFamily: "var(--display)", fontSize: 15, margin: "0 0 10px", color: "var(--gold-mid)" }}>Profiilin asetukset</h2>
            <label style={{ fontSize: 13, color: "var(--text-2)", display: "block", marginBottom: 4 }}>Profiilin nimi</label>
            <input value={draftName} onChange={e => setDraftName(e.target.value)} className="field" style={{ marginBottom: 12 }} />
            <label style={{ fontSize: 13, color: "var(--text-2)", display: "block", marginBottom: 4 }}>Anthropic API -avain (tuotehakua varten)</label>
            <input type="password" value={draftKey} onChange={e => setDraftKey(e.target.value)} placeholder="sk-ant-…" className="field" />
            <p style={{ fontSize: 12, color: "var(--text-3)", margin: "6px 0 10px", lineHeight: 1.5 }}>
              Avain on profiilikohtainen ja tallentuu Supabaseen omalle riviellesi. Ilman avainta haku ei toimi, mutta käsinlisäys ja seuranta toimivat normaalisti.
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button onClick={saveSettings} style={{ background: "var(--line-soft)", border: "1px solid var(--surface-3)", borderRadius: "var(--r2)", padding: "9px 14px", color: "var(--gold)", fontWeight: 700, cursor: "pointer" }}>
                Tallenna
              </button>
              {settingsMsg && <span style={{ fontSize: 13, color: settingsMsg === "Tallennettu." ? "var(--ok)" : "var(--err)" }}>{settingsMsg}</span>}
            </div>

            {/* ---- muistutukset ---- */}
            <div style={{ borderTop: "1px solid var(--line-soft)", marginTop: 14, paddingTop: 12 }}>
              <div style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 6, fontWeight: 700 }}>Muistutukset</div>
              <p style={{ fontSize: 12, color: "var(--text-3)", margin: "0 0 10px", lineHeight: 1.5 }}>
                Muistutus tulee eri Warhammer-hahmolta joka kerta — lempeästä primarkista
                kaaosjumalaan sen mukaan, kuinka kauan urakka on ollut hiljaa. Palvelin lähettää
                sen illalla myös silloin kun sovellus on kiinni
                {VAPID_PUBLIC_KEY ? "" : " (taustapush ei ole käytössä tässä asennuksessa)"}.
                iOS vaatii, että sovellus on lisätty kotinäytölle.
              </p>
              {notifyPerm === "granted" ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, color: "var(--ok)" }}>✓ Muistutukset käytössä</span>
                  <button onClick={testNotification} style={{ background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: "var(--r2)", padding: "7px 12px", color: "var(--text-2)", fontSize: 12, cursor: "pointer" }}>
                    Näytä esimerkki
                  </button>
                </div>
              ) : notifyPerm === "denied" ? (
                <p style={{ fontSize: 12, color: "var(--err)", margin: 0, lineHeight: 1.5 }}>
                  Ilmoitukset on estetty selaimen asetuksissa. Salli ne sivun asetuksista (lukkokuvake osoiterivillä) ottaaksesi muistutukset käyttöön.
                </p>
              ) : notifyPerm === "unsupported" ? (
                <p style={{ fontSize: 12, color: "var(--text-3)", margin: 0 }}>
                  Tämä selain ei tue ilmoituksia.
                </p>
              ) : (
                <button onClick={enableNotifications} style={{ background: "linear-gradient(135deg,var(--gold-deep),var(--gold-dim))", border: "1px solid var(--gold)", borderRadius: "var(--r2)", padding: "9px 14px", color: "#1A1408", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                  Ota muistutukset käyttöön
                </button>
              )}
            </div>
          </section>
        )}

        {/* ---------- TÄNÄÄN: SEURAAVA SIIRTO ---------- */}
        {suggestion && (
          <section className="rise" style={{
            background: "linear-gradient(135deg,var(--surface-3),var(--surface-2))", border: "1px solid var(--gold-deep)",
            borderRadius: "var(--r3)", padding: "var(--s4x)", marginBottom: 16,
          }}>
            <div style={{ fontSize: 11, color: "var(--gold-dim)", textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: 8 }}>
              Seuraava siirto
            </div>
            <div style={{ fontFamily: "var(--display)", fontSize: 19, color: "var(--text)", fontWeight: 700, lineHeight: 1.3 }}>
              {suggestion.n} × {suggestion.unit}
            </div>
            <div style={{ fontSize: 14, color: "var(--text-2)", marginTop: 3 }}>
              odottaa {STAGES[suggestion.stage].verb} · noin {suggestion.est} min
            </div>
            <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>{suggestion.product}</div>
            {suggestion.recipe && (
              <div style={{
                marginTop: 10, background: "var(--surface-2)", border: "1px solid var(--line-soft)",
                borderRadius: "var(--r2)", padding: "8px 10px",
              }}>
                <div style={{ fontSize: 10, color: "var(--gold-dim)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>
                  🎨 Maaliohje
                </div>
                <div style={{ fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                  {suggestion.recipe}
                </div>
              </div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <button onClick={() => goToProduct(suggestion.pid)} className="btn btn-gold" style={{ padding: "9px 16px", fontSize: 14 }}>
                Näytä
              </button>
              {suggestions.length > 1 && (
                <button onClick={() => setSuggIdx(i => i + 1)} style={{
                  background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: "var(--r2)",
                  padding: "9px 14px", color: "var(--text-2)", fontSize: 14, cursor: "pointer",
                }}>Ehdota toinen</button>
              )}
            </div>
          </section>
        )}

        {/* ---------- MOMENTUM ---------- */}
        {stats.total > 0 && (
          <section className="panel" style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
              {/* putki */}
              <div className={"stat" + (momentum.streak ? " is-live" : "")}>
                <div className="stat-val" style={{ color: momentum.streak ? "var(--gold)" : "var(--text-4)" }}>
                  {momentum.streak > 0 && <span style={{ fontSize: 17 }}>🔥 </span>}{momentum.streak}
                </div>
                <div className="stat-label">päivän putki</div>
              </div>
              {/* tällä viikolla */}
              <div className="stat">
                <div className="stat-val" style={{ color: momentum.thisWeek ? "var(--gold-mid)" : "var(--text-4)" }}>
                  {momentum.thisWeek}
                </div>
                <div className="stat-label">tällä viikolla</div>
              </div>
              {/* viime viikolla */}
              <div className="stat">
                <div className="stat-val" style={{ color: "var(--text-3)" }}>{momentum.lastWeek}</div>
                <div className="stat-label">viime viikolla</div>
              </div>
            </div>

            {/* putken tila / viikkovertailu */}
            <p style={{ fontSize: 13, color: "var(--text-2)", margin: "0 0 12px", fontStyle: "italic" }}>
              {momentum.streak > 0 && !momentum.activeToday
                ? `Putki on ${momentum.streak} päivää — yksi askel tänään pitää sen elossa.`
                : momentum.activeToday && momentum.today > 0
                ? `Tänään ${momentum.today} askelta. Putki jatkuu.`
                : momentum.lastWeek > 0 && momentum.thisWeek === 0
                ? `Viime viikolla ${momentum.lastWeek} askelta. Tämä viikko odottaa avaustaan.`
                : weekDelta > 0
                ? `${weekDelta} askelta enemmän kuin viime viikolla samaan aikaan.`
                : "Yksikin mini eteenpäin aloittaa putken."}
            </p>

            {nextAch && (
              <button onClick={() => { setAchOpen(true); requestAnimationFrame(() => document.getElementById("saavutukset")?.scrollIntoView({ behavior: "smooth", block: "start" })); }}
                style={{
                  display: "flex", width: "100%", alignItems: "center", gap: 10, textAlign: "left",
                  background: "var(--bg)", border: "1px solid var(--surface-2)", borderRadius: "var(--r2)",
                  padding: "10px 12px", cursor: "pointer",
                }}>
                <span style={{ fontSize: 20, flexShrink: 0, filter: "grayscale(1)", opacity: 0.7 }}>{nextAch.icon}</span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: "block", fontSize: 11, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Seuraava saavutus</span>
                  <span style={{ display: "block", fontSize: 13, color: "var(--text-2)", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {nextAch.name}
                  </span>
                  <span style={{ display: "block", height: 4, borderRadius: "2px", background: "var(--surface-2)", marginTop: 4, overflow: "hidden" }}>
                    <span style={{ display: "block", height: "100%", width: `${(nextAch.cur / nextAch.target) * 100}%`, background: TIERS[nextAch.tier].color }} />
                  </span>
                </span>
                <span style={{ fontSize: 12, color: "var(--text-3)", flexShrink: 0 }}>{nextAch.cur}/{nextAch.target}</span>
              </button>
            )}
          </section>
        )}

        {/* ---------- EDISTYMINEN ---------- */}
        <section className="panel" style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
            <span style={{ fontFamily: "var(--display)", fontSize: 30, color: "var(--gold)", fontWeight: 700 }}>{stats.pct}%</span>
            <span style={{ fontSize: 14, color: "var(--text-2)" }}>{stats.done} / {stats.total} miniä valmiina</span>
          </div>
          <StageBar perStage={stats.perStage} total={stats.total} showCounts />
          {stats.total > 0 && (
            <p style={{ margin: "10px 0 0", fontSize: 13, color: "var(--text-3)" }}>
              Maalaamatta: {stats.total - stats.done} miniä
            </p>
          )}
        </section>

        {/* ---------- HAKU ---------- */}
        <section style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && doSearch()}
              placeholder="Hae tuotteita, esim. 'High Elf' tai 'Combat Patrol'…"
              className="field" style={{ flex: 1, background: "var(--surface)", borderRadius: "var(--r2)", padding: "12px 14px" }} />
            <button onClick={doSearch} disabled={searching} style={{
              background: searching ? "var(--line)" : "linear-gradient(135deg,#A33B3B,#7E2626)",
              color: "#FBEDED", border: "1px solid #C05050", borderRadius: "var(--r2)",
              padding: "0 18px", fontWeight: 700, fontSize: 15, cursor: searching ? "wait" : "pointer", flexShrink: 0,
            }}>{searching ? "Haetaan…" : "Hae"}</button>
          </div>

          <button onClick={() => setManualOpen(v => !v)} className="btn-ghost" style={{ marginTop: 6 }}>
            {manualOpen ? "Sulje käsinlisäys" : "Tai lisää tuote käsin"}
          </button>

          {manualOpen && (
            <div className="rise panel" style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 8 }}>
              <input value={manual.product} onChange={e => setManual({ ...manual, product: e.target.value })} placeholder="Tuotteen nimi" className="field" />
              <select value={manual.system} onChange={e => setManual({ ...manual, system: e.target.value })} className="field">
                {SYSTEMS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <input value={manual.faction} onChange={e => setManual({ ...manual, faction: e.target.value })}
                list="fac-manual" placeholder="Rotu / armeija, esim. High Elves (valinnainen)" className="field" />
              <datalist id="fac-manual">
                {[...(factionsBySystem.get(manual.system) || [])].map(f => <option key={f} value={f} />)}
              </datalist>

              <div style={{ fontSize: 11, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.1em", marginTop: 2 }}>
                Miniatyyrit
              </div>

              {manual.units.map((u, i) => (
                <div key={u.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input value={u.name} onChange={e => setManualRow(u.id, { name: e.target.value })}
                    onKeyDown={e => { if (e.key === "Enter" && i === manual.units.length - 1) addManualRow(); }}
                    placeholder={i === 0 ? "Miniatyyrin nimi, esim. Clanrats" : "Miniatyyrin nimi"} className="field" style={{ flex: 1 }} />
                  <input type="number" min="1" max="200" value={u.count} aria-label="Määrä"
                    onChange={e => setManualRow(u.id, { count: e.target.value })}
                    className="field" style={{ width: 68, flexShrink: 0 }} />
                  <button onClick={() => removeManualRow(u.id)} disabled={manual.units.length === 1}
                    aria-label="Poista rivi" title="Poista rivi" style={{
                      background: "none", border: "none", flexShrink: 0, padding: "6px 4px",
                      color: manual.units.length === 1 ? "var(--line-soft)" : "var(--text-3)",
                      fontSize: 18, lineHeight: 1, cursor: manual.units.length === 1 ? "default" : "pointer",
                    }}>×</button>
                </div>
              ))}

              <button onClick={addManualRow} className="btn-ghost" style={{ alignSelf: "flex-start", textDecoration: "none", border: "1px dashed var(--line)", borderRadius: "var(--r2)", padding: "7px 12px", fontSize: 13 }}>
                + Lisää miniatyyri
              </button>

              <button onClick={addManual} disabled={!manualValid} style={{
                background: manualValid ? "var(--line-soft)" : "var(--surface-2)",
                border: `1px solid ${manualValid ? "var(--surface-3)" : "var(--line-soft)"}`, borderRadius: "var(--r2)", padding: "10px",
                color: manualValid ? "var(--gold)" : "var(--text-4)", fontWeight: 700,
                cursor: manualValid ? "pointer" : "default", marginTop: 2,
              }}>
                {manualValid ? `Lisää urakkaan (${manualTotal} miniä)` : "Lisää urakkaan"}
              </button>
            </div>
          )}

          {searchError && <p style={{ color: "var(--err)", fontSize: 14, margin: "8px 0 0" }}>{searchError}</p>}

          {failed.length > 0 && (
            <p style={{ color: "var(--warn)", fontSize: 13, margin: "8px 0 0", lineHeight: 1.5 }}>
              Sisältöä ei saatu selville: {failed.join(", ")}. Voit lisätä nämä käsin.
            </p>
          )}

          {/* ---------- SISÄLTÖJEN ERÄHAKU KÄYNNISSÄ ---------- */}
          {batch && (
            <div className="rise panel" style={{ marginTop: 10 }}>
              <div style={{ fontSize: 14, color: "var(--text)", marginBottom: 8 }}>
                ⏳ Haetaan sisältöjä… {batch.done + 1} / {batch.total}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 8 }}>{batch.name}</div>
              <div style={{ height: 6, borderRadius: "var(--r1)", background: "var(--surface-2)", overflow: "hidden" }}>
                <div style={{
                  width: `${(batch.done / batch.total) * 100}%`, height: "100%",
                  background: "linear-gradient(90deg,var(--gold-deep),var(--gold))", transition: "width .3s ease",
                }} />
              </div>
            </div>
          )}

          {/* ---------- HAKUTULOKSET: MONIVALINTA ---------- */}
          {matches && !batch && (
            <div className="rise panel flush" style={{ marginTop: 10, overflow: "hidden" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: "1px solid var(--line-soft)" }}>
                <span style={{ fontSize: 13, color: "var(--text-2)" }}>{matches.length} tuotetta — valitse lisättävät:</span>
                <button onClick={() => setSelected(allSelected ? [] : matches.map(m => m.id))} className="btn-ghost" style={{ fontSize: 12 }}>
                  {allSelected ? "Tyhjennä" : "Valitse kaikki"}
                </button>
              </div>

              {matches.map(m => {
                const sel = selected.includes(m.id);
                return (
                  <button key={m.id} className="row" onClick={() => toggleSelect(m.id)} aria-pressed={sel}
                    style={{ background: sel ? "var(--surface-3)" : undefined }}>
                    <span aria-hidden="true" className={"checkbox" + (sel ? " is-on" : "")}>{sel ? "✓" : ""}</span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 15, fontWeight: 700, color: sel ? "var(--text)" : "var(--text-2)" }}>{m.product}</span>
                      <span style={{ fontSize: 12, color: "var(--gold-dim)" }}>{m.system}{m.faction ? ` · ${m.faction}` : ""}</span>
                    </span>
                  </button>
                );
              })}

              <div style={{ display: "flex", gap: 8, padding: 10, background: "var(--surface-2)" }}>
                <button onClick={fetchSelected} disabled={!selected.length}
                  className="btn btn-gold" style={{ flex: 1 }}>
                  {selected.length ? `Hae sisällöt (${selected.length})` : "Valitse vähintään yksi"}
                </button>
                <button onClick={() => { setMatches(null); setSelected([]); }} className="btn btn-quiet">Sulje</button>
              </div>
            </div>
          )}

          {/* ---------- VAHVISTUSJONO: YKSI TUOTE KERRALLAAN ---------- */}
          {current && (
            <div className="rise" style={{ background: "var(--surface-2)", border: "1px solid var(--gold-deep)", borderRadius: "var(--r3)", padding: "var(--s4x)", marginTop: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8 }}>
                <span style={{ fontSize: 11, color: "var(--gold-dim)", textTransform: "uppercase", letterSpacing: "0.14em" }}>
                  Tarkista määrät
                </span>
                {queue.length > 1 && (
                  <span style={{ fontSize: 12, color: "var(--text-3)" }}>{queueIdx + 1} / {queue.length}</span>
                )}
              </div>

              {queue.length > 1 && (
                <div style={{ display: "flex", gap: 3, marginBottom: 10 }}>
                  {queue.map((_, i) => (
                    <div key={i} style={{
                      flex: 1, height: 3, borderRadius: "2px",
                      background: i < queueIdx ? "var(--gold-deep)" : i === queueIdx ? "var(--gold)" : "var(--line-soft)",
                    }} />
                  ))}
                </div>
              )}

              <div style={{ fontFamily: "var(--display)", fontSize: 17, color: "var(--text)", fontWeight: 700 }}>{current.product}</div>
              <div style={{ fontSize: 13, color: "var(--gold-dim)", marginBottom: 8 }}>{current.system}</div>
              <input value={current.faction || ""} list="fac-queue" placeholder="Rotu / armeija"
                aria-label="Rotu tai armeija"
                onChange={e => setQueue(q => q.map((it, i) => i !== queueIdx ? it : { ...it, faction: e.target.value }))}
                className="field" style={{ padding: "7px 10px", fontSize: 13, marginBottom: 10 }} />
              <datalist id="fac-queue">
                {[...(factionsBySystem.get(current.system) || [])].map(f => <option key={f} value={f} />)}
              </datalist>

              {current.units.map(u => (
                <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <input type="number" min="1" max="200" value={u.count} aria-label="Määrä"
                    onChange={e => patchQueueUnit(u.id, { count: e.target.value })}
                    className="field" style={{ width: 62, padding: "7px 8px", fontSize: 14, flexShrink: 0 }} />
                  <input value={u.name} aria-label="Miniatyyrin nimi"
                    onChange={e => patchQueueUnit(u.id, { name: e.target.value })}
                    className="field" style={{ flex: 1, padding: "7px 10px", fontSize: 14 }} />
                  <button onClick={() => removeQueueUnit(u.id)} aria-label="Poista rivi" title="Poista rivi" style={{
                    background: "none", border: "none", color: "var(--text-3)", fontSize: 18,
                    lineHeight: 1, cursor: "pointer", padding: "6px 4px", flexShrink: 0,
                  }}>×</button>
                </div>
              ))}

              <button onClick={addQueueUnit} className="btn-ghost" style={{ textDecoration: "none", border: "1px dashed var(--line)", borderRadius: "var(--r2)", padding: "6px 10px", fontSize: 12, marginTop: 2 }}>
                + Lisää rivi
              </button>

              <p style={{ fontSize: 12, color: "var(--text-2)", margin: "10px 0", lineHeight: 1.5 }}>
                Vertaa laatikon kylkeen — tekoälyhaku voi erehtyä. Korjaa määrät tai poista ylimääräiset rivit ennen lisäystä.
              </p>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={confirmCurrent} className="btn btn-gold" style={{ flex: "1 1 160px" }}>
                  Lisää urakkaan ({current.units.reduce((a, u) => a + clampCount(u.count), 0)} miniä)
                </button>
                <button onClick={advance} style={{
                  background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: "var(--r2)",
                  padding: "10px 14px", color: "var(--text-2)", cursor: "pointer",
                }}>Ohita</button>
                {queue.length > 1 && (
                  <button onClick={() => { setQueue([]); setQueueIdx(0); }} style={{
                    background: "none", border: "none", color: "var(--text-3)", fontSize: 12,
                    cursor: "pointer", textDecoration: "underline",
                  }}>Peru loput</button>
                )}
              </div>
            </div>
          )}
        </section>

        {/* ---------- SIVELLIN ---------- */}
        {stats.total > 0 && (
          <section style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Sivellin — valitse mitä napautus tekee minille
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              <button onClick={() => setBrush(null)} style={{
                background: brush === null ? "var(--line-soft)" : "var(--surface)",
                border: `1px solid ${brush === null ? "var(--gold)" : "var(--line-soft)"}`, borderRadius: "var(--r2)", padding: "7px 10px",
                color: brush === null ? "var(--gold)" : "var(--text-2)", fontSize: 13, fontWeight: 700, cursor: "pointer",
              }}>→ Seuraava vaihe</button>
              {STAGES.map(st => (
                <button key={st.key} onClick={() => setBrush(st.key)} style={{
                  background: brush === st.key ? st.bg : "var(--surface)",
                  border: `1px solid ${brush === st.key ? st.color : "var(--line-soft)"}`, borderRadius: "var(--r2)", padding: "7px 10px",
                  color: brush === st.key ? st.color : "var(--text-2)", fontSize: 13, fontWeight: 600, cursor: "pointer",
                }}>{st.name}</button>
              ))}
            </div>
          </section>
        )}

        {/* ---------- TYHJÄ TILA ---------- */}
        {loaded && products.length === 0 && (
          <div style={{ textAlign: "center", padding: "var(--s7x) var(--s5x)", color: "var(--text-3)" }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>🎨</div>
            <p style={{ margin: 0, fontSize: 15 }}>Urakka on tyhjä. Hae ensimmäinen tuote yltä —<br />esim. "High Elf" tai "Combat Patrol Tyranids".</p>
          </div>
        )}

        {/* ---------- TUOTELISTAN TYÖKALUT ---------- */}
        {products.length > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 8 }}>
            <span className="eyebrow">Kokoelma</span>
            <button
              onClick={() => {
                const anyOpen = openCats.length || openFacs.length || openProds.length;
                if (anyOpen) { setOpenCats([]); setOpenFacs([]); setOpenProds([]); }
                else {
                  setOpenCats(grouped.map(g => g.system));
                  setOpenFacs(grouped.flatMap(g => g.factions.map(f => g.system + "::" + f.key)));
                  setOpenProds(products.map(p => p.id));
                }
              }}
              className="btn btn-quiet btn-sm">
              {(openCats.length || openFacs.length || openProds.length) ? "Sulje kaikki" : "Avaa kaikki"}
            </button>
          </div>
        )}

        {/* ---------- TUOTTEET: JÄRJESTELMÄ -> ROTU -> TUOTE ---------- */}
        {grouped.map(({ system, factions }) => {
          const all = factions.flatMap(f => f.items);
          const c = tally(all);
          const cOpen = catOpen(system);
          return (
            <section key={system} style={{ marginBottom: cOpen ? 24 : 10 }}>
              {/* --- taso 1: pelijärjestelmä --- */}
              <button onClick={() => toggleCat(system)} aria-expanded={cOpen}
                className="acc-head"
                style={{ borderBottom: "1px solid var(--line)", marginBottom: cOpen ? 10 : 0 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <Chevron open={cOpen} />
                  <span style={{ fontFamily: "var(--display)", fontSize: 16, color: "var(--gold-mid)", letterSpacing: "0.06em", textTransform: "uppercase", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {system}
                  </span>
                  <span style={{ fontSize: 12, color: "var(--text-3)", flexShrink: 0 }}>
                    ({factions.length} {factions.length === 1 ? "rotu" : "rotua"})
                  </span>
                </span>
                <span style={{ fontSize: 13, color: "var(--text-2)", flexShrink: 0 }}>{c.pct}% · {c.total} miniä</span>
              </button>

              {cOpen && factions.map(({ key, name, items }) => {
                const fid = system + "::" + key;
                const f = tally(items);
                const fOpen = facOpen(fid);
                const undef = key === "";
                return (
                  <div key={fid} style={{ marginBottom: fOpen ? 14 : 6 }}>
                    {/* --- taso 2: rotu / armeija --- */}
                    <button onClick={() => toggleFac(fid)} aria-expanded={fOpen}
                      className="acc-head" style={{ paddingLeft: 6, marginBottom: fOpen ? 6 : 0 }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                        <Chevron open={fOpen} />
                        <span style={{
                          fontSize: 14, fontWeight: 700, letterSpacing: "0.04em",
                          color: undef ? "var(--text-3)" : "var(--text-2)",
                          fontStyle: undef ? "italic" : "normal",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>{name}</span>
                        <span style={{ fontSize: 11, color: "var(--text-4)", flexShrink: 0 }}>({items.length})</span>
                      </span>
                      <span style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                        <span style={{ width: 46 }}><StageBar perStage={f.perStage} total={f.total} slim /></span>
                        <span style={{ fontSize: 12, color: "var(--text-3)", minWidth: 30, textAlign: "right" }}>{f.pct}%</span>
                      </span>
                    </button>

                    {fOpen && (
                      <div style={{ borderLeft: "1px solid var(--surface-2)", paddingLeft: 10, marginLeft: 4 }}>
                        {items.map(p => {
                          const t = tally([p]);
                          const pDoneAll = t.pct === 100 && t.total > 0;
                          const open = prodOpen(p.id);
                          const facList = [...(factionsBySystem.get(SYSTEMS.includes(p.system) ? p.system : "Muu") || [])];
                          return (
                            <article key={p.id} id={"prod-" + p.id} className={"card rise" + (pDoneAll ? " is-done" : "") + (flash === p.id ? " flash" : "") + (pDoneAll && flash !== p.id ? " is-celebrating" : "")}
                              style={{ marginBottom: 10 }}>
                              {/* --- taso 3: tuote --- */}
                              <button onClick={() => toggleProd(p.id)} aria-expanded={open} style={{
                                display: "block", width: "100%", background: "none", border: "none",
                                padding: 0, cursor: "pointer", textAlign: "left",
                              }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                                  <span style={{ display: "flex", gap: 8, minWidth: 0 }}>
                                    <span style={{ paddingTop: 7 }}><Chevron open={open} /></span>
                                    <span style={{ minWidth: 0 }}>
                                      <h3 style={{ fontFamily: "var(--display)", fontSize: 16, margin: 0, color: pDoneAll ? "var(--gold)" : "var(--text)", lineHeight: 1.3 }}>
                                        {pDoneAll && "★ "}{p.name}
                                      </h3>
                                    </span>
                                  </span>
                                  <span style={{ textAlign: "right", flexShrink: 0 }}>
                                    <span style={{ display: "block", fontFamily: "var(--display)", fontSize: 19, fontWeight: 700, color: pDoneAll ? "var(--gold)" : "var(--text-2)", lineHeight: 1.1 }}>{t.pct}%</span>
                                    <span style={{ fontSize: 11, color: "var(--text-3)" }}>{t.done}/{t.total} valmis</span>
                                  </span>
                                </div>
                                <div style={{ marginTop: 8 }}>
                                  <StageBar perStage={t.perStage} total={t.total} slim />
                                </div>
                              </button>

                              {/* --- avattu sisältö --- */}
                              {open && (
                                <div className="rise">
                                  {p.units.map(u => {
                                    const uDone = u.minis.filter(s => s === 4).length;
                                    const editing = editProds.includes(p.id);
                                    return (
                                      <div key={u.id} style={{ marginTop: 14 }}>
                                        {editing ? (
                                          <UnitEditRow
                                            unit={u}
                                            canRemove={p.units.length > 1}
                                            onRename={v => renameUnit(p.id, u.id, v)}
                                            onResize={n => resizeUnit(p.id, u.id, n)}
                                            onRemove={() => removeUnit(p.id, u.id)}
                                          />
                                        ) : (
                                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, gap: 8, flexWrap: "wrap" }}>
                                            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
                                              {u.name} <span style={{ color: "var(--text-3)", fontWeight: 400 }}>({uDone}/{u.minis.length} valmis)</span>
                                            </span>
                                            <button onClick={() => setAllInUnit(p.id, u.id)}
                                              style={{ background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: "var(--r1)", padding: "4px 8px", color: "var(--text-2)", fontSize: 12, cursor: "pointer" }}>
                                              Sivele kaikki
                                            </button>
                                          </div>
                                        )}
                                        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                                          {u.minis.map((s, i) => {
                                            const st = STAGES[s];
                                            return (
                                              <button key={i} className={"chip chip-" + s} onClick={() => setMini(p.id, u.id, i)}
                                                aria-label={`${u.name} #${i + 1}: ${st.name}`} title={`#${i + 1}: ${st.name} — ${st.desc}`}
                                                >
                                                {s === 4 ? "★" : st.short}
                                              </button>
                                            );
                                          })}
                                        </div>

                                        {/* --- maaliohje --- */}
                                        <button
                                          onClick={() => setOpenRecipes(prev => prev.includes(u.id) ? prev.filter(x => x !== u.id) : [...prev, u.id])}
                                          aria-expanded={openRecipes.includes(u.id)}
                                          style={{
                                            display: "flex", alignItems: "center", gap: 5, marginTop: 8,
                                            background: "none", border: "none", padding: "2px 0", cursor: "pointer", fontSize: 11.5,
                                            color: u.recipe ? "var(--gold-dim)" : "var(--text-4)",
                                          }}>
                                          <Chevron open={openRecipes.includes(u.id)} />
                                          🎨 {u.recipe ? "Maaliohje" : "Lisää maaliohje"}
                                          {u.recipe && !openRecipes.includes(u.id) && (
                                            <span style={{ color: "var(--text-4)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 180 }}>
                                              — {u.recipe.split("\n")[0]}
                                            </span>
                                          )}
                                        </button>
                                        {openRecipes.includes(u.id) && (
                                          <RecipeEditor value={u.recipe || ""} onCommit={v => setRecipe(p.id, u.id, v)} />
                                        )}
                                      </div>
                                    );
                                  })}

                                  {/* --- miniatyyrien muokkaus --- */}
                                  {editProds.includes(p.id) && <AddUnitForm onAdd={(n, c) => addUnit(p.id, n, c)} />}

                                  <button
                                    onClick={() => setEditProds(prev => prev.includes(p.id) ? prev.filter(x => x !== p.id) : [...prev, p.id])}
                                    style={{
                                      marginTop: 12, background: editProds.includes(p.id) ? "var(--line-soft)" : "none",
                                      border: `1px ${editProds.includes(p.id) ? "solid" : "dashed"} var(--line)`,
                                      borderRadius: "var(--r1)", padding: "6px 11px",
                                      color: editProds.includes(p.id) ? "var(--gold)" : "var(--text-3)",
                                      fontSize: 12, cursor: "pointer",
                                    }}>
                                    {editProds.includes(p.id) ? "✓ Valmis muokkaamasta" : "✎ Muokkaa miniatyyrejä"}
                                  </button>

                                  {/* --- tuotteen sijoitus: järjestelmä + rotu --- */}
                                  <div style={{ display: "flex", gap: 6, marginTop: 14, flexWrap: "wrap", alignItems: "center" }}>
                                    <select value={SYSTEMS.includes(p.system) ? p.system : "Muu"} onChange={e => setSystem(p.id, e.target.value)}
                                      aria-label="Pelijärjestelmä"
                                      style={{ background: "var(--bg)", border: "1px solid var(--line-soft)", borderRadius: "var(--r1)", padding: "5px 8px", color: "var(--text-3)", fontSize: 12, flex: "1 1 140px", minWidth: 0 }}>
                                      {SYSTEMS.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                    <FactionInput
                                      value={p.faction || ""}
                                      onCommit={v => setFaction(p.id, v)}
                                      listId={"fac-" + p.id}
                                      options={facList}
                                      style={{ background: "var(--bg)", border: "1px solid var(--line-soft)", borderRadius: "var(--r1)", padding: "5px 8px", fontSize: 12, boxSizing: "border-box" }}
                                    />
                                    <button onClick={() => removeProduct(p.id)} style={{ background: "none", border: "none", color: "var(--text-3)", fontSize: 12, cursor: "pointer", padding: 2, textDecoration: "underline", flexShrink: 0 }}>
                                      poista
                                    </button>
                                  </div>
                                </div>
                              )}
                            </article>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </section>
          );
        })}

        {/* ---------- SAAVUTUKSET ---------- */}
        {stats.total > 0 && (
          <section id="saavutukset" style={{ marginBottom: 24 }}>
            <button onClick={() => setAchOpen(v => !v)} aria-expanded={achOpen}
              className="acc-head"
              style={{ borderBottom: "1px solid var(--line)", marginBottom: achOpen ? 10 : 0 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Chevron open={achOpen} />
                <span style={{ fontFamily: "var(--display)", fontSize: 16, color: "var(--gold-mid)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                  Saavutukset
                </span>
              </span>
              <span style={{ fontSize: 13, color: "var(--text-2)" }}>{earnedCount} / {ACHIEVEMENTS.length}</span>
            </button>

            {achOpen && (
              <div className="rise">
                <div style={{ height: 6, borderRadius: "var(--r1)", background: "var(--surface-2)", overflow: "hidden", marginBottom: 12 }}>
                  <div style={{ height: "100%", width: `${(earnedCount / ACHIEVEMENTS.length) * 100}%`, background: "linear-gradient(90deg,var(--gold-deep),var(--gold))", transition: "width .4s ease" }} />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8 }}>
                  {[...achList].sort((a, b) =>
                    (b.unlocked ? 1 : 0) - (a.unlocked ? 1 : 0) ||
                    (b.unlocked ? (b.earnedAt || "").localeCompare(a.earnedAt || "") : (b.cur / b.target) - (a.cur / a.target))
                  ).map(a => {
                    const T = TIERS[a.tier];
                    return (
                      <div key={a.id} title={a.desc}
                        className={"ach" + (a.unlocked ? " is-unlocked" : "")}
                        style={a.unlocked ? { background: T.bg, borderColor: T.color } : undefined}>
                        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
                          <span className="ach-icon">{a.icon}</span>
                          <span style={{
                            fontSize: 12.5, fontWeight: 700, lineHeight: 1.25,
                            color: a.unlocked ? T.color : "var(--text-3)",
                          }}>{a.name}</span>
                        </div>
                        <div style={{ fontSize: 10.5, color: a.unlocked ? "var(--text-3)" : "var(--text-4)", lineHeight: 1.4, minHeight: 28 }}>
                          {a.desc}
                        </div>
                        {a.unlocked ? (
                          <div style={{ fontSize: 9.5, color: T.color, marginTop: 5, opacity: 0.75, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                            {T.name}{a.earnedAt ? ` · ${fiDate(new Date(a.earnedAt))}` : ""}
                          </div>
                        ) : (
                          <div style={{ marginTop: 6 }}>
                            <div style={{ height: 3, borderRadius: "2px", background: "var(--surface-2)", overflow: "hidden" }}>
                              <div style={{ height: "100%", width: `${(a.cur / a.target) * 100}%`, background: T.color, opacity: 0.6 }} />
                            </div>
                            <div style={{ fontSize: 9.5, color: "var(--text-4)", marginTop: 3 }}>{a.cur} / {a.target}</div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        )}

        {/* ---------- LÄMPÖKARTTA (pohjalla) ---------- */}
        {stats.total > 0 && (
          <section className="panel" style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8, gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                Viimeiset 3 kuukautta
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, color: "var(--text-3)" }}>
                vähän
                {["var(--surface-2)", "#5A4520", "#8A6B2C", "var(--gold-mid)", "var(--gold)"].map(c => (
                  <span key={c} style={{ width: 9, height: 9, borderRadius: "2px", background: c, display: "inline-block" }} />
                ))}
                paljon
              </span>
            </div>
            <Heatmap byDay={momentum.byDay} />
            <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-3)" }}>
              {momentum.best > 0
                ? `Pisin putki: ${momentum.best} pv · ${momentum.byDay.size} aktiivista päivää · yhteensä ${momentum.totalSteps} askelta`
                : "Ei vielä merkintöjä"}
            </div>
          </section>
        )}

        {/* ---------- SELITE ---------- */}
        {stats.total > 0 && (
          <footer style={{ marginTop: 20, borderTop: "1px solid var(--line-soft)", paddingTop: 12 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", fontSize: 12, color: "var(--text-2)" }}>
              {STAGES.map(st => (
                <span key={st.key} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ width: 14, height: 14, borderRadius: "50%", background: st.bg, border: `2px solid ${st.color}`, display: "inline-block" }} />
                  {st.short} = {st.name}
                </span>
              ))}
            </div>
          </footer>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   JUURI — istunnon hallinta
   ============================================================ */
function App() {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false);
  const [swUpdate, setSwUpdate] = useState(null); // odottava service worker
  const [online, setOnline] = useState(navigator.onLine);

  /* ---- verkon tila ---- */
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  /* ---- service worker ---- */
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    });
    navigator.serviceWorker.register("sw.js").then(reg => {
      // jo odottava päivitys
      if (reg.waiting && navigator.serviceWorker.controller) setSwUpdate(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const sw = reg.installing;
        if (!sw) return;
        sw.addEventListener("statechange", () => {
          // uusi versio valmiina, ja vanha on yhä ohjaimissa -> tarjoa päivitystä
          if (sw.state === "installed" && navigator.serviceWorker.controller) setSwUpdate(sw);
        });
      });
    }).catch(e => console.warn("Service workerin rekisteröinti epäonnistui", e));
  }, []);

  useEffect(() => {
    if (!supa) { setReady(true); return; }
    supa.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data: sub } = supa.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const banners = (
    <>
      {!online && (
        <div style={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 60,
          background: "#3A1A1A", borderTop: "1px solid #C05050", color: "#FBEDED",
          padding: "8px 14px", fontSize: 13, textAlign: "center",
          fontFamily: "var(--body)",
        }}>
          ● Ei verkkoyhteyttä — muutokset tallentuvat kun yhteys palaa
        </div>
      )}
      {swUpdate && (
        <div style={{
          position: "fixed", bottom: online ? 12 : 44, left: "50%", transform: "translateX(-50%)", zIndex: 60,
          background: "var(--surface-2)", border: "1px solid var(--gold-deep)", borderRadius: "var(--r2)",
          padding: "8px 10px 8px 14px", display: "flex", alignItems: "center", gap: 10,
          boxShadow: "0 6px 24px rgba(0,0,0,.5)", fontFamily: "var(--body)",
        }}>
          <span style={{ fontSize: 13, color: "var(--text-2)" }}>Uusi versio saatavilla</span>
          <button onClick={() => swUpdate.postMessage("skip-waiting")} style={{
            background: "linear-gradient(135deg,var(--gold-deep),var(--gold-dim))", border: "1px solid var(--gold)",
            borderRadius: "var(--r1)", padding: "6px 12px", color: "#1A1408", fontWeight: 700,
            fontSize: 13, cursor: "pointer",
          }}>Päivitä</button>
        </div>
      )}
    </>
  );

  const center = { minHeight: "100vh", background: "var(--bg)", color: "var(--text-2)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--body)", padding: 20, textAlign: "center" };

  if (!supa) return (
    <div style={center}>
      <div>
        <h1 style={{ fontFamily: "var(--display)", color: "var(--gold)", fontSize: 20 }}>Asetukset puuttuvat</h1>
        <p style={{ maxWidth: 380, lineHeight: 1.6, fontSize: 14 }}>
          Täytä <code style={{ color: "var(--gold-mid)" }}>SUPABASE_URL</code> ja <code style={{ color: "var(--gold-mid)" }}>SUPABASE_ANON_KEY</code> tiedoston <code style={{ color: "var(--gold-mid)" }}>index.html</code> alusta.
        </p>
      </div>
    </div>
  );

  if (!ready) return <div style={center}>Ladataan…</div>;
  if (!session) return <>{banners}<AuthScreen /></>;
  return <>{banners}<Tracker key={session.user.id} session={session} online={online} onSignOut={() => supa.auth.signOut()} /></>;
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
