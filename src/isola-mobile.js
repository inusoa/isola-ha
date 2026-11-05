import { i18nAttach, i18nLang, i18nLoc } from './isola-i18n.js';
/* Isola – l'interfaccia di casa per smartphone (Home Assistant)
 * Isola       = smartphone (questa card: type: custom:isola-mobile)
 * Isola Live  = tablet a parete o hub fisso (type: custom:isola-live)
 * Si configura da sola dalle aree e dai dispositivi di Home Assistant; ogni voce si può cambiare nel YAML della card.
 */
const VERSION = '1.0.0-beta.5';
let IMG_W = 1364, IMG_H = 768;
// ritagli delle stanze sulla foto della casa: room_crops: { Soggiorno: [x0, y0, x1, y1] } (pixel della foto)
const applyCrops = c => { const K = c.room_crops || {}; (c.rooms || []).forEach(r => { if (K[r.name]) r.crop = K[r.name]; }); return c; };
const HIDE_EMPTY = new Set(['weather', 'night', 'tip', 'devices', 'energy', 'people', 'alerts', 's_access', 's_windows', 's_motion', 'r_more', 'y_prob', 'y_bat', 'y_maint', 'y_net', 'y_star', 'y_scripts', 'y_autos', 'y_events']);

// ------------------------------------------------------------------ configurazione
// auto: true = Isola legge aree e dispositivi di Home Assistant e si configura da sola.
// Tutto quello che scrivi nel YAML della card ha la precedenza su ciò che trova da sola.
const DEFAULTS = {
  auto: true,
  image: '',                // foto della casa dall'alto (la stessa di Isola Live), es. /local/isola/casa.jpg
  fullscreen: true,
  z_index: 7,
  sun: 'sun.sun',
  weather: '',
  alarm: '',
  lock: '',
  pv_power: '',
  pv_today: '',
  battery_soc: '', battery_power: '', battery_invert: false,
  battery_kwh: 0, battery_min_soc: 5,
  forecast_factor: '',
  windows: [],
  people: [],
  devices: [],
  rooms: [],
  security: { gate: null, cameras: [], live_when: ['armed_away', 'armed_home', 'armed_night', 'armed_vacation', 'armed_custom_bypass', 'arming', 'pending', 'triggered'], events: [], motion: [] },
  scenes: {},
  casa_live: { title: 'Casa', height: 'fill', mode: 'render' },
  tips: true,
  alerts: true,
  waste: null,              // raccolta differenziata: { today: sensor..., tomorrow: sensor..., from: 17, to: 20 }
  inverter: { strings: [] },
  climates: [],
  co2_kg_kwh: 0.25,
};

// ------------------------------------------------------------------ configurazione automatica
// Costruisce stanze, persone, dispositivi, sicurezza ed energia dalle aree e dalle entità di Home Assistant.
function autoConfig(h) {
  const S = h.states || {}, ids = Object.keys(S), E = h.entities || {}, D = h.devices || {}, A = h.areas || {};
  const dom = id => id.split('.')[0], obj = id => id.split('.')[1];
  const name = id => (S[id]?.attributes?.friendly_name) || obj(id).replace(/_/g, ' ');
  const dc = id => S[id]?.attributes?.device_class || '';
  const visible = id => { const e = E[id]; return !e || (!e.hidden && !e.entity_category); };
  const areaOf = id => { const e = E[id]; if (!e) return null; return e.area_id || (e.device_id && D[e.device_id] ? D[e.device_id].area_id : null) || null; };
  const first = (d, re) => ids.find(id => dom(id) === d && (!re || re.test(id)) && visible(id)) || '';
  const isMap = id => /map|mappa/i.test(id);
  const cfg = {};
  cfg.weather = first('weather');
  cfg.alarm = first('alarm_control_panel');
  cfg.lock = first('lock', /porta|portone|ingresso|front|door|main/) || first('lock');
  // fotovoltaico
  const pvP = ids.find(id => dom(id) === 'sensor' && dc(id) === 'power' && /(pv|solar|solare|fotovolt|inverter).*(power|potenza)|(active|input)_power/.test(id) && !/batter|grid|rete|meter/.test(id));
  const pvT = ids.find(id => dom(id) === 'sensor' && dc(id) === 'energy' && /(pv|solar|solare|fotovolt|inverter|yield|rendimento).*(today|daily|giornalier|oggi|day)/.test(id));
  if (pvP) cfg.pv_power = pvP; if (pvT) cfg.pv_today = pvT;
  // batteria di casa (accumulo): livello in % e potenza di carica/scarica
  const BAT = /^sensor[.](home_?|casa_?)?(batter(y|ia|ies)|storage|accumulo)(_(casa|home|[0-9]+))?_/.source;
  const bS = ids.find(id => new RegExp(BAT + '(soc|state_of_(charge|capacity)|livello|level|charge)$').test(id) && S[id].attributes?.unit_of_measurement === '%');
  const bP = ids.find(id => new RegExp(BAT + '(power|potenza|charge_discharge_power)$').test(id) && dc(id) === 'power');
  if (bS) cfg.battery_soc = bS; if (bP) cfg.battery_power = bP;
  // persone (con la batteria del telefono, se c'è l'app)
  cfg.people = ids.filter(id => dom(id) === 'person').map(id => {
    const p = { entity: id, name: name(id) };
    const tr = (S[id].attributes.device_trackers || []).find(t => /^device_tracker\./.test(t));
    if (tr) { const base = obj(tr); ['battery_level', 'battery_state', 'steps'].forEach(k => { const s2 = 'sensor.' + base + '_' + k; if (S[s2]) p[k === 'battery_level' ? 'battery' : k] = s2; }); }
    return p;
  });
  // finestre e porte
  const openings = ids.filter(id => dom(id) === 'binary_sensor' && /window|door|opening|garage_door/.test(dc(id)) && visible(id));
  cfg.windows = openings.map(id => { const t = name(id).replace(/^(finestra|porta|window|door)\s*/i, '') || name(id); return { entity: id, name: t.charAt(0).toUpperCase() + t.slice(1) }; });
  // telecamere e movimento
  const cams = ids.filter(id => dom(id) === 'camera' && !isMap(id) && visible(id));
  const motion = ids.filter(id => dom(id) === 'binary_sensor' && /motion|occupancy|presence/.test(dc(id)) && visible(id));
  cfg.security = {
    cameras: cams.map(id => ({ entity: id, name: name(id).replace(/\s*(live view|live)$/i, ''), motion: motion.find(m => obj(m).startsWith(obj(id).replace(/_live_view$/, ''))) || '' })),
    motion, events: [cfg.alarm, ...ids.filter(id => dom(id) === 'lock'), ...openings, ...motion].filter(Boolean),
  };
  // clima
  cfg.climates = ids.filter(id => dom(id) === 'climate' && visible(id)).map(id => ({ name: name(id), entity: id, prefix: '' }));
  // robot e lavatrice
  const devs = [];
  ids.filter(id => dom(id) === 'vacuum' && visible(id)).forEach(id => devs.push({ type: 'vacuum', name: name(id), entity: id, area_id: areaOf(id),
    battery: S['sensor.' + obj(id) + '_battery_level'] ? 'sensor.' + obj(id) + '_battery_level' : '',
    page: { pattern: obj(id), map: ids.find(x => dom(x) === 'camera' && x.includes(obj(id)) && isMap(x)) || '',
      commands: [['vacuum.start', 'Avvia', 'play'], ['vacuum.pause', 'Pausa', 'pause'], ['vacuum.return_to_base', 'Alla base', 'home'], ['vacuum.locate', 'Trova', 'target']] } }));
  ids.filter(id => dom(id) === 'lawn_mower' && visible(id)).forEach(id => devs.push({ type: 'mower', name: name(id), entity: id, area_id: areaOf(id),
    status: S['sensor.' + obj(id) + '_mower_status'] ? 'sensor.' + obj(id) + '_mower_status' : '',
    battery: S['sensor.' + obj(id) + '_battery'] ? 'sensor.' + obj(id) + '_battery' : '',
    page: { pattern: obj(id), commands: [['lawn_mower.start_mowing', 'Avvia', 'play'], ['lawn_mower.pause', 'Pausa', 'pause'], ['lawn_mower.dock', 'Alla base', 'home']] } }));
  ids.filter(id => dom(id) === 'sensor' && /(washer|washing|lavatrice).*(machine_state|state|stato)$/.test(id)).forEach(id => {
    const base = id.replace(/_(machine_state|state|stato)$/, '').replace(/^sensor\./, '');
    devs.push({ type: 'washer', name: /lavatric/i.test(id) ? 'Lavatrice' : 'Lavatrice', entity: id, area_id: areaOf(id),
      job: S['sensor.' + base + '_job_state'] ? 'sensor.' + base + '_job_state' : '', end: S['sensor.' + base + '_completion_time'] ? 'sensor.' + base + '_completion_time' : '',
      page: { pattern: base } });
  });
  // stanze = aree di Home Assistant
  const rooms = {};
  const add = (aid, item) => { if (!aid || !A[aid]) return; (rooms[aid] ||= { name: A[aid].name, path: aid, crop: null, items: [] }).items.push(item); };
  ids.filter(visible).forEach(id => {
    const d = dom(id), a = areaOf(id); if (!a) return;
    if (d === 'light') add(a, { type: 'light', entity: id, name: name(id) });
    else if (d === 'switch' && !/siren|sirena/.test(id)) add(a, { type: 'switch', entity: id, name: name(id) });
    else if (d === 'media_player') add(a, { type: 'media', entity: id, name: name(id) });
    else if (d === 'climate') add(a, { type: 'climate', entity: id, name: name(id) });
    else if (d === 'lock') add(a, { type: 'lock', entity: id, name: name(id) });
    else if (d === 'camera' && !isMap(id)) add(a, { type: 'camera', entity: id, name: name(id) });
    else if (d === 'binary_sensor' && /window|door|opening/.test(dc(id))) add(a, { type: 'window', entity: id, name: name(id) });
    else if (d === 'binary_sensor' && /motion|occupancy|presence/.test(dc(id))) add(a, { type: 'motion', entity: id, name: name(id) });
    else if (d === 'sensor' && /temperature|humidity/.test(dc(id)) && !devs.some(x => id.includes(x.page?.pattern || '§'))) add(a, { type: 'sensor', entity: id, name: name(id) });
  });
  devs.forEach(x => { if (x.area_id && A[x.area_id]) { x.room = A[x.area_id].name; rooms[x.area_id] ||= { name: A[x.area_id].name, path: x.area_id, crop: null, items: [] }; } delete x.area_id; });
  cfg.devices = devs;
  cfg.rooms = Object.values(rooms).sort((p, q) => p.name.localeCompare(q.name, 'it'));
  // scene e script con nomi riconoscibili
  const scr = ids.filter(id => /^(script|scene)\./.test(id));
  const pick = re => scr.find(id => re.test(id) || re.test(name(id).toLowerCase()));
  const sc = {}, mk = (id, label) => id ? { name: label, action: dom(id) + '.turn_on', target: id } : null;
  const n = pick(/notte|night|buonanotte|dormire/), o = pick(/esco|fuori|away|leave|uscita/), hm = pick(/sono_a_casa|arrivo|rientro|welcome|home/), m = pick(/buongiorno|morning|sveglia/);
  if (m) sc.morning = mk(m, 'Buongiorno'); if (o) sc.out = mk(o, 'Esco'); if (n) sc.night = mk(n, 'Notte'); if (hm) sc.home = mk(hm, 'Sono a casa');
  cfg.scenes = sc;
  cfg.casa_live = { weather: cfg.weather };
  return cfg;
}

// ------------------------------------------------------------------ utilità
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = (v, d = 0) => Number(v).toLocaleString(i18nLoc(), { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: 'always' });
const hhmm = d => d.toLocaleTimeString(i18nLoc(), { hour: '2-digit', minute: '2-digit' });
const BAD = /^(unknown|unavailable|none|)$/i;
const GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const dayName = (d, now = new Date()) => { const t = new Date(now); if (sameDay(d, t)) return 'oggi'; t.setDate(t.getDate() + 1); if (sameDay(d, t)) return 'domani'; return GIORNI[d.getDay()]; };
const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
const deepMerge = (a, b) => { const o = { ...a }; for (const k of Object.keys(b || {})) o[k] = (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k])) ? deepMerge(a[k], b[k]) : b[k]; return o; };

// ------------------------------------------------------------------ icone (tratto, 24×24)
const I = {
  casa: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  energia: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  sicurezza: '<path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6z"/>',
  stanze: '<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h10"/>',
  arrow: '<path d="M7 17 17 7M8 7h9v9"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  cloudsun: '<path d="M8 5V3M3.5 7.5 2 6M13 6.5 14.5 5"/><path d="M5 11a3 3 0 0 1 5.6-1.5"/><path d="M8 20h9a4 4 0 0 0 0-8 5 5 0 0 0-9.6 1.5A3.3 3.3 0 0 0 8 20z"/>',
  cloud: '<path d="M7 19h10a5 5 0 0 0 .5-10 6 6 0 0 0-11.4 2A4 4 0 0 0 7 19z"/>',
  rain: '<path d="M7 15h10a5 5 0 0 0 .5-10 6 6 0 0 0-11.4 2A4 4 0 0 0 7 15z"/><path d="M8 18l-1 3M12 18l-1 3M16 18l-1 3"/>',
  storm: '<path d="M7 15h10a5 5 0 0 0 .5-10 6 6 0 0 0-11.4 2A4 4 0 0 0 7 15z"/><path d="M12 15l-2 4h4l-2 4"/>',
  snow: '<path d="M7 15h10a5 5 0 0 0 .5-10 6 6 0 0 0-11.4 2A4 4 0 0 0 7 15z"/><path d="M8 19h.01M12 21h.01M16 19h.01"/>',
  fog: '<path d="M4 10h16M6 14h12M8 18h8M5 6h14"/>',
  wind: '<path d="M3 8h11a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h8"/>',
  sunset: '<path d="M7 18a5 5 0 0 1 10 0M2 18h20M12 6v5M4.9 10.9l1.4 1.4M19.1 10.9l-1.4 1.4M9 9l3-3 3 3"/>',
  drop: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
  home: '<path d="M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z"/>',
  work: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
  pin: '<path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>',
  away: '<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 16l4-4-4-4M14 12H4"/>',
  shoe: '<path d="M7 4c2 0 3 2 3 5s-1 5-3 5-3-2-3-5 1-5 3-5zM6 17h3v3H6zM16 8c2 0 3 2 3 5s-1 5-3 5-3-2-3-5 1-5 3-5z"/>',
  exit: '<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><path d="M10 16l-4-4 4-4M6 12h10"/>',
  enter: '<path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4"/><path d="M14 16l4-4-4-4M18 12H8"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  flame: '<path d="M12 22c4 0 7-2.8 7-6.8 0-3.6-2.4-5.9-4.2-8.2-.5 2-1.6 3.1-2.8 3.6.2-3-1.2-5.8-3.5-7.6.2 3.3-3.5 6.4-3.5 12.2C5 19.2 8 22 12 22z"/>',
  tower: '<path d="M12 2 7 22M12 2l5 20M8 10h8M6.5 16h11"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  broom: '<path d="M14 4l6 6M4 20l7-7M9 11l4 4-5 5H4v-4z"/>',
  fan: '<circle cx="12" cy="12" r="2"/><path d="M12 10c0-4 1-7 4-7 2 0 3 2 2 4l-4 3M14 12c4 0 7 1 7 4 0 2-2 3-4 2l-3-4M12 14c0 4-1 7-4 7-2 0-3-2-2-4l4-3M10 12c-4 0-7-1-7-4 0-2 2-3 4-2l3 4"/>',
  disk: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M7 15h.01M11 15h6"/>',
  temp: '<path d="M10 14V5a2 2 0 0 1 4 0v9a4 4 0 1 1-4 0z"/>',
  chip: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
  siren: '<path d="M6 18v-6a6 6 0 0 1 12 0v6M4 18h16v3H4zM12 2v2M4.2 5.2l1.4 1.4M19.8 5.2l-1.4 1.4"/>',
  offline: '<path d="M2 8.5a15 15 0 0 1 20 0M5 12a10 10 0 0 1 14 0M8.5 15.5a5 5 0 0 1 7 0M12 19h.01M3 3l18 18"/>',
  batlow: '<rect x="2" y="7" width="17" height="10" rx="2.5"/><path d="M22 10v4M5 10v4"/>',
  update: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  backup: '<path d="M7 18h10a5 5 0 0 0 .5-10 6 6 0 0 0-11.4 2A4 4 0 0 0 7 18z"/><path d="M12 15v-5M9.5 12.5 12 10l2.5 2.5"/>',
  shieldoff: '<path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  unlock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>',
  gate: '<path d="M4 21V5M20 21V5M4 9h16M4 15h16M9 5v16M15 5v16"/>',
  faceid: '<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M9 9v1M15 9v1M12 9v4h-1M9.5 16a3.5 3.5 0 0 0 5 0"/>',
  window: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M12 3v18M4 12h16"/>',
  motion: '<circle cx="13" cy="4" r="2"/><path d="M7 21l3-6 3 2v4M10 15l1-6 4 3 3 1M8 10l3-1"/>',
  back: '<path d="M15 18l-6-6 6-6"/>',
  bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
  lamp: '<path d="M8 3h8l-1 6H9zM12 9v3M9 21h6M12 12a4 4 0 0 1 0 8"/>',
  tv: '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8"/>',
  gauge: '<path d="M4 18a8 8 0 1 1 16 0M12 18l4-6"/>',
  chev: '<path d="M9 6l6 6-6 6"/>',
  chevup: '<path d="M6 15l6-6 6 6"/>',
  play: '<path d="M7 4.5v15l12-7.5z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>',
  sistema: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  bin: '<path d="M3 7h18M8 7V5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M5 7l1 13a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1l1-13"/>',
};
const svg = (name, size = 22, sw = 1.8, extra = '') => `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" ${extra}>${I[name] || ''}</svg>`;

// icone animate dei dispositivi (48×48)
const DEV_SVG = {
  vacuum: `<g class="a-body"><circle cx="24" cy="24" r="15" fill="currentColor" fill-opacity=".14" stroke-width="2"/><path d="M13.5 15.5a14 14 0 0 1 21 0" stroke-width="2.4"/><circle class="a-lidar" cx="24" cy="23" r="4.5" fill="currentColor" stroke="none"/><g class="a-brush"><path d="M13 32h5.5M13 32l-2.8 4.8M13 32l-2.8-4.8" stroke-width="1.6"/></g></g>`,
  washer: `<defs><clipPath id="isola-drum"><circle cx="24" cy="28" r="7.6"/></clipPath></defs><g class="w-shell"><rect x="9" y="6" width="30" height="36" rx="5" fill="currentColor" fill-opacity=".1" stroke-width="2"/><path d="M9 14h30" stroke-width="1.6"/><circle cx="14.5" cy="10" r="1.4" fill="currentColor" stroke="none"/><circle cx="19" cy="10" r="1.4" fill="currentColor" stroke="none"/><circle cx="24" cy="28" r="9.6" stroke-width="2"/><g clip-path="url(#isola-drum)"><g class="w-drum"><path d="M14 30q5-3.5 10 0t10 0V38H14z" fill="currentColor" fill-opacity=".45" stroke="none"/><circle cx="21" cy="24.5" r="2.2" fill="currentColor" stroke="none"/><circle cx="28" cy="31.5" r="1.6" fill="currentColor" fill-opacity=".8" stroke="none"/></g></g></g>`,
  mower: `<path d="M3 42.5h42" stroke-width="1.4" stroke-opacity=".35"/><path d="M5 42v-2M8.5 42v-2M12 42v-2" stroke-width="1.6"/><g class="m-body"><path d="M10 35v-6a4 4 0 0 1 4-4h14l8 6v4z" fill="currentColor" fill-opacity=".16" stroke-width="2"/><rect x="17" y="21" width="8" height="4" rx="2" fill="currentColor" stroke="none"/><g class="m-w1"><circle cx="16" cy="37" r="4.5" fill="var(--surf)" stroke-width="2"/><path d="M16 33.5v7M12.5 37h7" stroke-width="1.4"/></g><g class="m-w2"><circle cx="32" cy="38" r="3.5" fill="var(--surf)" stroke-width="2"/><path d="M32 35.5v5M29.5 38h5" stroke-width="1.4"/></g></g><g class="m-grass"><path d="M38 42l-1-6M41.5 42l1-7M45 42l-1-5" stroke-width="1.6"/></g>`,
  mop: `<path d="M8 44h32" stroke-width="2" stroke-opacity=".35" stroke-dasharray="3 4"/><g class="p-stick"><path d="M24 7v29" stroke-width="2.2"/><path d="M20 7h8" stroke-width="2.4"/><rect x="20.5" y="15" width="7" height="11" rx="2.5" fill="currentColor" fill-opacity=".3" stroke-width="1.8"/></g><rect x="13" y="35" width="22" height="6" rx="3" fill="currentColor" fill-opacity=".2" stroke-width="2"/><circle class="p-bub" cx="14" cy="34" r="1.6" fill="currentColor" stroke="none"/><circle class="p-bub" cx="34" cy="33" r="1.3" fill="currentColor" stroke="none" style="animation-delay:.6s"/><circle class="p-bub" cx="18" cy="32" r="1.1" fill="currentColor" stroke="none" style="animation-delay:1.2s"/>`,
};
DEV_SVG.dishwasher = `<rect x="9" y="6" width="30" height="36" rx="5" fill="currentColor" fill-opacity=".1" stroke-width="2"/><path d="M9 13h30" stroke-width="1.6"/><circle cx="15" cy="9.5" r="1.3" fill="currentColor" stroke="none"/><path d="M14 33h20M16 33v-6M20 33v-8M24 33v-6M28 33v-8M32 33v-6" stroke-width="1.6"/><circle class="d-drop" cx="18" cy="24" r="1.3" fill="currentColor" stroke="none"/><circle class="d-drop" cx="24" cy="22" r="1.3" fill="currentColor" stroke="none" style="animation-delay:.5s"/><circle class="d-drop" cx="30" cy="24" r="1.3" fill="currentColor" stroke="none" style="animation-delay:1s"/>`;
DEV_SVG.oven = `<rect x="7" y="8" width="34" height="32" rx="5" fill="currentColor" fill-opacity=".1" stroke-width="2"/><path d="M7 15h34" stroke-width="1.6"/><circle cx="13" cy="11.5" r="1.3" fill="currentColor" stroke="none"/><circle cx="18" cy="11.5" r="1.3" fill="currentColor" stroke="none"/><rect class="o-glow" x="12" y="20" width="24" height="14" rx="3" fill="currentColor" stroke-width="1.8"/><path class="o-heat" d="M18 29c1.5-1.5-1.5-3 0-4.5M24 29c1.5-1.5-1.5-3 0-4.5M30 29c1.5-1.5-1.5-3 0-4.5" stroke="var(--surf)" stroke-width="1.6"/>`;
DEV_SVG.hob = `<path d="M6 40h36" stroke-width="2" stroke-opacity=".5"/><path d="M12 24h24v10a4 4 0 0 1-4 4H16a4 4 0 0 1-4-4z" fill="currentColor" fill-opacity=".18" stroke-width="2"/><path d="M9 24h30M20 20h8" stroke-width="2"/><path class="h-steam" d="M18 16c-2-2 2-4 0-6" stroke-width="1.8"/><path class="h-steam" d="M24 16c-2-2 2-4 0-6" stroke-width="1.8" style="animation-delay:.6s"/><path class="h-steam" d="M30 16c-2-2 2-4 0-6" stroke-width="1.8" style="animation-delay:1.2s"/>`;
const DEV_COLOR = { vacuum: '#5ED3C3', washer: '#F5B544', mower: '#9BCB6B', mop: '#8EC5F2', dishwasher: '#7FB6FF', oven: '#E8935C', hob: '#FF7A66' };

const WX = {
  sunny: ['Sereno', 'sun', '#F5B544'], 'clear-night': ['Sereno', 'moon', '#C9C2F0'], partlycloudy: ['Poco nuvoloso', 'cloudsun', '#C9D0D4'],
  cloudy: ['Nuvoloso', 'cloud', '#B9C1C6'], fog: ['Nebbia', 'fog', '#B9C1C6'], rainy: ['Pioggia', 'rain', '#8EC5F2'], pouring: ['Pioggia forte', 'rain', '#8EC5F2'],
  lightning: ['Temporale', 'storm', '#C9C2F0'], 'lightning-rainy': ['Temporale', 'storm', '#C9C2F0'], snowy: ['Neve', 'snow', '#F3EFE7'], 'snowy-rainy': ['Nevischio', 'snow', '#F3EFE7'],
  hail: ['Grandine', 'snow', '#F3EFE7'], windy: ['Ventoso', 'wind', '#B9C1C6'], 'windy-variant': ['Ventoso', 'wind', '#B9C1C6'], exceptional: ['Allerta meteo', 'storm', '#FF7A66'],
};
const RAINY = /^(rainy|pouring|lightning-rainy|snowy-rainy|hail|snowy|lightning)$/;
const WIND_DIR = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
const OPT_IT = { sweeping: 'Aspirazione', mopping: 'Lavaggio', sweeping_and_mopping: 'Aspira e lava', mopping_after_sweeping: 'Prima aspira, poi lava', customized_cleaning: 'Personalizzata', quiet: 'Silenziosa', silent: 'Silenziosa', standard: 'Standard', normal: 'Normale', strong: 'Forte', turbo: 'Turbo', max: 'Massima', low: 'Bassa', medium: 'Media', mid: 'Media', high: 'Alta', auto: 'Automatica', on: 'Acceso', off: 'Spento', run: 'Avvia', pause: 'Pausa', stop: 'Stop', none: 'Nessuno', cold: 'Fredda', rinse: 'Risciacquo', spin: 'Centrifuga', wash: 'Lavaggio', rinsehold: 'Stop risciacquo', no_spin: 'Senza centrifuga', nospin: 'Senza centrifuga', fast: 'Veloce', slow: 'Lenta', eco: 'Eco', boost: 'Boost', sleep: 'Notte', comfort: 'Comfort', away: 'Fuori', home: 'Casa', both: 'Entrambe', vertical: 'Verticale', horizontal: 'Orizzontale', diffuse: 'Diffusa', focus: 'Concentrata', middle: 'Media', top: 'Alta', bottom: 'Bassa' };
const NAME_IT = { 'selected map': 'Mappa', 'cleaning mode': 'Modalità di pulizia', 'tight mopping': 'Lavaggio approfondito', 'suction level': 'Potenza di aspirazione', 'volume': 'Volume', 'filter left': 'Filtro residuo', 'main brush left': 'Spazzola principale residua', 'side brush left': 'Spazzola laterale residua', 'mop pad left': 'Panno residuo', 'filter time left': 'Filtro, ore residue', 'main brush time left': 'Spazzola principale, ore residue', 'side brush time left': 'Spazzola laterale, ore residue', 'reset filter': 'Azzera filtro', 'reset main brush': 'Azzera spazzola principale', 'reset side brush': 'Azzera spazzola laterale', 'reset mop pad': 'Azzera panno', 'water volume': 'Quantità d’acqua', 'mop pad humidity': 'Umidità del panno', 'cleaning time': 'Tempo di pulizia', 'cleaned area': 'Area pulita', 'battery level': 'Batteria', 'battery': 'Batteria', 'status': 'Stato', 'current room': 'Stanza attuale', 'water tank': 'Serbatoio acqua', 'cleaning history': 'Ultima pulizia', 'wifi strength': 'Segnale Wi-Fi', 'online': 'Connessione', 'schedule': 'Programma', 'mower status': 'Stato', 'rain sensor active': 'Pioggia rilevata', 'do not disturb': 'Non disturbare', 'carpet boost': 'Spinta sui tappeti', 'child lock': 'Blocco bambini', 'remote control': 'Controllo remoto', 'rinse cycles': 'Risciacqui', 'bubble soak': 'Ammollo a bolle', 'spin level': 'Centrifuga', 'energy saved': 'Energia risparmiata', 'machine state': 'Stato macchina', 'job state': 'Fase', 'completion time': 'Fine prevista', 'map': 'Mappa', 'total cleaning time': 'Tempo totale di pulizia', 'total cleaned area': 'Area totale pulita', 'cleaning count': 'Numero di pulizie', 'first cleaning date': 'Prima pulizia', 'dnd start': 'Inizio non disturbare', 'dnd end': 'Fine non disturbare', 'resume cleaning': 'Riprendi la pulizia', 'auto empty': 'Svuotamento automatico', 'self clean': 'Autopulizia', 'charging': 'In carica', 'vacuum status': 'Stato', 'fresh water tank status': 'Acqua pulita', 'waste water tank status': 'Acqua sporca', 'cleaning method': 'Metodo di pulizia', 'suction mode power': 'Potenza di aspirazione', 'running speed': 'Velocità', 'error': 'Errore', 'state': 'Stato', 'task status': 'Attività', 'mop pad': 'Panno', 'detergent left': 'Detergente residuo' };
const BIN_IT = { battery_charging: ['In carica', 'No'], plug: ['Collegato', 'Scollegato'], power: ['Acceso', 'Spento'], connectivity: ['Online', 'Offline'], moisture: ['Bagnato', 'Asciutto'], problem: ['Problema', 'Ok'], lock: ['Sbloccato', 'Bloccato'], door: ['Aperta', 'Chiusa'], window: ['Aperta', 'Chiusa'], opening: ['Aperto', 'Chiuso'], garage_door: ['Aperta', 'Chiusa'], motion: ['Movimento', 'Nessuno'], occupancy: ['Presenza', 'Nessuno'], presence: ['Presente', 'Assente'], running: ['In funzione', 'Fermo'], update: ['Disponibile', 'Aggiornato'], battery: ['Scarica', 'Ok'], safety: ['Pericolo', 'Ok'], tamper: ['Manomesso', 'Ok'], sound: ['Suono', 'Silenzio'], vibration: ['Vibrazione', 'Ferma'] };
const STATE_IT = { working: 'Taglio in corso', wet: 'Bagnato', dry: 'Asciutto', return: 'Rientro alla base', cleaning: 'Pulizia in corso', docked: 'In base', returning: 'Rientro alla base', paused: 'In pausa', idle: 'Fermo', error: 'Errore', mowing: 'Taglio in corso', leaving: 'In partenza', charging: 'In carica', charged: 'Carico', on: 'Acceso', off: 'Spento', run: 'In funzione', stop: 'Fermo', pause: 'In pausa', locked: 'Chiuso', unlocked: 'Aperto', playing: 'In riproduzione', standby: 'Standby', home: 'A casa', not_home: 'Fuori', armed_home: 'Inserito in casa', armed_away: 'Inserito', armed_night: 'Notte', disarmed: 'Disinserito', triggered: 'Scattato', open: 'Aperto', closed: 'Chiuso', full: 'Pieno', empty: 'Vuoto', normal: 'Ok', unavailable: 'Non disponibile', unknown: '–', heat: 'Caldo', cool: 'Freddo', dry: 'Deumidifica', fan_only: 'Ventola', auto: 'Auto', none: 'Nessuno' };
const JOB = { wash: 'Lavaggio', washing: 'Lavaggio', rinse: 'Risciacquo', rinsing: 'Risciacquo', spin: 'Centrifuga', spinning: 'Centrifuga', drying: 'Asciugatura', dry: 'Asciugatura', weightsensing: 'Pesatura', weight_sensing: 'Pesatura', prewash: 'Prelavaggio', pre_wash: 'Prelavaggio', soaking: 'Ammollo', cooling: 'Raffreddamento', airwash: 'Lavaggio ad aria', aiwash: 'Lavaggio', delaywash: 'Partenza ritardata', finish: 'Finito', finished: 'Finito', none: '' };
const ALARM_TXT = { disarmed: 'allarme disinserito', armed_home: 'allarme inserito in casa', armed_away: 'allarme inserito', armed_night: 'allarme notte', armed_vacation: 'allarme vacanza', armed_custom_bypass: 'allarme inserito', arming: 'allarme in attivazione', pending: 'allarme in attesa', triggered: 'ALLARME SCATTATO' };

// ------------------------------------------------------------------ stile
const CSS = `
:host{display:block}
.app{--bg:#0D1114;--surf:#161C21;--tx:#F3EFE7;--mut:#9AA4AB;--mut2:#B9C1C6;--mut3:#C9D0D4;--line:rgba(243,239,231,.08);--sun:#F5B544;--sea:#5ED3C3;--coral:#FF7A66;--orange:#E8935C;--leaf:#9BCB6B;--water:#8EC5F2;--moon:#C9C2F0;--pill:#F3EFE7;--pillfg:#0D1114;--navbg:rgba(28,35,41,.94);
  background:var(--bg);color:var(--tx);font-family:Manrope,system-ui,-apple-system,'Segoe UI',sans-serif;-webkit-font-smoothing:antialiased;-webkit-tap-highlight-color:transparent}
.app.fs{position:fixed;inset:0;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain}
.app.night{--bg:#090C10;--surf:#12161B;--pill:#C9C2F0;--pillfg:#17132B;--navbg:rgba(20,24,30,.94)}
.page{max-width:560px;margin:0 auto;box-sizing:border-box;padding:calc(env(safe-area-inset-top,0px) + 16px) 20px calc(env(safe-area-inset-bottom,0px) + 124px);display:flex;flex-direction:column;gap:22px}
.app:not(.fs) .page{padding-top:16px}
button{font-family:inherit;color:inherit;-webkit-tap-highlight-color:transparent}
.disp{font-family:'Bricolage Grotesque',Manrope,system-ui,sans-serif;font-weight:700;letter-spacing:-.02em}
.lab{font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--mut)}
.card{background:var(--surf);border-radius:28px;padding:20px;display:flex;flex-direction:column;gap:14px}
.row{display:flex;align-items:center}
.sp{justify-content:space-between}
.mut{color:var(--mut)}
.link{font-size:13px;font-weight:600;color:var(--sea);background:none;border:0;padding:0;cursor:pointer}
.ib{width:44px;height:44px;border-radius:22px;border:1px solid rgba(243,239,231,.14);background:var(--surf);display:grid;place-items:center;cursor:pointer;flex:none}
.bar{display:block;height:4px;border-radius:2px;background:rgba(243,239,231,.12);overflow:hidden}
.bar>i{display:block;height:100%;border-radius:2px}
.bar.ind>i{width:40%!important;animation:ind 1.6s ease-in-out infinite}
@keyframes ind{0%{transform:translateX(-100%)}100%{transform:translateX(260%)}}
[hidden]{display:none!important}

/* intestazione */
.top{display:flex;justify-content:space-between;align-items:center;gap:10px}
.top .lab{flex:1}
h1{margin:0;font-size:40px;line-height:1.02}
h1.alert{color:var(--coral)}
.sub{margin:0;font-size:16px;line-height:1.45;color:var(--mut2)}

/* persone */
.people{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.person{text-align:left;border:0;cursor:pointer;background:var(--surf);border-radius:24px;padding:14px;display:flex;flex-direction:column;gap:12px}
.av{position:relative;width:52px;height:52px;flex:none}
.av .ring{position:absolute;inset:0;border-radius:26px;border:2px solid var(--sea);padding:3px;box-sizing:border-box}
.av.out .ring{border:2px dashed rgba(245,181,68,.75)}
.av .pic{display:grid;place-items:center;width:100%;height:100%;border-radius:50%;background:linear-gradient(135deg,#2C5C57,#1B2B33) center/cover;font-size:18px}
.av .badge{position:absolute;right:-3px;bottom:-3px;width:22px;height:22px;border-radius:11px;background:var(--sea);color:#0D1114;display:grid;place-items:center;border:2px solid var(--surf)}
.av.out .badge{background:var(--sun);color:#2A1D05}
.pname{font-size:16px;font-weight:700}
.pwhere{font-size:12px;font-weight:600;color:var(--sea);line-height:1.3}
.av.out+.pinfo .pwhere{color:var(--sun)}
.pinfo{display:flex;flex-direction:column;gap:1px;min-width:0}
.pstats{display:flex;justify-content:space-between;align-items:center;padding-top:10px;border-top:1px solid var(--line);font-size:12px;font-weight:700}
.pstats span{display:flex;align-items:center;gap:4px}
.heart{transform-box:fill-box;transform-origin:center;animation:beat 1.1s ease-in-out infinite}
@keyframes beat{0%,40%,100%{transform:scale(1)}20%{transform:scale(1.22)}}
.blink{animation:blink 1.6s ease-in-out infinite}
@keyframes blink{0%,100%{opacity:.35}50%{opacity:1}}

/* meteo */
.wx{width:100%;box-sizing:border-box;border-radius:28px;padding:20px;background:linear-gradient(160deg,#1D2A33 0%,var(--surf) 70%);display:flex;flex-direction:column;gap:16px;border:0;text-align:left;cursor:pointer}
.app.night .wx{background:linear-gradient(160deg,#171A2B 0%,var(--surf) 70%)}
.wxnow{display:flex;align-items:center;gap:14px}
.wxt{font-size:52px;line-height:1}
.wxd{flex:1;display:flex;flex-direction:column;gap:2px;text-align:right;font-size:12px;color:var(--mut)}
.wxd b{font-size:16px;color:var(--tx)}
.hours{display:flex;gap:4px}
.hr{flex:1;display:flex;flex-direction:column;align-items:center;gap:7px;padding:10px 0;border-radius:16px;font-size:12px}
.hr.now{background:rgba(243,239,231,.08)}
.hr span{color:var(--mut);font-weight:600}
.hr b{font-size:14px}
.rays{transform-box:fill-box;transform-origin:center;animation:spin 24s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.wxl{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--mut3);padding-top:12px;border-top:1px solid var(--line)}

/* casa live */
.hero{position:relative;display:block;height:236px;border-radius:28px;overflow:hidden;border:0;padding:0;background:var(--surf);cursor:pointer;width:100%;text-align:left}
.hero img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:52% 42%;transform:scale(1.35);transition:filter 1.2s}
.app.night .hero img{filter:brightness(.34) saturate(.55) hue-rotate(-12deg)}
.hero .shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(13,17,20,0) 40%,rgba(13,17,20,.88) 100%)}
.hero .live{position:absolute;top:14px;left:14px;display:flex;align-items:center;gap:7px;padding:6px 11px 6px 9px;border-radius:999px;background:rgba(13,17,20,.62);font-size:12px;font-weight:600}
.hero .live i{width:8px;height:8px;border-radius:4px;background:var(--sea)}
.hero .cap{position:absolute;left:18px;right:18px;bottom:16px;display:flex;justify-content:space-between;align-items:flex-end}
.hero .cap b{font-size:22px;display:block}
.hero .cap small{font-size:13px;color:var(--mut3)}
.hero .go{width:44px;height:44px;border-radius:22px;background:var(--pill);color:var(--pillfg);display:grid;place-items:center}

/* sole */
.dial{position:relative;height:168px}
.dial svg{position:absolute;left:50%;top:0;transform:translateX(-50%)}
.dial .val{position:absolute;left:0;right:0;top:72px;display:flex;flex-direction:column;align-items:center;gap:2px}
.dial .val b{font-size:52px;line-height:1}
.dial .val b small{font-size:20px;font-weight:500;color:var(--mut)}
.dial .val span{font-size:13px;color:var(--mut)}
.dial .t{position:absolute;bottom:0;font-size:12px;color:var(--mut)}
.trio{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));border-top:1px solid var(--line);padding-top:14px}
.trio>div{display:flex;flex-direction:column;gap:3px;min-width:0}
.trio>div+div{padding-left:14px;border-left:1px solid var(--line)}
.trio span{font-size:12px;color:var(--mut)}
.trio b{font-size:18px}
.trio b small{font-size:12px;font-weight:500;color:var(--mut)}
.sunglow{animation:sglow 2.4s ease-in-out infinite}
@keyframes sglow{0%,100%{opacity:.18}50%{opacity:.4}}

/* in funzione */
.grid2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.dev{text-align:left;border:0;cursor:pointer;background:var(--surf);border-radius:22px;padding:16px;display:flex;flex-direction:column;gap:10px}
.dev .ic{width:56px;height:56px;border-radius:18px;display:grid;place-items:center}
.dev b{font-size:16px}
.dev small{font-size:13px;color:var(--mut);line-height:1.35}
.a-body{transform-origin:24px 24px;animation:wander 3.4s ease-in-out infinite}
.a-brush{transform-origin:13px 32px;animation:spin .5s linear infinite}
.a-lidar{animation:blink 1.4s ease-in-out infinite}
@keyframes wander{0%,100%{transform:translate(-1.5px,1px) rotate(-9deg)}50%{transform:translate(1.5px,-1px) rotate(9deg)}}
.w-shell{animation:shake .2s linear infinite}
.w-drum{transform-origin:24px 28px;animation:spin 1.1s linear infinite}
@keyframes shake{0%,100%{transform:translate(0,0)}25%{transform:translate(-.6px,.3px)}75%{transform:translate(.6px,-.3px)}}
.m-body{animation:roll 2.6s ease-in-out infinite}
.m-w1{transform-origin:16px 37px;animation:spin .8s linear infinite}
.m-w2{transform-origin:32px 38px;animation:spin .6s linear infinite}
.m-grass{transform-origin:41px 42px;animation:sway 1.3s ease-in-out infinite}
@keyframes roll{0%,100%{transform:translateX(-2.5px)}50%{transform:translateX(2.5px)}}
@keyframes sway{0%,100%{transform:skewX(-14deg)}50%{transform:skewX(14deg)}}
.p-stick{transform-origin:24px 36px;animation:tilt 1.8s ease-in-out infinite}
.p-bub{animation:rise 1.8s ease-out infinite}
.d-drop{animation:rise 1.5s ease-out infinite}
.o-glow{animation:oglow 2.2s ease-in-out infinite}
@keyframes oglow{0%,100%{fill-opacity:.35}50%{fill-opacity:.85}}
.o-heat{animation:rise 2.2s ease-out infinite}
.h-steam{animation:steam 1.8s ease-out infinite}
@keyframes steam{0%{transform:translateY(2px);opacity:0}30%{opacity:1}100%{transform:translateY(-6px);opacity:0}}
@keyframes tilt{0%,100%{transform:rotate(-13deg)}50%{transform:rotate(13deg)}}
@keyframes rise{0%{transform:translateY(0);opacity:0}20%{opacity:1}100%{transform:translateY(-16px);opacity:0}}
.paused *{animation-play-state:paused!important}

/* consiglio */
.tip{border-radius:24px;padding:16px 18px;background:linear-gradient(135deg,rgba(245,181,68,.16),rgba(245,181,68,.04));border:1px solid rgba(245,181,68,.3);display:flex;gap:14px;align-items:flex-start}
.tip .ti{width:40px;height:40px;border-radius:14px;background:rgba(245,181,68,.18);color:var(--sun);display:grid;place-items:center;flex:none}
.tip b{font-size:15px}
.tip p{margin:4px 0 0;font-size:13px;line-height:1.45;color:var(--mut3)}
.tip .x{width:32px;height:32px;border-radius:16px;border:0;background:rgba(243,239,231,.08);color:var(--mut3);display:grid;place-items:center;cursor:pointer;flex:none}

/* stanze */
.room{text-align:left;border:0;padding:0;cursor:pointer;border-radius:22px;overflow:hidden;background:var(--surf);display:flex;flex-direction:column}
.room .ph{display:block;height:96px;background-repeat:no-repeat}
.app.night .room .ph{filter:brightness(.45) saturate(.6)}
.room .ph.none{display:grid;place-items:center;background:repeating-linear-gradient(135deg,#1A2127 0 10px,var(--surf) 10px 20px);color:var(--mut);font-size:12px;font-weight:600}
.room .rt{padding:12px 14px 14px;display:flex;flex-direction:column;gap:2px}
.room .rt b{font-size:15px}
.room .rt span{font-size:12px;color:var(--mut)}

/* scene */
.scenes{display:flex;gap:10px}
.scene{flex:1;min-width:0;white-space:nowrap;padding:0 8px;height:52px;border-radius:26px;border:1px solid rgba(243,239,231,.14);background:transparent;font-size:14px;font-weight:600;display:flex;align-items:center;justify-content:center;gap:7px;cursor:pointer}
.bigscene{display:flex;align-items:center;gap:14px;padding:16px 18px;border-radius:26px;border:0;background:var(--moon);color:#17132B;text-align:left;cursor:pointer}
.bigscene .bi{width:48px;height:48px;border-radius:16px;background:rgba(23,19,43,.12);display:grid;place-items:center}
.bigscene b{font-size:17px;display:block}
.bigscene small{font-size:12px;opacity:.75}

/* navigazione */
.nav{position:fixed;left:50%;transform:translateX(-50%);width:min(calc(100% - 40px),520px);bottom:calc(env(safe-area-inset-bottom,0px) + 14px);height:68px;border-radius:34px;background:var(--navbg);-webkit-backdrop-filter:blur(18px);backdrop-filter:blur(18px);border:1px solid rgba(243,239,231,.10);display:flex;align-items:center;justify-content:space-between;padding:0 8px;box-sizing:border-box;box-shadow:0 18px 40px rgba(0,0,0,.45);z-index:2}
.app:not(.fs) .nav{position:sticky;transform:none;left:auto;margin:0 auto}
.nav button{width:52px;height:52px;border-radius:26px;border:0;background:transparent;color:var(--mut2);display:grid;place-items:center;cursor:pointer}
.nav button.on{width:auto;padding:0 18px;background:var(--pill);color:var(--pillfg);display:flex;gap:8px;font-size:14px;font-weight:700}

/* fogli e messaggi */
.sheet{position:fixed;inset:0;z-index:5;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,.5)}
.sheet .box{width:min(100%,560px);box-sizing:border-box;background:var(--surf);border-radius:28px 28px 0 0;padding:22px 20px calc(env(safe-area-inset-bottom,0px) + 22px);display:flex;flex-direction:column;gap:16px}
.sheet .box b{font-size:20px}
.sheet .btns{display:flex;gap:10px}
.sheet .btns button{flex:1;height:52px;border-radius:26px;border:1px solid rgba(243,239,231,.16);background:transparent;font-size:15px;font-weight:700;cursor:pointer}
.sheet .btns button.ok{border:0;background:var(--pill);color:var(--pillfg)}
.toast{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(env(safe-area-inset-bottom,0px) + 96px);z-index:6;padding:12px 18px;border-radius:999px;background:var(--pill);color:var(--pillfg);font-size:14px;font-weight:700;box-shadow:0 10px 30px rgba(0,0,0,.4);display:flex;gap:8px;align-items:center;transition:opacity .3s}
.livebox{position:fixed;inset:0;z-index:4;background:#000;display:flex;flex-direction:column}
.livebox .lx{position:absolute;z-index:3;top:calc(env(safe-area-inset-top,0px) + 12px);right:14px;width:44px;height:44px;border-radius:22px;border:0;background:rgba(13,17,20,.7);color:#F3EFE7;display:grid;place-items:center;cursor:pointer}
.livebox .lc{flex:1;min-height:0;padding-top:env(safe-area-inset-top,0px)}
/* energia */
.seg{display:flex;gap:4px;padding:4px;border-radius:999px;background:var(--surf)}
.seg button{flex:1;height:40px;border-radius:999px;border:0;background:transparent;color:var(--mut2);font-size:13px;font-weight:600;cursor:pointer}
.seg button.on{background:var(--sun);color:#2A1D05;font-weight:700}
.flow .fl{fill:none;stroke-width:3.5;stroke-linecap:round;stroke-dasharray:1 8;animation:flow 1s linear infinite}
.flow .fl.rev{animation-direction:reverse}.flow .fl.off{animation:none;opacity:.15}
@keyframes flow{to{stroke-dashoffset:-18}}
.flow .tm{fill:var(--mut);font-size:12px}.flow .tb{fill:var(--tx);font-size:17px;font-weight:700}.flow .ts{fill:var(--mut3);font-size:12px}
.chip{font-size:11px;font-weight:700;color:var(--mut2);background:rgba(243,239,231,.08);padding:3px 8px;border-radius:999px;white-space:nowrap}
.prow{display:flex;flex-direction:column;gap:7px;padding:11px 0;border:0;border-bottom:1px solid rgba(243,239,231,.06);background:none;text-align:left;cursor:pointer;width:100%}
.prow .pn{flex:1;font-size:15px;font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.prow b{font-size:14px;white-space:nowrap}
.erow{display:grid;grid-template-columns:minmax(0,1fr) 150px;align-items:center;gap:10px}
.idle{display:flex;flex-wrap:wrap;gap:6px;padding-top:10px;font-size:12px;color:var(--mut)}.idle span{width:100%}
.idle i{font-style:normal;padding:4px 9px;border-radius:999px;background:rgba(243,239,231,.06);color:var(--mut2)}
.clima{text-align:left;border:0;cursor:pointer;background:var(--surf);border-radius:24px;padding:16px;display:flex;flex-direction:column;gap:10px;min-width:0}
.kv{display:flex;justify-content:space-between;font-size:12px;color:var(--mut);gap:6px}.kv b{color:var(--tx);white-space:nowrap}
.str{display:flex;flex-direction:column;gap:4px;padding:14px;border-radius:20px;background:rgba(245,181,68,.08)}
.str span{font-size:12px;color:var(--mut)}.str b{font-size:24px;line-height:1}.str small{font-size:13px;color:var(--mut);font-weight:500}.str em{font-style:normal;font-size:12px;color:var(--mut3)}
.trio.sm b{font-size:14px}
.note{display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:18px;background:rgba(245,181,68,.10);font-size:13px;color:var(--mut3);line-height:1.4}.note>span{flex:1}.note b{color:var(--tx)}
.pbtn{flex:none;height:34px;padding:0 14px;border-radius:17px;border:0;background:var(--sun);color:#2A1D05;font-size:12px;font-weight:700;cursor:pointer}.pbtn.warn{background:var(--coral);color:#2A0D08}
.ax{fill:var(--mut);font-size:9.5px}
.legend{display:flex;flex-wrap:wrap;gap:8px 14px;font-size:12px;color:var(--mut3)}.legend span{display:flex;align-items:center;gap:6px}.legend i{width:10px;height:10px;border-radius:3px}.legend em{font-style:normal;color:var(--mut)}
.mini{display:flex;padding:3px;border-radius:999px;background:rgba(243,239,231,.06)}
.mini button{height:28px;padding:0 11px;border-radius:14px;border:0;background:transparent;color:var(--mut2);font-size:12px;font-weight:600;cursor:pointer}.mini button.on{background:var(--pill);color:var(--pillfg);font-weight:700}
.foot{font-size:12px;color:var(--mut);padding-top:10px;border-top:1px solid rgba(243,239,231,.06);line-height:1.45}.foot b{color:var(--tx)}
.hb{display:flex;align-items:center;gap:10px;font-size:12px;color:var(--mut)}.hb>span:first-child{width:76px}.hb b{color:var(--tx);font-size:14px;min-width:52px;text-align:right}
.tiles3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.tiles3>div{display:flex;flex-direction:column;gap:3px;padding:12px 10px;border-radius:16px;background:rgba(243,239,231,.04);min-width:0}
.tiles3 span{font-size:11px;color:var(--mut)}.tiles3 b{font-size:15px}.tiles3 em{font-style:normal;font-size:11px;color:var(--mut)}
.ring{display:flex;flex-direction:column;align-items:center;gap:4px;text-align:center}.ring>span{position:relative;width:96px;height:96px}
.ring>span b{position:absolute;inset:0;display:grid;place-items:center;font-size:22px}.ring strong{font-size:14px}.ring em{font-style:normal;font-size:11px;color:var(--mut)}
.trow{display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid rgba(243,239,231,.06)}.trow:last-child{border:0}
.trow span{flex:1;font-size:13px;color:var(--mut3)}.trow b{min-width:64px;text-align:center;font-size:14px}
.trow button{width:34px;height:34px;border-radius:17px;border:1px solid rgba(243,239,231,.16);background:transparent;font-size:18px;line-height:1;cursor:pointer}
.vrow{display:grid;grid-template-columns:1.2fr 1fr 1fr .8fr;gap:4px;font-size:13px;padding:9px 0;border-top:1px solid rgba(243,239,231,.06);align-items:baseline}
.vrow>*:not(:first-child){text-align:right}.vrow>span:first-child{font-weight:600}.vrow>span:nth-child(2){color:var(--mut)}.vrow em{font-style:normal;font-weight:700}
.vrow.vh{font-size:11px;color:var(--mut);border:0;padding:0 0 4px}.vrow.vh>span{font-weight:400!important}
.chips{display:flex;flex-wrap:wrap;gap:6px}
.chips button{height:32px;padding:0 12px;border-radius:16px;border:1px solid rgba(243,239,231,.14);background:transparent;font-size:12px;font-weight:600;cursor:pointer}.chips button.on{background:var(--pill);color:var(--pillfg);border-color:transparent}
.inp{display:flex;align-items:center;gap:10px;font-size:13px;color:var(--mut3)}.inp span{flex:1}
.inp input{width:110px;height:40px;box-sizing:border-box;border-radius:14px;border:1px solid rgba(243,239,231,.14);background:rgba(243,239,231,.04);color:var(--tx);font:inherit;font-size:15px;font-weight:700;text-align:right;padding:0 12px}
.months{height:170px;display:flex;align-items:stretch;gap:5px;padding-top:52px}
.mb{position:relative;flex:1;height:100%;display:flex;flex-direction:column;justify-content:flex-end;border:0;padding:0;background:none;cursor:pointer;min-width:0}.mb:disabled{cursor:default}
.mb>i{display:block;border-radius:6px}.mb .fut{height:10%;border:1px dashed rgba(243,239,231,.18)}
.tipb{position:absolute;left:50%;top:-50px;transform:translateX(-50%);white-space:nowrap;padding:6px 10px;border-radius:12px;background:var(--pill);color:var(--pillfg);font-size:12px;font-weight:700;line-height:1.25;text-align:center;z-index:1}
.tipb.l{left:0;transform:none}.tipb.r{left:auto;right:0;transform:none}
.tipb em{display:block;font-style:normal;font-weight:600;opacity:.7}
.mlab{display:flex;gap:5px;font-size:11px;color:var(--mut)}.mlab span{flex:1;text-align:center}.mlab span.on{color:var(--tx);font-weight:700}
.tile{background:var(--surf);border-radius:22px;padding:16px;display:flex;flex-direction:column;gap:6px;min-width:0}
.tile span{font-size:12px;color:var(--mut)}.tile b{font-size:26px;line-height:1}.tile small{font-size:13px;font-weight:500;color:var(--mut)}.tile em{font-style:normal;font-size:12px;color:var(--mut3)}
.linkcard{display:flex;align-items:center;gap:14px;padding:18px 20px;border-radius:24px;background:var(--surf);border:0;text-align:left;cursor:pointer;color:var(--mut2);width:100%}
.linkcard .li{width:44px;height:44px;border-radius:15px;background:rgba(243,239,231,.08);display:grid;place-items:center}.linkcard b{display:block;font-size:15px;color:var(--tx)}.linkcard small{font-size:12px;color:var(--mut)}
/* avvisi */
.alert{display:flex;align-items:center;gap:12px;padding:14px 16px;border-radius:22px;background:var(--surf);border:1px solid transparent}
.alert[role=button]{cursor:pointer}
.alert.hot{border-color:var(--ac);background:color-mix(in srgb,var(--ac) 12%,var(--surf))}
.alert .ai{width:40px;height:40px;border-radius:14px;display:grid;place-items:center;flex:none;color:var(--ac);background:color-mix(in srgb,var(--ac) 16%,transparent)}
.alert b{display:block;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.alert small{font-size:12px;color:var(--mut)}
.more{height:44px;border-radius:22px;border:1px solid rgba(243,239,231,.14);background:transparent;font-size:13px;font-weight:700;cursor:pointer}
/* sicurezza */
.modes{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.mode{height:86px;border-radius:24px;border:1px solid rgba(243,239,231,.10);background:var(--surf);display:flex;flex-direction:column;align-items:flex-start;justify-content:space-between;padding:14px 16px;cursor:pointer;color:var(--mut2);text-align:left}
.mode b{font-size:15px;color:var(--tx)}
.mode.on{background:var(--coral);color:#2A0D08;border-color:transparent}.mode.on b{color:#2A0D08}
.mode.off.on{background:var(--pill);color:var(--pillfg)}.mode.off.on b{color:var(--pillfg)}
.mini1{height:30px;padding:0 12px;border-radius:15px;border:1px solid rgba(243,239,231,.16);background:transparent;font-size:12px;font-weight:700;cursor:pointer;color:var(--mut2)}
.mini1.on{background:rgba(255,122,102,.16);border-color:transparent;color:var(--coral)}
.cams{display:flex;flex-direction:column;gap:12px}
.cams:empty{display:none}
.cam{position:relative;border-radius:22px;overflow:hidden;background:#05070A;aspect-ratio:16/9;--ha-card-border-radius:0;--ha-card-border-width:0;--ha-card-box-shadow:none}
.camv{position:absolute;inset:0}.camv>*{display:block;width:100%;height:100%}
.camimg{width:100%;height:100%;object-fit:cover;cursor:pointer}
.camn{position:absolute;left:12px;bottom:12px;right:12px;display:flex;align-items:center;gap:8px;pointer-events:none;flex-wrap:wrap}
.camn b{padding:5px 10px;border-radius:999px;background:rgba(13,17,20,.7);font-size:12px}
.camn i{font-style:normal;font-size:11px;font-weight:700;padding:5px 9px;border-radius:999px;background:rgba(13,17,20,.7);color:var(--mut3)}
.camn i:empty{display:none}.camn i.hot{background:var(--coral);color:#2A0D08}
.camlive{position:absolute;top:12px;left:12px;display:flex;align-items:center;gap:6px;padding:5px 10px 5px 8px;border-radius:999px;background:rgba(13,17,20,.7);font-size:11px;font-weight:700;pointer-events:none}
.camlive i{width:8px;height:8px;border-radius:4px;background:var(--coral);animation:blink 1.2s infinite}
.acc,.arow{display:flex;align-items:center;gap:12px;padding:12px 0;border:0;border-bottom:1px solid rgba(243,239,231,.06);background:none;text-align:left;width:100%;font-size:inherit}
.acc:last-child,.arow:last-child{border-bottom:0}
button.arow{cursor:pointer}
.grow{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}.grow b{font-size:15px}.grow small{font-size:12px;color:var(--mut)}
.ai2{width:44px;height:44px;border-radius:15px;background:rgba(243,239,231,.08);display:grid;place-items:center;flex:none;color:var(--mut2)}
.ai2.warn{background:rgba(255,122,102,.16);color:var(--coral)}
.pbtn.ghost{background:transparent;border:1px solid rgba(243,239,231,.18);color:var(--tx)}
.pbtn.light{background:var(--pill);color:var(--pillfg);display:flex;align-items:center;gap:6px;height:40px;padding:0 16px;font-size:14px;border-radius:20px}
.win{display:flex;align-items:center;gap:12px;padding:14px;border-radius:20px;border:1px solid transparent;background:var(--surf);text-align:left;cursor:pointer;color:var(--mut2)}
.win b{display:block;font-size:14px;color:var(--tx)}.win small{font-size:12px;color:var(--mut)}
.win.open{border-color:rgba(255,122,102,.5);background:rgba(255,122,102,.10);color:var(--coral)}.win.open small{color:#FFB3A6}
.mrow{display:flex;align-items:center;gap:12px;padding:11px 0;border:0;border-bottom:1px solid rgba(243,239,231,.06);background:none;width:100%;text-align:left;cursor:pointer;font-size:14px}
.mrow:last-child{border:0}
.mrow i{width:8px;height:8px;border-radius:4px;background:var(--mut);opacity:.5;flex:none}.mrow i.hot{background:var(--coral);opacity:1;animation:blink 1.2s infinite}
.mrow small{font-size:12px;color:var(--mut)}
/* stanze */
.grid2>.room:last-child:nth-child(odd){grid-column:span 2}
.rhero{position:relative;height:300px;margin:calc(-16px - env(safe-area-inset-top,0px)) -20px 0;border-radius:0 0 36px 36px;overflow:hidden;background-color:var(--surf);background-repeat:no-repeat}
.app:not(.fs) .rhero{margin-top:-16px}
.rhero.none{background:repeating-linear-gradient(135deg,#1A2127 0 10px,var(--surf) 10px 20px)}
.rhero .shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(13,17,20,.35) 0%,rgba(13,17,20,0) 35%,rgba(13,17,20,.9) 100%)}
.app.night .rhero .shade{background:linear-gradient(180deg,rgba(9,12,16,.6) 0%,rgba(9,12,16,.45) 40%,rgba(9,12,16,.95) 100%)}
.rhero .back{position:absolute;top:calc(env(safe-area-inset-top,0px) + 16px);left:20px;background:rgba(13,17,20,.6);border:0}
.rcap{position:absolute;left:20px;right:20px;bottom:22px;display:flex;flex-direction:column;gap:6px}.rcap span{font-size:15px;color:var(--mut3)}
.rsec{display:flex;flex-direction:column;gap:12px}
.lt{background:var(--surf);border-radius:24px;display:flex;flex-direction:column;overflow:hidden;min-width:0}.lt.on{background:var(--sun);color:#2A1D05}
.ltb{height:112px;border:0;background:none;color:inherit;text-align:left;padding:16px;display:flex;flex-direction:column;justify-content:space-between;cursor:pointer}
.ltb b{display:block;font-size:15px}.ltb small{font-size:12px;opacity:.75}
.noimg{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;color:rgba(243,239,231,.55);background:radial-gradient(120% 90% at 30% 20%,#2a3b33,#141a1d 70%)}
.noimg small{font-size:13px}
.bri{-webkit-appearance:none;appearance:none;margin:0 14px 14px;height:28px;border-radius:14px;background:rgba(42,29,5,.18);outline:none}
.bri::-webkit-slider-thumb{-webkit-appearance:none;width:28px;height:28px;border-radius:14px;background:#2A1D05;border:3px solid var(--sun)}
.bri::-moz-range-thumb{width:24px;height:24px;border-radius:12px;background:#2A1D05;border:3px solid var(--sun)}
.arow .val{font-size:14px;font-weight:700;color:var(--tx)}
.arow.card2{background:var(--surf);border-radius:22px;padding:12px 16px;border:0}
.arow.ph{opacity:.7}
.sw{width:52px;height:32px;border-radius:16px;border:0;background:rgba(243,239,231,.16);position:relative;cursor:pointer;flex:none;padding:0}
.sw i{position:absolute;left:4px;top:4px;width:24px;height:24px;border-radius:12px;background:#F3EFE7;transition:transform .2s}
.sw.on{background:var(--sun)}.sw.on i{transform:translateX(20px);background:#2A1D05}
.dcard{background:var(--surf);border-radius:24px;padding:16px;display:flex;flex-direction:column;gap:12px}
.dcard .ic{width:64px;height:64px;border-radius:20px;display:grid;place-items:center;border:0;cursor:pointer;flex:none}
.dcard .grow small{font-size:13px;line-height:1.35}
.dcard.rest *{animation:none!important}
.rnd{width:52px;height:52px;border-radius:26px;border:1px solid rgba(243,239,231,.18);background:transparent;font-size:24px;cursor:pointer}
.sheet input{height:52px;border-radius:16px;border:1px solid rgba(243,239,231,.16);background:rgba(243,239,231,.05);color:var(--tx);font:inherit;font-size:22px;letter-spacing:.3em;text-align:center}
/* pagine complete */
.crow{display:flex;align-items:center;gap:12px;min-height:52px;padding:8px 0;border:0;border-bottom:1px solid rgba(243,239,231,.06);background:none;width:100%;text-align:left;cursor:default;font-size:14px}
.crow:last-child{border-bottom:0}
button.crow{cursor:pointer}
.crow .cn{flex:1;min-width:0;font-size:14px;line-height:1.3}
.crow .cn small{font-size:12px;color:var(--mut)}
.crow .cv{font-size:14px;font-weight:700;text-align:right;max-width:55%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cpick{display:flex;align-items:center;gap:4px;height:36px;padding:0 10px 0 14px;border-radius:18px;border:1px solid rgba(243,239,231,.16);background:rgba(243,239,231,.04);font-size:13px;font-weight:700;cursor:pointer;max-width:60%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cnum{display:flex;align-items:center;gap:8px}
.cnum button{width:34px;height:34px;border-radius:17px;border:1px solid rgba(243,239,231,.16);background:transparent;font-size:18px;line-height:1;cursor:pointer}
.cnum b{min-width:56px;text-align:center;font-size:14px}.cnum small{font-size:11px;color:var(--mut);font-weight:500}
.opts{display:flex;flex-direction:column;gap:6px;max-height:50vh;overflow:auto}
.opts button{display:flex;align-items:center;justify-content:space-between;height:50px;padding:0 16px;border-radius:16px;border:0;background:rgba(243,239,231,.05);font-size:15px;font-weight:600;cursor:pointer;text-align:left}
.opts button.on{background:var(--pill);color:var(--pillfg)}
.dhero{display:flex;flex-direction:column;align-items:center;gap:10px;padding:8px 0 4px;text-align:center}
.dhero .ic{width:104px;height:104px;border-radius:32px;border:0;display:grid;place-items:center;cursor:pointer;color:var(--dc);background:color-mix(in srgb,var(--dc) 16%,transparent)}
.dhero h1{font-size:40px;line-height:1}
.dhero.rest *{animation:none!important}
.cmds{display:grid;grid-template-columns:repeat(auto-fit,minmax(78px,1fr));gap:10px}
.cmds button{height:76px;border-radius:22px;border:0;background:var(--surf);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;font-size:12px;font-weight:700;cursor:pointer}
.cmds button:active{background:var(--pill);color:var(--pillfg)}
.map{position:relative;display:block;width:100%;border:0;padding:0;border-radius:22px;overflow:hidden;background:#05070A;cursor:pointer;min-height:180px}
.map img{display:block;width:100%;height:auto}
.ctip{display:flex;flex-wrap:wrap;gap:4px 12px;padding:10px 12px;border-radius:14px;background:rgba(243,239,231,.06);font-size:12px;color:var(--mut3)}
.ctip b{width:100%;color:var(--tx)}.ctip span{display:flex;align-items:center;gap:5px}.ctip i{width:8px;height:8px;border-radius:2px}.ctip em{font-style:normal;color:var(--tx);font-weight:700}
.lgb{display:flex;align-items:center;gap:6px;height:30px;padding:0 10px;border-radius:15px;border:1px solid rgba(243,239,231,.12);background:transparent;font-size:12px;cursor:pointer;color:var(--mut3)}
.lgb i{width:10px;height:10px;border-radius:3px}.lgb.off{opacity:.4}.lgb.off i{background:transparent!important;border:1px solid var(--mut)}
.lg{display:inline-block;width:8px;height:8px;border-radius:2px;margin:0 4px 0 8px}
.tile:disabled{cursor:default}
@media (prefers-reduced-motion: reduce){*{animation:none!important}}
`;

// ------------------------------------------------------------------ la card
class IsolaCard extends HTMLElement {
  static getStubConfig() { return {}; }
  getCardSize() { return 12; }
  setConfig(config) {
    this._user = config || {}; this._autoKey = null;
    this._config = applyCrops(deepMerge(DEFAULTS, this._user));
    this._cache = {};
    if (this._root) this._build();
  }
  set hass(h) {
    this._hass = h;
    i18nLang(h, this._user && this._user.language);
    // configurazione automatica (si rifà se cambiano aree o entità)
    if (this._user && this._user.auto !== false) {
      const key = Object.keys(h.states || {}).length + '|' + Object.keys(h.areas || {}).length;
      if (key !== this._autoKey) {
        this._autoKey = key;
        try { this._config = applyCrops(deepMerge(deepMerge(DEFAULTS, autoConfig(h)), this._user)); this._cache = {}; if (this._root) this._build(); }
        catch (e) { console.error('isola: configurazione automatica', e); }
      }
    }
    // dimensione vera della foto (servono i pixel per i ritagli delle stanze)
    const im0 = this._config.image;
    if (im0 && this._imgSrc !== im0) { this._imgSrc = im0; const im = new Image(); im.onload = () => { if (im.naturalWidth && (im.naturalWidth !== IMG_W || im.naturalHeight !== IMG_H)) { IMG_W = im.naturalWidth; IMG_H = im.naturalHeight; this._cache = {}; if (this._root) this._build(); } }; im.src = im0; }
    if (this._briWant) { const b = h.states[this._briWant.id]?.attributes?.brightness; if (b != null && Math.abs(Math.round(b / 2.55) - this._briWant.pct) <= 2) this._briDone(); }
    if (!this._root) this._build();
    if (this._live) this._live.hass = h;
    (this._camEls || []).forEach(e => { e.hass = h; });
    this._subscribe();
    this._schedule();
  }
  connectedCallback() {
    this._timer = setInterval(() => this._schedule(true), 30000);
    if (this._hass) this._subscribe();
  }
  disconnectedCallback() {
    clearInterval(this._timer);
    this._unsub();
  }

  // ---------------------------------------------------------------- struttura
  _build() {
    if (!document.getElementById('isola-fonts')) {
      const l = document.createElement('link'); l.id = 'isola-fonts'; l.rel = 'stylesheet';
      l.href = 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700&family=Manrope:wght@400;500;600;700&display=swap';
      document.head.appendChild(l);
    }
    if (!this._root) { this._root = this.attachShadow({ mode: 'open' }); i18nAttach(this._root); }
    const c = this._config;
    this._root.innerHTML = `<style>${CSS}</style>
      <div class="app${c.fullscreen ? ' fs' : ''}" style="${c.fullscreen ? 'z-index:' + (+c.z_index || 7) : ''}">
        <div class="page" data-page="casa">
          <header style="display:flex;flex-direction:column;gap:8px">
            <div class="top">
              <button class="ib" data-act="menu" aria-label="Menu di Home Assistant" ${c.fullscreen ? '' : 'hidden'}>${svg('menu', 20)}</button>
              <span class="lab" data-s="date"></span>
              <button class="ib" data-act="assist" aria-label="Assist, parla con la casa">${svg('mic', 20)}</button>
            </div>
            <h1 class="disp" data-s="title"></h1>
            <p class="sub" data-s="subtitle"></p>
          </header>
          <section class="people" data-s="people" aria-label="Chi c'è"></section>
          <div data-s="weather" hidden></div>
          <button class="hero" data-act="live" aria-label="Apri Isola Live">
            ${c.image ? `<img src="${esc(c.image)}" alt="La casa vista dall'alto">` : `<span class="noimg" aria-hidden="true">${svg('casa', 64, 1.2)}<small>Aggiungi la foto della casa in Isola Live</small></span>`}
            <span class="shade"></span>
            <span class="live"><i></i>Live</span>
            <span class="cap"><span><b class="disp">Isola Live</b><small data-s="herosub"></small></span><span class="go">${svg('arrow', 20, 2)}</span></span>
          </button>
          <div data-s="night" hidden></div>
          <section class="card" data-s="energy" aria-label="Il sole" hidden></section>
          <section data-s="devices" aria-label="In funzione" hidden></section>
          <section data-s="alerts" aria-label="Avvisi" hidden></section>
          <div data-s="tip" hidden></div>
          <section style="display:flex;flex-direction:column;gap:12px" aria-label="Stanze">
            <span class="lab">Stanze</span>
            <div class="grid2" data-s="rooms"></div>
          </section>
          <section class="scenes" data-s="scenes" aria-label="Scene"></section>
        </div>
        <div class="page" data-page="energia" hidden>
          <header style="display:flex;flex-direction:column;gap:8px">
            <div class="top">
              <button class="ib" data-act="menu" aria-label="Menu di Home Assistant" ${c.fullscreen ? '' : 'hidden'}>${svg('menu', 20)}</button>
              <span class="lab" data-s="e_kick"></span>
              <button class="ib" data-act="assist" aria-label="Assist, parla con la casa">${svg('mic', 20)}</button>
            </div>
            <h1 class="disp" data-s="e_title"></h1>
            <p class="sub" data-s="e_sub" hidden></p>
          </header>
          <nav class="seg" data-s="e_seg" aria-label="Sezioni energia"></nav>
          <div data-s="e_body" style="display:flex;flex-direction:column;gap:22px"></div>
        </div>
        <div class="page" data-page="sicurezza" hidden>
          <header style="display:flex;flex-direction:column;gap:8px">
            <div class="top">
              <button class="ib" data-act="menu" aria-label="Menu di Home Assistant" ${c.fullscreen ? '' : 'hidden'}>${svg('menu', 20)}</button>
              <span class="lab" data-s="s_kick"></span>
              <button class="ib" data-act="assist" aria-label="Assist, parla con la casa">${svg('mic', 20)}</button>
            </div>
            <h1 class="disp" data-s="s_title"></h1>
            <p class="sub" data-s="s_sub"></p>
          </header>
          <div data-s="s_modes"></div>
          <section class="rsec" aria-label="Telecamere"><div data-s="s_camhead"></div><div class="cams" data-s="s_cams"></div></section>
          <div data-s="s_access" hidden></div>
          <div data-s="s_windows" hidden></div>
          <div data-s="s_motion" hidden></div>
        </div>
        <div class="page" data-page="sistema" hidden>
          <header style="display:flex;flex-direction:column;gap:8px">
            <div class="top">
              <button class="ib" data-act="menu" aria-label="Menu di Home Assistant" ${c.fullscreen ? '' : 'hidden'}>${svg('menu', 20)}</button>
              <span class="lab">Sistema</span>
              <button class="ib" data-act="assist" aria-label="Assist, parla con la casa">${svg('mic', 20)}</button>
            </div>
            <h1 class="disp" data-s="y_title"></h1>
          </header>
          <div data-s="y_sys"></div><div data-s="y_prob" hidden></div><div data-s="y_scenes"></div><div data-s="y_autos" hidden></div><div data-s="y_scripts" hidden></div>
          <div data-s="y_maint" hidden></div><div data-s="y_bat" hidden></div><div data-s="y_net" hidden></div><div data-s="y_star" hidden></div><div data-s="y_events" hidden></div>
        </div>
        <div class="page" data-page="sub" hidden>
          <header style="display:flex;flex-direction:column;gap:8px" data-s="u_head"></header>
          <div data-s="u_main" style="display:flex;flex-direction:column;gap:18px"></div>
        </div>
        <div class="page" data-page="stanze" hidden>
          <div class="rlist" style="display:flex;flex-direction:column;gap:22px">
            <header style="display:flex;flex-direction:column;gap:8px">
              <div class="top">
                <button class="ib" data-act="menu" aria-label="Menu di Home Assistant" ${c.fullscreen ? '' : 'hidden'}>${svg('menu', 20)}</button>
                <span class="lab">Stanze</span>
                <button class="ib" data-act="assist" aria-label="Assist, parla con la casa">${svg('mic', 20)}</button>
              </div>
              <h1 class="disp" data-s="st_title"></h1>
            </header>
            <div class="grid2" data-s="st_rooms"></div>
          </div>
          <div class="rdet" style="display:flex;flex-direction:column;gap:22px" hidden>
            <div data-s="r_head"></div>
            <div data-s="r_main" style="display:flex;flex-direction:column;gap:22px"></div>
            <section class="rsec" aria-label="Telecamere"><div data-s="r_camhead"></div><div class="cams" data-s="r_cams"></div></section>
            <div data-s="r_more" hidden></div>
          </div>
        </div>
        <nav class="nav" aria-label="Navigazione">
          <button data-act="page" data-to="casa" data-l="Casa" aria-label="Casa">${svg('casa')}</button>
          <button data-act="page" data-to="energia" data-l="Energia" aria-label="Energia">${svg('energia')}</button>
          <button data-act="page" data-to="sicurezza" data-l="Sicurezza" aria-label="Sicurezza">${svg('sicurezza')}</button>
          <button data-act="page" data-to="stanze" data-l="Stanze" aria-label="Stanze">${svg('stanze')}</button>
          <button data-act="page" data-to="sistema" data-l="Sistema" aria-label="Sistema">${svg('sistema')}</button>
        </nav>
        <div data-s="overlay"></div>
      </div>`;
    this._app = this._root.querySelector('.app');
    this._slots = {};
    this._root.querySelectorAll('[data-s]').forEach(e => { this._slots[e.dataset.s] = e; });
    this._cache = {};
    this._app.addEventListener('click', e => this._click(e));
    this._app.addEventListener('change', e => this._change(e));
    // luminosità: mentre trascini il cursore la pagina non si ridisegna e la percentuale si aggiorna dal vivo
    this._app.addEventListener('input', e => {
      const t = e.target; if (!t || !t.dataset || !t.dataset.bri) return;
      this._briDrag = t;
      const sm = t.closest('.lt')?.querySelector('small'); if (sm) sm.textContent = 'Accesa · ' + t.value + '%';
    });
    const briEnd = e => { const t = e.target; if (t && t.dataset && t.dataset.bri && this._briDrag === t) setTimeout(() => { if (this._briDrag === t && !this._briWant) { this._briDrag = null; this._schedule(true); } }, 1500); };
    this._app.addEventListener('pointerup', briEnd); this._app.addEventListener('touchend', briEnd);
    const chartPtr = e => {
      const el = e.target && e.target.closest ? e.target.closest('[data-chart]') : null; if (!el) return;
      if (e.type === 'pointermove' && !e.buttons && e.pointerType === 'mouse') return;
      const r = el.getBoundingClientRect(); this._cf = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); this._schedule();
    };
    this._app.addEventListener('pointerdown', chartPtr);
    this._app.addEventListener('pointermove', chartPtr);
    this._page = this._page || 'casa';
    try { this._etab = this._etab || localStorage.getItem('isola_etab') || 'adesso'; } catch (e) { this._etab = 'adesso'; }
    this._mounted = null;
    this._showPage();
  }
  _showPage() {
    this._root.querySelectorAll('[data-page]').forEach(p => { p.hidden = p.dataset.page !== this._page; });
    this._root.querySelectorAll('.nav button[data-act="page"]').forEach(b => {
      const on = b.dataset.to === (this._page === 'sub' ? this._subFrom : this._page);
      b.classList.toggle('on', on);
      if (on) { b.setAttribute('aria-current', 'page'); b.innerHTML = svg(b.dataset.to, 20, 2) + b.dataset.l; } else { b.removeAttribute('aria-current'); b.innerHTML = svg(b.dataset.to); }
    });
  }

  _schedule(force) {
    if (force) this._cache.minute = null;
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => { this._raf = null; try { this._render(); } catch (err) { console.error('isola-mobile', err); } });
  }
  _set(slot, html) {
    const el0 = this._slots[slot];
    if (this._briDrag && el0 && el0.contains(this._briDrag)) return;   // non interrompere il cursore della luminosità
    if (this._cache[slot] === html) return;
    this._cache[slot] = html;
    const el = this._slots[slot]; if (el) { el.innerHTML = html; if (HIDE_EMPTY.has(slot) || slot.startsWith('x_')) el.hidden = !html; }
  }

  // ---------------------------------------------------------------- dati
  _st(id) { return id && this._hass ? this._hass.states[id] : undefined; }
  _ok(id) { const s = this._st(id); return s && !BAD.test(s.state) ? s : null; }
  _num(id) { const s = this._ok(id); if (!s) return NaN; const v = parseFloat(s.state); return v; }
  _watts(id) {
    const s = this._ok(id); if (!s) return null;
    const v = parseFloat(s.state); if (isNaN(v)) return null;
    const u = s.attributes.unit_of_measurement || 'W'; return u === 'kW' ? v * 1000 : u === 'MW' ? v * 1e6 : v;
  }
  _kwh(id) { const s = this._ok(id); if (!s) return NaN; const v = parseFloat(s.state); const u = s.attributes.unit_of_measurement; return u === 'Wh' ? v / 1000 : u === 'MWh' ? v * 1000 : v; }
  _batt() {
    const c = this._config, S = this._hass.states;
    const find = re => Object.keys(S).find(k => re.test(k));
    if (!this._bIds || this._bIds.t < Date.now() - 60000) this._bIds = {
      soc: c.battery_soc || find(/^sensor\.batter(y|ies)(_\d+)?_state_of_capacity$/),
      pw: c.battery_power || find(/^sensor\.batter(y|ies)(_\d+)?_charge_discharge_power$/), t: Date.now() };
    const soc = this._num(this._bIds.soc);
    let p = this._watts(this._bIds.pw); if (p !== null && c.battery_invert) p = -p;
    return { soc, p, id: this._bIds.soc };
  }
  // consumo della casa = somma dei sensori di potenza dei dispositivi (come la card "Potenza adesso")
  _houseW() {
    if (this._hw && Date.now() - this._hw.t < 5000) return this._hw.v;
    const S = this._hass.states;
    const SKIP = /inverter|saved|risparmi|forecast|energy_production|solar_production|energy_current_hour|energy_next|battery|batteria|batteries|difference|differenza|daily|monthly|weekly|yearly|today|yesterday|(^|[_\s])(day|week|month|year)($|[_\s])/i;
    let tot = 0, n = 0;
    for (const id in S) {
      if (!id.startsWith('sensor.')) continue;
      const st = S[id], a = st.attributes || {};
      if (SKIP.test(id) || SKIP.test(a.friendly_name || '')) continue;
      const u = a.unit_of_measurement;
      if (a.device_class !== 'power' && !(['W', 'kW'].includes(u) && !a.device_class)) continue;
      if (/^sensor\.iphone|^sensor\.(.*_)?grid|rete/i.test(id)) continue;
      const v = parseFloat(st.state); if (isNaN(v)) continue;
      const w = u === 'kW' ? v * 1000 : v; if (w > 0 && w < 10000) { tot += w; n++; }
    }
    this._hw = { v: n ? tot : null, t: Date.now() };
    return this._hw.v;
  }
  _sunTimes() {
    const s = this._st(this._config.sun); if (!s) return null;
    const a = s.attributes, up = s.state === 'above_horizon';
    let rise = a.next_rising ? new Date(a.next_rising) : null, set = a.next_setting ? new Date(a.next_setting) : null;
    if (up && rise) rise = new Date(rise.getTime() - 86400000);           // l'alba di oggi
    if (!up && set && rise && set > rise) set = new Date(set.getTime() - 86400000);
    return { up, rise, set, elev: a.elevation };
  }
  _isNight() { const s = this._st(this._config.sun); return s ? s.state === 'below_horizon' : false; }

  // previsioni meteo (oraria e giornaliera)
  _subscribe() {
    const h = this._hass, w = this._config.weather;
    if (!h || !h.connection || this._subs || !this.isConnected) return;
    this._subs = [];
    const sub = type => h.connection.subscribeMessage(m => { this['_fc_' + type] = m.forecast || []; this._schedule(); },
      { type: 'weather/subscribe_forecast', forecast_type: type, entity_id: w }).then(u => this._subs.push(u)).catch(() => {});
    sub('hourly'); sub('daily');
  }
  _unsub() { (this._subs || []).forEach(u => { try { u(); } catch (e) {} }); this._subs = null; }

  // ---------------------------------------------------------------- dispositivi
  // robot tagliaerba: se c'è il sensore di stato (status) vale quello, perché l'entità principale a volte resta ferma
  _mowSt(d, st) {
    const x = String(this._ok(d.status)?.state || '').toLowerCase(); if (!x) return st;
    if (/work|mow|cut|border|edge|leav/.test(x)) return 'mowing';
    if (/return|back|homing|go.?home|going/.test(x)) return 'returning';
    if (/pause|stop/.test(x)) return 'paused';
    if (/error|fault|alarm|lift|stuck|trap|tilt/.test(x)) return 'error';
    if (/charg|standby|idle|dock|station|sleep|rest/.test(x)) return 'docked';
    return st;
  }
  _device(d) {
    const s = this._st(d.entity); if (!s) return null;
    let st = String(s.state).toLowerCase(); const now = Date.now();
    if (d.type === 'mower') st = this._mowSt(d, st);
    const out = { d, active: false, paused: false, title: d.name, sub: '', pct: null, ind: false, color: DEV_COLOR[d.type] || '#B9C1C6', entity: d.entity };
    if (d.type === 'vacuum') {
      out.active = ['cleaning', 'returning', 'paused'].includes(st);
      out.paused = st === 'paused';
      const room = this._ok(d.current_room)?.state;
      out.sub = st === 'returning' ? 'Torna alla base' : st === 'paused' ? 'In pausa' : room ? 'Pulisce: ' + room.toLowerCase() : 'Sta pulendo';
      const area = this._num(d.area), t = this._num(d.time);
      if (!isNaN(area) && st === 'cleaning') out.sub += ` · ${nf(area)} m²` + (!isNaN(t) ? ` · ${nf(t)} min` : '');
      out.ind = st === 'cleaning';
      const b = this._num(d.battery); if (!out.ind && !isNaN(b)) out.pct = b;
      out.idleText = st === 'docked' || st === 'charging' ? 'alla base' : st === 'error' ? 'errore' : 'fermo';
    } else if (d.type === 'washer') {
      out.active = ['run', 'running', 'pause', 'paused'].includes(st);
      out.paused = /^pause/.test(st);
      const job = String(this._ok(d.job)?.state || '').toLowerCase();
      const fase = JOB[job] !== undefined ? JOB[job] : cap(job.replace(/_/g, ' '));
      const end = this._ok(d.end); let endD = end ? new Date(end.state) : null; if (endD && isNaN(endD)) endD = null;
      out.sub = out.paused ? 'In pausa' : [fase, endD && endD > now ? 'finisce alle ' + hhmm(endD) : ''].filter(Boolean).join(' · ') || 'In funzione';
      if (endD) { const start = new Date(s.last_changed).getTime(); const tot = endD - start; out.pct = tot > 0 ? Math.max(3, Math.min(100, (now - start) / tot * 100)) : null; }
      if (out.pct === null) out.ind = true;
      out.idleText = 'ferma';
    } else if (d.type === 'mower') {
      out.active = ['mowing', 'returning', 'paused', 'leaving'].includes(st);
      out.paused = st === 'paused';
      const stx = this._ok(d.status)?.state;
      out.sub = st === 'returning' ? 'Torna alla base' : st === 'paused' ? 'In pausa' : 'Taglia il prato';
      const b = this._num(d.battery); if (!isNaN(b)) { out.pct = b; out.sub += ` · ${nf(b)}%`; } else out.ind = true;
      out.idleText = st === 'docked' ? 'alla base' : st === 'error' ? 'errore' : 'ferma';
    } else if (d.type === 'mop') {
      const idle = new RegExp(d.idle || '^(idle)$', 'i');
      const charging = this._st(d.charging)?.state === 'on';
      out.active = !charging && !idle.test(st);
      const b = this._num(d.battery);
      out.sub = cap(String(s.state).replace(/_/g, ' ')) + (!isNaN(b) ? ` · batteria ${nf(b)}%` : '');
      if (!isNaN(b)) out.pct = b; else out.ind = true;
      out.idleText = charging ? 'in carica' : 'alla base';
    } else if (d.type === 'dishwasher' || d.type === 'oven' || d.type === 'hob') {
      out.active = st === 'on';
      const since = new Date(s.last_changed), mins = Math.max(0, Math.round((now - since) / 60000));
      const pw = this._watts(d.power);
      if (d.type === 'dishwasher') {
        const prog = this._ok(d.program)?.state || '';
        const endS = this._ok(d.end); const endD = endS ? new Date(endS.state) : null;
        out.sub = [prog, endD && !isNaN(endD) && endD > now ? 'finisce alle ' + hhmm(endD) : ''].filter(Boolean).join(' · ');
        if (endD && !isNaN(endD) && endD > since) out.pct = Math.max(3, Math.min(100, (now - since) / (endD - since) * 100)); else out.ind = true;
        out.idleText = 'ferma';
      } else {
        const what = this._ok(d.type === 'oven' ? d.mode : d.zones)?.state || '';
        out.sub = [what, mins < 1 ? 'appena acceso' : 'da ' + mins + ' min', pw ? nf(pw) + ' W' : ''].filter(Boolean).join(' · ');
        out.ind = true;
        out.idleText = 'spento';
      }
      if (!out.active) { const k = this._num(d.energy), n = this._num(d.cycles); out.sub = [!isNaN(n) ? nf(n) + (n === 1 ? ' ciclo' : ' cicli') : '', !isNaN(k) ? nf(k, 1) + ' kWh in totale' : ''].filter(Boolean).join(' · ') || 'Premi quando lo accendi'; }
    }
    return out;
  }

  // ---------------------------------------------------------------- disegno
  _render() {
    const h = this._hass, c = this._config; if (!h || !this._app) return;
    const now = new Date(), night = this._isNight();
    this._app.classList.toggle('night', night);
    if (this._page === 'sub') { this._renderSub(now, night); return; }
    if (this._page === 'sistema') { this._renderSistema(now, night); return; }
    if (this._page === 'energia') { this._renderEnergia(now, night); return; }
    if (this._page === 'sicurezza') { this._renderSicurezza(now, night); return; }
    if (this._page === 'stanze') {
      const L = [...new Set(c.rooms.flatMap(r => this._roomParts(r).lights))], n = L.filter(id => this._st(id)?.state === 'on').length;
      this._set('st_title', n ? `${n} ${n === 1 ? 'luce accesa' : 'luci accese'}.` : 'Tutto spento.');
      this._renderStanze(now, night); return;
    }
    const devs = c.devices.map(d => this._device(d)).filter(Boolean);
    const active = devs.filter(x => x.active);
    const openW = c.windows.filter(w => this._st(w.entity)?.state === 'on');
    const alarm = this._st(c.alarm)?.state || '';
    const lock = this._st(c.lock)?.state || '';

    // data e ora
    const dstr = now.toLocaleDateString(i18nLoc(), { weekday: 'long', day: 'numeric', month: 'long' });
    this._set('date', `${esc(cap(dstr))} · ${hhmm(now)}`);

    // titolo in linguaggio naturale
    let title = night ? 'Tutto chiuso.' : 'Tutto tranquillo.', alert = false;
    if (alarm === 'triggered') { title = 'Allarme!'; alert = true; }
    else if (openW.length) { title = openW.length === 1 ? `Finestra ${openW[0].name.toLowerCase()} aperta.` : `${openW.length} finestre aperte.`; alert = night || alarm.startsWith('armed'); }
    else if (['unlocked', 'open', 'opening', 'jammed'].includes(lock)) { title = lock === 'jammed' ? 'Serratura bloccata.' : 'Portone aperto.'; alert = night || lock === 'jammed'; }
    const h1 = this._slots.title; if (h1) h1.classList.toggle('alert', alert);
    this._set('title', esc(title));
    const parts = [];
    if (active.length) parts.push(active.length === 1 ? `${active[0].d.name} al lavoro` : `${active.slice(0, -1).map(x => x.d.name).join(', ')} e ${active[active.length - 1].d.name} al lavoro`);
    else if (night) parts.push('nessun dispositivo in funzione');
    if (ALARM_TXT[alarm]) parts.push(ALARM_TXT[alarm]);
    if (openW.length > 1) parts.push('aperte: ' + openW.map(w => w.name.toLowerCase()).join(', '));
    this._set('subtitle', esc(cap(parts.join(', '))) + (parts.length ? '.' : ''));

    const me = this._hass.user && this._hass.user.id;
    const ppl = c.people.slice().sort((a, b) => (this._st(b.entity)?.attributes?.user_id === me) - (this._st(a.entity)?.attributes?.user_id === me));
    this._set('people', ppl.map(p => this._personHtml(p, now)).join(''));
    this._set('weather', this._weatherHtml(now, night));

    // casa live
    const lights = [...new Set(c.rooms.flatMap(r => this._roomParts(r).lights))];
    const lon = lights.filter(id => this._st(id)?.state === 'on').length;
    this._set('herosub', night ? (lon ? `${lon} ${lon === 1 ? 'luce accesa' : 'luci accese'} · vialetto automatico` : 'Luci spente') : 'Piano terra · tocca per aprire');

    // sole / notte
    const bt = this._batt(), pv = this._watts(c.pv_power), today = this._kwh(c.pv_today), house = this._houseW();
    if (night) { this._set('energy', ''); this._set('night', this._nightHtml(bt, today, house, now)); }
    else { this._set('night', ''); this._set('energy', this._energyHtml(pv, today, bt, house, now)); }

    // in funzione
    this._set('devices', active.length ? `<div style="display:flex;flex-direction:column;gap:12px"><span class="lab">In funzione · ${active.length}</span><div class="grid2">${active.map(x => this._devHtml(x)).join('')}</div></div>` : '');

    // consiglio del sole
    this._set('tip', night ? '' : this._tipHtml(pv, house, bt, active));
    this._set('alerts', c.alerts ? this._alerts(now) : '');

    this._set('rooms', this._roomsList(devs));
    this._set('scenes', this._scenesHtml(night));
    this._slots.scenes.className = night ? '' : 'scenes';
    this._slots.scenes.style.cssText = night ? 'display:flex;flex-direction:column;gap:10px' : '';
  }

  _personHtml(p, now) {
    const s = this._st(p.entity); if (!s) return '';
    const st = s.state, home = st === 'home';
    let where, icon = 'pin';
    if (home) { where = 'A casa'; icon = 'home'; }
    else if (st === 'not_home') { where = 'Fuori casa'; icon = 'away'; }
    else if (/lavoro|work|ufficio|office/i.test(st)) { where = 'Al lavoro'; icon = 'work'; }
    else where = cap(st);
    const since = new Date(s.last_changed);
    if (!home && !isNaN(since)) where += sameDay(since, now) ? ' · ' + hhmm(since) : '';
    const pic = s.attributes.entity_picture;
    const name = p.name || s.attributes.friendly_name || '';
    const steps = this._num(p.steps), heart = this._num(p.heart), bat = this._num(p.battery);
    const bs = String(this._st(p.battery_state)?.state || '').toLowerCase();
    const chg = /charg|in carica/.test(bs) && !/not|non/.test(bs);
    const bcol = chg ? 'var(--sea)' : isNaN(bat) ? 'var(--mut)' : bat < 20 ? 'var(--coral)' : bat < 50 ? 'var(--sun)' : 'var(--tx)';
    const batIcon = chg ? `<svg class="blink" aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="currentColor">${I.energia}</svg>`
      : `<svg aria-hidden="true" width="15" height="13" viewBox="0 0 28 16" fill="none" stroke="currentColor" stroke-width="2"><rect x="1.5" y="2" width="22" height="12" rx="3"/><path d="M26 6v4" stroke-linecap="round"/><rect x="4" y="4.5" width="${isNaN(bat) ? 0 : Math.max(1.5, 17 * bat / 100).toFixed(1)}" height="7" rx="1.5" fill="currentColor" stroke="none"/></svg>`;
    return `<button class="person" data-act="more" data-id="${esc(p.entity)}">
      <span class="row" style="gap:10px">
        <span class="av${home ? '' : ' out'}"><span class="ring"><span class="pic disp" style="${pic ? `background-image:url('${esc(pic)}')` : ''}">${pic ? '' : esc(name.charAt(0))}</span></span><span class="badge">${svg(icon, 12, 2.6)}</span></span>
        <span class="pinfo"><span class="pname">${esc(name)}</span><span class="pwhere">${esc(where)}</span></span>
      </span>
      <span class="pstats">
        <span>${svg('shoe', 13, 2, 'style="color:var(--water)"')}${isNaN(steps) ? '–' : nf(steps)}</span>
        <span><svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24"><path ${isNaN(heart) ? '' : 'class="heart"'} d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" fill="${isNaN(heart) ? '#6B767E' : '#FF7A66'}"/></svg>${isNaN(heart) ? '–' : nf(heart)}</span>
        <span style="color:${bcol}">${batIcon}${isNaN(bat) ? '–' : nf(bat) + '%'}</span>
      </span>
    </button>`;
  }

  _wxIcon(cond, size, sw, rays) {
    const m = WX[cond] || ['', 'cloud', '#B9C1C6'];
    if (m[1] === 'sun') return `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${m[2]}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"><g ${rays ? 'class="rays"' : ''}>${I.sun}</g></svg>`;
    return `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${m[2]}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${I[m[1]]}</svg>`;
  }
  _weatherHtml(now, night) {
    const w = this._st(this._config.weather); if (!w) return '';
    const a = w.attributes, cond = w.state;
    const lab = (WX[cond] || [cap(cond)])[0];
    const daily = this._fc_daily || [], hourly = this._fc_hourly || [];
    const d0 = daily.find(f => sameDay(new Date(f.datetime), now)) || daily[0];
    const minmax = d0 && d0.templow !== undefined ? `Min ${nf(d0.templow)}° · Max ${nf(d0.temperature)}°` : '';
    const wu = a.wind_speed_unit || 'km/h';
    const wind = a.wind_speed !== undefined ? `Vento ${nf(a.wind_speed)} ${esc(wu)}${a.wind_bearing !== undefined ? ' da ' + WIND_DIR[Math.round(((+a.wind_bearing % 360) + 360) % 360 / 45) % 8] : ''}` : '';
    const hrs = hourly.filter(f => new Date(f.datetime).getTime() > now.getTime() - 1800000).slice(1, 6);
    const hoursHtml = hrs.length ? `<div class="hours"><span class="hr now"><span>Ora</span>${this._wxIcon(cond, 20, 1.8)}<b>${nf(a.temperature)}°</b></span>${hrs.map(f => { const t = new Date(f.datetime); return `<span class="hr"><span>${t.getHours()}</span>${this._wxIcon(f.condition, 20, 1.8)}<b>${nf(f.temperature)}°</b></span>`; }).join('')}</div>` : '';
    // riga utile: pioggia
    let line = '';
    const rainH = hourly.slice(0, 12).find(f => RAINY.test(f.condition) || (f.precipitation_probability ?? 0) >= 60);
    if (RAINY.test(cond)) { const dry = hourly.find(f => !RAINY.test(f.condition) && (f.precipitation_probability ?? 0) < 40 && new Date(f.datetime) > now); line = dry ? `Dovrebbe smettere verso le ${new Date(dry.datetime).getHours()}` : 'Pioggia per il resto della giornata'; }
    else if (rainH) line = `Pioggia in arrivo verso le ${new Date(rainH.datetime).getHours()}`;
    else if (daily.length) {
      const i = daily.findIndex(f => RAINY.test(f.condition) || (f.precipitation_probability ?? 0) >= 50 || (f.precipitation ?? 0) >= 1);
      line = i < 0 ? `Niente pioggia nei prossimi ${daily.length} giorni` : i === 0 ? 'Possibile pioggia più tardi' : `Niente pioggia fino a ${dayName(new Date(daily[i].datetime), now)}`;
    }
    return `<button class="wx" data-act="more" data-id="${esc(this._config.weather)}" aria-label="Meteo">
      <span class="wxnow">${this._wxIcon(night && cond === 'sunny' ? 'clear-night' : cond, 54, 1.5, true)}<span class="wxt disp">${nf(a.temperature)}°</span>
        <span class="wxd"><b>${esc(lab)}</b>${minmax ? `<span>${minmax}</span>` : ''}${wind ? `<span>${wind}</span>` : ''}</span></span>
      ${hoursHtml}
      ${line ? `<span class="wxl">${svg('drop', 16, 1.8, 'style="color:var(--water)"')}${esc(line)}</span>` : ''}
    </button>`;
  }

  _energyHtml(pv, today, bt, house, now) {
    const sun = this._sunTimes();
    let f = 0.5; if (sun && sun.rise && sun.set) f = Math.max(0, Math.min(1, (now - sun.rise) / (sun.set - sun.rise)));
    const ang = Math.PI * f, x = 175 - 130 * Math.cos(ang), y = 156 - 130 * Math.sin(ang);
    const kw = pv === null ? '–' : nf(pv / 1000, 1);
    const big = pv !== null && pv < 20 ? 'Fermo' : kw;
    const socTxt = isNaN(bt.soc) ? '–' : nf(bt.soc) + '%';
    const bp = bt.p;
    const bolt = !isNaN(bt.soc) && bp !== null && bp > 20 ? `<svg class="blink" aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="var(--sea)" style="margin-left:4px">${I.energia}</svg>` : '';
    return `<div class="row sp"><span class="lab">Il sole oggi</span><button class="link" data-act="nav" data-to="energia">Energia</button></div>
      <div class="dial">
        <svg aria-hidden="true" width="310" height="168" viewBox="20 0 310 168">
          <path d="M45 156 A130 130 0 0 1 305 156" fill="none" stroke="rgba(243,239,231,0.12)" stroke-width="2" stroke-dasharray="2 6" stroke-linecap="round"/>
          ${f > 0.001 ? `<path d="M45 156 A130 130 0 0 1 ${x.toFixed(1)} ${y.toFixed(1)}" fill="none" stroke="#F5B544" stroke-width="3" stroke-linecap="round"/>` : ''}
          <circle class="sunglow" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="14" fill="#F5B544"/>
          <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7" fill="#F5B544"/>
          <line x1="20" y1="156" x2="330" y2="156" stroke="rgba(243,239,231,0.10)" stroke-width="1"/>
        </svg>
        <div class="val"><b class="disp">${big}${big !== 'Fermo' && pv !== null ? '<small> kW</small>' : ''}</b><span>dal fotovoltaico, adesso</span></div>
        <span class="t" style="left:6px">${sun && sun.rise ? hhmm(sun.rise) : ''}</span>
        <span class="t" style="right:6px">${sun && sun.set ? hhmm(sun.set) : ''}</span>
      </div>
      <div class="trio">
        <div><span>Oggi</span><b>${isNaN(today) ? '–' : nf(today, 1)} <small>kWh</small></b></div>
        <div><span>Batteria</span><b>${socTxt}${bolt}</b>${isNaN(bt.soc) ? '' : `<span class="bar"><i style="width:${bt.soc}%;background:var(--sea)"></i></span>`}</div>
        <div><span>Casa usa</span><b>${house === null ? '–' : nf(house / 1000, 1)} <small>kW</small></b></div>
      </div>`;
  }

  _nightHtml(bt, today, house, now) {
    const c = this._config;
    let main = '', bar = '';
    if (!isNaN(bt.soc)) {
      const usable = Math.max(0, bt.soc - (+c.battery_min_soc || 0)) / 100 * (+c.battery_kwh || 7) * 1000;
      const load = Math.max(house || 0, 150);
      const until = new Date(now.getTime() + usable / load * 3600000);
      main = `<div class="row" style="gap:16px"><span class="disp" style="font-size:44px;line-height:1">${nf(bt.soc)}%</span>
        <span style="display:flex;flex-direction:column;gap:3px;font-size:14px;color:var(--mut3)"><span>La batteria copre la casa</span><b style="color:var(--sea);font-size:16px">${usable < 100 ? 'è scarica' : (until - now > 20 * 3600000 ? 'per tutta la notte' : 'fino alle ' + hhmm(until) + ' circa')}</b></span></div>`;
      bar = `<span class="bar" style="height:8px;border-radius:4px"><i style="width:${bt.soc}%;background:var(--sea)"></i></span>`;
    }
    const S = this._hass.states;
    const tomId = Object.keys(S).find(id => /^sensor\.energy_production_tomorrow(_\d+)?$/.test(id));
    let tom = tomId ? this._kwh(tomId) : NaN;
    const fac = this._num(c.forecast_factor); if (!isNaN(tom) && fac >= 20) tom = tom * Math.min(fac, 150) / 100;
    const foot = [!isNaN(today) ? `Oggi il sole ha dato ${nf(today, 1)} kWh` : '', !isNaN(tom) ? `domani ne sono previsti ${nf(tom, 1)} kWh` : ''].filter(Boolean).join(' · ');
    if (!main && !foot) return '';
    return `<section class="card" aria-label="Stanotte"><div class="row sp"><span class="lab">Stanotte</span><button class="link" data-act="nav" data-to="energia">Energia</button></div>${main}${bar}${foot ? `<span style="font-size:12px;color:var(--mut)">${esc(foot)}</span>` : ''}</section>`;
  }

  _devHtml(x) {
    const col = x.color;
    return `<button class="dev${x.paused ? ' paused' : ''}" data-act="opendev" data-dev="${esc(x.d.name)}">
      <span class="ic" style="background:${col}24;color:${col}"><svg aria-hidden="true" width="40" height="40" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">${DEV_SVG[x.d.type] || ''}</svg></span>
      <span style="display:flex;flex-direction:column;gap:2px"><b>${esc(x.title)}</b><small>${esc(x.sub)}</small></span>
      <span class="bar${x.ind ? ' ind' : ''}"><i style="width:${x.pct === null ? 40 : x.pct.toFixed(0)}%;background:${col}"></i></span>
    </button>`;
  }

  _tipHtml(pv, house, bt, active) {
    const c = this._config; if (!c.tips || pv === null || house === null) return '';
    const key = 'isola_tip_' + new Date().toDateString();
    try { if (localStorage.getItem(key)) return ''; } catch (e) {}
    const sun = this._sunTimes(); if (!sun || !sun.set) return '';
    const left = (sun.set - Date.now()) / 3600000; if (left < 1.5) return '';
    const surplus = pv - house;
    const socOk = isNaN(bt.soc) || bt.soc >= 75;
    if (surplus < 1000 || !socOk) return '';
    const washing = active.some(x => x.d.type === 'washer');
    const what = washing ? 'la lavastoviglie' : 'lavatrice o lavastoviglie';
    const until = new Date(sun.set.getTime() - 5400000);
    const p = `Il sole produce ${nf(surplus / 1000, 1)} kW più di quanto usa la casa${isNaN(bt.soc) ? '' : bt.soc >= 95 ? ' e la batteria è piena' : ` e la batteria è al ${nf(bt.soc)}%`}. Fino alle ${hhmm(until)} è energia tua.`;
    return `<section class="tip" aria-label="Consiglio"><span class="ti">${svg('sun', 22)}</span><span style="flex:1"><b>Buon momento per ${what}</b><p>${esc(p)}</p></span><button class="x" data-act="tipx" data-key="${key}" aria-label="Chiudi il consiglio">${svg('close', 14, 2.4)}</button></section>`;
  }

  // stanze divise per piano (titolo solo se ci sono stanze al primo piano)
  _roomsList(devs) {
    const rooms = this._config.rooms || [], two = rooms.some(r => r.floor);
    let out = '', last = null;
    for (const r of rooms) {
      const f = r.floor ? 1 : 0;
      if (two && f !== last) { out += `<span class="lab" style="grid-column:1/-1;margin-top:${last === null ? 0 : 10}px">${f ? 'Primo piano' : 'Piano terra'}</span>`; last = f; }
      out += this._roomHtml(r, devs);
    }
    return out;
  }
  _roomHtml(r, devs) {
    let ph;
    if (r.crop) {
      const [x0, y0, x1, y1] = r.crop, rw = x1 - x0, tw = 165, th = 96;
      const scale = tw / rw, visH = th / scale;
      const cy = (y0 + y1) / 2, top = Math.max(0, Math.min(IMG_H - visH, cy - visH / 2));
      const px = rw >= IMG_W ? 0 : x0 / (IMG_W - rw) * 100, py = IMG_H - visH <= 0 ? 0 : top / (IMG_H - visH) * 100;
      ph = `<span class="ph" style="background-image:url('${esc(r.image || this._config.image)}');background-size:${(IMG_W / rw * 100).toFixed(1)}% auto;background-position:${px.toFixed(1)}% ${py.toFixed(1)}%"></span>`;
    } else ph = `<span class="ph none">${esc(r.note || '')}</span>`;
    const bits = [];
    const P = this._roomParts(r), lights = P.lights;
    if (lights.length) { const on = lights.filter(id => this._st(id)?.state === 'on').length; bits.push(on ? `${on} ${on === 1 ? 'luce' : 'luci'}` : 'luci spente'); }
    if (P.media) { const m = this._st(P.media.state_entity || P.media.entity); if (m) bits.push(['on', 'playing', 'paused', 'idle'].includes(m.state) ? 'TV accesa' : 'TV spenta'); }
    const mine = devs.filter(x => x.d.room === r.name);
    mine.forEach(x => bits.push(x.active ? `${x.d.name} al lavoro` : `${x.d.name} ${x.idleText || 'fermo'}`));
    P.climate.forEach((id, i) => { const s = this._st(id); if (!s) return; if (i === 0 || s.state !== 'off') { const t = s.attributes.current_temperature; bits.push((s.state === 'off' ? 'clima spento' : 'clima acceso') + (t !== undefined && i === 0 ? ` · ${nf(t)}°` : '')); } });
    const open = P.windows.filter(id => this._st(id)?.state === 'on').length;
    if (open) bits.unshift(open === 1 ? 'finestra aperta' : `${open} finestre aperte`);
    const sub = cap([...new Set(bits)].slice(0, 2).join(' · '));
    return `<button class="room" data-act="openroom" data-room="${esc(r.name)}">${ph}<span class="rt"><b>${esc(r.name)}</b><span${open ? ' style="color:var(--coral)"' : ''}>${esc(sub)}</span></span></button>`;
  }

  _scenesHtml(night) {
    const s = this._config.scenes;
    const btn = (k, icon) => s[k] ? `<button class="scene" data-act="scene" data-k="${k}">${svg(icon, 18)}${esc(s[k].name)}</button>` : '';
    if (!night) return btn('morning', 'sun') + btn('out', 'exit') + btn('night', 'moon');
    return (s.night ? `<button class="bigscene" data-act="scene" data-k="night"><span class="bi">${svg('moon', 24, 2)}</span><span style="flex:1"><b>Attiva ${esc(s.night.name)}</b><small>${esc(s.night.sub || '')}</small></span></button>` : '')
      + `<div class="scenes">${btn('home', 'enter')}${btn('out', 'exit')}${btn('morning', 'sun')}</div>`;
  }

  // ================================================================ ENERGIA (fase 2)
  _n(id, d) { const s = this._st(id); const v = s ? parseFloat(s.state) : NaN; return isNaN(v) ? d : v; }
  _prices() { return { acq: this._n('input_number.prezzo_acquisto', 0.2125), ven: this._n('input_number.prezzo_vendita', 0.10), q: this._n('input_number.quota_autoconsumo', 35) / 100 }; }
  _val(k) { const p = this._prices(); return k * (p.q * p.acq + (1 - p.q) * p.ven); }

  // sensori di potenza / energia dei dispositivi (stessa logica delle card attuali)
  _rows(cls) {
    const key = '_rows_' + cls, ttl = cls === 'power' ? 5000 : 30000;
    if (this[key] && Date.now() - this[key].t < ttl) return this[key].v;
    const S = this._hass.states;
    const SKIP = /inverter|saved|risparmi|forecast|energy_production|solar_production|energy_current_hour|energy_next|battery|batteria|batteries|difference|differenza|daily|monthly|weekly|yearly|today|yesterday|(^|[_\s])(day|week|month|year)($|[_\s])/i;
    const clean = s => (s || '').replace(/\s+(real.?time power( consumption)?|total energy( consumption)?|energy consumption|potenza|power|energia elettrica|energia|energy)$/i, '');
    const out = [];
    for (const id in S) {
      if (!id.startsWith('sensor.')) continue;
      const st = S[id], a = st.attributes || {};
      if (/current.?energy/i.test(id) && S[id.replace(/current/i, 'total')]) continue;
      if (/^sensor\.iphone_/.test(id) || SKIP.test(id) || SKIP.test(a.friendly_name || '')) continue;
      const u = a.unit_of_measurement;
      const unitOk = cls === 'power' ? ['W', 'kW', 'mW'].includes(u) : ['Wh', 'kWh', 'MWh'].includes(u);
      if (a.device_class !== cls && !(unitOk && !a.device_class)) continue;
      let v = parseFloat(st.state); if (isNaN(v)) continue;
      v = cls === 'power' ? (u === 'kW' ? v * 1000 : u === 'mW' ? v / 1000 : v) : (u === 'Wh' ? v / 1000 : u === 'MWh' ? v * 1000 : v);
      out.push({ id, name: clean(a.friendly_name || id), v, est: a.calculation_mode !== undefined && a.source_entity !== undefined, src: a.source_entity || '' });
    }
    out.sort((a, b) => b.v - a.v);
    this[key] = { v: out, t: Date.now() };
    return out;
  }
  // chiamate a Home Assistant con cache (si ridisegna da sola quando arrivano i dati)
  _ws(key, ttl, make, lsKey) {
    const W = this._wsc || (this._wsc = {});
    let e = W[key];
    if (!e) {
      e = W[key] = {};
      if (lsKey) { try { const sv = JSON.parse(localStorage.getItem(lsKey)); if (sv && sv.key === key) { e.data = sv.data; e.ts = sv.ts; } } catch (er) {} }
    }
    if (!e.busy && (!e.ts || Date.now() - e.ts > ttl) && this._hass.callWS) {
      e.busy = true;
      this._hass.callWS(make()).then(r => {
        e.data = r || {}; e.ts = Date.now(); e.err = false; e.proc = null;
        if (lsKey) { try { localStorage.setItem(lsKey, JSON.stringify({ key, data: e.data, ts: e.ts })); } catch (er) {} }
      }).catch(() => { e.err = true; e.ts = Date.now() - ttl + 60000; })
        .finally(() => { e.busy = false; this._schedule(); });
    }
    return e;
  }
  _arm(key) { // pulsanti che chiedono un secondo tocco
    if (this._armed === key) { this._armed = null; return true; }
    this._armed = key; clearTimeout(this._armT); this._armT = setTimeout(() => { this._armed = null; this._schedule(); }, 4000);
    this._schedule(); return false;
  }

  _renderEnergia(now, night) {
    const tab = this._etab;
    if (this._mounted !== tab) this._mountTab(tab);
    const K = { adesso: 'Energia · adesso', oggi: 'Energia · oggi', bolletta: 'Energia · bolletta', storico: 'Energia · storico' };
    this._set('e_kick', K[tab]);
    this._set('e_seg', [['adesso', 'Adesso'], ['oggi', 'Oggi'], ['bolletta', 'Bolletta'], ['storico', 'Storico']]
      .map(([k, l]) => `<button class="${k === tab ? 'on' : ''}" data-act="etab" data-k="${k}"${k === tab ? ' aria-current="page"' : ''}>${l}</button>`).join(''));
    const r = this['_e_' + tab](now, night) || {};
    this._set('e_title', esc(r.title || ''));
    this._set('e_sub', r.sub ? esc(r.sub) : '');
    this._slots.e_sub.hidden = !r.sub;
  }
  _mountTab(tab) {
    const L = { adesso: ['flow', 'power', 'clima', 'plant'], oggi: ['fc', 'chart', 'dev'], bolletta: ['bill', 'self', 'value', 'tariffe', 'verify', 'dati'], storico: ['months', 'totals', 'native'] };
    const body = this._slots.e_body;
    Object.keys(this._slots).filter(k => k.startsWith('x_')).forEach(k => { delete this._slots[k]; delete this._cache[k]; });
    body.innerHTML = L[tab].map(k => `<div data-s="x_${k}" hidden></div>`).join('');
    body.querySelectorAll('[data-s]').forEach(e => { this._slots[e.dataset.s] = e; });
    this._mounted = tab;
  }

  // ---------------------------------------------------------------- Adesso
  _e_adesso(now) {
    const c = this._config, pv = this._watts(c.pv_power), house = this._houseW(), bt = this._batt(), today = this._kwh(c.pv_today);
    const hasB = !isNaN(bt.soc), bp = hasB && bt.p !== null ? bt.p : 0;
    const grid = pv !== null && house !== null ? pv - house - bp : null;
    const kw = w => nf(Math.abs(w) / 1000, 1) + ' kW';
    const sunOn = pv !== null && pv >= 20, ch = bp > 20, dis = bp < -20, exp = grid !== null && grid > 40, imp = grid !== null && grid < -40;
    let title;
    if (sunOn) { if (house) { const p = Math.round(Math.min(1, pv / house) * 100); title = p >= 100 ? 'Il sole copre tutta la casa.' : `Il sole copre il ${p}% di casa.`; } else title = `Il sole produce ${kw(pv)}.`; }
    else title = dis ? 'La casa va a batteria.' : 'Il sole è a riposo.';
    // stringhe
    const strs = (c.inverter.strings || []).map(s => { const v = this._n(s.v, NaN), a = this._n(s.a, NaN); return isNaN(v) || isNaN(a) ? null : { v, a, w: v * a }; });
    const strTxt = strs.every(Boolean) && strs.length ? strs.map(s => nf(s.w / 1000, 2)).join(' + ') : '';
    const batSub = !hasB ? 'non trovata' : ch ? 'carica ' + kw(bp) : dis ? 'scarica ' + kw(bp) : 'in attesa';
    const gridSub = grid === null ? 'rete' : exp ? 'verso la rete' : imp ? 'dalla rete' : 'rete';
    const cls = (on, rev) => on ? 'fl' : rev ? 'fl rev' : 'fl off';
    const flow = `<section class="card" aria-label="Flussi di energia adesso" style="gap:6px">
      <svg viewBox="0 0 350 286" width="100%" style="display:block;overflow:visible" class="flow">
        <circle class="sunglow" cx="175" cy="46" r="32" fill="#F5B544" ${sunOn ? '' : 'style="animation:none;opacity:.05"'}/>
        <path class="${cls(sunOn)}" d="M175 74 L175 124" stroke="#F5B544"/>
        <path class="${cls(ch, dis)}" d="M138 176 C 104 196, 84 204, 66 218" stroke="#5ED3C3"/>
        <path class="${cls(exp, imp)}" d="M212 176 C 246 196, 266 204, 284 218" stroke="#B9C1C6" style="stroke-width:2.6"/>
        <circle cx="175" cy="46" r="24" fill="#2B2414"/>
        <g transform="translate(163 34)" stroke="#F5B544" fill="none" stroke-width="1.8" stroke-linecap="round"><g class="${sunOn ? 'rays' : ''}">${I.sun}</g></g>
        <text x="212" y="40" class="tm">Sole</text><text x="212" y="61" class="tb">${pv === null ? '–' : sunOn ? kw(pv) : 'fermo'}</text>
        ${strTxt ? `<text x="20" y="40" class="tm">Stringhe kW</text><text x="20" y="60" class="ts">${strTxt}</text>` : ''}
        <rect x="108" y="126" width="134" height="52" rx="26" fill="var(--pill)"/>
        <g transform="translate(130 140)" stroke="var(--pillfg)" fill="none" stroke-width="2" stroke-linejoin="round">${I.casa}</g>
        <text x="160" y="158" fill="var(--pillfg)" font-size="16" font-weight="700">${house === null ? '–' : kw(house)}</text>
        <rect x="18" y="222" width="44" height="44" rx="15" fill="rgba(94,211,195,.14)"/>
        <g transform="translate(28 232)" stroke="#5ED3C3" fill="none" stroke-width="1.8" stroke-linejoin="round"><rect x="7" y="4" width="10" height="17" rx="2"/><path d="M10 2h4"/><rect ${ch ? 'class="blink"' : ''} x="9.5" y="${(19 - 10 * (hasB ? bt.soc : 0) / 100).toFixed(1)}" width="5" height="${(10 * (hasB ? bt.soc : 0) / 100).toFixed(1)}" rx="1" fill="#5ED3C3" stroke="none"/></g>
        <text x="72" y="240" class="tb" style="font-size:16px">${hasB ? nf(bt.soc) + '%' : 'Batteria'}</text><text x="72" y="258" class="ts" style="fill:${hasB ? '#5ED3C3' : 'var(--mut)'}">${batSub}</text>
        <rect x="288" y="222" width="44" height="44" rx="15" fill="rgba(243,239,231,.08)"/>
        <g transform="translate(298 232)" stroke="#B9C1C6" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${I.tower}</g>
        <text x="278" y="240" class="tb" text-anchor="end" style="font-size:16px">${grid === null ? '–' : '≈ ' + kw(grid)}</text><text x="278" y="258" class="ts" text-anchor="end">${gridSub}</text>
      </svg>
      ${this._trio([
        ['Dal sole', sunOn && house ? nf(Math.min(100, pv / house * 100)) + '%' : '–'],
        this._battEta(bt, now),
        ['Oggi', isNaN(today) ? '–' : `${nf(today, 1)} <small>kWh</small>`]])}
    </section>`;
    this._set('x_flow', flow);

    // potenza adesso
    const pw = this._rows('power').map(x => ({ ...x, v: Math.abs(x.v) < 0.5 ? 0 : x.v })).filter(x => x.v > -1000);
    let KN = {}; try { KN = JSON.parse(localStorage.getItem('isola_pw_known')) || {}; } catch (e) {}
    let chg = false; pw.forEach(x => { if (!KN[x.id]) { KN[x.id] = { n: x.name, e: x.est ? 1 : 0 }; chg = true; } });
    if (chg) { try { localStorage.setItem('isola_pw_known', JSON.stringify(KN)); } catch (e) {} }
    const seen = new Set(pw.map(x => x.id));
    Object.keys(KN).forEach(id => { if (!seen.has(id) && this._st(id)) pw.push({ id, name: KN[id].n, est: !!KN[id].e, v: 0, off: true }); });
    const on = pw.filter(x => x.v >= 1).slice(0, 8), idle = pw.filter(x => x.v < 1);
    const tot = pw.reduce((s, x) => s + Math.max(x.v, 0), 0), mx = Math.max(...on.map(x => x.v), 1);
    const PC = ['#F5B544', '#E8935C', '#5ED3C3', '#8EC5F2', '#B79CF2', '#9BCB6B', '#FF7A66', '#C9D0D4'];
    this._set('x_power', `<section class="card" aria-label="Potenza adesso" style="gap:2px">
      <div class="row sp" style="margin-bottom:6px"><span class="lab">Potenza adesso</span><span style="font-size:13px;color:var(--mut)"><b style="color:var(--tx)">${nf(tot / 1000, 2)} kW</b> in tutto</span></div>
      ${on.length ? on.map((x, i) => `<button class="prow" data-act="more" data-id="${esc(x.id)}"><span class="row" style="gap:8px"><span class="pn">${esc(x.name)}</span>${x.est ? '<span class="chip">stima</span>' : ''}<b>${nf(x.v)} W</b></span><span class="bar" style="height:5px"><i style="width:${Math.max(3, x.v / mx * 100).toFixed(0)}%;background:${PC[i % PC.length]}"></i></span></button>`).join('')
        : '<p class="mut" style="margin:6px 0">Tutti i dispositivi sono a riposo</p>'}
      ${idle.length ? `<div class="idle"><span>A riposo</span>${idle.slice(0, 10).map(x => `<i>${esc(x.name)}${x.off ? ' · non disp.' : ''}</i>`).join('')}${idle.length > 10 ? `<i>e altri ${idle.length - 10}</i>` : ''}</div>` : ''}
    </section>`);

    // condizionatori
    const MODE = { off: ['Spento', '#9AA4AB'], cool: ['Raffresca', '#8EC5F2'], heat: ['Riscalda', '#E8935C'], dry: ['Deumidifica', '#5ED3C3'], fan_only: ['Ventila', '#B9C1C6'], auto: ['Auto', '#9BCB6B'], heat_cool: ['Auto', '#9BCB6B'] };
    const p = this._prices();
    const S = this._hass.states;
    const sensorOf = (prefix, kind) => {
      const re = kind === 'power' ? /(real_?time_?power|_power)$/i : /energy_consumption$/i;
      const all = Object.keys(S).filter(i => i.startsWith('sensor.' + prefix + '_') && re.test(i));
      const ids = all.filter(i => !isNaN(parseFloat(S[i].state))); if (!ids.length) return null;
      const pick = (kind === 'power' ? ids.find(i => /real/i.test(i)) : ids.find(i => /total/i.test(i))) || ids[0];
      const u = S[pick].attributes.unit_of_measurement; let v = parseFloat(S[pick].state);
      v = kind === 'power' ? (u === 'kW' ? v * 1000 : v) : (u === 'Wh' ? v / 1000 : u === 'MWh' ? v * 1000 : v);
      return { v, id: pick };
    };
    const cl = (c.climates || []).map(a => {
      const e = this._st(a.entity), st = e ? e.state : 'unavailable', at = e ? e.attributes : {};
      const m = MODE[st] || ['Non disp.', '#6B767E'], onn = !!MODE[st] && st !== 'off';
      const pwo = sensorOf(a.prefix, 'power'), eno = sensorOf(a.prefix, 'energy');
      return `<button class="clima" data-act="more" data-id="${esc(a.entity)}">
        <span class="row sp"><b style="font-size:15px">${esc(a.name)}</b><span class="chip" style="color:${m[1]};background:${m[1]}22">${m[0]}</span></span>
        <span class="disp" style="font-size:28px;line-height:1">${pwo ? nf(pwo.v) : '–'}<small style="font-size:13px;font-weight:500;color:var(--mut)"> W</small></span>
        <span class="kv"><span>${onn ? 'Ora → obiettivo' : 'In casa'}</span><b>${at.current_temperature !== undefined ? nf(at.current_temperature, 1) + '°' : '–'}${onn && at.temperature !== undefined ? ' → ' + nf(at.temperature, 1) + '°' : ''}</b></span>
        <span class="kv"><span>Energia</span><b>${eno ? nf(eno.v, 1) + ' kWh' : '–'}</b></span>
        <span class="kv"><span>Costo</span><b>${eno ? '≈ ' + nf(eno.v * p.acq, 2) + ' €' : '–'}</b></span>
      </button>`;
    });
    this._set('x_clima', cl.length ? `<section style="display:flex;flex-direction:column;gap:12px" aria-label="Condizionatori"><span class="lab">Condizionatori</span><div class="grid2">${cl.join('')}</div></section>` : '');

    // impianto
    const iv = c.inverter;
    const stx = this._ok(iv.status)?.state || '–';
    const good = /rete|grid|on|normal|connesso|running/i.test(stx);
    const tile = (n, s) => `<div class="str"><span>Stringa ${n}</span><b class="disp">${s ? nf(s.w) : '–'}<small> W</small></b><em>${s ? `${nf(s.v)} V · ${nf(s.a, 1)} A` : 'non disponibile'}</em></div>`;
    this._set('x_plant', `<section class="card" aria-label="Impianto">
      <div class="row sp"><span class="lab">Impianto</span><span style="font-size:12px;color:var(--mut)">SUN2000 3 kW${hasB ? ' · LUNA2000 7 kWh' : ''}</span></div>
      ${strs.length ? `<div class="grid2" style="gap:10px">${strs.map((s, i) => tile(i + 1, s)).join('')}</div>` : ''}
      ${this._trio([
        ['Stato', `<span class="row" style="gap:6px"><i style="width:7px;height:7px;border-radius:4px;background:${good ? 'var(--sea)' : 'var(--sun)'}"></i>${esc(cap(stx))}</span>`],
        ['Efficienza', isNaN(this._n(iv.efficiency, NaN)) ? '–' : nf(this._n(iv.efficiency, 0), 1) + '%'],
        ['Temperatura', isNaN(this._n(iv.temperature, NaN)) ? '–' : nf(this._n(iv.temperature, 0)) + '°']], true)}
    </section>`);
    return { title };
  }
  _trio(items, small) {
    return `<div class="trio${small ? ' sm' : ''}">${items.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div>`;
  }
  _battEta(bt, now) {
    const c = this._config; if (isNaN(bt.soc)) return ['Batteria', '–'];
    const kwh = (+c.battery_kwh || 7) * 1000, bp = bt.p || 0;
    if (bt.soc >= 99) return ['Batteria', 'piena'];
    if (bp > 20) { const h = (100 - bt.soc) / 100 * kwh / bp; return h > 14 ? ['Batteria', 'si carica'] : ['Piena alle', hhmm(new Date(now.getTime() + h * 3600000))]; }
    if (bp < -20) { const h = Math.max(0, bt.soc - (+c.battery_min_soc || 0)) / 100 * kwh / -bp; return h > 20 ? ['Batteria', 'si scarica'] : ['Dura fino alle', hhmm(new Date(now.getTime() + h * 3600000))]; }
    return ['Batteria', 'in attesa'];
  }

  // ---------------------------------------------------------------- Oggi
  _fcIds() {
    if (this._fcid && Date.now() - this._fcid.t < 60000) return this._fcid;
    const S = this._hass.states;
    const cands = Object.keys(S).filter(id => id.startsWith('sensor.') && !/inverter/i.test(id)).filter(id => { const a = S[id].attributes || {}; return ['kWh', 'Wh', 'MWh'].includes(a.unit_of_measurement) && a.device_class === 'energy'; });
    const lab = id => (id + ' ' + (S[id].attributes.friendly_name || '')).toLowerCase();
    const isFc = id => /(production|produzione|prevista|previsione|previsto|estimated|stimat|forecast)/.test(lab(id));
    const pick = (re, not) => cands.find(id => isFc(id) && re.test(lab(id)) && !(not && not.test(lab(id))));
    this._fcid = {
      today: cands.find(id => /energy_production_today$/.test(id)) || pick(/(today|oggi)/, /(remaining|rimanent|tomorrow|domani|peak|picco|after|dopo)/),
      tom: cands.find(id => /energy_production_tomorrow$/.test(id)) || pick(/(tomorrow|domani)/, /(remaining|rimanent|peak|picco|after|dopo)/),
      rem: cands.find(id => /energy_production_today_remaining$/.test(id)) || pick(/(remaining|rimanent)/), t: Date.now() };
    return this._fcid;
  }
  _e_oggi(now, night) {
    const c = this._config, prod = this._n(c.pv_today, 0), F = this._fcIds();
    const rawF = this._n(c.forecast_factor, 0), fac = rawF >= 20 ? Math.min(rawF, 150) / 100 : 1;
    const t = F.today ? this._kwh(F.today) * fac : null, tm = F.tom ? this._kwh(F.tom) * fac : null;
    const rem = F.rem ? this._kwh(F.rem) * fac : (t !== null ? Math.max(t - prod, 0) : null);
    const title = `${nf(prod, 1)} kWh dal sole${night ? ' oggi.' : ', finora.'}`;
    const sub = `Valgono circa ${nf(this._val(prod), 2)} €.` + (!night && rem !== null && rem >= 0.1 ? ` Prima del tramonto ne arrivano altri ${nf(rem, 1)}.` : '');

    // previsione + suggerimento di correzione (ultimi 9 giorni)
    let fcHtml;
    if (!F.today && !F.tom) fcHtml = `<section class="card"><span class="lab">Previsione</span><p class="mut" style="margin:0;font-size:13px;line-height:1.45">Non trovo sensori di previsione. Con l'integrazione Forecast.Solar la sezione si compila da sola.</p></section>`;
    else {
      let sugHtml = '';
      if (F.today && this._st(c.pv_today)) {
        const e = this._ws('fc_hist', 1800000, () => ({ type: 'history/history_during_period', start_time: new Date(Date.now() - 9 * 86400000).toISOString(), end_time: new Date().toISOString(), entity_ids: [F.today, c.pv_today], minimal_response: true, no_attributes: true, significant_changes_only: false }));
        if (e.data && !e.proc) {
          const ts = x => x.lu || (x.last_updated ? Date.parse(x.last_updated) / 1000 : 0);
          const day = sec => { const d = new Date(sec * 1000); return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate(); };
          const Fd = {}, Pd = {};
          (e.data[F.today] || []).forEach(x => { const v = parseFloat(x.s !== undefined ? x.s : x.state); if (!isNaN(v) && ts(x)) (Fd[day(ts(x))] = Fd[day(ts(x))] || []).push(v); });
          (e.data[c.pv_today] || []).forEach(x => { const v = parseFloat(x.s !== undefined ? x.s : x.state); if (!isNaN(v) && ts(x)) Pd[day(ts(x))] = Math.max(Pd[day(ts(x))] || 0, v); });
          const tk = day(Date.now() / 1000), rs = [];
          Object.keys(Fd).forEach(k => { if (k === tk || !Pd[k]) return; const a = Fd[k].slice().sort((x, y) => x - y); const f = a[Math.floor(a.length / 2)]; if (f > 2 && Pd[k] > 0.5) rs.push(Pd[k] / f); });
          rs.sort((x, y) => x - y);
          e.proc = { n: rs.length, ratio: rs.length >= 3 ? rs[Math.floor(rs.length / 2)] : null };
        }
        const pr = e.proc;
        const sugPct = pr && pr.ratio !== null ? Math.round(pr.ratio * 100) : null;
        const FH = this._st(c.forecast_factor);
        if (sugPct !== null && Math.abs(sugPct - Math.round(fac * 100)) >= 8) {
          const armed = this._armed === 'fc';
          sugHtml = `<div class="note"><span>Negli ultimi ${pr.n} giorni hai prodotto in media il <b>${sugPct}%</b> del previsto.</span>${FH ? `<button class="pbtn${armed ? ' warn' : ''}" data-act="fcapply" data-val="${sugPct}">${armed ? 'Tocca per confermare' : 'Correggi al ' + sugPct + '%'}</button>` : ''}</div>`;
        } else if (fac !== 1) sugHtml = `<div class="note"><span>Previsione corretta al <b>${Math.round(fac * 100)}%</b> sui dati reali</span></div>`;
      }
      const pct = t > 0 ? Math.min(prod / t * 100, 100) : 0;
      const delta = t && tm !== null ? (tm - t) / t * 100 : null;
      fcHtml = `<section class="card" aria-label="Previsione">
        <div class="row sp"><span class="lab">Previsione</span><span class="chip">Forecast.Solar</span></div>
        ${this._trio([
          ['Previsti oggi', t === null ? '–' : `${nf(t, 1)} <small>kWh</small>`],
          ['Ancora oggi', rem === null ? '–' : `${nf(rem, 1)} <small>kWh</small>`],
          ['Domani', tm === null ? '–' : `${nf(tm, 1)} <small>kWh</small>`]])}
        ${t !== null ? `<div style="display:flex;flex-direction:column;gap:6px"><span class="bar" style="height:8px;border-radius:4px"><i style="width:${pct.toFixed(0)}%;background:var(--sun)"></i></span>
          <span class="row sp" style="font-size:12px;color:var(--mut)"><span>${nf(prod, 1)} kWh prodotti</span><span>${nf(pct)}% del previsto${delta !== null ? ` · domani ${delta >= 0 ? '+' : '−'}${nf(Math.abs(delta))}%` : ''}</span></span></div>` : ''}
        ${sugHtml}
      </section>`;
    }
    this._set('x_fc', fcHtml);
    this._set('x_chart', this._chart24());
    this._set('x_dev', this._perDevice(now));
    return { title, sub };
  }
  _chart24() {
    const c = this._config, FV = c.pv_power;
    const pw = this._rows('power');
    const ids = [...(this._st(FV) ? [FV] : []), ...pw.map(x => x.id).filter(i => i !== FV)].slice(0, 25).sort();
    const key = 'chart:' + ids.join(',');
    const e = this._ws(key, 300000, () => ({ type: 'history/history_during_period', start_time: new Date(Date.now() - 86400000).toISOString(), end_time: new Date().toISOString(), entity_ids: ids, minimal_response: true, no_attributes: true, significant_changes_only: false }), 'isola_chart');
    const head = `<div class="row sp"><span class="lab">Sole e consumi · 24 ore</span><button class="link" data-act="openconsumi">Dettagli</button></div>`;
    if (!e.data) return `<section class="card">${head}<p class="mut" style="margin:8px 0">${e.err ? 'Storico non disponibile al momento' : 'Carico lo storico…'}</p></section>`;
    if (!e.proc) {
      const t1 = e.ts, t0 = t1 - 86400000, N = 96, step = (t1 - t0) / N, out = {};
      Object.keys(e.data).forEach(id => {
        const u = this._st(id)?.attributes?.unit_of_measurement, k = u === 'kW' ? 1000 : u === 'mW' ? 0.001 : 1;
        const ev = e.data[id].map(x => ({ t: x.lu ? x.lu * 1000 : new Date(x.last_updated || x.last_changed || x.lc).getTime(), v: parseFloat(x.s !== undefined ? x.s : x.state) * k })).filter(x => !isNaN(x.v) && !isNaN(x.t)).sort((a, b) => a.t - b.t);
        if (!ev.length) return;
        const pts = []; let j = 0, cur = ev[0].v;
        for (let i = 0; i < N; i++) { const te = t0 + (i + 1) * step; let m = null; while (j < ev.length && ev[j].t <= te) { cur = ev[j].v; m = m === null ? cur : Math.max(m, cur); j++; } pts.push(m === null ? cur : Math.max(m, cur)); }
        out[id] = pts;
      });
      e.proc = { out, t1 };
    }
    const D = e.proc.out, name = id => id === FV ? 'Fotovoltaico' : ((pw.find(x => x.id === id) || {}).name || id);
    const mxOf = a => Math.max(...a, 0);
    const lightIds = pw.filter(x => /^(light\.|switch\.luce_)/.test(x.src || '') && D[x.id]).map(x => x.id);
    const cand = {};
    Object.keys(D).forEach(id => { if (id !== FV && !lightIds.includes(id)) cand[id] = { pts: D[id], est: !!(pw.find(x => x.id === id) || {}).est, ids: [id] }; });
    if (lightIds.length) cand.__luci = { pts: D[lightIds[0]].map((_, i) => lightIds.reduce((a, id) => a + ((D[id] || [])[i] || 0), 0)), est: true, ids: lightIds };
    const cons = Object.keys(cand).filter(id => mxOf(cand[id].pts) >= 5).sort((a, b) => mxOf(cand[b].pts) - mxOf(cand[a].pts)).slice(0, 5);
    const PAL = ['#5ED3C3', '#8EC5F2', '#B79CF2', '#9BCB6B', '#E8935C'];
    const series = [];
    if (D[FV]) series.push({ name: 'Fotovoltaico', color: '#F5B544', pts: D[FV], fill: true, ids: [FV] });
    cons.forEach((id, i) => series.push({ name: id === '__luci' ? 'Luci' : name(id), color: id === '__luci' ? '#FF7A66' : PAL[i % PAL.length], pts: cand[id].pts, est: cand[id].est, ids: cand[id].ids }));
    if (!series.length) return `<section class="card">${head}<p class="mut" style="margin:8px 0">Nessun dato nelle ultime 24 ore</p></section>`;
    const W = 340, H = 180, Lm = 28, R = 4, T = 8, B = 20;
    const ymaxRaw = Math.max(...series.map(s => Math.max(...s.pts)), 100);
    const ymax = [100, 200, 500, 1000, 1500, 2000, 3000, 4000, 5000, 7000, 10000].find(v => v >= ymaxRaw) || Math.ceil(ymaxRaw / 1000) * 1000;
    const X = (i, n) => Lm + (W - Lm - R) * i / (n - 1), Y = v => T + (H - T - B) * (1 - Math.min(Math.max(v, 0), ymax) / ymax);
    let g = '';
    [0, 0.5, 1].forEach(f => { const y = Y(ymax * f); g += `<line x1="${Lm}" x2="${W - R}" y1="${y}" y2="${y}" stroke="rgba(243,239,231,.07)"/><text x="${Lm - 6}" y="${y + 4}" text-anchor="end" class="ax">${ymax * f >= 1000 ? nf(ymax * f / 1000, 1) + 'k' : Math.round(ymax * f)}</text>`; });
    for (let h = 24; h >= 0; h -= 6) { const x = Lm + (W - Lm - R) * (24 - h) / 24, d = new Date(e.proc.t1 - h * 3600000); g += `<text x="${x}" y="${H - 6}" text-anchor="${h === 24 ? 'start' : h === 0 ? 'end' : 'middle'}" class="ax">${h === 0 ? 'ora' : String(d.getHours()).padStart(2, '0') + ':00'}</text>`; }
    series.slice().reverse().forEach(s => {
      const n = s.pts.length, line = s.pts.map((v, i) => `${i ? 'L' : 'M'}${X(i, n).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
      if (s.fill) g += `<path d="${line} L${X(n - 1, n)},${Y(0)} L${X(0, n)},${Y(0)} Z" fill="url(#isola-fv)"/>`;
      g += `<path d="${line}" fill="none" stroke="${s.color}" stroke-width="${s.fill ? 2 : 1.6}" stroke-linejoin="round" stroke-linecap="round"${s.est ? ' stroke-dasharray="6 4"' : ''}/>`;
    });
    const cur = ids2 => { const w = ids2.reduce((a, id) => a + (this._watts(id) || 0), 0); return nf(Math.abs(w) < 0.5 ? 0 : w) + ' W'; };
    return `<section class="card" aria-label="Sole e consumi nelle ultime 24 ore">${head}
      <svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block"><defs><linearGradient id="isola-fv" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#F5B544" stop-opacity=".5"/><stop offset="1" stop-color="#F5B544" stop-opacity=".03"/></linearGradient></defs>${g}</svg>
      <div class="legend">${series.map(s => `<span><i style="background:${s.color}"></i>${esc(s.name)}<em>${cur(s.ids)}</em></span>`).join('')}</div>
    </section>`;
  }
  _perDevice(now) {
    const p = this._prices();
    const S = this._hass.states;
    const dayOk = id => { const s = S[id]; const a = s && s.attributes || {}; return !!s && ['total', 'total_increasing'].includes(a.state_class) && ['Wh', 'kWh', 'MWh'].includes(a.unit_of_measurement) && !isNaN(parseFloat(s.state)); };
    const cand = this._rows('energy').map(x => { const d = x.id + '_day'; return dayOk(d) ? { id: d, name: x.name, est: x.est } : x; }).filter(x => x.v === undefined || x.v >= 0.01).slice(0, 30);
    const pwr = this._rows('power'), pairOf = {};
    cand.forEach(x => { const q = pwr.find(y => y.name.toLowerCase() === x.name.toLowerCase()); if (q) pairOf[x.id] = q.id; });
    const ids = [...new Set(cand.map(x => x.id).concat(Object.values(pairOf)))].sort();
    const d0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const mS = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const b0 = new Date(now.getFullYear(), now.getMonth() - (now.getMonth() % 2), 1), bS = b0.getTime(), hasB = bS !== mS;
    const e = ids.length ? this._ws('stat:' + ids.join(','), 300000, () => ({ type: 'recorder/statistics_during_period', start_time: b0.toISOString(), end_time: new Date(Date.now() + 3600000).toISOString(), statistic_ids: ids, period: 'hour', types: ['change', 'mean'], units: { energy: 'kWh', power: 'W' } }), 'isola_stat') : {};
    const tab = this._pdTab || 't';
    const tabs = [['t', 'Oggi'], ['m', 'Mese'], ...(hasB ? [['b', 'Bimestre']] : [])];
    const head = `<div class="row sp" style="margin-bottom:6px"><span class="lab">Per dispositivo</span><span class="mini">${tabs.map(([k, l]) => `<button class="${k === tab ? 'on' : ''}" data-act="pdtab" data-k="${k}">${l}</button>`).join('')}</span></div>`;
    if (!e.data) return `<section class="card" style="gap:4px">${head}<p class="mut" style="margin:8px 0">${e.err ? 'Statistiche non disponibili al momento' : 'Carico le statistiche…'}</p></section>`;
    const nowMs = Date.now();
    const stat = id => {
      const arr = e.data[id]; if (!arr || !arr.length) return null;
      const pa = pairOf[id] ? e.data[pairOf[id]] : null, pmap = {};
      if (pa) pa.forEach(x => { const st = typeof x.start === 'number' ? x.start : new Date(x.start).getTime(); if (x.mean != null) pmap[st] = x.mean / 1000 * Math.min(3600000, Math.max(nowMs - st, 0)) / 3600000; });
      let t = 0, m = 0, b = 0;
      arr.forEach(x => { const st = typeof x.start === 'number' ? x.start : new Date(x.start).getTime(); let v = x.change || 0; const pp = pmap[st]; if (pp !== undefined && v > pp * 3 + 0.2) v = pp; b += v; if (st >= mS) m += v; if (st >= d0) t += v; });
      return { t: Math.max(t, 0), m: Math.max(m, 0), b: Math.max(b, 0) };
    };
    const list = cand.map(x => ({ id: x.id, name: x.name, est: x.est, s: stat(x.id) })).filter(x => x.s && x.s[tab] >= 0.005).sort((a, b) => b.s[tab] - a.s[tab]).slice(0, 10);
    const tot = list.reduce((s, x) => s + x.s[tab], 0), mx = Math.max(...list.map(x => x.s[tab]), 0.01);
    const per = { t: 'oggi', m: 'questo mese', b: 'nel bimestre' }[tab];
    return `<section class="card" aria-label="Energia per dispositivo" style="gap:2px">${head}
      ${list.length ? list.map(x => `<button class="prow erow" data-act="more" data-id="${esc(x.id)}"><span class="row" style="gap:8px;min-width:0"><span class="pn">${esc(x.name)}</span>${x.est ? '<span class="chip">stima</span>' : ''}</span><span class="row" style="gap:8px"><span class="bar" style="height:5px;flex:1"><i style="width:${Math.max(3, x.s[tab] / mx * 100).toFixed(0)}%;background:var(--sun)"></i></span><b>${nf(x.s[tab], tab === 't' ? 2 : 1)} kWh</b></span></button>`).join('')
        : '<p class="mut" style="margin:8px 0">Nessun consumo registrato</p>'}
      ${list.length ? `<span class="foot">Totale ${per}: <b>${nf(tot, 1)} kWh</b> · ≈ ${nf(tot * p.acq, 2)} € al prezzo di acquisto</span>` : ''}
    </section>`;
  }

  // ---------------------------------------------------------------- Bolletta
  _e_bolletta(now) {
    const B = this._st('sensor.bolletta_stimata_bimestre');
    const eur = (v, d = 2) => nf(+v || 0, d) + ' €';
    let title = 'Bolletta', sub = '';
    if (!B || isNaN(parseFloat(B.state))) {
      sub = !B ? 'Manca sensor.bolletta_stimata_bimestre: controlla il pacchetto energia_calcoli.yaml.' : 'Primo calcolo in corso.';
      this._set('x_bill', '');
    } else {
      const a = B.attributes, costo = parseFloat(B.state), senza = +a.senza_fotovoltaico;
      const d0 = new Date(a.inizio + 'T00:00:00'), d1 = new Date(a.fine + 'T00:00:00');
      const ms = d => d.toLocaleDateString(i18nLoc(), { month: 'short' }).replace('.', '');
      title = `${eur(costo)} a fine bimestre.`;
      sub = `Bolletta ${ms(d0)}–${ms(d1)}, da pagare a ${a.da_pagare_a}.` + (senza > 0 ? ` Senza il sole sarebbero ${eur(senza, 0)}.` : '');
      const wCon = senza > 0 ? Math.max(0, Math.min(100, costo / senza * 100)) : 0;
      const prog = Math.min(100, (+a.giorni_trascorsi) / (+a.giorni) * 100);
      this._set('x_bill', `<section class="card" aria-label="Bolletta">
        <div class="row sp"><span class="lab">Bolletta ${ms(d0)}–${ms(d1)}</span><span class="chip" style="color:#0D1114;background:var(--sea)">Risparmi ${eur(a.risparmio, 0)}</span></div>
        <div class="hb"><span>Con il sole</span><span class="bar" style="height:8px;border-radius:4px;flex:1"><i style="width:${wCon.toFixed(0)}%;background:var(--sea)"></i></span><b>${eur(costo, 0)}</b></div>
        <div class="hb"><span>Senza</span><span class="bar" style="height:8px;border-radius:4px;flex:1"><i style="width:100%;background:var(--orange)"></i></span><b>${eur(senza, 0)}</b></div>
        <div style="display:flex;flex-direction:column;gap:6px"><span class="row sp" style="font-size:12px;color:var(--mut)"><span>Giorno ${a.giorno} di ${a.giorni}</span><span>${nf(prog)}%</span></span><span class="bar"><i style="width:${prog.toFixed(0)}%;background:var(--water)"></i></span></div>
        <div class="tiles3">
          <div><span>Maturato</span><b>${eur(a.maturato_ad_oggi, 0)}</b><em>risparmiati ${eur(a.risparmio_ad_oggi, 0)}</em></div>
          <div><span>Dalla rete</span><b>${nf(a.prelievo_previsto_kwh)} kWh</b><em>attesi</em></div>
          <div><span>Dal sole</span><b>${nf(a.produzione_prevista_kwh)} kWh</b><em>${nf(a.produzione_ad_oggi_kwh)} già prodotti</em></div>
        </div>
        <span class="foot">Costi fissi ${eur(a.costi_fissi_mensili)}/mese, canone TV escluso.</span>
      </section>`);
    }
    // autosufficienza
    const M = this._st('sensor.autosufficienza_mese'), Y = this._st('sensor.autosufficienza_anno');
    if (M && Y && !isNaN(parseFloat(M.state))) {
      const m = M.attributes, mn = cap(now.toLocaleDateString(i18nLoc(), { month: 'long' }));
      const ring = (v, col, l, s) => { const r = 38, cc = 2 * Math.PI * r, off = cc * (1 - Math.max(0, Math.min(100, v)) / 100); return `<div class="ring"><span><svg aria-hidden="true" width="96" height="96" viewBox="0 0 96 96" style="transform:rotate(-90deg)"><circle cx="48" cy="48" r="${r}" fill="none" stroke="rgba(243,239,231,.08)" stroke-width="9"/><circle cx="48" cy="48" r="${r}" fill="none" stroke="${col}" stroke-width="9" stroke-linecap="round" stroke-dasharray="${cc.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"/></svg><b class="disp">${nf(v)}%</b></span><strong>${l}</strong><em>${s}</em></div>`; };
      this._set('x_self', `<section class="card" aria-label="Autosufficienza">
        <div class="row sp"><span class="lab">Autosufficienza</span><span class="chip">stima</span></div>
        <div class="row" style="justify-content:space-around">${ring(parseFloat(M.state), 'var(--sea)', mn, 'consumi coperti dal sole')}${ring(parseFloat(Y.state), 'var(--sun)', 'Da gennaio', 'consumi coperti dal sole')}</div>
        <div class="tiles3"><div><span>Dal sole</span><b>${nf(m.autoconsumo_kwh)} kWh</b><em>autoconsumati</em></div><div><span>Dalla rete</span><b>${nf(m.prelievo_kwh)} kWh</b><em>prelevati</em></div><div><span>Immessi</span><b>${nf(m.immissione_kwh)} kWh</b><em>al GSE</em></div></div>
      </section>`);
    } else this._set('x_self', '');
    // valore del sole
    const c = this._config, vs = id => this._n(id, NaN);
    const vO = !isNaN(vs('sensor.valore_fv_oggi')) ? vs('sensor.valore_fv_oggi') : this._val(this._n(c.pv_today, 0));
    const vM = !isNaN(vs('sensor.valore_fv_mese')) ? vs('sensor.valore_fv_mese') : this._val(this._n(c.inverter.month, 0));
    const vY = !isNaN(vs('sensor.valore_fv_anno')) ? vs('sensor.valore_fv_anno') : this._val(this._n(c.inverter.year, 0));
    const gse = vs('sensor.accredito_gse_mese');
    this._set('x_value', `<section class="card" aria-label="Quanto vale il sole"><span class="lab">Quanto vale il sole</span>
      ${this._trio([['Oggi', eur(vO)], [cap(now.toLocaleDateString(i18nLoc(), { month: 'long' })), eur(vM)], [String(now.getFullYear()), eur(vY, 0)]])}
      ${!isNaN(gse) ? `<span class="foot">Accredito GSE previsto questo mese: <b>${eur(gse)}</b></span>` : ''}</section>`);
    // tariffe
    const T = [['input_number.prezzo_acquisto', 'Prezzo acquisto €/kWh', 4], ['input_number.prezzo_vendita', 'Energia immessa €/kWh', 4], ['input_number.quota_autoconsumo', 'Quota autoconsumata %', 0], ['input_number.prelievo_mensile', 'Prelievo medio kWh/mese', 0], ['input_number.costi_fissi_mensili', 'Costi fissi €/mese', 2]].filter(x => this._st(x[0]));
    this._set('x_tariffe', T.length ? `<section class="card" aria-label="Tariffe e stime" style="gap:2px"><div class="row sp" style="margin-bottom:6px"><span class="lab">Tariffe e stime</span></div>
      ${T.map(([id, l, d]) => `<div class="trow"><span>${l}</span><button data-act="step" data-id="${id}" data-dir="-1" aria-label="Diminuisci ${l}">−</button><b>${nf(this._n(id, 0), d)}</b><button data-act="step" data-id="${id}" data-dir="1" aria-label="Aumenta ${l}">+</button></div>`).join('')}</section>` : '');
    this._set('x_verify', this._verify(now));
    this._set('x_dati', this._billInputs());
    return { title, sub };
  }
  _verify(now) {
    const c = this._config, n = now;
    if (!this._st('input_number.bolletta_reale_totale')) return '';
    const p = this._prices(), base = this._n('input_number.prelievo_mensile', 137), fissi = this._n('input_number.costi_fissi_mensili', 28.47);
    const mese_fv = this._n(c.inverter.month, 0);
    const storico = { 1: 191, 2: 129, 3: 120, 4: 119, 5: 96, 6: 167 }, cons25 = { 10: 201, 11: 225, 12: 273 };
    const MESI = ['Gen–Feb', 'Mar–Apr', 'Mag–Giu', 'Lug–Ago', 'Set–Ott', 'Nov–Dic'];
    const sel = this._st('input_select.bolletta_periodo');
    let idx = sel ? MESI.indexOf(sel.state) : -1; if (idx < 0) idx = Math.floor(n.getMonth() / 2);
    const m1 = idx * 2; let y = n.getFullYear(); if (new Date(y, m1, 1) > n) y -= 1;
    const start = new Date(y, m1, 1), end = new Date(y, m1 + 2, 1);
    const FVID = c.inverter.month;
    const e = this._ws('cal:' + y + '-' + m1, 600000, () => ({ type: 'recorder/statistics_during_period', start_time: start.toISOString(), end_time: new Date(Math.min(end.getTime(), Date.now()) + 3600000).toISOString(), statistic_ids: [FVID], period: 'month', types: ['max', 'state'], units: { energy: 'kWh' } }));
    const data = (e.data && e.data[FVID]) || [];
    const prodStat = [0, 0];
    data.forEach(x => { const st = typeof x.start === 'number' ? x.start : new Date(x.start).getTime(); const mo = new Date(st).getMonth() - m1; const v = x.max != null ? x.max : x.state; if ((mo === 0 || mo === 1) && v != null) prodStat[mo] = Math.max(prodStat[mo], v); });
    const MAN = this._manualMonths(y);
    const months = [0, 1].map(k => {
      const ms = new Date(y, m1 + k, 1), me = new Date(y, m1 + k + 1, 1);
      const frac = Math.min(Math.max((n - ms) / (me - ms), 0), 1);
      const isCur = ms.getMonth() === n.getMonth() && ms.getFullYear() === n.getFullYear();
      let td = data.length ? prodStat[k] : null; if (isCur) td = Math.max(td || 0, mese_fv);
      if ((td === null || td === 0) && MAN[ms.getMonth()] !== null) td = MAN[ms.getMonth()]; if (td === null) td = 0;
      const proj = frac >= 1 ? td : (frac >= 0.1 ? td / frac : 250), mn = ms.getMonth() + 1;
      const kind = storico[mn] !== undefined ? 'storico' : cons25[mn] !== undefined ? 'cons' : 'base';
      const prel = kind === 'storico' ? storico[mn] : kind === 'cons' ? Math.max(cons25[mn] - proj * p.q, 0) : base;
      return { mn, proj, kind, prel };
    });
    const sum = f => months.reduce((a, m) => a + f(m), 0);
    const prel_est = sum(m => m.prel), prod = sum(m => m.proj), bill_est = prel_est * p.acq + fissi * 2, gse_est = prod * (1 - p.q) * p.ven;
    const tot = this._n('input_number.bolletta_reale_totale', 0), kwh = this._n('input_number.bolletta_reale_kwh', 0), extra = this._n('input_number.bolletta_reale_extra', 0), gse = this._n('input_number.bolletta_reale_gse', 0);
    const have = tot > 0 && kwh > 0, real = tot - extra;
    const pct = (a, b) => a > 0 ? (b - a) / a * 100 : 0, col = v => Math.abs(v) <= 5 ? 'var(--sea)' : Math.abs(v) <= 12 ? 'var(--sun)' : 'var(--coral)';
    const sg = v => (v > 0 ? '+' : v < 0 ? '−' : '') + nf(Math.abs(v), 1) + '%';
    const line = (l, a, b, f, u) => { const v = pct(a, b); return `<div class="vrow"><span>${l}</span><span>${f(a)}${u}</span><b>${f(b)}${u}</b><em style="color:${col(v)}">${sg(v)}</em></div>`; };
    const head = `<div class="row sp"><span class="lab">Verifica con la bolletta</span><span class="chip">${MESI[idx]} ${y}</span></div>`;
    const warn = end > n ? `<span class="foot" style="color:var(--sun)">Periodo non ancora concluso: i dati reali si inseriscono a bolletta emessa.</span>` : '';
    if (!have) return `<section class="card" aria-label="Verifica con la bolletta">${head}
      <div class="tiles3" style="grid-template-columns:1fr 1fr"><div><span>Bolletta stimata</span><b>${nf(bill_est, 2)} €</b></div><div><span>Prelievo stimato</span><b>${nf(prel_est)} kWh</b></div></div>
      <span class="foot">Inserisci totale e kWh della bolletta qui sotto: confronto la stima con il dato reale e ti propongo le correzioni.</span>${warn}</section>`;
    const sug = [];
    const pr = (real - fissi * 2) / kwh;
    if (pr > 0.05 && pr < 1) sug.push({ ent: 'input_number.prezzo_acquisto', label: 'Prezzo acquisto', cur: p.acq, val: Math.round(pr * 10000) / 10000, d: 4, u: ' €/kWh', tol: 0.015 });
    const nBase = months.filter(m => m.kind === 'base').length, fixedTot = months.filter(m => m.kind === 'storico').reduce((a, m) => a + m.prel, 0), consM = months.filter(m => m.kind === 'cons');
    if (nBase > 0) { const b = (kwh - fixedTot - consM.reduce((a, m) => a + m.prel, 0)) / nBase; if (b > 0 && b < 1000) sug.push({ ent: 'input_number.prelievo_mensile', label: 'Prelievo mensile di base', cur: base, val: Math.round(b), d: 0, u: ' kWh/mese', tol: 0.03 }); }
    if (consM.length > 0) { const sumC = consM.reduce((a, m) => a + cons25[m.mn], 0), sumP = consM.reduce((a, m) => a + m.proj, 0); const q = sumP > 0 ? (sumC - (kwh - fixedTot - nBase * base)) / sumP : -1; if (q >= 0 && q <= 1) sug.push({ ent: 'input_number.quota_autoconsumo', label: 'Quota autoconsumata', cur: p.q * 100, val: Math.round(q * 100), d: 0, u: ' %', tol: 0.02, abs: 1 }); }
    if (gse > 0 && prod > 0 && p.q < 1) { const pv = gse / (prod * (1 - p.q)); if (pv > 0.01 && pv < 0.5) sug.push({ ent: 'input_number.prezzo_vendita', label: 'Prezzo energia immessa', cur: p.ven, val: Math.round(pv * 10000) / 10000, d: 4, u: ' €/kWh', tol: 0.03 }); }
    const sugHtml = sug.map(s => {
      const diff = Math.abs(s.val - s.cur), same = s.abs ? diff < s.abs : diff / (s.cur || 1) <= s.tol;
      if (same) return `<div class="row sp" style="font-size:13px;padding:4px 2px"><span style="color:var(--mut3)">${s.label}</span><b style="color:var(--sea)">In linea · ${nf(s.cur, s.d)}${s.u}</b></div>`;
      const armed = this._armed === 'cal:' + s.ent;
      return `<div class="note"><span><b>${s.label}</b><br>${nf(s.cur, s.d)} → proposto <b>${nf(s.val, s.d)}${s.u}</b></span><button class="pbtn${armed ? ' warn' : ''}" data-act="calapply" data-id="${s.ent}" data-val="${s.val}">${armed ? 'Conferma' : 'Applica'}</button></div>`;
    }).join('');
    return `<section class="card" aria-label="Verifica con la bolletta">${head}
      <div><div class="vrow vh"><span></span><span>Stima</span><span>Reale</span><span>Scarto</span></div>
      ${line('Importo', bill_est, real, v => nf(v, 2), ' €')}${line('Prelievo', prel_est, kwh, v => nf(v), ' kWh')}${line('Costo medio', bill_est / Math.max(prel_est, 1), real / kwh, v => nf(v, 3), ' €')}${gse > 0 ? line('GSE', gse_est, gse, v => nf(v, 2), ' €') : ''}</div>
      ${sugHtml || '<span class="foot">Nessuna correzione possibile con questo periodo.</span>'}
      <span class="foot">Con una sola bolletta correggi un parametro alla volta. Importo reale = totale meno altre voci (${nf(extra, 2)} €).</span>${warn}</section>`;
  }
  _billInputs() {
    const sel = this._st('input_select.bolletta_periodo');
    const F = [['input_number.bolletta_reale_totale', 'Totale da pagare (€)'], ['input_number.bolletta_reale_kwh', 'Energia prelevata (kWh)'], ['input_number.bolletta_reale_extra', 'Altre voci, canone TV (€)'], ['input_number.bolletta_reale_gse', 'Accredito GSE del periodo (€)']].filter(x => this._st(x[0]));
    if (!sel && !F.length) return '';
    return `<section class="card" aria-label="Dati della bolletta"><span class="lab">Dati della bolletta</span>
      ${sel ? `<div class="chips">${(sel.attributes.options || []).map(o => `<button class="${o === sel.state ? 'on' : ''}" data-act="selopt" data-id="input_select.bolletta_periodo" data-v="${esc(o)}">${esc(o)}</button>`).join('')}</div>` : ''}
      ${F.map(([id, l]) => `<label class="inp"><span>${l}</span><input type="text" inputmode="decimal" data-num="${id}" value="${String(this._n(id, 0)).replace('.', ',')}"></label>`).join('')}
    </section>`;
  }

  // ---------------------------------------------------------------- Storico
  _manualMonths(y) {
    const DEF = y === 2026 ? [50.01, 198.21, 291.18, 406.97, 454.89, 468.3, 461.85, 400.86, 342.19, null, null, null] : [];
    const out = new Array(12).fill(null); DEF.forEach((v, i) => { out[i] = v; });
    const st = this._st('input_text.produzione_fv_mensile');
    if (st && st.state && !BAD.test(st.state)) st.state.trim().split(/[;\s]+/).slice(0, 12).forEach((t, i) => { const v = parseFloat(t.replace(',', '.')); if (!isNaN(v)) out[i] = v; });
    return out;
  }
  _e_storico(now) {
    const c = this._config, FVID = c.inverter.month, y = now.getFullYear(), cm = now.getMonth();
    const e = this._st(FVID) ? this._ws('mon:' + y, 600000, () => ({ type: 'recorder/statistics_during_period', start_time: new Date(y, 0, 1).toISOString(), end_time: new Date(Date.now() + 3600000).toISOString(), statistic_ids: [FVID], period: 'month', types: ['max', 'state'], units: { energy: 'kWh' } }), 'isola_mon') : {};
    const vals = new Array(12).fill(null);
    ((e.data && e.data[FVID]) || []).forEach(x => { const d = new Date(typeof x.start === 'number' ? x.start : x.start); const v = x.max != null ? x.max : x.state; if (d.getFullYear() === y && v != null) vals[d.getMonth()] = Math.max(v, 0); });
    const live = this._n(FVID, NaN); if (!isNaN(live)) vals[cm] = Math.max(vals[cm] || 0, live);
    const MAN = this._manualMonths(y);
    vals.forEach((v, i) => { if ((v === null || v === 0) && i !== cm && MAN[i] !== null) vals[i] = MAN[i]; });
    const shown = vals.slice(0, cm + 1), have = shown.filter(v => v !== null);
    const tot = have.reduce((a, b) => a + b, 0), mx = Math.max(...have, 1);
    const best = have.length ? shown.indexOf(Math.max(...have)) : -1;
    const sel = this._selM !== undefined && shown[this._selM] != null ? this._selM : best;
    const co2 = +c.co2_kg_kwh || 0.25;
    const MN = Array.from({ length: 12 }, (_, i) => { const t = new Date(2026, i, 1).toLocaleDateString(i18nLoc(), { month: 'short' }).replace('.', ''); return t.charAt(0).toUpperCase() + t.slice(1); });
    const ML = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
    const bars = vals.map((v, i) => {
      const future = i > cm;
      const h = v === null ? 0 : Math.max(v / mx * 100, 2);
      const st = future ? '' : i === sel ? 'background:var(--sun)' : i === cm ? 'background:repeating-linear-gradient(135deg,rgba(245,181,68,.55) 0 4px,rgba(245,181,68,.25) 4px 8px)' : 'background:rgba(245,181,68,.45)';
      const tip = i === sel && v !== null ? `<span class="tipb${i < 2 ? ' l' : i > 9 ? ' r' : ''}">${nf(v)} kWh<em>≈ ${nf(this._val(v))} €</em></span>` : '';
      return `<button class="mb" data-act="selm" data-k="${i}" ${future || v === null ? 'disabled' : ''} aria-label="${MN[i]}">${tip}${future ? '<i class="fut"></i>' : `<i style="height:${h.toFixed(1)}%;${st}"></i>`}</button>`;
    }).join('');
    const full = shown.filter((v, i) => v !== null && i !== cm), avg = full.length ? full.reduce((a, b) => a + b, 0) / full.length : null;
    this._set('x_months', `<section class="card" aria-label="Produzione mensile">
      <div class="row sp"><span class="lab">Produzione ${y}</span><span class="chip" style="color:var(--sea);background:rgba(94,211,195,.12)">≈ ${nf(this._val(tot))} €</span></div>
      ${!e.data && e.busy ? '<p class="mut" style="margin:0;font-size:12px">Aggiorno le statistiche…</p>' : ''}
      <div class="months">${bars}</div>
      <div class="mlab">${MN.map((m, i) => `<span${i === sel ? ' class="on"' : ''}>${m.charAt(0)}</span>`).join('')}</div>
      <span class="foot">${best >= 0 ? `Mese migliore: <b>${ML[best]}, ${nf(shown[best])} kWh</b>` : ''}${avg !== null ? ` · media ${nf(avg)} kWh` : ''}. Il mese in corso (a righe) è parziale.</span>
    </section>`);
    const iv = c.inverter, k = id => this._kwh(id);
    const tl = (l, v, s) => `<div class="tile"><span>${l}</span><b class="disp">${isNaN(v) ? '–' : nf(v, v < 100 ? 1 : 0)}<small> kWh</small></b><em>${s}</em></div>`;
    const kT = k(c.pv_today), kM = k(iv.month), kY = k(iv.year), kA = k(iv.total);
    this._set('x_totals', `<section style="display:flex;flex-direction:column;gap:12px" aria-label="Totali"><span class="lab">Totali</span><div class="grid2">
      ${tl('Oggi', kT, isNaN(kT) ? '' : '≈ ' + nf(this._val(kT), 2) + ' €')}${tl(cap(ML[cm]), kM, isNaN(kM) ? '' : '≈ ' + nf(this._val(kM), 2) + ' €')}
      ${tl(String(y), kY, isNaN(kY) ? '' : '≈ ' + nf(this._val(kY)) + ' €')}${tl('Dall’installazione', kA, isNaN(kA) ? '' : nf(kA * co2) + ' kg di CO₂ evitata')}</div></section>`);
    this._set('x_native', `<button class="linkcard" data-act="go" data-to="/energy"><span class="li">${svg('chart', 22)}</span><span style="flex:1"><b>Pannello Energia</b><small>I grafici ufficiali di Home Assistant</small></span>${svg('arrow', 20, 2)}</button>`);
    const yr = !isNaN(kY) ? Math.max(kY, tot) : tot;
    return { title: `${nf(yr)} kWh dal sole nel ${y}.`, sub: `Circa ${nf(this._val(yr))} € di valore e ${nf(yr * co2)} kg di CO₂ evitata.` };
  }

  // ================================================================ SICUREZZA e STANZE (fase 3)
  _roomParts(r) {
    const it = r.items || [];
    return {
      lights: it.filter(x => x.type === 'light' || x.type === 'switch').map(x => x.entity),
      media: it.find(x => x.type === 'media'),
      windows: it.filter(x => x.type === 'window').map(x => x.entity),
      climate: it.filter(x => x.type === 'climate').map(x => x.entity),
    };
  }
  _ago(iso, now) {
    const t = new Date(iso); if (isNaN(t)) return '';
    const m = (now - t) / 60000;
    if (m < 1) return 'ora'; if (m < 60) return Math.round(m) + ' min fa';
    if (sameDay(t, now)) return 'alle ' + hhmm(t);
    const y = new Date(now); y.setDate(y.getDate() - 1);
    return (sameDay(t, y) ? 'ieri ' : t.toLocaleDateString(i18nLoc(), { day: 'numeric', month: 'short' }) + ' ') + hhmm(t);
  }
  _isLive(alarm) { return (this._config.security.live_when || []).includes(alarm) || !!this._camLive; }

  // telecamere: card native di Home Assistant (stream live quando serve, altrimenti l'ultima immagine)
  async _helpersReady() {
    if (this._helpers !== undefined) return this._helpers;
    try { this._helpers = window.loadCardHelpers ? await window.loadCardHelpers() : null; } catch (e) { this._helpers = null; }
    return this._helpers;
  }
  _mountCams(slot, cams, live) {
    const box = this._slots[slot]; if (!box) return;
    const sig = cams.map(x => x.entity).join(',') + '|' + live;
    if (box.dataset.sig === sig) return;
    box.dataset.sig = sig;
    this._camEls = (this._camEls || []).filter(e => e.isConnected && !box.contains(e));
    box.innerHTML = cams.map((cm, i) => `<div class="cam" data-i="${i}"><div class="camv"></div><span class="camn"><b>${esc(cm.name)}</b><i data-mo="${esc(cm.entity)}"></i></span>${live ? '<span class="camlive"><i></i>Live</span>' : ''}</div>`).join('');
    const token = (this._camTok = (this._camTok || 0) + 1);
    this._helpersReady().then(H => {
      if (token !== this._camTok || box.dataset.sig !== sig) return;
      box.querySelectorAll('.cam').forEach((w, i) => {
        const cm = cams[i], v = w.querySelector('.camv');
        let el;
        if (H) {
          el = H.createCardElement({ type: 'picture-entity', entity: cm.entity, camera_view: live ? 'live' : 'auto', show_name: false, show_state: false, tap_action: { action: 'more-info' } });
        } else {
          el = document.createElement('img'); el.className = 'camimg'; el.alt = cm.name;
          el.addEventListener('click', () => this._fire('hass-more-info', { entityId: cm.entity }));
        }
        v.appendChild(el);
        if (el.tagName !== 'IMG') { el.hass = this._hass; this._camEls.push(el); } else this._camImgs = (this._camImgs || []).concat([{ el, id: cm.entity }]);
      });
      this._camOverlays();
    });
  }
  _unmountCams() {
    ['s_cams', 'r_cams'].forEach(k => { const b = this._slots[k]; if (b) { b.innerHTML = ''; delete b.dataset.sig; } });
    this._camEls = []; this._camImgs = []; this._camTok = (this._camTok || 0) + 1;
  }
  _camOverlays() {
    const now = new Date();
    (this._camImgs || []).forEach(x => { const s = this._st(x.id); if (s && s.attributes.entity_picture) { const u = s.attributes.entity_picture; if (x.el.dataset.u !== u) { x.el.dataset.u = u; x.el.src = u; } } });
    const all = [...(this._config.security.cameras || []), ...this._config.rooms.flatMap(r => (r.items || []).filter(x => x.type === 'camera'))];
    this._root.querySelectorAll('[data-mo]').forEach(el => {
      const cm = all.find(x => x.entity === el.dataset.mo); if (!cm) return;
      const ding = cm.ding && this._st(cm.ding)?.state === 'on', mo = cm.motion ? this._st(cm.motion) : null;
      const txt = ding ? 'Suonano alla porta' : mo && mo.state === 'on' ? 'Movimento ora' : mo ? 'Movimento ' + this._ago(mo.last_changed, now) : '';
      el.textContent = txt; el.className = ding || (mo && mo.state === 'on') ? 'hot' : '';
    });
  }

  _renderSicurezza(now, night) {
    const c = this._config, S = c.security, al = this._st(c.alarm), st = al ? al.state : '';
    const T = { disarmed: 'Disinserito.', armed_home: 'Inserito in casa.', armed_away: 'Inserito, siete fuori.', armed_night: 'Inserito per la notte.', armed_vacation: 'Modalità vacanza.', armed_custom_bypass: 'Inserito.', arming: 'Si sta inserendo…', pending: 'Ingresso rilevato…', triggered: 'Allarme!' };
    const openW = c.windows.filter(w => this._st(w.entity)?.state === 'on');
    const lock = this._st(c.lock)?.state || '';
    const subs = [openW.length ? 'Aperte: ' + openW.map(w => w.name.toLowerCase()).join(', ') : 'Porte e finestre chiuse'];
    if (lock) subs.push(lock === 'locked' ? 'portone chiuso a chiave' : lock === 'jammed' ? 'serratura bloccata' : 'portone aperto');
    this._set('s_kick', al ? 'Sicurezza' : 'Sicurezza · allarme non trovato');
    this._set('s_title', esc(T[st] || 'Sicurezza'));
    this._slots.s_title.classList.toggle('alert', st === 'triggered' || st === 'pending');
    this._set('s_sub', esc(subs.join(', ') + '.'));

    // modalità
    const sf = al ? +al.attributes.supported_features : NaN;
    const has = bit => isNaN(sf) || (sf & bit) === bit;
    const M = [['disarm', 'Disinserito', 'shieldoff', 'disarmed', true], ['arm_home', 'In casa', 'home', 'armed_home', has(1)], ['arm_away', 'Fuori', 'away', 'armed_away', has(2)], ['arm_night', 'Notte', 'moon', 'armed_night', has(4)]].filter(x => x[4]);
    this._set('s_modes', al ? `<div class="modes" style="grid-template-columns:repeat(${M.length === 3 ? 3 : 2},minmax(0,1fr))">${M.map(([k, l, ic, sv]) => `<button class="mode${st === sv ? ' on' : ''}${sv === 'disarmed' ? ' off' : ''}" data-act="alarm" data-k="${k}" aria-pressed="${st === sv}">${svg(ic, 22)}<b>${l}</b></button>`).join('')}</div>` : '');

    // telecamere: live quando l'allarme è inserito
    const live = this._isLive(st);
    this._set('s_camhead', `<div class="row sp"><span class="lab">Telecamere</span><button class="mini1${live ? ' on' : ''}" data-act="camlive">${live ? (this._camLive ? 'Live · tocca per fermare' : 'Live con allarme inserito') : 'Guarda live'}</button></div>`);
    this._mountCams('s_cams', S.cameras || [], live);
    this._camOverlays();

    // accessi
    const gl = S.gate && S.gate.lock ? this._st(S.gate.lock) : null;
    const lockTxt = { locked: 'Chiuso a chiave', unlocked: 'Aperto', open: 'Aperto', opening: 'Si apre…', locking: 'Si chiude…', unlocking: 'Si apre…', jammed: 'Bloccato' };
    const rows = [];
    if (this._st(c.lock)) rows.push(`<div class="acc"><span class="ai2${lock !== 'locked' ? ' warn' : ''}">${svg(lock === 'locked' ? 'lock' : 'unlock', 22)}</span><span class="grow"><b>Portone</b><small>${lockTxt[lock] || cap(lock)}</small></span>${lock === 'locked' ? `<button class="pbtn ghost" data-act="lock" data-id="${c.lock}" data-k="unlock">Apri</button>` : `<button class="pbtn" data-act="lock" data-id="${c.lock}" data-k="lock">Chiudi</button>`}</div>`);
    if (S.gate) rows.push(`<div class="acc"><span class="ai2">${svg('gate', 22)}</span><span class="grow"><b>${esc(S.gate.name || 'Cancelletto')}</b><small>${gl ? (lockTxt[gl.state] || cap(gl.state)) : 'Ring Intercom'}</small></span><button class="pbtn light" data-act="gate">${svg('faceid', 16, 2)}Apri</button></div>`);
    this._set('s_access', rows.length ? `<section class="card" style="gap:0;padding:6px 18px" aria-label="Accessi">${rows.join('')}</section>` : '');

    // finestre
    this._set('s_windows', c.windows.length ? `<section style="display:flex;flex-direction:column;gap:12px" aria-label="Finestre"><span class="lab">Finestre</span><div class="grid2">${c.windows.map(w => {
      const s = this._st(w.entity), on = s && s.state === 'on';
      return `<button class="win${on ? ' open' : ''}" data-act="more" data-id="${esc(w.entity)}">${svg('window', 22)}<span><b>${esc(w.name)}</b><small>${!s ? 'non trovata' : on ? 'Aperta · ' + this._ago(s.last_changed, now) : 'Chiusa'}</small></span></button>`; }).join('')}</div></section>` : '');

    // movimenti
    const mv = (S.motion || []).map(id => this._st(id)).filter(Boolean).sort((a, b) => new Date(b.last_changed) - new Date(a.last_changed));
    this._set('s_motion', mv.length ? `<section class="card" style="gap:0;padding:8px 18px" aria-label="Movimenti"><span class="lab" style="padding:10px 0 4px">Ultimi movimenti</span>${mv.map(s => `<button class="mrow" data-act="more" data-id="${esc(s.entity_id)}"><i class="${s.state === 'on' ? 'hot' : ''}"></i><span class="grow">${esc((s.attributes.friendly_name || s.entity_id).replace(/\s*(motion|movimento)$/i, ''))}</span><small>${s.state === 'on' ? 'adesso' : this._ago(s.last_changed, now)}</small></button>`).join('')}</section>` : '');
  }

  _renderStanze(now, night) {
    const c = this._config, devs = c.devices.map(d => this._device(d)).filter(Boolean);
    const r = this._room ? c.rooms.find(x => x.name === this._room) : null;
    this._root.querySelector('[data-page="stanze"] .rlist').hidden = !!r;
    this._root.querySelector('[data-page="stanze"] .rdet').hidden = !r;
    if (!r) {
      this._set('st_rooms', this._roomsList(devs));
      if (this._slots.r_cams && this._slots.r_cams.dataset.sig) this._unmountCams();
      return;
    }
    const P = this._roomParts(r), mine = devs.filter(x => x.d.room === r.name);
    // intestazione con la foto della stanza
    let bg = '';
    if (r.crop) {
      const [x0, y0, x1, y1] = r.crop, rw = x1 - x0, tw = 390, th = 300, visH = th * rw / tw, cy = (y0 + y1) / 2;
      const top = Math.max(0, Math.min(IMG_H - visH, cy - visH / 2));
      bg = `background-image:url('${esc(r.image || c.image)}');background-size:${(IMG_W / rw * 100).toFixed(1)}% auto;background-position:${(rw >= IMG_W ? 0 : x0 / (IMG_W - rw) * 100).toFixed(1)}% ${(IMG_H - visH <= 0 ? 0 : top / (IMG_H - visH) * 100).toFixed(1)}%`;
    }
    const on = P.lights.filter(id => this._st(id)?.state === 'on').length;
    const bits = [];
    if (P.lights.length) bits.push(on ? `${on} ${on === 1 ? 'luce accesa' : 'luci accese'}` : 'luci spente');
    mine.filter(x => x.active).forEach(x => bits.push(`${x.d.name} al lavoro`));
    const ow = P.windows.filter(id => this._st(id)?.state === 'on').length; if (ow) bits.push(ow === 1 ? 'finestra aperta' : ow + ' finestre aperte');
    const t0 = P.climate.map(id => this._st(id)?.attributes?.current_temperature).find(v => v !== undefined);
    if (t0 !== undefined) bits.unshift(nf(t0, 1) + '°');
    this._set('r_head', `<div class="rhero${r.crop ? '' : ' none'}" style="${bg}"><span class="shade"></span>
      <button class="ib back" data-act="roomback" aria-label="Torna alle stanze">${svg('back', 20, 2)}</button>
      <div class="rcap"><h1 class="disp" style="font-size:40px;line-height:1">${esc(r.name)}</h1><span>${esc(cap(bits.join(' · ')) || (r.note || ''))}</span></div></div>`);

    const H = [];
    // luci e prese
    const L = (r.items || []).filter(x => x.type === 'light' || x.type === 'switch');
    const AU = (r.items || []).filter(x => x.type === 'auto'), dark = this._st('sun.sun')?.state === 'below_horizon';
    if (L.length || AU.length) H.push(`<section class="rsec"><span class="lab">Luci</span>${L.length ? '<div class="grid2">' : '<div style="display:none">'}${L.map(x => {
      const s = this._st(x.entity), o = s && s.state === 'on', dim = s && x.type === 'light' && (s.attributes.supported_color_modes || []).some(m => m !== 'onoff');
      const bri = o && s.attributes.brightness !== undefined ? Math.round(s.attributes.brightness / 2.55) : null;
      return `<div class="lt${o ? ' on' : ''}"><button class="ltb" data-act="toggle" data-id="${esc(x.entity)}" aria-pressed="${o}">${svg(x.outdoor ? 'lamp' : 'bulb', 24, 1.9)}<span><b>${esc(x.name)}</b><small>${!s ? 'non trovata' : o ? 'Accesa' + (bri !== null ? ' · ' + bri + '%' : '') : 'Spenta'}</small></span></button>${dim && o ? `<input class="bri" type="range" min="1" max="100" value="${bri || 100}" data-bri="${esc(x.entity)}" aria-label="Luminosità ${esc(x.name)}">` : ''}</div>`; }).join('')}</div>
      ${(r.items || []).filter(x => x.type === 'auto').map(x => `<div class="arow"><span class="grow"><b>${esc(x.name)}</b><small>${esc(x.note || '')}</small></span><span class="chip">${dark ? 'Accesa · auto' : 'Spenta · auto'}</span></div>`).join('')}</section>`);
    // dispositivi della stanza
    if (mine.length) H.push(`<section class="rsec"><span class="lab">Dispositivi</span>${mine.map(x => this._devRoomHtml(x, r)).join('')}</section>`);
    // tv
    (r.items || []).filter(x => x.type === 'media').forEach(x => {
      const s = this._st(x.state_entity || x.entity), o = s && ['on', 'playing', 'paused', 'idle', 'buffering'].includes(s.state);
      H.push(`<div class="arow card2"><span class="ai2">${svg('tv', 22)}</span><span class="grow"><b>${esc(x.name)}</b><small>${!s ? 'non trovata' : o ? 'Accesa' + (s.attributes.media_title ? ' · ' + esc(s.attributes.media_title) : '') : 'Spenta'}</small></span><button class="sw${o ? ' on' : ''}" data-act="media" data-id="${esc(x.entity)}" data-on="${o ? 1 : 0}" aria-label="${o ? 'Spegni' : 'Accendi'} ${esc(x.name)}" aria-pressed="${o}"><i></i></button></div>`);
    });
    // clima
    (r.items || []).filter(x => x.type === 'climate').forEach(x => H.push(this._climaRoomHtml(x)));
    // accessi, finestre, sensori
    const rowsA = [];
    (r.items || []).forEach(x => {
      const s = this._st(x.entity);
      if (x.type === 'lock' && s) rowsA.push(`<div class="arow"><span class="ai2${s.state !== 'locked' ? ' warn' : ''}">${svg(s.state === 'locked' ? 'lock' : 'unlock', 20)}</span><span class="grow"><b>${esc(x.name)}</b><small>${s.state === 'locked' ? 'Chiuso a chiave' : 'Aperto'}</small></span><button class="pbtn${s.state === 'locked' ? ' ghost' : ''}" data-act="lock" data-id="${esc(x.entity)}" data-k="${s.state === 'locked' ? 'unlock' : 'lock'}">${s.state === 'locked' ? 'Apri' : 'Chiudi'}</button></div>`);
      if (x.type === 'gate') rowsA.push(`<div class="arow"><span class="ai2">${svg('gate', 20)}</span><span class="grow"><b>${esc(c.security.gate?.name || 'Cancelletto')}</b><small>Con conferma Face ID</small></span><button class="pbtn light" data-act="gate">${svg('faceid', 16, 2)}Apri</button></div>`);
      if (x.type === 'window') rowsA.push(`<button class="arow" data-act="more" data-id="${esc(x.entity)}"><span class="ai2${s && s.state === 'on' ? ' warn' : ''}">${svg('window', 20)}</span><span class="grow"><b>${esc(x.name)}</b><small${s && s.state === 'on' ? ' style="color:var(--coral)"' : ''}>${!s ? 'non trovata' : s.state === 'on' ? 'Aperta · ' + this._ago(s.last_changed, now) : 'Chiusa'}</small></span></button>`);
      if (x.type === 'motion' && s) rowsA.push(`<button class="arow" data-act="more" data-id="${esc(x.entity)}"><span class="ai2">${svg('motion', 20)}</span><span class="grow"><b>${esc(x.name)}</b><small>${s.state === 'on' ? 'Movimento adesso' : 'Ultimo movimento ' + this._ago(s.last_changed, now)}</small></span></button>`);
      if (x.type === 'binary' && s) rowsA.push(`<button class="arow" data-act="more" data-id="${esc(x.entity)}"><span class="ai2">${svg('drop', 20)}</span><span class="grow"><b>${esc(x.name)}</b><small>${s.state === 'on' ? esc(x.on || 'Sì') : esc(x.off || 'No')}</small></span></button>`);
      if (x.type === 'sensor' && s) rowsA.push(`<button class="arow" data-act="more" data-id="${esc(x.entity)}"><span class="ai2">${svg('gauge', 20)}</span><span class="grow"><b>${esc(x.name)}</b></span><small class="val">${esc(({ full: 'Pieno', empty: 'Vuoto', low: 'Basso', normal: 'Ok', ok: 'Ok', high: 'Alto', on: 'Sì', off: 'No' })[String(s.state).toLowerCase()] || cap(String(s.state).replace(/_/g, ' ')))}${s.attributes.unit_of_measurement ? ' ' + esc(s.attributes.unit_of_measurement) : ''}</small></button>`);
      if (x.type === 'siren' && s) { const o = s.state === 'on'; rowsA.push(`<div class="arow"><span class="ai2${o ? ' warn' : ''}">${svg('siren', 20)}</span><span class="grow"><b>${esc(x.name)}</b><small>${o ? 'Suona adesso' : 'Spenta'}</small></span><button class="sw${o ? ' on' : ''}" data-act="siren" data-id="${esc(x.entity)}" data-on="${o ? 1 : 0}" aria-pressed="${o}" aria-label="${esc(x.name)}"><i></i></button></div>`); }
      if (x.type === 'placeholder') rowsA.push(`<div class="arow ph"><span class="ai2">${svg('drop', 20)}</span><span class="grow"><b>${esc(x.name)}</b><small>${esc(x.note || '')}</small></span></div>`);
    });
    if (rowsA.length) H.push(`<section class="card" style="gap:0;padding:4px 16px">${rowsA.join('')}</section>`);
    this._set('r_main', H.join(''));
    const cams = (r.items || []).filter(x => x.type === 'camera');
    const st = this._st(c.alarm)?.state || '';
    this._set('r_camhead', cams.length ? `<span class="lab">Telecamere</span>` : '');
    this._mountCams('r_cams', cams, this._isLive(st));
    this._camOverlays();
    this._set('r_more', '');
  }
  _devRoomHtml(x, r) {
    const d = x.d, col = x.color, s = this._st(d.entity); let st = s ? String(s.state).toLowerCase() : ''; if (d.type === 'mower') st = this._mowSt(d, st);
    const btn = (svc, label, primary) => `<button class="pbtn${primary ? '' : ' ghost'}" data-act="svc" data-svc="${svc}" data-id="${esc(d.entity)}">${label}</button>`;
    let acts = '';
    if (d.type === 'vacuum') {
      const seg = (r.items || []).find(i => i.type === 'clean' && i.device === d.name);
      acts = st === 'cleaning' ? btn('vacuum.pause', 'Pausa') + btn('vacuum.return_to_base', 'Alla base') : (seg ? `<button class="pbtn" data-act="seg" data-id="${esc(d.entity)}" data-seg="${seg.segments.join(',')}">${esc(seg.name)}</button>` : '') + btn('vacuum.start', st === 'paused' ? 'Riprendi' : 'Pulisci tutto', !seg) + (st === 'paused' || st === 'returning' ? '' : '');
    } else if (d.acts) {
      const L = (x.active ? d.acts.active : d.acts.idle) || [];
      acts = L.map(([svc, label, data], i) => `<button class="pbtn${i === 0 && !x.active ? '' : ' ghost'}" data-act="svc" data-svc="${svc}" data-id="${esc(d.entity)}" data-data="${esc(JSON.stringify(data || {}))}">${esc(label)}</button>`).join('');
    } else if (d.type === 'mower') {
      acts = st === 'mowing' ? btn('lawn_mower.pause', 'Pausa') + btn('lawn_mower.dock', 'Alla base') : btn('lawn_mower.start_mowing', st === 'paused' ? 'Riprendi' : 'Avvia taglio', true) + (st === 'paused' ? btn('lawn_mower.dock', 'Alla base') : '');
    }
    const info = [];
    const b = this._num(d.battery); if (!isNaN(b) && d.type !== 'mower') info.push(`Batteria ${nf(b)}%`);
    if (d.type === 'washer') { const pw = this._watts(d.power); if (pw !== null && x.active) info.push(nf(pw) + ' W'); }
    if (d.type === 'mower') { const rain = this._st(d.rain); if (rain && !/unknown|unavailable/.test(rain.state)) info.push(/wet|rain|on|bagnat/i.test(rain.state) ? 'pioggia rilevata' : 'erba asciutta'); }
    return `<div class="dcard${x.active ? '' : ' rest'}${x.paused ? ' paused' : ''}">
      <div class="row" style="gap:14px"><button class="ic" data-act="opendev" data-dev="${esc(d.name)}" style="background:${col}24;color:${col}" aria-label="${esc(d.name)}"><svg aria-hidden="true" width="44" height="44" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">${DEV_SVG[d.type] || ''}</svg></button>
        <span class="grow"><span class="row" style="gap:8px"><b style="font-size:17px">${esc(d.name)}</b><span class="chip" style="color:${x.active ? col : 'var(--mut2)'};background:${x.active ? col + '22' : 'rgba(243,239,231,.08)'}">${x.active ? 'Al lavoro' : cap(x.idleText || 'fermo')}</span></span><small>${esc(x.active ? x.sub : info.join(' · ') || x.sub)}</small></span></div>
      ${x.active ? `<span class="bar${x.ind ? ' ind' : ''}"><i style="width:${x.pct === null ? 40 : x.pct.toFixed(0)}%;background:${col}"></i></span>` : ''}
      <div class="row" style="gap:8px;flex-wrap:wrap">${acts}<button class="pbtn ghost" data-act="opendev" data-dev="${esc(d.name)}">Tutti i comandi</button></div>
    </div>`;
  }
  _climaRoomHtml(x) {
    const s = this._st(x.entity); if (!s) return '';
    const a = s.attributes, mode = s.state, onn = mode !== 'off' && !BAD.test(mode);
    const ML = { off: 'Spento', cool: 'Freddo', heat: 'Caldo', dry: 'Deumid.', fan_only: 'Ventola', auto: 'Auto', heat_cool: 'Auto' };
    const modes = (a.hvac_modes || ['off', 'cool', 'heat']).filter(m => ML[m]);
    return `<div class="dcard">
      <div class="row" style="gap:14px"><span class="ai2" style="width:48px;height:48px;border-radius:16px;color:${onn ? 'var(--water)' : 'var(--mut2)'}">${svg('snow', 24)}</span>
        <span class="grow" data-act="openclima" data-id="${esc(x.entity)}" role="button" style="cursor:pointer"><b style="font-size:17px">${esc(x.name)} ${svg('chev', 14, 2.2)}</b><small>In stanza ${a.current_temperature !== undefined ? nf(a.current_temperature, 1) + '°' : '–'}${a.current_humidity !== undefined ? ' · umidità ' + nf(a.current_humidity) + '%' : ''}</small></span>
        <button class="sw${onn ? ' on' : ''}" data-act="hvac" data-id="${esc(x.entity)}" data-mode="${onn ? 'off' : (a.hvac_modes || []).includes('cool') ? 'cool' : (modes.find(m => m !== 'off') || 'auto')}" aria-pressed="${onn}" aria-label="${onn ? 'Spegni' : 'Accendi'}"><i></i></button></div>
      ${onn ? `<div class="row" style="gap:12px;justify-content:center"><button class="rnd" data-act="ctemp" data-id="${esc(x.entity)}" data-dir="-1" aria-label="Abbassa">−</button><span class="disp" style="font-size:44px;line-height:1;min-width:120px;text-align:center">${a.temperature !== undefined ? nf(a.temperature, (a.target_temp_step || 1) < 1 ? 1 : 0) + '°' : '–'}</span><button class="rnd" data-act="ctemp" data-id="${esc(x.entity)}" data-dir="1" aria-label="Alza">+</button></div>
      <div class="chips">${modes.filter(m => m !== 'off').map(m => `<button class="${m === mode ? 'on' : ''}" data-act="hvac" data-id="${esc(x.entity)}" data-mode="${m}">${ML[m]}</button>`).join('')}</div>` : ''}
    </div>`;
  }

  // ================================================================ PAGINE COMPLETE (fase 4): dispositivi, clima, consumi, sistema
  _fname(id, strip) {
    const s = this._st(id); let n = (s && s.attributes.friendly_name) || id.split('.')[1].replace(/_/g, ' ');
    if (strip) n = n.replace(new RegExp('^\\s*' + strip.replace(/[_\s]+/g, '[_\\s]+') + '[\\s_:-]*', 'i'), '');
    n = n.trim(); const k = n.toLowerCase();
    if (NAME_IT[k]) return NAME_IT[k];
    const m = k.match(/^room (\d+) cleaning times$/); if (m) return 'Passaggi stanza ' + m[1];
    return cap(n) || id;
  }
  _opt(v) {
    const k = String(v).toLowerCase();
    return OPT_IT[k] !== undefined ? OPT_IT[k] : cap(String(v).replace(/_/g, ' '));
  }
  _fmt(s) {
    if (!s) return '–';
    const st = String(s.state), a = s.attributes || {}, dom = s.entity_id.split('.')[0];
    if (BAD.test(st)) return st === 'unavailable' ? 'Non disponibile' : '–';
    if (dom === 'binary_sensor') { const L = BIN_IT[a.device_class] || ['Sì', 'No']; return st === 'on' ? L[0] : L[1]; }
    if (a.device_class === 'timestamp' || /^\d{4}-\d\d-\d\dT/.test(st)) { const d = new Date(st); if (!isNaN(d)) return d > new Date() ? (sameDay(d, new Date()) ? 'alle ' + hhmm(d) : d.toLocaleDateString(i18nLoc(), { weekday: 'short', day: 'numeric', month: 'short' }) + ' ' + hhmm(d)) : this._ago(st, new Date()); }
    const v = Number(st);
    if (st !== '' && !isNaN(v)) { const u = a.unit_of_measurement || ''; return nf(v, Number.isInteger(v) ? 0 : Math.abs(v) < 10 ? 2 : 1) + (u ? (u === '%' ? '%' : ' ' + u) : ''); }
    return STATE_IT[st.toLowerCase()] || this._opt(st);
  }
  _like(pattern, domains) {
    const re = pattern instanceof RegExp ? pattern : new RegExp(pattern.replace(/\*/g, '.*'), 'i');
    return Object.keys(this._hass.states).filter(id => domains.includes(id.split('.')[0]) && re.test(id)).sort((a, b) => this._fname(a).localeCompare(this._fname(b), 'it'));
  }
  _ctrl(id, strip, label) {
    const s = this._st(id); if (!s) return '';
    const dom = id.split('.')[0], a = s.attributes, n = esc(label || this._fname(id, strip)), bad = BAD.test(s.state);
    if (dom === 'select' || dom === 'input_select') return `<div class="crow"><span class="cn">${n}</span><button class="cpick" data-act="pick" data-id="${esc(id)}" ${bad ? 'disabled' : ''}>${esc(bad ? 'Non disp.' : this._opt(s.state))}${svg('chev', 14, 2.2)}</button></div>`;
    if (dom === 'switch' || dom === 'input_boolean' || dom === 'light' || dom === 'fan' || dom === 'humidifier') { const o = s.state === 'on'; return `<div class="crow"><span class="cn">${n}</span><button class="sw${o ? ' on' : ''}" data-act="toggle" data-id="${esc(id)}" aria-pressed="${o}" aria-label="${n}" ${bad ? 'disabled' : ''}><i></i></button></div>`; }
    if (dom === 'number' || dom === 'input_number') { const d = (+a.step || 1) < 1 ? String(a.step).split('.')[1].length : 0; return `<div class="crow"><span class="cn">${n}</span><span class="cnum"><button data-act="num" data-id="${esc(id)}" data-dir="-1" aria-label="Diminuisci">−</button><b>${bad ? '–' : nf(+s.state, d)}${a.unit_of_measurement ? '<small> ' + esc(a.unit_of_measurement) + '</small>' : ''}</b><button data-act="num" data-id="${esc(id)}" data-dir="1" aria-label="Aumenta">+</button></span></div>`; }
    if (dom === 'button' || dom === 'input_button') return `<div class="crow"><span class="cn">${n}</span><button class="pbtn ghost" data-act="press" data-id="${esc(id)}" ${s.state === 'unavailable' ? 'disabled' : ''}>Esegui</button></div>`;
    if (dom === 'script') return `<div class="crow"><span class="cn">${n}${s.state === 'on' ? '<small> · in corso</small>' : ''}</span><button class="pbtn ghost" data-act="run" data-id="${esc(id)}">${svg('play', 14, 2.2)}</button></div>`;
    return `<button class="crow" data-act="more" data-id="${esc(id)}"><span class="cn">${n}</span><span class="cv">${esc(this._fmt(s))}</span></button>`;
  }
  _spark(id, hours, color, title, attr) {
    const s = this._st(id); if (!s) return '';
    const e = this._ws('h:' + id + ':' + hours + ':' + (attr || ''), 600000, () => ({ type: 'history/history_during_period', start_time: new Date(Date.now() - hours * 3600000).toISOString(), end_time: new Date().toISOString(), entity_ids: [id], minimal_response: !attr, no_attributes: !attr, significant_changes_only: false }));
    const head = `<div class="row sp"><span class="lab">${esc(title)}</span><span class="mut" style="font-size:12px">${hours} ore</span></div>`;
    if (!e.data) return `<section class="card">${head}<p class="mut" style="margin:0;font-size:13px">${e.err ? 'Storico non disponibile' : 'Carico lo storico…'}</p></section>`;
    const raw = (e.data[id] || []).map(x => ({ t: x.lu ? x.lu * 1000 : new Date(x.last_updated || x.last_changed).getTime(), a: x.a || x.attributes, v: parseFloat(x.s !== undefined ? x.s : x.state) }));
    const W = 340, H = 110, t0 = Date.now() - hours * 3600000, t1 = Date.now();
    const lines = (attr ? attr : [null]).map((k, li) => {
      let pts = raw.map(p => ({ t: Math.max(p.t, t0), v: k ? parseFloat((p.a || {})[k]) : p.v })).filter(p => !isNaN(p.v));
      if (pts.length) pts.push({ t: t1, v: pts[pts.length - 1].v });
      return pts;
    });
    const all = lines.flat(); if (!all.length) return `<section class="card">${head}<p class="mut" style="margin:0;font-size:13px">Nessun dato</p></section>`;
    let lo = Math.min(...all.map(p => p.v)), hi = Math.max(...all.map(p => p.v)); if (hi - lo < 1) { hi += 0.5; lo -= 0.5; }
    const X = t => ((t - t0) / (t1 - t0) * W).toFixed(1), Y = v => (H - 6 - (v - lo) / (hi - lo) * (H - 14)).toFixed(1);
    const cols = attr ? ['#8EC5F2', '#E8935C'] : [color];
    const paths = lines.map((pts, i) => pts.length ? `<path d="${pts.map((p, j) => `${j ? 'L' : 'M'}${X(p.t)},${Y(p.v)}`).join(' ')}" fill="none" stroke="${cols[i]}" stroke-width="2" stroke-linejoin="round"${attr ? '' : ' style="vector-effect:non-scaling-stroke"'}/>` : '').join('');
    const u0 = (s.attributes || {}).unit_of_measurement || (attr ? '°' : ''), u = u0 && !['°', '%', '°C'].includes(u0) ? ' ' + u0 : u0;
    return `<section class="card">${head}<svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="none" style="display:block;height:110px">${paths}</svg>
      <div class="row sp" style="font-size:12px;color:var(--mut)"><span>min ${nf(lo, 1)}${esc(u)}</span>${attr ? `<span><i class="lg" style="background:#8EC5F2"></i>${esc(attr[0] === 'current_temperature' ? 'Ambiente' : attr[0])}  <i class="lg" style="background:#E8935C"></i>Impostata</span>` : ''}<span>max ${nf(hi, 1)}${esc(u)}</span></div></section>`;
  }
  _events(ids, hours, title, limit) {
    if (!ids.length || !this._hass.callWS) return '';
    const e = this._ws('lb:' + ids.join(',') + ':' + hours, 120000, () => ({ type: 'logbook/get_events', start_time: new Date(Date.now() - hours * 3600000).toISOString(), end_time: new Date().toISOString(), entity_ids: ids }));
    const head = `<span class="lab" style="padding:10px 0 4px">${esc(title)}</span>`;
    if (!e.data) return `<section class="card" style="gap:0;padding:8px 18px">${head}<p class="mut" style="margin:6px 0 10px;font-size:13px">${e.err ? 'Registro non disponibile' : 'Carico il registro…'}</p></section>`;
    const list = (Array.isArray(e.data) ? e.data : []).filter(x => x.state !== undefined || x.message).sort((a, b) => b.when - a.when).slice(0, limit || 12);
    if (!list.length) return `<section class="card" style="gap:0;padding:8px 18px">${head}<p class="mut" style="margin:6px 0 10px;font-size:13px">Nessun evento nelle ultime ${hours} ore</p></section>`;
    const now = new Date();
    return `<section class="card" style="gap:0;padding:8px 18px">${head}${list.map(x => {
      const st = x.state !== undefined ? this._fmt({ entity_id: x.entity_id || 'sensor.x', state: x.state, attributes: (this._st(x.entity_id) || {}).attributes || {} }) : x.message;
      return `<div class="mrow" style="cursor:default"><i></i><span class="grow"><span style="font-size:14px">${esc(ids.length > 1 ? (this._fname(x.entity_id || '') + ': ') : '')}${esc(st)}</span></span><small>${this._ago(new Date(x.when * 1000).toISOString(), now)}</small></div>`; }).join('')}</section>`;
  }
  _pick(id) {
    const s = this._st(id); if (!s) return;
    const opts = s.attributes.options || [];
    this._pendingFn = null;
    this._slots.overlay.innerHTML = `<div class="sheet" data-act="sheetno"><div class="box" role="dialog" aria-label="${esc(this._fname(id))}"><b class="disp">${esc(this._fname(id))}</b><div class="opts">${opts.map(o => `<button class="${o === s.state ? 'on' : ''}" data-act="pickopt" data-id="${esc(id)}" data-v="${esc(o)}">${esc(this._opt(o))}${o === s.state ? svg('check', 16, 2.4) : ''}</button>`).join('')}</div><div class="btns"><button data-act="sheetno">Chiudi</button></div></div></div>`;
    this._slots.overlay.querySelector('.box').addEventListener('click', ev => ev.stopPropagation());
    this._slots.overlay.querySelectorAll('.box button').forEach(x => x.addEventListener('click', ev => { ev.stopPropagation(); this._click({ target: x }); }));
  }
  _pics() {
    this._root.querySelectorAll('img[data-pic]').forEach(img => {
      const s = this._st(img.dataset.pic); if (!s || !s.attributes.entity_picture) return;
      let u = s.attributes.entity_picture;
      if (img.dataset.live === '1') u += (u.includes('?') ? '&' : '?') + '_t=' + Math.floor(Date.now() / 10000);
      if (img.getAttribute('src') !== u) img.setAttribute('src', u);
    });
  }
  _goSub(sub) {
    if (this._page !== 'sub') this._subFrom = this._page;
    this._unmountCams();
    this._sub = sub; this._page = 'sub'; this._showPage(); this._app.scrollTo({ top: 0 }); this._cache = {}; this._schedule();
  }
  _subHead(kick, title, sub) {
    return `<div class="top"><button class="ib" data-act="subback" aria-label="Indietro">${svg('back', 20, 2)}</button><span class="lab">${esc(kick)}</span><button class="ib" data-act="assist" aria-label="Assist">${svg('mic', 20)}</button></div>
      ${title ? `<h1 class="disp">${esc(title)}</h1>` : ''}${sub ? `<p class="sub">${esc(sub)}</p>` : ''}`;
  }
  _renderSub(now, night) {
    const S = this._sub || {};
    if (S.k === 'dev') return this._renderDevPage(now);
    if (S.k === 'clima') return this._renderClimaPage(now);
    if (S.k === 'consumi') return this._renderConsumi(now);
  }

  // ---------------------------------------------------------------- pagina dispositivo
  _renderDevPage(now) {
    const c = this._config, d = c.devices.find(x => x.name === this._sub.id); if (!d) return;
    const x = this._device(d) || { d, active: false, sub: 'non trovato', color: DEV_COLOR[d.type], pct: null };
    const P = d.page || {}, s = this._st(d.entity), st = s ? String(s.state).toLowerCase() : '';
    const col = x.color;
    this._set('u_head', this._subHead(d.room || 'Dispositivo', '', ''));
    const b = this._num(d.battery);
    const statusTxt = x.active ? x.sub : (STATE_IT[st] || cap(x.idleText || this._fmt(s)));
    const hero = `<section class="dhero${x.active ? '' : ' rest'}${x.paused ? ' paused' : ''}" style="--dc:${col}">
      <button class="ic" data-act="more" data-id="${esc(d.entity)}" aria-label="Dettagli ${esc(d.name)}"><svg aria-hidden="true" width="64" height="64" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">${DEV_SVG[d.type] || ''}</svg></button>
      <h1 class="disp">${esc(d.name)}</h1>
      <span class="chip" style="color:${x.active ? col : 'var(--mut2)'};background:${x.active ? col + '22' : 'rgba(243,239,231,.08)'}">${x.active ? 'Al lavoro' : esc(cap(x.idleText || 'fermo'))}</span>
      <p class="sub" style="text-align:center">${esc(statusTxt)}</p>
      ${x.active ? `<span class="bar${x.ind ? ' ind' : ''}" style="width:100%"><i style="width:${x.pct === null ? 40 : x.pct.toFixed(0)}%;background:${col}"></i></span>` : !isNaN(b) ? `<span class="row" style="gap:8px;width:100%;font-size:12px;color:var(--mut)"><span>Batteria</span><span class="bar" style="flex:1"><i style="width:${b}%;background:${b < 20 ? 'var(--coral)' : col}"></i></span><b style="color:var(--tx)">${nf(b)}%</b></span>` : ''}
    </section>`;
    const cmds = (P.commands || []).filter(([sv]) => { const dom = sv.split('.')[0]; return dom !== 'vacuum' || s; });
    const cmdHtml = cmds.length ? `<div class="cmds" style="grid-template-columns:repeat(${cmds.length <= 4 ? cmds.length : 3},minmax(0,1fr))">${cmds.map(([sv, l, ic, data]) => `<button data-act="svc" data-svc="${sv}" data-id="${esc(d.entity)}"${data ? ` data-data="${esc(JSON.stringify(data))}"` : ''}>${svg(ic, 22, 2)}<span>${esc(l)}</span></button>`).join('')}</div>` : '';
    const map = P.map && this._st(P.map) ? `<button class="map" data-act="more" data-id="${esc(P.map)}" aria-label="Mappa"><img data-pic="${esc(P.map)}" data-live="${x.active ? 1 : 0}" alt="Mappa di ${esc(d.name)}"><span class="camn"><b>Mappa</b></span></button>` : '';
    const quick = (P.quick || []).map(q => Array.isArray(q) ? q : [q, null]).filter(([id]) => this._st(id));
    const quickHtml = quick.length ? `<section class="card" style="gap:0;padding:6px 18px"><span class="lab" style="padding:10px 0 4px">Impostazioni</span>${quick.map(([id, l]) => this._ctrl(id, P.strip || d.name, l)).join('')}</section>` : '';
    let roomsHtml = '';
    if (P.rooms && P.rooms.length) roomsHtml = `<section class="card" style="gap:0;padding:6px 18px"><span class="lab" style="padding:10px 0 4px">Pulizia per stanza</span>${P.rooms.map(r => {
      const t = this._st(r.times);
      return `<div class="crow"><span class="cn">${esc(r.name)}</span>${t ? `<button class="cpick" data-act="pick" data-id="${esc(r.times)}" aria-label="Passaggi ${esc(r.name)}">${esc(this._opt(t.state))}×${svg('chev', 14, 2.2)}</button>` : ''}<button class="pbtn" data-act="seg" data-id="${esc(d.entity)}" data-seg="${r.seg}">Pulisci</button></div>`; }).join('')}</section>`;
    const info = (P.info || []).filter(([id]) => this._st(id));
    const infoHtml = info.length ? `<div class="grid2">${info.map(([id, l]) => `<button class="tile" data-act="more" data-id="${esc(id)}" style="border:0;text-align:left;cursor:pointer"><span>${esc(l)}</span><b style="font-size:20px;line-height:1.15">${esc(this._fmt(this._st(id)))}</b></button>`).join('')}</div>` : '';
    const chart = P.chart ? this._spark(P.chart, 24, col, P.chartTitle || 'Batteria') : '';
    const log = this._events([d.entity], 48, 'Storico attività', 10);
    const pat = P.pattern;
    const ctrls = pat ? this._like(pat, ['select', 'switch', 'number', 'button', 'time', 'text']).filter(id => !quick.some(([q]) => q === id) && !(P.rooms || []).some(r => r.times === id)) : [];
    const sens = pat ? this._like(pat, ['sensor', 'binary_sensor', 'camera', 'image', 'event']).filter(id => !info.some(([i]) => i === id)) : [];
    const k = 'dev:' + d.name, open = this._exp && this._exp[k];
    const allHtml = ctrls.length + sens.length ? `<section class="card" style="gap:0;padding:6px 18px">
      <button class="crow" data-act="exp" data-k="${esc(k)}"><span class="cn"><b>Tutte le impostazioni</b><small> · ${ctrls.length + sens.length}</small></span>${svg(open ? 'chevup' : 'chev', 16, 2.2)}</button>
      ${open ? (ctrls.length ? `<span class="lab" style="padding:14px 0 2px">Comandi</span>${ctrls.map(id => this._ctrl(id, P.strip || d.name)).join('')}` : '') + (sens.length ? `<span class="lab" style="padding:14px 0 2px">Sensori</span>${sens.map(id => this._ctrl(id, P.strip || d.name)).join('')}` : '') : ''}
    </section>` : '';
    this._set('u_main', [hero, cmdHtml, map, quickHtml, roomsHtml, infoHtml, chart, log, allHtml].filter(Boolean).join(''));
    this._pics();
  }

  // ---------------------------------------------------------------- pagina clima
  _renderClimaPage(now) {
    const c = this._config, cl = (c.climates || []).find(x => x.entity === this._sub.id) || { entity: this._sub.id, name: this._fname(this._sub.id), prefix: '' };
    const s = this._st(cl.entity);
    this._set('u_head', this._subHead('Clima', '', ''));
    if (!s) { this._set('u_main', '<p class="mut">Condizionatore non trovato</p>'); return; }
    const a = s.attributes, mode = s.state, onn = mode !== 'off' && !BAD.test(mode);
    const ML = { off: 'Spento', cool: 'Freddo', heat: 'Caldo', dry: 'Deumidifica', fan_only: 'Ventola', auto: 'Auto', heat_cool: 'Auto' };
    const indoor = this._num('sensor.' + cl.prefix + '_indoor_temperature');
    const tin = !isNaN(indoor) ? indoor : +a.current_temperature;
    const w = this._st(c.weather), tout = w ? +w.attributes.temperature : NaN;
    const diff = !isNaN(tin) && !isNaN(tout) ? tin - tout : null;
    const dtxt = diff === null ? '' : Math.abs(diff) <= 0.4 ? 'come fuori' : `${nf(Math.abs(diff), 1)}° ${diff > 0 ? 'più caldo' : 'più fresco'} di fuori (${nf(tout, 1)}°)`;
    const step = +a.target_temp_step || 1;
    const chips = (list, act, cur, map) => (list || []).length ? `<div class="chips">${list.map(m => `<button class="${m === cur ? 'on' : ''}" data-act="${act}" data-id="${esc(cl.entity)}" data-mode="${esc(m)}">${esc(map && map[m] ? map[m] : this._opt(m))}</button>`).join('')}</div>` : '';
    const hero = `<section class="dhero" style="--dc:${onn ? 'var(--water)' : 'var(--mut2)'}">
      <h1 class="disp">${esc(cl.name)}</h1>
      <span class="disp" style="font-size:64px;line-height:1">${isNaN(tin) ? '–' : nf(tin, 1)}°</span>
      <p class="sub" style="text-align:center">In stanza${a.current_humidity !== undefined ? ' · umidità ' + nf(a.current_humidity) + '%' : ''}${dtxt ? '<br>' + esc(dtxt) : ''}</p>
      <div class="row" style="gap:12px"><span class="chip" style="color:${onn ? 'var(--water)' : 'var(--mut2)'};background:${onn ? 'rgba(142,197,242,.14)' : 'rgba(243,239,231,.08)'}">${esc(ML[mode] || this._opt(mode))}</span>
      <button class="sw${onn ? ' on' : ''}" data-act="hvac" data-id="${esc(cl.entity)}" data-mode="${onn ? 'off' : (a.hvac_modes || []).includes('cool') ? 'cool' : ((a.hvac_modes || []).find(m => m !== 'off') || 'auto')}" aria-pressed="${onn}" aria-label="${onn ? 'Spegni' : 'Accendi'}"><i></i></button></div>
    </section>`;
    const thermo = `<section class="card" aria-label="Temperatura impostata"><span class="lab">Temperatura impostata</span>
      <div class="row" style="gap:14px;justify-content:center"><button class="rnd" data-act="ctemp" data-id="${esc(cl.entity)}" data-dir="-1" aria-label="Abbassa">−</button><span class="disp" style="font-size:52px;line-height:1;min-width:140px;text-align:center">${a.temperature !== undefined ? nf(a.temperature, step < 1 ? 1 : 0) + '°' : '–'}</span><button class="rnd" data-act="ctemp" data-id="${esc(cl.entity)}" data-dir="1" aria-label="Alza">+</button></div>
      <span class="lab" style="margin-top:4px">Modalità</span>${chips((a.hvac_modes || []).filter(m => m !== 'off'), 'hvac', mode, ML)}
      ${(a.fan_modes || []).length ? `<span class="lab" style="margin-top:4px">Ventilazione</span>${chips(a.fan_modes, 'fanm', a.fan_mode)}` : ''}
      ${(a.swing_modes || []).length ? `<span class="lab" style="margin-top:4px">Alette</span>${chips(a.swing_modes, 'swing', a.swing_mode)}` : ''}
      ${(a.preset_modes || []).length ? `<span class="lab" style="margin-top:4px">Preset</span>${chips(a.preset_modes, 'preset', a.preset_mode)}` : ''}
    </section>`;
    // consumi del condizionatore
    const S = this._hass.states, p = this._prices();
    const pick = re => { const ids = Object.keys(S).filter(i => i.startsWith('sensor.' + cl.prefix + '_') && re.test(i) && !isNaN(parseFloat(S[i].state))); return ids.find(i => /real|total/i.test(i)) || ids[0]; };
    const pw = cl.prefix ? pick(/(real_?time_?power|_power)$/i) : null, en = cl.prefix ? pick(/energy_consumption$/i) : null;
    const enV = en ? this._kwh(en) : NaN;
    const cons = pw || en ? `<div class="grid2">${pw ? `<button class="tile" data-act="more" data-id="${pw}" style="border:0;text-align:left;cursor:pointer"><span>Potenza ora</span><b class="disp">${nf(this._watts(pw) || 0)}<small> W</small></b></button>` : ''}${en ? `<button class="tile" data-act="more" data-id="${en}" style="border:0;text-align:left;cursor:pointer"><span>Energia</span><b class="disp">${nf(enV, 1)}<small> kWh</small></b><em>≈ ${nf(enV * p.acq, 2)} €</em></button>` : ''}</div>` : '';
    const chart = this._spark(cl.entity, 24, '#8EC5F2', 'Ambiente e impostata', ['current_temperature', 'temperature']);
    const ctrls = cl.prefix ? this._like('\\.' + cl.prefix + '_', ['switch', 'select', 'number', 'button', 'light', 'fan', 'humidifier']) : [];
    const sens = cl.prefix ? this._like('\\.' + cl.prefix + '_', ['sensor', 'binary_sensor']).filter(id => !BAD.test(this._st(id).state)) : [];
    const k = 'cl:' + cl.entity, open = this._exp && this._exp[k];
    const allHtml = ctrls.length + sens.length ? `<section class="card" style="gap:0;padding:6px 18px">
      <button class="crow" data-act="exp" data-k="${esc(k)}"><span class="cn"><b>Tutte le funzioni</b><small> · ${ctrls.length + sens.length}</small></span>${svg(open ? 'chevup' : 'chev', 16, 2.2)}</button>
      ${open ? (ctrls.length ? `<span class="lab" style="padding:14px 0 2px">Controlli</span>${ctrls.map(id => this._ctrl(id, cl.prefix)).join('')}` : '') + (sens.length ? `<span class="lab" style="padding:14px 0 2px">Sensori e consumi</span>${sens.map(id => this._ctrl(id, cl.prefix)).join('')}` : '') : ''}
    </section>` : '';
    this._set('u_main', [hero, thermo, cons, chart, allHtml].filter(Boolean).join(''));
  }

  // ---------------------------------------------------------------- consumi dettagliati
  _renderConsumi(now) {
    const c = this._config, FV = c.pv_power, hours = this._cper || 24, p = this._prices();
    this._set('u_head', this._subHead('Energia', 'Sole e consumi', ''));
    const pw = this._rows('power');
    const ids = [...(this._st(FV) ? [FV] : []), ...pw.map(x => x.id).filter(i => i !== FV)].slice(0, 25).sort();
    const e = this._ws('cons:' + hours + ':' + ids.join(','), hours > 24 ? 900000 : 300000, () => ({ type: 'history/history_during_period', start_time: new Date(Date.now() - hours * 3600000).toISOString(), end_time: new Date().toISOString(), entity_ids: ids, minimal_response: true, no_attributes: true, significant_changes_only: false }));
    const seg = `<nav class="seg">${[[6, '6 ore'], [24, '24 ore'], [48, '2 giorni'], [168, '7 giorni']].map(([h, l]) => `<button class="${h === hours ? 'on' : ''}" data-act="cper" data-k="${h}">${l}</button>`).join('')}</nav>`;
    if (!e.data) { this._set('u_main', seg + `<section class="card"><p class="mut" style="margin:0">${e.err ? 'Storico non disponibile al momento' : 'Carico lo storico…'}</p></section>`); return; }
    if (!e.proc) {
      const t1 = e.ts, t0 = t1 - hours * 3600000, N = 96, step = (t1 - t0) / N, out = {};
      Object.keys(e.data).forEach(id => {
        const u = this._st(id)?.attributes?.unit_of_measurement, k = u === 'kW' ? 1000 : u === 'mW' ? 0.001 : 1;
        const ev = e.data[id].map(x => ({ t: x.lu ? x.lu * 1000 : new Date(x.last_updated || x.last_changed).getTime(), v: parseFloat(x.s !== undefined ? x.s : x.state) * k })).filter(x => !isNaN(x.v) && !isNaN(x.t)).sort((a, b) => a.t - b.t);
        if (!ev.length) return;
        const pts = []; let j = 0, cur = ev[0].v;
        while (j < ev.length && ev[j].t <= t0) { cur = ev[j].v; j++; }
        for (let i = 0; i < N; i++) {
          const b0 = t0 + i * step, b1 = b0 + step; let acc = 0, t = b0;
          while (j < ev.length && ev[j].t <= b1) { acc += Math.max(cur, 0) * (ev[j].t - t); t = ev[j].t; cur = ev[j].v; j++; }
          acc += Math.max(cur, 0) * (b1 - t); pts.push(acc / step);
        }
        out[id] = pts;
      });
      e.proc = { out, t0, t1, step };
    }
    const D = e.proc.out, name = id => id === FV ? 'Fotovoltaico' : ((pw.find(x => x.id === id) || {}).name || this._fname(id));
    const lightIds = pw.filter(x => /^(light\.|switch\.luce_)/.test(x.src || '') && D[x.id]).map(x => x.id);
    const cand = {};
    Object.keys(D).forEach(id => { if (id !== FV && !lightIds.includes(id)) cand[id] = { pts: D[id], ids: [id], est: !!(pw.find(x => x.id === id) || {}).est }; });
    if (lightIds.length) cand.__luci = { pts: D[lightIds[0]].map((_, i) => lightIds.reduce((a, id) => a + ((D[id] || [])[i] || 0), 0)), ids: lightIds, est: true };
    const kwh = pts => pts.reduce((a, v) => a + v, 0) * e.proc.step / 3600000 / 1000;
    const PAL = ['#5ED3C3', '#8EC5F2', '#B79CF2', '#9BCB6B', '#E8935C', '#C9D0D4', '#F3EFE7'];
    const cons = Object.keys(cand).map(id => ({ id, name: id === '__luci' ? 'Luci' : name(id), pts: cand[id].pts, est: cand[id].est, k: kwh(cand[id].pts) })).filter(x => x.k >= 0.005).sort((a, b) => b.k - a.k);
    const series = [];
    if (D[FV]) series.push({ id: FV, name: 'Fotovoltaico', color: '#F5B544', pts: D[FV], fill: true, k: kwh(D[FV]) });
    cons.slice(0, 7).forEach((x, i) => series.push({ ...x, color: x.id === '__luci' ? '#FF7A66' : PAL[i % PAL.length] }));
    const hid = this._chid || {};
    const vis = series.filter(s => !hid[s.id]);
    const W = 340, H = 220, Lm = 30, R = 4, T = 10, B = 22, n = 96;
    const ymaxRaw = Math.max(...vis.map(s => Math.max(...s.pts)), 100);
    const ymax = [100, 200, 500, 1000, 1500, 2000, 3000, 4000, 5000, 7000, 10000].find(v => v >= ymaxRaw) || Math.ceil(ymaxRaw / 1000) * 1000;
    const X = i => Lm + (W - Lm - R) * i / (n - 1), Y = v => T + (H - T - B) * (1 - Math.min(Math.max(v, 0), ymax) / ymax);
    let g = '';
    [0, 0.5, 1].forEach(f => { const y = Y(ymax * f); g += `<line x1="${Lm}" x2="${W - R}" y1="${y}" y2="${y}" stroke="rgba(243,239,231,.07)"/><text x="${Lm - 5}" y="${y + 3}" text-anchor="end" class="ax">${ymax * f >= 1000 ? nf(ymax * f / 1000, 1) + 'k' : Math.round(ymax * f)}</text>`; });
    const span = e.proc.t1 - e.proc.t0;
    for (let k = 0; k <= 4; k++) { const t = new Date(e.proc.t0 + span * k / 4); g += `<text x="${Lm + (W - Lm - R) * k / 4}" y="${H - 6}" text-anchor="${k === 0 ? 'start' : k === 4 ? 'end' : 'middle'}" class="ax">${k === 4 ? 'ora' : hours > 48 ? t.toLocaleDateString(i18nLoc(), { weekday: 'short' }) : String(t.getHours()).padStart(2, '0') + ':00'}</text>`; }
    vis.slice().reverse().forEach(s => {
      const line = s.pts.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
      if (s.fill) g += `<path d="${line} L${X(n - 1)},${Y(0)} L${X(0)},${Y(0)} Z" fill="url(#isola-fv2)"/>`;
      g += `<path d="${line}" fill="none" stroke="${s.color}" stroke-width="${s.fill ? 2 : 1.6}" stroke-linejoin="round"${s.est ? ' stroke-dasharray="5 3"' : ''}/>`;
    });
    let tip = '';
    if (this._cf !== undefined && this._cf !== null) {
      const i = Math.max(0, Math.min(n - 1, Math.round((this._cf * W - Lm) / (W - Lm - R) * (n - 1))));
      const x = X(i), t = new Date(e.proc.t0 + (i + 0.5) * e.proc.step);
      g += `<line x1="${x}" x2="${x}" y1="${T}" y2="${H - B}" stroke="#F3EFE7" stroke-opacity=".5" stroke-dasharray="2 3"/>`;
      tip = `<div class="ctip"><b>${hours > 24 ? t.toLocaleDateString(i18nLoc(), { weekday: 'short', day: 'numeric' }) + ' ' : ''}${hhmm(t)}</b>${vis.map(s => `<span><i style="background:${s.color}"></i>${esc(s.name)}<em>${nf(s.pts[i])} W</em></span>`).join('')}</div>`;
    }
    const chart = `<section class="card"><div class="row sp"><span class="lab">Potenza</span><span class="mut" style="font-size:12px">tocca il grafico</span></div>
      <svg data-chart="consumi" viewBox="0 0 ${W} ${H}" width="100%" style="display:block;touch-action:pan-y"><defs><linearGradient id="isola-fv2" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#F5B544" stop-opacity=".5"/><stop offset="1" stop-color="#F5B544" stop-opacity=".03"/></linearGradient></defs>${g}</svg>${tip}
      <div class="legend">${series.map(s => `<button class="lgb${hid[s.id] ? ' off' : ''}" data-act="cser" data-k="${esc(s.id)}"><i style="background:${s.color}"></i>${esc(s.name)}</button>`).join('')}</div></section>`;
    const tot = cons.reduce((a, x) => a + x.k, 0), mx = Math.max(...cons.map(x => x.k), 0.01);
    const fvK = D[FV] ? kwh(D[FV]) : null;
    const sum = `<section class="card" style="gap:2px"><div class="row sp" style="margin-bottom:6px"><span class="lab">Nel periodo</span>${fvK !== null ? `<span class="chip" style="color:var(--sun);background:rgba(245,181,68,.14)">Sole ${nf(fvK, 1)} kWh · ≈ ${nf(this._val(fvK), 2)} €</span>` : ''}</div>
      ${cons.slice(0, 12).map(x => `<button class="prow erow" data-act="more" data-id="${esc(x.id === '__luci' ? lightIds[0] : x.id)}"><span class="row" style="gap:8px;min-width:0"><span class="pn">${esc(x.name)}</span>${x.est ? '<span class="chip">stima</span>' : ''}</span><span class="row" style="gap:8px"><span class="bar" style="height:5px;flex:1"><i style="width:${Math.max(3, x.k / mx * 100).toFixed(0)}%;background:var(--sea)"></i></span><b>${nf(x.k, x.k < 10 ? 2 : 1)} kWh</b></span></button>`).join('')}
      <span class="foot">Consumi tracciati: <b>${nf(tot, 1)} kWh</b> · ≈ ${nf(tot * p.acq, 2)} € al prezzo di acquisto</span></section>`;
    this._set('u_main', seg + chart + sum);
  }

  // ---------------------------------------------------------------- Sistema
  _renderSistema(now) {
    const c = this._config, S = this._hass.states, E = this._hass.entities || {}, DV = this._hass.devices || {};
    const ids = Object.keys(S);
    const val = id => { if (!id) return null; const v = parseFloat(S[id].state); return isNaN(v) ? null : v; };
    const find = (re, unit) => ids.find(id => id.startsWith('sensor.') && re.test(id) && val(id) !== null && (!unit || S[id].attributes.unit_of_measurement === unit));
    const memId = find(/(memory_usage|memory_use_percent|memory_percent)/, '%') || find(/(host|core)_memory_percent/, '%');
    let diskId = find(/(disk_usage|disk_use_percent|disk_percent)/, '%'), disk = val(diskId);
    if (disk === null) { const u = find(/host_disk_used/), t = find(/host_disk_total/); if (u && t && val(t) > 0) { disk = val(u) / val(t) * 100; diskId = u; } }
    const tempId = find(/(processor_temperature|cpu_temp|processor_temp|soc_temp)/), cpuId = find(/(processor_use|cpu_use|cpu_usage|processor_usage)/, '%') || find(/(host|core)_cpu_percent/, '%');
    const bootId = ids.find(id => /(last_boot|boot_time)/.test(id) && !isNaN(new Date(S[id].state).getTime()));
    const bkId = ids.find(id => /^sensor\.backup_last_successful_automatic_backup/.test(id) && !isNaN(new Date(S[id].state).getTime()));
    const core = S['update.home_assistant_core_update'];
    const upd = ids.filter(id => id.startsWith('update.') && S[id].state === 'on');
    // problemi
    const DOM = ['light', 'switch', 'sensor', 'binary_sensor', 'climate', 'cover', 'lock', 'camera', 'vacuum', 'lawn_mower', 'media_player', 'fan', 'valve', 'humidifier', 'water_heater'];
    const off = {};
    ids.forEach(id => {
      const st = S[id]; if (st.state !== 'unavailable' || !DOM.includes(id.split('.')[0]) || /^sensor\.iphone_/.test(id)) return;
      if (now - new Date(st.last_changed).getTime() < 600000) return;
      const en = E[id]; if (en && (en.hidden || en.entity_category || en.platform === 'mobile_app')) return;
      const dev = en && en.device_id ? DV[en.device_id] : null, key = dev ? en.device_id : id;
      (off[key] = off[key] || { name: dev ? (dev.name_by_user || dev.name || id) : (st.attributes.friendly_name || id), n: 0, id }).n++;
    });
    const bats = ids.filter(id => id.startsWith('sensor.') && S[id].attributes.device_class === 'battery' && S[id].attributes.unit_of_measurement === '%' && val(id) !== null).sort((a, b) => val(a) - val(b));
    const low = bats.filter(id => val(id) <= 20 && !/^sensor\.iphone_/.test(id));
    const nProb = Object.keys(off).length + low.length + upd.length;
    this._set('y_title', nProb ? `${nProb} ${nProb === 1 ? 'cosa' : 'cose'} da controllare.` : 'Tutto in ordine.');
    const tile = (l, v, sub, id) => `<button class="tile" ${id ? `data-act="more" data-id="${id}"` : 'disabled'} style="border:0;text-align:left;cursor:pointer"><span>${l}</span><b class="disp" style="font-size:22px">${v}</b>${sub ? `<em>${sub}</em>` : ''}</button>`;
    const pc = v => v === null ? '–' : nf(v) + '%';
    this._set('y_sys', `<section class="rsec"><span class="lab">Home Assistant</span><div class="grid2">
      ${tile('Versione', core ? esc(core.attributes.installed_version || '–') : '–', core && core.state === 'on' ? 'nuova: ' + esc(core.attributes.latest_version || '') : 'aggiornato', core ? 'update.home_assistant_core_update' : '')}
      ${tile('Ultimo backup', bkId ? esc(this._ago(S[bkId].state, now)) : '–', 'automatico', bkId)}
      ${tile('Memoria', pc(val(memId)), cpuId ? 'CPU ' + pc(val(cpuId)) : '', memId)}
      ${tile('Disco', pc(disk), tempId ? 'temperatura ' + nf(val(tempId)) + '°' : '', diskId)}
      ${tile('Acceso da', bootId ? esc(this._ago(S[bootId].state, now)) : '–', '', bootId)}
      ${tile('Aggiornamenti', upd.length ? String(upd.length) : 'nessuno', upd.length ? 'da installare' : '', '')}
    </div></section>`);
    const exp = k => this._exp && this._exp[k];
    const more = (k, n, lim) => n > lim ? `<button class="more" style="margin-top:8px" data-act="exp" data-k="${k}">${exp(k) ? 'Mostra meno' : 'Mostra tutti (' + n + ')'}</button>` : '';
    // aggiornamenti e problemi
    const probRows = [
      ...upd.map(id => `<button class="arow" data-act="more" data-id="${id}"><span class="ai2">${svg('update', 20)}</span><span class="grow"><b>${esc(this._fname(id))}</b><small>${esc((S[id].attributes.installed_version || '') + ' → ' + (S[id].attributes.latest_version || ''))}</small></span></button>`),
      ...Object.values(off).map(g => `<button class="arow" data-act="more" data-id="${esc(g.id)}"><span class="ai2 warn">${svg('offline', 20)}</span><span class="grow"><b>${esc(g.name)}</b><small>${g.n > 1 ? g.n + ' entità non disponibili' : 'Non disponibile'}</small></span></button>`)];
    this._set('y_prob', probRows.length ? `<section class="card" style="gap:0;padding:4px 16px"><span class="lab" style="padding:12px 0 4px">Da controllare</span>${(exp('prob') ? probRows : probRows.slice(0, 5)).join('')}${more('prob', probRows.length, 5)}</section>` : '');
    // batterie
    const bRows = bats.map(id => { const v = val(id); return `<button class="crow" data-act="more" data-id="${id}"><span class="cn">${esc(this._fname(id).replace(/\s*(battery|batteria)( level)?$/i, ''))}</span><span class="row" style="gap:8px;width:120px"><span class="bar" style="flex:1"><i style="width:${v}%;background:${v <= 20 ? 'var(--coral)' : v <= 50 ? 'var(--sun)' : 'var(--sea)'}"></i></span><b style="font-size:13px;min-width:38px;text-align:right">${nf(v)}%</b></span></button>`; });
    this._set('y_bat', bRows.length ? `<section class="card" style="gap:0;padding:4px 18px"><span class="lab" style="padding:12px 0 4px">Batterie</span>${(exp('bat') ? bRows : bRows.slice(0, 6)).join('')}${more('bat', bRows.length, 6)}</section>` : '');
    // manutenzione (tutto, non solo le urgenze)
    this._set('y_maint', this._maintHtml());
    // rete
    const wl = ids.filter(id => id.startsWith('sensor.') && /(_wireless$|wifi_strength|_signal_strength$|_rssi$|wifi_signal)/.test(id) && !/^sensor\.iphone_/.test(id));
    const star = ['sensor.starlink_capacita_di_trasmissione_in_downlink', 'sensor.starlink_capacita_di_trasmissione_in_uplink', 'binary_sensor.starlink_connettivita', 'sensor.starlink_tasso_di_perdita_di_ping'].filter(id => S[id]);
    this._set('y_net', wl.length || star.length ? `<section class="card" style="gap:0;padding:4px 18px"><span class="lab" style="padding:12px 0 4px">Rete</span>${wl.map(id => this._ctrl(id)).join('')}${star.length ? `<span class="lab" style="padding:14px 0 2px">Starlink</span>${star.map(id => this._ctrl(id, 'starlink')).join('')}` : ''}</section>` : '');
    this._set('y_star', S['sensor.starlink_downlink_throughput'] ? this._spark('sensor.starlink_downlink_throughput', 24, '#8EC5F2', 'Starlink · download') : '');
    // scene, script, automazioni
    const sc = c.scenes;
    this._set('y_scenes', `<section class="rsec"><span class="lab">Scene</span><div class="grid2">${[['morning', 'sun'], ['night', 'moon'], ['out', 'exit'], ['home', 'enter']].filter(([k]) => sc[k]).map(([k, ic]) => `<button class="scene" style="height:56px" data-act="scene" data-k="${k}">${svg(ic, 18)}${esc(sc[k].name)}</button>`).join('')}</div></section>`);
    const scr = ids.filter(id => id.startsWith('script.')).sort((a, b) => this._fname(a).localeCompare(this._fname(b), 'it'));
    const sRows = scr.map(id => this._ctrl(id));
    this._set('y_scripts', sRows.length ? `<section class="card" style="gap:0;padding:4px 18px"><span class="lab" style="padding:12px 0 4px">Script</span>${(exp('scr') ? sRows : sRows.slice(0, 6)).join('')}${more('scr', sRows.length, 6)}</section>` : '');
    const au = ids.filter(id => id.startsWith('automation.') && S[id].state !== 'unavailable').sort((a, b) => this._fname(a).localeCompare(this._fname(b), 'it'));
    const aRows = au.map(id => { const s = S[id], o = s.state === 'on', lt = s.attributes.last_triggered; return `<div class="crow"><span class="cn">${esc(this._fname(id))}<small>${lt ? ' · ' + esc(this._ago(lt, now)) : ''}</small></span><button class="sw${o ? ' on' : ''}" data-act="toggle" data-id="${id}" aria-pressed="${o}" aria-label="${esc(this._fname(id))}"><i></i></button></div>`; });
    this._set('y_autos', aRows.length ? `<section class="card" style="gap:0;padding:4px 18px"><span class="lab" style="padding:12px 0 4px">Automazioni</span>${(exp('aut') ? aRows : aRows.slice(0, 6)).join('')}${more('aut', aRows.length, 6)}</section>` : '');
    this._set('y_events', this._events((c.security.events || []).filter(id => S[id]), 48, 'Ultimi eventi · 48 ore', 15));
  }
  _maintHtml() {
    const S = this._hass.states;
    const RB = new RegExp('(' + ((this._config.devices || []).map(d => (d.page && d.page.pattern) || '').filter(Boolean).join('|') || '§') + ')', 'i'), PART = /(filter|filtro|brush|spazzol|mop|panno|roller|rullo|blade|lama|detergent|dust_bag|sacchett|consumab)/, SKIPT = /(total|totale|cleaning_time|clean_count|conteggio|cronologia|history|firmware|reset|ripristin)/;
    const canon = (t, nm) => /(filtr|filter)/.test(t) ? 'filtro' : /(later|side)/.test(t) ? 'spazzola laterale' : /(princip|main)/.test(t) ? 'spazzola principale' : /(mop|panno|pad)/.test(t) ? 'panno' : /(blade|lama)/.test(t) ? 'lama' : /(roller|rullo)/.test(t) ? 'rullo' : /(brush|spazzol)/.test(t) ? 'spazzola' : /(dust_bag|sacchett)/.test(t) ? 'sacchetto' : nm;
    const grp = {};
    Object.keys(S).forEach(id => {
      if (!id.startsWith('sensor.') || !RB.test(id)) return;
      const st = S[id], a = st.attributes || {}, nm = a.friendly_name || id, txt = (id + ' ' + nm).toLowerCase();
      if (!PART.test(txt) || SKIPT.test(txt)) return;
      const v = parseFloat(st.state); if (isNaN(v)) return;
      const u = a.unit_of_measurement, kind = u === '%' ? 'pct' : (u === 'h' || u === 'min' || u === 'd') ? 'h' : null; if (!kind) return;
      const rob = cap((id.match(RB) || [''])[0].toLowerCase()), part = canon(txt, nm);
      const g = (grp[rob + '|' + part] = grp[rob + '|' + part] || { rob, part, id });
      g[kind] = kind === 'h' ? (u === 'min' ? v / 60 : u === 'd' ? v * 24 : v) : v;
    });
    const rows = Object.values(grp).sort((a, b) => (a.pct ?? 100) - (b.pct ?? 100)).map(g => { const p = g.pct; return `<button class="crow" data-act="more" data-id="${g.id}"><span class="cn">${esc(g.rob)} · ${esc(g.part)}<small>${g.h !== undefined ? ' · ' + nf(g.h) + ' h' : ''}</small></span>${p !== undefined ? `<span class="row" style="gap:8px;width:120px"><span class="bar" style="flex:1"><i style="width:${Math.max(2, p)}%;background:${p <= 15 ? 'var(--coral)' : p <= 30 ? 'var(--sun)' : 'var(--sea)'}"></i></span><b style="font-size:13px;min-width:38px;text-align:right">${nf(p)}%</b></span>` : ''}</button>`; });
    [['camera', 'camera'], ['cameretta', 'cameretta']].forEach(([k, l]) => {
      const t = this._n('sensor.clima_' + k + '_ore', NaN), b = this._n('input_number.filtro_clima_' + k + '_base', NaN); if (isNaN(t) || isNaN(b)) return;
      const h = Math.max(t - b, 0), lim = 150, armed = this._armed === 'al:script.filtro_clima_' + k + '_pulito';
      rows.push(`<div class="crow"><span class="cn">Filtro clima ${l}<small> · ${nf(h)} h su ${lim}</small></span><button class="pbtn${armed ? ' warn' : ' ghost'}" data-act="alrun" data-id="script.filtro_clima_${k}_pulito">${armed ? 'Conferma' : 'Pulito'}</button></div>`);
    });
    return rows.length ? `<section class="card" style="gap:0;padding:4px 18px"><span class="lab" style="padding:12px 0 4px">Manutenzione</span>${rows.join('')}</section>` : '';
  }

  // ================================================================ AVVISI (Casa)
  _alerts(now) {
    const S = this._hass.states, items = [], c = this._config;
    const E = this._hass.entities || {}, DV = this._hass.devices || {};
    // manutenzione robot
    const RB = new RegExp('(' + ((this._config.devices || []).map(d => (d.page && d.page.pattern) || '').filter(Boolean).join('|') || '§') + ')', 'i'), PART = /(filter|filtro|brush|spazzol|mop|panno|roller|rullo|blade|lama|detergent|dust_bag|sacchett|consumab)/, SKIPT = /(total|totale|cleaning_time|clean_count|conteggio|cronologia|history|firmware|reset|ripristin)/;
    const canon = (t, nm) => /(filtr|filter)/.test(t) ? 'filtro' : /(later|side)/.test(t) ? 'spazzola laterale' : /(princip|main)/.test(t) ? 'spazzola principale' : /(mop|panno|pad)/.test(t) ? 'panno' : /(blade|lama)/.test(t) ? 'lama' : /(roller|rullo)/.test(t) ? 'rullo' : /(brush|spazzol)/.test(t) ? 'spazzola' : /(dust_bag|sacchett)/.test(t) ? 'sacchetto' : nm;
    const grp = {};
    Object.keys(S).forEach(id => {
      if (!id.startsWith('sensor.') || !RB.test(id)) return;
      const st = S[id], a = st.attributes || {}, nm = a.friendly_name || id, txt = (id + ' ' + nm).toLowerCase();
      if (!PART.test(txt) || SKIPT.test(txt)) return;
      const v = parseFloat(st.state); if (isNaN(v)) return;
      const u = a.unit_of_measurement, kind = u === '%' ? 'pct' : (u === 'h' || u === 'min' || u === 'd') ? 'h' : null; if (!kind) return;
      const rob = cap((id.match(RB) || [''])[0].toLowerCase());
      const part = canon(txt, nm);
      const g = (grp[rob + '|' + part] = grp[rob + '|' + part] || { rob, part });
      g[kind] = kind === 'h' ? (u === 'min' ? v / 60 : u === 'd' ? v * 24 : v) : v;
    });
    Object.values(grp).forEach(g => {
      const sp = g.pct !== undefined ? (g.pct <= 5 ? 3 : g.pct <= 15 ? 2 : 0) : 0, sh = g.h !== undefined ? (g.h <= 8 ? 3 : g.h <= 24 ? 2 : 0) : 0, sev = Math.max(sp, sh);
      if (sev >= 2) items.push({ sev, icon: 'broom', t: `${g.rob}: ${g.part} da cambiare`, s: [g.pct !== undefined ? Math.round(g.pct) + '% di vita residua' : '', g.h !== undefined ? Math.round(g.h) + ' h residue' : ''].filter(Boolean).join(' · ') });
    });
    [['camera', 'camera'], ['cameretta', 'cameretta']].forEach(([k, l]) => {
      const t = this._n('sensor.clima_' + k + '_ore', NaN), b = this._n('input_number.filtro_clima_' + k + '_base', NaN); if (isNaN(t) || isNaN(b)) return;
      const h = Math.max(t - b, 0), lim = 150; if (h < lim) return;
      items.push({ sev: 2, icon: 'fan', t: 'Filtro condizionatore ' + l, s: `${nf(h)} h dall'ultima pulizia`, act: 'script.filtro_clima_' + k + '_pulito', actLabel: 'Pulito' });
    });
    // sistema
    const ids = Object.keys(S).filter(id => id.startsWith('sensor.'));
    const val = id => { if (!id) return null; const v = parseFloat(S[id].state); return isNaN(v) ? null : v; };
    const find = (re, unit) => ids.find(id => re.test(id) && val(id) !== null && (!unit || S[id].attributes.unit_of_measurement === unit));
    let disk = val(find(/(disk_usage|disk_use_percent|disk_percent)/, '%'));
    if (disk === null) { const u = find(/host_disk_used/), t = find(/host_disk_total/); if (u && t && val(t) > 0) disk = val(u) / val(t) * 100; }
    const temp = val(find(/(processor_temperature|cpu_temp|processor_temp|soc_temp)/)), mem = val(find(/(memory_usage|memory_use_percent|memory_percent)/, '%') || find(/(host|core)_memory_percent/, '%'));
    if (disk !== null && disk >= 85) items.push({ sev: disk >= 93 ? 3 : 2, icon: 'disk', t: 'Disco quasi pieno', s: 'Occupato al ' + Math.round(disk) + '%' });
    if (temp !== null && temp >= 80) items.push({ sev: temp >= 90 ? 3 : 2, icon: 'temp', t: 'Sistema molto caldo', s: Math.round(temp) + ' °C' });
    if (mem !== null && mem >= 90) items.push({ sev: 2, icon: 'chip', t: 'Memoria quasi esaurita', s: 'In uso al ' + Math.round(mem) + '%' });
    if (S[c.alarm] && S[c.alarm].state === 'triggered') items.push({ sev: 3, icon: 'siren', t: 'Allarme scattato', s: 'Controlla le telecamere' });
    // dispositivi non disponibili da più di 10 minuti
    const DOM = ['light', 'switch', 'sensor', 'binary_sensor', 'climate', 'cover', 'lock', 'camera', 'vacuum', 'lawn_mower', 'media_player', 'fan', 'valve', 'humidifier', 'water_heater'];
    const off = {};
    Object.keys(S).forEach(id => {
      const st = S[id]; if (st.state !== 'unavailable' || !DOM.includes(id.split('.')[0]) || /^sensor\.iphone_/.test(id)) return;
      if (now - new Date(st.last_changed).getTime() < 600000) return;
      const en = E[id]; if (en && (en.hidden || en.entity_category || en.platform === 'mobile_app')) return;
      const dev = en && en.device_id ? DV[en.device_id] : null, key = dev ? en.device_id : id;
      (off[key] = off[key] || { name: dev ? (dev.name_by_user || dev.name || id) : (st.attributes.friendly_name || id), n: 0 }).n++;
    });
    Object.values(off).sort((a, b) => b.n - a.n).slice(0, 4).forEach(g => items.push({ sev: 2, icon: 'offline', t: g.name, s: g.n > 1 ? g.n + ' entità non disponibili' : 'Non disponibile' }));
    // batterie
    Object.keys(S).forEach(id => {
      const st = S[id], a = st.attributes || {}, en = E[id]; if (en && (en.hidden || en.platform === 'mobile_app')) return;
      if (/^sensor\.iphone_/.test(id)) return;
      if (id.startsWith('sensor.') && a.device_class === 'battery' && a.unit_of_measurement === '%') { const v = parseFloat(st.state); if (!isNaN(v) && v <= 20) items.push({ sev: v <= 10 ? 3 : 2, icon: 'batlow', t: a.friendly_name || id, s: 'Batteria al ' + Math.round(v) + '%' }); }
      else if (id.startsWith('binary_sensor.') && a.device_class === 'battery' && st.state === 'on') items.push({ sev: 2, icon: 'batlow', t: a.friendly_name || id, s: 'Batteria scarica' });
    });
    const upd = Object.keys(S).filter(id => id.startsWith('update.') && S[id].state === 'on').length;
    if (upd) items.push({ sev: 1, icon: 'update', t: upd === 1 ? '1 aggiornamento disponibile' : upd + ' aggiornamenti disponibili', s: 'Impostazioni › Aggiornamenti', go: '/config/updates' });
    const bk = Object.keys(S).find(id => /^sensor\.backup_last_successful_automatic_backup/.test(id));
    if (bk && !BAD.test(S[bk].state)) { const days = (now - new Date(S[bk].state).getTime()) / 86400000; if (days > 3) items.push({ sev: 2, icon: 'backup', t: 'Backup automatico in ritardo', s: 'Ultimo ' + Math.floor(days) + ' giorni fa', go: '/config/backup' }); }
    // raccolta differenziata (se configurata: waste: { today, tomorrow, from, to })
    const W = c.waste;
    if (W && (W.today || W.tomorrow)) {
      const ro = S[W.today], rd = S[W.tomorrow], h = now.getHours() + now.getMinutes() / 60, f0 = W.from ?? 17, f1 = W.to ?? 20;
      const ok = x => x && x.state && !/^(unknown|unavailable|nessuna|none)$/i.test(x.state);
      if (ok(ro) && h >= 12 && h < f1) items.push({ sev: h >= f0 ? 2 : 1, icon: 'bin', t: 'Raccolta oggi: ' + ro.state.toLowerCase(), s: h >= f0 ? `Esponi entro le ${f1}:00` : `Da esporre dalle ${f0} alle ${f1}` });
      else if (ok(rd) && h >= f1) items.push({ sev: 1, icon: 'bin', t: 'Domani: ' + rd.state.toLowerCase(), s: `Da esporre domani dalle ${f0} alle ${f1}` });
    }
    items.sort((a, b) => b.sev - a.sev);
    if (!items.length) return '';
    const COL = { 3: '#FF7A66', 2: '#E8935C', 1: '#8EC5F2' };
    const show = this._alAll ? items : items.slice(0, 3);
    return `<div style="display:flex;flex-direction:column;gap:12px"><span class="lab">Avvisi · ${items.length}</span>
      ${show.map(i => { const col = COL[i.sev]; const armed = i.act && this._armed === 'al:' + i.act;
        return `<div class="alert${i.sev >= 3 ? ' hot' : ''}" style="--ac:${col}"${i.go ? ` data-act="go" data-to="${i.go}" role="button"` : ''}><span class="ai">${svg(i.icon, 20)}</span><span style="flex:1;min-width:0"><b>${esc(i.t)}</b><small>${esc(i.s)}</small></span>${i.act ? `<button class="pbtn${armed ? ' warn' : ''}" data-act="alrun" data-id="${i.act}">${armed ? 'Conferma' : esc(i.actLabel)}</button>` : ''}</div>`; }).join('')}
      ${items.length > 3 ? `<button class="more" data-act="alall">${this._alAll ? 'Mostra meno' : (items.length - 3 === 1 ? 'Mostra l’altro' : `Mostra altri ${items.length - 3}`)}</button>` : ''}
    </div>`;
  }

  // ---------------------------------------------------------------- azioni
  _fire(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true })); }
  _navigate(path) {
    if (!path) return;
    history.pushState(null, '', path);
    window.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: false } }));
  }

  _click(e) {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const act = b.dataset.act, c = this._config;
    if (act === 'more') this._fire('hass-more-info', { entityId: b.dataset.id });
    else if (act === 'menu') this._fire('hass-toggle-menu', {});
    else if (act === 'assist') this._fire('hass-action', { config: { tap_action: { action: 'assist', start_listening: false } }, action: 'tap' });
    else if (act === 'nav') this._goPage(b.dataset.to);
    else if (act === 'page') this._goPage(b.dataset.to);
    else if (act === 'go') this._navigate(b.dataset.to);
    else if (act === 'etab') { this._etab = b.dataset.k; try { localStorage.setItem('isola_etab', this._etab); } catch (er) {} this._schedule(); }
    else if (act === 'pdtab') { this._pdTab = b.dataset.k; this._schedule(); }
    else if (act === 'selm') { this._selM = +b.dataset.k; this._schedule(); }
    else if (act === 'alall') { this._alAll = !this._alAll; this._schedule(); }
    else if (act === 'step') {
      const s = this._st(b.dataset.id); if (!s) return;
      const a = s.attributes, st = +a.step || 1;
      let v = +((Math.round((parseFloat(s.state) + st * +b.dataset.dir) / st) * st).toFixed(6));
      if (a.max !== undefined) v = Math.min(+a.max, v); if (a.min !== undefined) v = Math.max(+a.min, v);
      this._hass.callService('input_number', 'set_value', { entity_id: b.dataset.id, value: v });
    }
    else if (act === 'fcapply') { if (this._arm('fc')) this._hass.callService('input_number', 'set_value', { entity_id: c.forecast_factor, value: parseFloat(b.dataset.val) }).then(() => this._toast('Previsione corretta')); }
    else if (act === 'calapply') { if (this._arm('cal:' + b.dataset.id)) this._hass.callService('input_number', 'set_value', { entity_id: b.dataset.id, value: parseFloat(b.dataset.val) }).then(() => this._toast('Parametro aggiornato')); }
    else if (act === 'alrun') { if (this._arm('al:' + b.dataset.id)) this._hass.callService('script', 'turn_on', { entity_id: b.dataset.id }).then(() => this._toast('Fatto')); }
    else if (act === 'opendev') this._goSub({ k: 'dev', id: b.dataset.dev });
    else if (act === 'openclima') this._goSub({ k: 'clima', id: b.dataset.id });
    else if (act === 'openconsumi') this._goSub({ k: 'consumi' });
    else if (act === 'subback') this._goPage(this._subFrom || 'casa');
    else if (act === 'pick') this._pick(b.dataset.id);
    else if (act === 'pickopt') { const d = b.dataset.id.split('.')[0]; this._closeSheet(); this._svc(d === 'input_select' ? 'input_select' : 'select', 'select_option', { entity_id: b.dataset.id, option: b.dataset.v }); }
    else if (act === 'num') {
      const s2 = this._st(b.dataset.id); if (!s2) return;
      const a2 = s2.attributes, st2 = +a2.step || 1, d = b.dataset.id.split('.')[0];
      let v = +((Math.round((parseFloat(s2.state) + st2 * +b.dataset.dir) / st2) * st2).toFixed(6));
      if (a2.max !== undefined) v = Math.min(+a2.max, v); if (a2.min !== undefined) v = Math.max(+a2.min, v);
      this._svc(d, 'set_value', { entity_id: b.dataset.id, value: v });
    }
    else if (act === 'press') { const d = b.dataset.id.split('.')[0]; this._svc(d, 'press', { entity_id: b.dataset.id }, 'Fatto'); }
    else if (act === 'run') this._svc('script', 'turn_on', { entity_id: b.dataset.id }, 'Avviato');
    else if (act === 'exp') { this._exp = this._exp || {}; this._exp[b.dataset.k] = !this._exp[b.dataset.k]; this._schedule(); }
    else if (act === 'cper') { this._cper = +b.dataset.k; this._cf = null; this._schedule(); }
    else if (act === 'cser') { this._chid = this._chid || {}; this._chid[b.dataset.k] = !this._chid[b.dataset.k]; this._schedule(); }
    else if (act === 'fanm') this._svc('climate', 'set_fan_mode', { entity_id: b.dataset.id, fan_mode: b.dataset.mode });
    else if (act === 'swing') this._svc('climate', 'set_swing_mode', { entity_id: b.dataset.id, swing_mode: b.dataset.mode });
    else if (act === 'preset') this._svc('climate', 'set_preset_mode', { entity_id: b.dataset.id, preset_mode: b.dataset.mode });
    else if (act === 'siren') { const id = b.dataset.id; if (b.dataset.on === '1') this._svc('switch', 'turn_off', { entity_id: id }, 'Sirena spenta'); else this._confirm('Faccio suonare la sirena?', 'Suona', () => this._svc('switch', 'turn_on', { entity_id: id })); }
    else if (act === 'selopt') this._hass.callService('input_select', 'select_option', { entity_id: b.dataset.id, option: b.dataset.v });
    else if (act === 'openroom') { this._room = b.dataset.room; this._unmountCams(); if (this._page !== 'stanze') this._goPage('stanze'); else { this._app.scrollTo({ top: 0 }); this._schedule(); } }
    else if (act === 'roomback') { this._room = null; this._unmountCams(); this._app.scrollTo({ top: 0 }); this._schedule(); }
    else if (act === 'camlive') { this._camLive = !this._camLive; this._schedule(); }
    else if (act === 'alarm') this._alarm(b.dataset.k);
    else if (act === 'lock') {
      const id = b.dataset.id, nm = (this._st(id)?.attributes?.friendly_name || 'la porta');
      if (b.dataset.k === 'unlock') this._confirm(`Apro ${id === c.lock ? 'il portone' : nm}?`, 'Apri', () => this._svc('lock', 'unlock', { entity_id: id }, 'Aperto'));
      else this._svc('lock', 'lock', { entity_id: id }, 'Chiuso');
    }
    else if (act === 'gate') { const g = c.security.gate; if (g && g.script) this._svc('script', 'turn_on', { entity_id: g.script }, 'Conferma con Face ID dalla notifica'); }
    else if (act === 'toggle') { const d = b.dataset.id.split('.')[0]; this._svc(d === 'light' ? 'light' : 'homeassistant', 'toggle', { entity_id: b.dataset.id }); }
    else if (act === 'media') this._svc('media_player', b.dataset.on === '1' ? 'turn_off' : 'turn_on', { entity_id: b.dataset.id });
    else if (act === 'hvac') this._svc('climate', 'set_hvac_mode', { entity_id: b.dataset.id, hvac_mode: b.dataset.mode });
    else if (act === 'ctemp') {
      const s = this._st(b.dataset.id); if (!s) return; const a = s.attributes;
      const step = +a.target_temp_step || 1; let t = (+a.temperature || 20) + step * +b.dataset.dir;
      if (a.min_temp !== undefined) t = Math.max(+a.min_temp, t); if (a.max_temp !== undefined) t = Math.min(+a.max_temp, t);
      this._svc('climate', 'set_temperature', { entity_id: b.dataset.id, temperature: t });
    }
    else if (act === 'svc') { const [d, sv] = b.dataset.svc.split('.'); let data = { entity_id: b.dataset.id }; if (b.dataset.data) { try { data = JSON.parse(b.dataset.data); } catch (er) {} } this._svc(d, sv, data, 'Fatto'); }
    else if (act === 'seg') this._svc('dreame_vacuum', 'vacuum_clean_segment', { entity_id: b.dataset.id, segments: b.dataset.seg.split(',').map(Number) }, 'Il robot parte');
    else if (act === 'top') this._app.scrollTo({ top: 0, behavior: 'smooth' });
    else if (act === 'live') this._openLive();
    else if (act === 'livex') this._closeLive();
    else if (act === 'tipx') { try { localStorage.setItem(b.dataset.key, '1'); } catch (er) {} this._cache.tip = null; this._schedule(); }
    else if (act === 'scene') this._scene(b.dataset.k);
    else if (act === 'sheetok') { const fn = this._pendingFn, inp = this._slots.overlay.querySelector('input'), code = inp ? inp.value : undefined; this._closeSheet(); if (fn) fn(code); }
    else if (act === 'sheetno') this._closeSheet();
  }
  _change(e) {
    const t = e.target; if (!t || !t.dataset) return;
    if (t.dataset.bri) {
      const pct = Math.max(1, Math.min(100, Math.round(+t.value)));
      this._hass.callService('light', 'turn_on', { entity_id: t.dataset.bri, brightness_pct: pct })
        .then(() => this._toast('Luminosità ' + pct + '%')).catch(er => this._toast('La luce non risponde', true, er));
      // la pagina torna ad aggiornarsi quando arriva il nuovo stato della luce (o dopo 4 secondi)
      this._briWant = { id: t.dataset.bri, pct };
      clearTimeout(this._briT); this._briT = setTimeout(() => this._briDone(), 4000);
      return;
    }
    if (!t.dataset.num) return;
    const v = parseFloat(String(t.value).replace(',', '.')); if (isNaN(v)) return;
    this._hass.callService('input_number', 'set_value', { entity_id: t.dataset.num, value: v }).then(() => this._toast('Salvato')).catch(er => this._toast('Valore non valido', true, er));
  }
  _briDone() { clearTimeout(this._briT); this._briWant = null; this._briDrag = null; this._cache = {}; this._schedule(true); }
  _goPage(p) {
    if (p === 'stanze' && this._page === 'stanze' && this._room) { this._room = null; this._unmountCams(); this._app.scrollTo({ top: 0 }); this._schedule(); return; }
    if (this._page === p) { this._app.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    if (this._page === 'sicurezza' || this._page === 'stanze' || this._page === 'sub') this._unmountCams();
    if (this._page === 'sub') { this._sub = null; this._cf = null; }
    this._page = p; this._showPage(); this._app.scrollTo({ top: 0 }); this._cache = {}; this._mounted = null; this._schedule();
  }
  _confirm(title, ok, fn, code) {
    this._pendingFn = fn;
    this._slots.overlay.innerHTML = `<div class="sheet" data-act="sheetno"><div class="box" role="dialog" aria-label="${esc(title)}"><b class="disp">${esc(title)}</b>${code ? '<input type="password" inputmode="numeric" autocomplete="off" aria-label="Codice">' : ''}<div class="btns"><button data-act="sheetno">Annulla</button><button class="ok" data-act="sheetok">${esc(ok)}</button></div></div></div>`;
    this._slots.overlay.querySelector('.box').addEventListener('click', ev => ev.stopPropagation());
    this._slots.overlay.querySelectorAll('.box button').forEach(x => x.addEventListener('click', ev => { ev.stopPropagation(); this._click({ target: x }); }));
    const i = this._slots.overlay.querySelector('input'); if (i) setTimeout(() => i.focus(), 50);
  }
  _scene(k) {
    const s = this._config.scenes[k]; if (!s) return;
    if (s.confirm) { this._confirm(s.confirm, s.name, () => this._runScene(k)); return; }
    this._runScene(k);
  }
  _closeSheet() { this._pendingFn = null; this._slots.overlay.innerHTML = ''; }
  _svc(domain, service, data, okText) {
    return this._hass.callService(domain, service, data).then(() => { if (okText) this._toast(okText); }).catch(er => this._toast('Non riuscito: ' + (er && er.message ? er.message : domain + '.' + service), true, er));
  }
  _alarm(k) {
    const c = this._config, al = this._st(c.alarm); if (!al) return;
    const needCode = !!al.attributes.code_format && (k === 'disarm' || al.attributes.code_arm_required !== false);
    const run = code => this._svc('alarm_control_panel', 'alarm_' + k, { entity_id: c.alarm, ...(code ? { code } : {}) }, k === 'disarm' ? 'Allarme disinserito' : 'Allarme inserito');
    const L = { disarm: 'Disinserisco l’allarme?', arm_home: 'Inserisco in casa?', arm_away: 'Inserisco, uscite?', arm_night: 'Inserisco per la notte?' };
    if (k === 'disarm' || needCode) this._confirm(L[k] || 'Confermi?', k === 'disarm' ? 'Disinserisci' : 'Inserisci', run, needCode);
    else run();
  }
  _runScene(k) {
    const s = this._config.scenes[k]; if (!s || !s.action) return;
    const [domain, service] = s.action.split('.');
    const data = s.data || {}; const target = s.target ? { entity_id: s.target } : undefined;
    this._hass.callService(domain, service, data, target)
      .then(() => this._toast(`${s.name}: fatto`))
      .catch(err => this._toast(`${s.name}: non riuscito`, true, err));
  }
  _toast(text, bad, err) {
    if (err) console.warn('isola-mobile', err);
    const t = document.createElement('div'); t.className = 'toast'; t.innerHTML = (bad ? '' : svg('check', 16, 2.4)) + esc(text);
    if (bad) t.style.background = 'var(--coral)';
    this._app.appendChild(t); setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 400); }, 2200);
  }
  _openLive() {
    const c = this._config;
    if (!customElements.get('isola-live')) { this._toast('Isola Live non è installata (risorsa isola-live.js)', true); return; }
    const box = document.createElement('div'); box.className = 'livebox';
    box.innerHTML = `<button class="lx" data-act="livex" aria-label="Chiudi Isola Live">${svg('close', 18, 2.4)}</button><div class="lc"></div>`;
    const el = document.createElement('isola-live');
    try { el.setConfig({ image: c.image, ...c.casa_live }); } catch (e) { console.error(e); this._toast('Isola Live non si apre', true); return; }
    // il configuratore di Isola Live salva dentro casa_live di questa card (e la card si aggiorna senza ricostruirsi)
    el._saveTarget = { type: 'custom:isola-mobile', key: 'casa_live', match: this._user, onSaved: card => {
      this._user = card;
      try { this._config = applyCrops(deepMerge(this._user.auto === false ? DEFAULTS : deepMerge(DEFAULTS, autoConfig(this._hass)), this._user)); } catch (e) { console.warn('isola-mobile', e); }
    } };
    el.hass = this._hass;
    box.querySelector('.lc').appendChild(el);
    this._app.appendChild(box);
    this._live = el; this._liveBox = box;
  }
  _closeLive() { if (this._liveBox) this._liveBox.remove(); this._live = null; this._liveBox = null; }
}

if (!customElements.get('isola-mobile')) customElements.define('isola-mobile', IsolaCard);
window.customCards = window.customCards || [];
if (!window.customCards.find(x => x.type === 'isola-mobile')) window.customCards.push({ type: 'isola-mobile', name: 'Isola', description: 'L\u2019interfaccia di casa per smartphone (Isola Live è per tablet e hub fissi)', preview: false });
console.info(`%c ISOLA %c ${VERSION} `, 'background:#F5B544;color:#2A1D05;font-weight:700', 'background:#161C21;color:#F3EFE7');
