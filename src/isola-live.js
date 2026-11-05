import { i18nAttach, i18nLang, i18nLoc } from './isola-i18n.js';
/* Isola Live – la casa viva per tablet a parete e hub fissi (Home Assistant)
 * Isola       = smartphone (type: custom:isola-mobile)
 * Isola Live  = tablet / hub fisso (questa card: type: custom:isola-live)
 * Foto della casa dall'alto (render) + luci, robot, persone, sensori posizionati in pixel sulla foto.
 */
const VERSION = '1.0.0-beta.5';
const VQ = new URL(import.meta.url).search;

// ------------------------------------------------------------------ configurazione predefinita
// Le posizioni sono in metri, coordinate della scena: x verso destra (cucina), z verso il giardino.
// Impostazioni predefinite neutre: Isola Live si configura da sola (luci, robot, persone, meteo, allarme);
// le posizioni sulla foto (px) si aggiungono nel YAML o con il configuratore.
const DEFAULTS = {
  auto: true,
  title: 'Casa',
  image: '',               // render dall'alto, es. /local/isola/casa.jpg
  ppm: 40,                 // pixel per metro nella foto (dimensione delle luci e velocità dei robot)
  height: 'fill',
  portrait: 'rotate',
  kiosk: false,
  night_dim: false,
  quadro: false,
  quadro_after: 3,
  motion_recent: 15,
  effects: 'high',
  mode: 'render',
  north: 0,
  image_north: null,
  sun: 'sun.sun',
  weather: '',
  alarm: '',
  lights: [],              // { id, entity, name, px: [x, y], room: [[x, y], ...] }
  ambient: [],
  sensors: [],             // { id, type: window|camera|lock|motion, entity, name, px: [x, y] }
  energy: { px: null, house_px: null, pv_power: '', battery_soc: '', battery_power: '', battery_invert: false },
  rooms: [],               // { name, path, poly: [[x, y], ...] }  stanze toccabili
  devices: [],             // { id, type, entity, name, px: [x, y], area_px: [[x0, y0, x1, y1]] }
  floors: false,
  upper: null,
  trail: true,
  people: [],
  presence: {},            // { 'binary_sensor.movimento_x': [x, y] }
  presence_default: null,
  presence_bed: [],
  arrival_path: [],
  voice: '',
  waste: null,
};
const PALETTE = ['#f5a524', '#26a69a', '#7e57c2', '#ef5350', '#42a5f5', '#8d6e63'];
// configurazione automatica dalle entità di Home Assistant (solo ciò che non ha bisogno di una posizione)
function liveAuto(h) {
  const S = h.states || {}, ids = Object.keys(S), E = h.entities || {};
  const dom = id => id.split('.')[0], obj = id => id.split('.')[1], name = id => S[id]?.attributes?.friendly_name || obj(id).replace(/_/g, ' ');
  const visible = id => { const e = E[id]; return !e || (!e.hidden && !e.entity_category); };
  const first = d => ids.find(id => dom(id) === d && visible(id)) || '';
  const pv = ids.find(id => dom(id) === 'sensor' && S[id].attributes.device_class === 'power' && /(pv|solar|solare|fotovolt|inverter).*(power|potenza)|(active|input)_power/.test(id) && !/batter|grid|rete|meter/.test(id)) || '';
  return {
    weather: first('weather'), alarm: first('alarm_control_panel'),
    lights: ids.filter(id => dom(id) === 'light' && visible(id)).map(id => ({ id: obj(id), entity: id, name: name(id), icon: 'mdi:ceiling-light' })),
    devices: [
      ...ids.filter(id => dom(id) === 'vacuum' && visible(id)).map(id => ({ id: obj(id), type: 'vacuum', entity: id, name: name(id), icon: 'mdi:robot-vacuum' })),
      ...ids.filter(id => dom(id) === 'lawn_mower' && visible(id)).map(id => ({ id: obj(id), type: 'mower', entity: id, name: name(id), icon: 'mdi:robot-mower',
        status: S['sensor.' + obj(id) + '_mower_status'] ? 'sensor.' + obj(id) + '_mower_status' : '', battery: S['sensor.' + obj(id) + '_battery'] ? 'sensor.' + obj(id) + '_battery' : '' })),
    ],
    people: ids.filter(id => dom(id) === 'person').map((id, i) => ({ id: obj(id), entity: id, name: name(id), color: PALETTE[i % PALETTE.length], eta: '' })),
    energy: { pv_power: pv },
  };
}
const mergeById = (a = [], b = []) => { const out = a.map(x => ({ ...x })); for (const u of b || []) { const i = out.findIndex(x => (u.id && x.id === u.id) || (u.entity && x.entity === u.entity)); if (i >= 0) out[i] = { ...out[i], ...u }; else out.push({ ...u }); } return out; };
const EMOJI = { 'mdi:cog-outline': '⚙️', 'mdi:pencil-ruler': '📐', 'mdi:power-socket-eu': '🔌', 'mdi:air-conditioner': '❄️', 'mdi:cube-outline': '🧊', 'mdi:image-outline': '🖼️', 'mdi:label-outline': '🏷️', 'mdi:camera-iris': '📷', 'mdi:home-outline': '🏠', 'mdi:sofa-outline': '🛋️', 'mdi:tree-outline': '🌳', 'mdi:arrow-collapse-down': '⬇️', 'mdi:wall': '🧱', 'mdi:fullscreen': '⤢', 'mdi:ceiling-light': '💡', 'mdi:outdoor-lamp': '🏮', 'mdi:robot-vacuum': '🤖', 'mdi:robot-mower': '🌱', 'mdi:washing-machine': '🫧', 'mdi:television': '📺', 'mdi:broom': '🧹', 'mdi:shield-home': '🛡️', 'mdi:weather-sunset': '🌇', 'mdi:weather-sunny': '☀️', 'mdi:weather-night': '🌙', 'mdi:weather-partly-cloudy': '⛅', 'mdi:weather-cloudy': '☁️', 'mdi:weather-rainy': '🌧️', 'mdi:weather-pouring': '🌧️', 'mdi:weather-lightning': '⛈️', 'mdi:weather-lightning-rainy': '⛈️', 'mdi:weather-fog': '🌫️', 'mdi:weather-snowy': '🌨️', 'mdi:weather-snowy-rainy': '🌨️', 'mdi:weather-hail': '🌨️', 'mdi:weather-windy': '💨', 'mdi:weather-windy-variant': '💨', 'mdi:alert-outline': '⚠️', 'mdi:solar-power-variant': '☀️', 'mdi:cctv': '📹', 'mdi:lock': '🔒', 'mdi:lock-open-variant': '🔓', 'mdi:window-open-variant': '🪟', 'mdi:home-battery': '🔋', 'mdi:battery-clock-outline': '🔋', 'mdi:chevron-right': '›', 'mdi:bell-ring': '🔔' };
const WXN = { 'sunny': 'Sereno', 'clear-night': 'Sereno', 'partlycloudy': 'Poco nuvoloso', 'cloudy': 'Nuvoloso', 'fog': 'Nebbia', 'rainy': 'Pioggia', 'pouring': 'Pioggia forte', 'lightning': 'Temporale', 'lightning-rainy': 'Temporale', 'hail': 'Grandine', 'snowy': 'Neve', 'snowy-rainy': 'Nevischio', 'windy': 'Ventoso', 'windy-variant': 'Ventoso', 'exceptional': 'Allerta' };
const WXI = { 'sunny': 'mdi:weather-sunny', 'clear-night': 'mdi:weather-night', 'partlycloudy': 'mdi:weather-partly-cloudy', 'cloudy': 'mdi:weather-cloudy', 'fog': 'mdi:weather-fog', 'rainy': 'mdi:weather-rainy', 'pouring': 'mdi:weather-pouring', 'lightning': 'mdi:weather-lightning', 'lightning-rainy': 'mdi:weather-lightning-rainy', 'hail': 'mdi:weather-hail', 'snowy': 'mdi:weather-snowy', 'snowy-rainy': 'mdi:weather-snowy-rainy', 'windy': 'mdi:weather-windy', 'windy-variant': 'mdi:weather-windy-variant', 'exceptional': 'mdi:alert-outline' };
// posizione del sole (algoritmo NOAA semplificato): elevazione e azimut in gradi
function sunPos(date, lat, lon) {
  const rad = Math.PI / 180, n = date.getTime() / 86400000 + 2440587.5 - 2451545.0;
  const L = (280.46 + 0.9856474 * n) % 360, g = ((357.528 + 0.9856003 * n) % 360) * rad;
  const lam = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad, eps = (23.439 - 0.0000004 * n) * rad;
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam)), dec = Math.asin(Math.sin(eps) * Math.sin(lam));
  const gmst = (18.697374558 + 24.06570982441908 * n) % 24, H = (gmst * 15 + lon) * rad - ra, la = lat * rad;
  const el = Math.asin(Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(H));
  const az = Math.atan2(-Math.sin(H), Math.tan(dec) * Math.cos(la) - Math.sin(la) * Math.cos(H));
  return { elevation: el / rad, azimuth: (az / rad + 360) % 360 };
}
const IT = {
  on: 'Accesa', off: 'Spenta', unavailable: 'Non disponibile', unknown: '—',
  cleaning: 'In pulizia', docked: 'Alla base', returning: 'Rientra', paused: 'In pausa', idle: 'Fermo', error: 'Errore', mowing: 'Taglia l’erba',
  run: 'In funzione', stop: 'Ferma', pause: 'In pausa', charging: 'In carica',
  disarmed: 'Disinserito', armed_home: 'Inserito (casa)', armed_away: 'Inserito (fuori)', armed_night: 'Inserito (notte)', triggered: 'ALLARME', arming: 'Inserimento…', pending: 'In attesa',
};
const tr = s => IT[s] ?? s;
const NAMES = { 'machine state': 'Stato macchina', 'job state': 'Fase', 'completion time': 'Fine prevista', 'water consumption': 'Acqua consumata', 'energy difference': 'Energia ultimo ciclo', 'energy saved': 'Energia risparmiata', 'spin level': 'Centrifuga', 'rinse cycles': 'Risciacqui' };

class Casa3DCard extends HTMLElement {
  static getStubConfig() { return {}; }
  setConfig(cfg) {
    this._user = cfg || {}; this._autoKey = null;
    this._setCfg(this._user);
  }
  _setCfg(cfg) {
    const c = Object.assign({}, DEFAULTS, cfg || {});
    const mergeList = (def, user) => {
      if (!user) return def.map(x => ({ ...x }));
      const out = def.map(x => ({ ...x }));
      for (const u of user) { const i = out.findIndex(x => x.id === u.id); if (i >= 0) out[i] = { ...out[i], ...u }; else out.push({ ...u }); }
      return out.filter(x => !x.hidden);
    };
    c.lights = mergeList(DEFAULTS.lights, cfg && cfg.lights);
    c.devices = mergeList(DEFAULTS.devices, cfg && cfg.devices);
    c.ambient = mergeList(DEFAULTS.ambient, cfg && cfg.ambient);
    c.sensors = mergeList(DEFAULTS.sensors, cfg && cfg.sensors);
    c.energy = { ...DEFAULTS.energy, ...((cfg && cfg.energy) || {}) };
    c.rooms = (cfg && cfg.rooms) || DEFAULTS.rooms;
    c.upper = cfg && cfg.upper && c.floors !== false ? { short: '1° piano', ...cfg.upper } : null;
    this._base = c;
    if (this._floor && !c.upper) this._floor = 0;
    this._config = this._floor ? this._upperCfg(c) : c;
    if (this._root) this._floorUi();
    if (this._root) { this._$('#ttl').textContent = c.title; this._$('#card').style.height = c.height === 'fill' ? 'var(--c3h,calc(100svh - 120px))' : c.height; }
    this._applyKiosk(true);
    if (this._root) this._$('#card').classList.toggle('lowfx', c.effects === 'low');
    if (this._built) this._rebuild = true;
  }
  getCardSize() { return 10; }
  getGridOptions() { return { columns: 12, rows: 8, min_rows: 6 }; }

  // altezza "fill": dalla posizione della card fino al fondo dello schermo visibile (barra di iOS esclusa)
  _fitHeight() {
    if (!this._config || this._config.height !== 'fill' || !this._root) return;
    const card = this._$('#card'); if (card.classList.contains('max')) return;
    const top = this.getBoundingClientRect().top, vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    const h = Math.max(360, Math.round(vh - Math.max(0, top) - 8));
    if (this._lastH !== h) { this._lastH = h; this.style.setProperty('--c3h', h + 'px'); }
  }
  // in modifica (matita, ?edit=1) o con ?nokiosk nell'indirizzo la card non copre le barre di Home Assistant
  _editing() {
    if (/[?&](edit=1|nokiosk)/.test(location.search)) return true;
    let n = this;
    for (let i = 0; n && i < 60; i++) {
      if (n.tagName === 'HUI-ROOT') return !!(n.lovelace && n.lovelace.editMode);
      if (n.tagName === 'HUI-CARD-OPTIONS' || n.tagName === 'HUI-CARD-EDIT-MODE' || n.tagName === 'HUI-DIALOG-EDIT-CARD') return true;
      n = n.assignedSlot || n.parentNode || n.host;
    }
    return false;
  }
  _applyKiosk(force) {
    const c = this._config; if (!c || !this._root) return;
    const t = Date.now(); if (!force && t - (this._kt || 0) < 1000) return; this._kt = t;
    const ed = this._editing(), card = this._$('#card');
    card.classList.toggle('max', !!c.kiosk && !ed);
    if (ed) { this._$('#dim')?.classList.remove('on'); this._$('#quadro')?.classList.remove('on'); card.classList.remove('q'); }
  }
  _idle() {
    const c = this._config; if (!c || !this._root) return;
    if (this._editing()) { this._applyKiosk(true); return; }
    const sun = this._st(c.sun), night = sun ? +sun.attributes.elevation < -4 : (new Date().getHours() >= 22 || new Date().getHours() < 7);
    const since = Date.now() - (this._lastTouch || 0);
    if (c.night_dim) this._$('#dim').classList.toggle('on', night && since > 60000);
    const q = this._$('#quadro'); if (!q) return;
    const on = !!c.quadro && since > (+c.quadro_after || 3) * 60000;
    if (on) this._quadro(night && c.night_dim);
    q.classList.toggle('on', on); this._$('#card').classList.toggle('q', on);
  }
  // modalità quadro: orologio, meteo e avvisi del giorno sopra la casa
  _quadro(dimmed) {
    const q = this._$('#quadro'), c = this._base || this._config, S = this._hass ? this._hass.states : {}, now = new Date();
    const st = id => S[id], num = id => { const s = S[id]; const v = s ? parseFloat(s.state) : NaN; return v; };
    const hm = d => d.toLocaleTimeString(i18nLoc(), { hour: '2-digit', minute: '2-digit' });
    const chips = [];
    // raccolta differenziata (se configurata: waste: { today, tomorrow, from, to })
    const W = c.waste, ok = x => x && x.state && !/^(unknown|unavailable|nessuna|none)$/i.test(x.state), h = now.getHours() + now.getMinutes() / 60;
    if (W && (W.today || W.tomorrow)) {
      const ro = st(W.today), rd = st(W.tomorrow), f0 = W.from ?? 17, f1 = W.to ?? 20;
      if (ok(ro) && h >= 12 && h < f1) chips.push([(h >= f0 ? '♻️ Esponi ora: ' : '♻️ Stasera: ') + ro.state.toLowerCase() + ` (${f0}–${f1})`, h >= f0]);
      else if (ok(rd) && h >= f1) chips.push(['♻️ Domani: ' + rd.state.toLowerCase(), false]);
    }
    // allarme, finestre, portone
    const al = st(c.alarm);
    if (al && al.state === 'triggered') chips.push(['🚨 Allarme scattato', true]);
    else if (al && /^armed/.test(al.state)) chips.push(['🛡️ Allarme inserito', false]);
    (c.sensors || []).forEach(m => { const s = st(m.entity); if (!s) return;
      if (m.type === 'window' && s.state === 'on') chips.push(['🪟 Finestra ' + m.name.toLowerCase() + ' aperta', true]);
      if (m.type === 'lock' && ['unlocked', 'open', 'jammed'].includes(s.state)) chips.push(['🔓 ' + m.name + ' aperto', true]); });
    // dispositivi al lavoro
    (c.devices || []).forEach(d => { const s = st(d.entity); if (!s) return; const v = String(s.state).toLowerCase();
      if (d.type === 'washer' && /^(run|running)$/.test(v)) { const e = st(String(d.entity || '').replace(/machine_state$/, 'completion_time')); const t = e ? new Date(e.state) : null; chips.push(['🫧 Lavatrice' + (t && !isNaN(t) && t > now ? ' · fine ' + hm(t) : ''), false]); }
      if (d.type === 'vacuum' && v === 'cleaning') chips.push(['🤖 ' + d.name + ' al lavoro', false]);
      if (d.type === 'mower' && v === 'mowing') chips.push(['🌱 ' + d.name + ' taglia il prato', false]); });
    // sole e batteria
    const pvS = st(c.energy && c.energy.pv_power); let pv = pvS ? parseFloat(pvS.state) : NaN; if (pvS && (pvS.attributes.unit_of_measurement || 'W') === 'W') pv = pv / 1000;
    if (!isNaN(pv) && pv > 0.05) chips.push(['☀️ ' + pv.toLocaleString(i18nLoc(), { maximumFractionDigits: 1, minimumFractionDigits: 1 }) + ' kW dal sole', false]);
    const soc = (this._batt ? num(this._batt().soc) : NaN); if (!isNaN(soc)) chips.push(['🔋 Batteria ' + Math.round(soc) + '%', false]);
    const w = st(c.weather), t = w ? w.attributes.temperature : null;
    const wx = w ? `${EMOJI[WXI[w.state]] || ''} ${t != null ? Math.round(t) + '° · ' : ''}${WXN[w.state] || w.state}` : '';
    const esc = x => String(x).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
    q.classList.toggle('night', !!dimmed);
    q.innerHTML = `<div class="qt">${hm(now)}</div><div class="qd">${esc((d => d.charAt(0).toUpperCase() + d.slice(1))(now.toLocaleDateString(i18nLoc(), { weekday: 'long', day: 'numeric', month: 'long' })))}</div>${wx ? `<div class="qw">${esc(wx)}</div>` : ''}${chips.length ? `<div class="qc">${chips.slice(0, 6).map(([x, hot]) => `<span class="${hot ? 'hot' : ''}">${esc(x)}</span>`).join('')}</div>` : ''}`;
  }
  connectedCallback() {
    if (!this._root) this._render();
    this._applyKiosk(true);
    if (this._config) this._$('#card').classList.toggle('lowfx', this._config.effects === 'low');
    if (!this._tick) this._tick = setInterval(() => { this._refreshMarkers(); this._idle(); this._people(); }, 30000);
    if (!this._qtick) this._qtick = setInterval(() => { if (this._$('#quadro')?.classList.contains('on')) this._idle(); }, 10000);
    if (!this._touchB) {
      this._touchB = () => { this._lastTouch = Date.now(); this._$('#dim')?.classList.remove('on'); this._$('#quadro')?.classList.remove('on'); this._$('#card')?.classList.remove('q'); };
      this._$('#card').addEventListener('pointerdown', this._touchB, true);
      this._$('#dim').addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); this._touchB(); });
      this._$('#quadro').addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); this._touchB(); });
      this._lastTouch = Date.now();
    }
    if (!this._onVp) {
      this._onVp = () => { cancelAnimationFrame(this._vpR); this._vpR = requestAnimationFrame(() => this._fitHeight()); };
      window.addEventListener('resize', this._onVp); window.visualViewport?.addEventListener('resize', this._onVp);
      window.addEventListener('orientationchange', this._onVp);
    }
    setTimeout(() => this._fitHeight(), 0); setTimeout(() => this._fitHeight(), 400);
    if (!this._io) {
      this._io = new IntersectionObserver(es => {
        const v = es.some(e => e.isIntersecting); this._visible = v;
        if (v && !this._loading) { if (this._mode() === '3d' && !this._scene) this._initScene(); if (this._mode() === 'render' && !this._rv) this._initRender(); }
        if (this._scene) this._scene.paused = !v || this._mode() !== '3d';
      });
      this._io.observe(this);
    }
  }
  disconnectedCallback() { clearInterval(this._tick); this._tick = null; clearInterval(this._qtick); this._qtick = null; if (this._scene) this._scene.paused = true; if (this._onVp) { window.removeEventListener('resize', this._onVp); window.visualViewport?.removeEventListener('resize', this._onVp); window.removeEventListener('orientationchange', this._onVp); this._onVp = null; } }

  set hass(h) {
    this._hass = h;
    i18nLang(h, this._user && this._user.language);
    if (this._user && this._user.auto !== false) {
      const key = Object.keys(h.states || {}).length;
      if (key !== this._autoKey) {
        const firstTime = this._autoKey === null; this._autoKey = key;
        const a = liveAuto(h), u = this._user;
        try {
          this._setCfg({ ...a, ...u, lights: mergeById(a.lights, u.lights), devices: mergeById(a.devices, u.devices), people: u.people || a.people,
            energy: { ...a.energy, ...(u.energy || {}) }, weather: u.weather || a.weather, alarm: u.alarm || a.alarm });
          if (!firstTime && this._rv) { this._rv.dispose(); this._rv = null; this._pins = null; this._mk = null; this._chips = null; this._en = null; this._flows = null; this._last = {}; this._initRender(); }
        } catch (e) { console.error('isola-live: configurazione automatica', e); }
        if (this._waitHass) { this._waitHass = false; this._initRender(); }
      }
    }
    this._applyKiosk();
    this._editBtn();
    if (this._scene || this._rv) this._sync();
    this._refreshMarkers();
    this._renderChips();
  }

  // ------------------------------------------------------------------ DOM
  _render() {
    const root = this._root = this.attachShadow({ mode: 'open' }); i18nAttach(root);
    const c = this._config || DEFAULTS;
    root.innerHTML = `
<style>
:host{display:block}
ha-card,.card{position:relative;overflow:hidden;border-radius:var(--ha-card-border-radius,16px);height:${c.height === 'fill' ? 'var(--c3h,calc(100svh - 120px))' : c.height};min-height:360px;background:#cfdde6}
.card.max{position:fixed;inset:0;z-index:9999;height:auto!important;border-radius:0}
.lowfx .glass{backdrop-filter:none!important;-webkit-backdrop-filter:none!important;background:color-mix(in srgb,var(--card-background-color,#fff) 94%,transparent)}
.lowfx .flows path{filter:none}.lowfx .mk.win .b,.lowfx .mk.cam.alert .b,.lowfx .mk.lock.open .b{animation:none}
.dim{position:absolute;inset:0;z-index:50;background:#000;opacity:0;pointer-events:none;transition:opacity 2s}
.dim.on{opacity:.78;pointer-events:auto}
.quadro{position:absolute;inset:0;z-index:55;display:flex;flex-direction:column;justify-content:flex-end;padding:0 4vw 5vh;box-sizing:border-box;opacity:0;pointer-events:none;transition:opacity 1.5s;color:#fff;background:linear-gradient(180deg,rgba(0,0,0,0) 35%,rgba(0,0,0,.62) 100%);font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}
.quadro.on{opacity:1;pointer-events:auto}
.quadro.night{opacity:.55;background:none}
.quadro .qt{font-size:clamp(72px,13vw,170px);font-weight:700;letter-spacing:-.04em;line-height:.9;text-shadow:0 4px 30px rgba(0,0,0,.35)}
.quadro .qd{font-size:clamp(18px,2.4vw,30px);font-weight:500;opacity:.9;margin-top:8px}
.quadro .qw{font-size:clamp(16px,2vw,26px);opacity:.92;margin-top:6px}
.quadro .qc{display:flex;flex-wrap:wrap;gap:10px;margin-top:18px}
.quadro .qc span{padding:8px 14px;border-radius:999px;background:rgba(0,0,0,.42);font-size:clamp(14px,1.6vw,20px);font-weight:600;-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}
.quadro .qc span.hot{background:rgba(229,72,77,.85)}
.lowfx .quadro .qc span{-webkit-backdrop-filter:none;backdrop-filter:none;background:rgba(0,0,0,.6)}
.lowfx .quadro .qc span.hot,.quadro .qc span.hot{background:rgba(229,72,77,.9)}
.card.q .top,.card.q .mk,.card.q .pin,.card.q .en,.card.q .roomchip,.card.q #labels,.card.q .tray{opacity:0!important;pointer-events:none!important;transition:opacity 1s}
.card.rmode [data-v],.card.rmode #cut,.card.rmode #photo{display:none}
.card.rmode{background:#232a24}
.card:not(.rmode) #sim{display:none}
.sim{position:absolute;left:10px;top:64px;width:min(330px,calc(100% - 20px));border-radius:16px;padding:12px;font-size:12px;display:none;flex-direction:column;gap:8px}
.sim.open{display:flex}
.sim .row{display:flex;align-items:center;gap:8px}.sim .row b{min-width:44px;font-size:15px}
.sim .wx{display:flex;flex-wrap:wrap;gap:5px}.sim .wx button{padding:5px 8px}
.sim small{color:var(--secondary-text-color,#666)}
.card:not(.rmode) .mk,.card:not(.rmode) .flows,.card:not(.rmode) .en,.card:not(.rmode) .roomchip{display:none}
.mk{position:absolute;left:0;top:0;pointer-events:none;transition:opacity .5s}
.mk.off{opacity:0;pointer-events:none!important}
.mk.win .b{display:flex;align-items:center;gap:4px;padding:3px 9px 3px 4px;border-radius:999px;background:#d32f2f;color:#fff;font-size:11px;font-weight:700;--mdc-icon-size:15px;white-space:nowrap;animation:c3pr 1.6s infinite}
@keyframes c3pr{0%{box-shadow:0 0 0 0 rgba(211,47,47,.7)}70%{box-shadow:0 0 0 12px rgba(211,47,47,0)}100%{box-shadow:0 0 0 0 rgba(211,47,47,0)}}
.mk.mot.recent .r{animation:none;transform:scale(.42);border-color:rgba(255,190,90,.55);background:rgba(255,190,90,.18)}
.mk.mot .ago{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-size:10px;font-weight:700;color:#fff;text-shadow:0 1px 2px #000;display:none;white-space:nowrap}
.mk.mot.recent .ago{display:block}
.mk.mot .r{width:70px;height:70px;border-radius:50%;border:2px solid rgba(255,190,90,.95);background:radial-gradient(rgba(255,190,90,.35),rgba(255,190,90,0) 70%);animation:c3ring 1.8s ease-out infinite}
@keyframes c3ring{0%{transform:scale(.45);opacity:1}100%{transform:scale(1.25);opacity:0}}
.mk.cam,.mk.lock{pointer-events:auto;cursor:pointer}
.mk.cam .b,.mk.lock .b{position:relative;width:28px;height:28px;border-radius:50%;display:grid;place-items:center;--mdc-icon-size:16px;font-size:14px;background:rgba(18,20,24,.78);color:#fff;border:1px solid rgba(255,255,255,.28);box-shadow:0 3px 10px #0005}
.mk.cam.alert .b{background:#d32f2f;animation:c3pr 1.4s infinite}
.mk.lock.ok .b{background:#2e7d32}.mk.lock.open .b{background:#d32f2f;animation:c3pr 1.6s infinite}
.card.nolbl .mk.cam,.card.nolbl .mk.lock,.card.nolbl .en{opacity:0;pointer-events:none}
.alarmb{position:absolute;inset:0;border-radius:inherit;pointer-events:none;transition:box-shadow .6s}
.alarmb.home{box-shadow:inset 0 0 0 3px rgba(255,167,38,.9)}
.alarmb.away{box-shadow:inset 0 0 0 3px rgba(229,57,53,.95)}
.alarmb.trig{animation:c3al 0.8s infinite}
@keyframes c3al{50%{box-shadow:inset 0 0 0 6px rgba(229,57,53,1),inset 0 0 60px rgba(229,57,53,.5)}}
.flows{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible}
.flows path{fill:none;stroke-linecap:round;stroke-width:3.2;stroke-dasharray:1 11;animation:c3flow 1.4s linear infinite;filter:drop-shadow(0 0 3px currentColor)}
.flows path.base{stroke-dasharray:none;animation:none;stroke-width:2;opacity:.22;filter:none}
@keyframes c3flow{to{stroke-dashoffset:-24}}
.en{position:absolute;left:0;top:0;display:flex;flex-direction:column;gap:4px;padding:5px;border-radius:12px;font-size:11px;pointer-events:auto;min-width:86px}
.en .t{display:flex;align-items:center;gap:6px;padding:3px 6px 3px 3px;border-radius:9px;cursor:pointer;background:color-mix(in srgb,var(--primary-text-color,#000) 6%,transparent)}
.en .ic{width:22px;height:22px;border-radius:7px;display:grid;place-items:center;--mdc-icon-size:15px;font-size:12px;background:#f5a524;color:#3a2600}
.en .t div{display:flex;flex-direction:column;line-height:1.15}.en b{font-size:12px}.en small{color:var(--secondary-text-color,#666);font-size:10px}
.en .bi{position:relative;width:14px;height:22px;margin:0 4px 0 4px;border-radius:3px;border:2px solid currentColor;color:#43a047}
.en .bi:before{content:'';position:absolute;left:3px;right:3px;top:-5px;height:3px;border-radius:2px 2px 0 0;background:currentColor}
.en .bi i{position:absolute;left:1px;right:1px;bottom:1px;border-radius:1px;background:currentColor}
.en .bat.miss{opacity:.55}
.card.narrow .title{padding:6px 10px;gap:2px}.card.narrow .title b{font-size:13px}.card.narrow .stat{font-size:11px;gap:4px}.card.narrow .tray{left:6px;right:6px;padding:4px;gap:4px}.card.narrow .chip{padding:4px 8px 4px 4px;font-size:11px}
.card.narrow .en{min-width:0;padding:3px;gap:3px}.card.narrow .en small{display:none}.card.narrow .en .t{padding:2px 5px 2px 2px}.card.narrow .en b{font-size:11px}.card.narrow .en .ic{width:18px;height:18px}.card.narrow .en .bi{width:11px;height:17px}
.roomchip{position:absolute;left:0;top:0;pointer-events:auto;padding:7px 12px;border-radius:999px;font-size:13px;font-weight:600;cursor:pointer;transform:translate(-50%,-130%);display:flex;align-items:center;gap:4px;animation:c3in .18s ease-out}
@keyframes c3in{from{opacity:0;transform:translate(-50%,-110%)}}
#rview[hidden],#view[hidden]{display:none}
#view{position:absolute;inset:0}
.glass{background:color-mix(in srgb,var(--card-background-color,#fff) 78%,transparent);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);color:var(--primary-text-color,#1c1c1c);border:1px solid color-mix(in srgb,var(--divider-color,#0002) 60%,transparent);box-shadow:0 6px 20px #0002}
.top{position:absolute;left:10px;right:10px;top:10px;display:flex;gap:8px;align-items:flex-start;justify-content:space-between;pointer-events:none}
.top>*{pointer-events:auto}
.title{border-radius:14px;padding:8px 12px;display:flex;flex-direction:column;gap:4px;max-width:58%}
.title b{font-size:15px;letter-spacing:.02em}
.stat{display:flex;gap:6px;flex-wrap:wrap;font-size:12px;color:var(--secondary-text-color,#555)}
.stat span{white-space:nowrap}
.tools{display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-end;border-radius:14px;padding:6px;max-width:48%}
button{font:inherit;font-size:12px;border:0;border-radius:10px;padding:6px 9px;cursor:pointer;display:inline-flex;align-items:center;gap:5px;--mdc-icon-size:17px;background:color-mix(in srgb,var(--primary-text-color,#000) 7%,transparent);color:var(--primary-text-color,#222)}
button.on{background:var(--primary-color,#03a9f4);color:var(--text-primary-color,#fff)}
.labels{position:absolute;inset:0;pointer-events:none;overflow:hidden}
.pin{-webkit-touch-callout:none;position:absolute;left:0;top:0;transform:translate(-50%,-100%);pointer-events:auto;display:flex;align-items:center;gap:5px;padding:4px 8px 4px 5px;border-radius:999px;font-size:12px;line-height:1;cursor:pointer;white-space:nowrap;user-select:none;-webkit-user-select:none;transition:opacity .2s}
.pin .ic{width:22px;height:22px;border-radius:50%;display:grid;place-items:center;background:color-mix(in srgb,var(--primary-text-color,#000) 8%,transparent);--mdc-icon-size:15px;font-size:13px}
.pin.active .ic{background:#ffb300;color:#3a2600}
.pin.run .ic{background:#2e7d32;color:#fff}
.pin.err .ic{background:#d32f2f;color:#fff}
.pin small{color:var(--secondary-text-color,#666)}
.pin.compact .nm{display:none}
.pin .tp{font-weight:700;font-size:12px;padding-right:3px}.pin .tp:empty{display:none}
.pin.heat .ic,.chip.heat .ic{background:#ff8a3d;color:#fff}.pin.cool .ic,.chip.cool .ic{background:#3d9bff;color:#fff}
.floors{display:flex;gap:3px;margin-top:3px;pointer-events:auto}.floors:empty{display:none}
.floors button{border:0;border-radius:9px;padding:5px 10px;font:inherit;font-size:12px;font-weight:600;cursor:pointer;background:color-mix(in srgb,var(--primary-text-color,#000) 7%,transparent);color:inherit;transition:background .3s,color .3s}
.floors button.on{background:var(--primary-text-color,#1d2328);color:var(--card-background-color,#fff)}
.card:not(.rmode) .floors{display:none}
#labels,.tray{transition:opacity .3s}
.card.fl #labels,.card.fl .tray{opacity:0}
.rvx{position:absolute;inset:0;transition:opacity .85s ease}
#mode,#cut,#photo,[data-v]{display:none!important}
.mk.per{z-index:3;transition:opacity .6s}
.pin.ping::after,.mk.ping::after,.en.ping::after{content:'';position:absolute;left:50%;top:50%;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;border:3px solid #4fc3f7;animation:c3ping 1s ease-out 3;pointer-events:none}
@keyframes c3ping{0%{transform:scale(.6);opacity:1}100%{transform:scale(1.9);opacity:0}}
.voice{position:absolute;left:50%;top:14px;transform:translate(-50%,-140%);z-index:60;display:flex;align-items:center;gap:10px;padding:9px 16px 9px 10px;border-radius:999px;font-size:14px;font-weight:600;transition:transform .45s cubic-bezier(.3,.8,.3,1);pointer-events:none;white-space:nowrap}
.voice.on{transform:translate(-50%,0)}
.voice .w{display:flex;gap:3px;align-items:center;height:22px}.voice .w i{width:4px;border-radius:2px;background:#4fc3f7;animation:c3wave .9s ease-in-out infinite}
.voice .w i:nth-child(2){animation-delay:.15s}.voice .w i:nth-child(3){animation-delay:.3s}.voice .w i:nth-child(4){animation-delay:.45s}
@keyframes c3wave{0%,100%{height:6px}50%{height:20px}}
.card.narrow .voice{top:auto;bottom:86px;transform:translate(-50%,180%)}.card.narrow .voice.on{transform:translate(-50%,0)}
.mk.per .av{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;font-weight:800;font-size:13px;color:#fff;background:var(--pc) center/cover no-repeat;border:2px solid #fff;box-shadow:0 0 0 2.5px var(--pc),0 4px 12px #0006}
.mk.per .nm{position:absolute;left:50%;top:100%;transform:translateX(-50%);margin-top:5px;padding:2px 7px;border-radius:999px;background:rgba(18,20,24,.78);color:#fff;font-size:10px;font-weight:700;white-space:nowrap;display:none}
.card:not(.nolbl) .mk.per.walk .nm,.card.names .mk.per .nm{display:block}
.mk.per.walk .av{animation:c3walk .5s ease-in-out infinite alternate}
@keyframes c3walk{to{transform:translateY(-3px)}}
.ppl{display:flex;flex-wrap:wrap;gap:6px;margin-top:2px;pointer-events:auto}.ppl:empty{display:none}
.ppl .pp{display:flex;align-items:center;gap:6px;padding:3px 9px 3px 3px;border-radius:999px;font-size:11.5px;background:color-mix(in srgb,var(--primary-text-color,#000) 6%,transparent);cursor:pointer;white-space:nowrap}
.ppl .pp i{width:20px;height:20px;border-radius:50%;display:grid;place-items:center;font-style:normal;font-weight:800;font-size:10px;color:#fff;background:var(--pc) center/cover no-repeat;box-shadow:0 0 0 1.5px var(--pc)}
.ppl .pp b{font-weight:700}.ppl .pp small{color:var(--secondary-text-color,#666);font-size:11px}
.ppl .pp.come small{color:#2e7d32;font-weight:700}
.pin.compact{padding:3px}
.pin.hidden{opacity:0;pointer-events:none}
.tray{position:absolute;left:10px;right:10px;bottom:calc(8px + env(safe-area-inset-bottom,0px));display:flex;gap:6px;overflow-x:auto;padding:6px;border-radius:14px;scrollbar-width:none}
.tray::-webkit-scrollbar{display:none}
.chip{flex:0 0 auto;display:flex;align-items:center;gap:6px;border-radius:12px;padding:6px 10px 6px 6px;font-size:12px;cursor:pointer;background:color-mix(in srgb,var(--primary-text-color,#000) 6%,transparent)}
.chip .ic{width:24px;height:24px;border-radius:50%;display:grid;place-items:center;--mdc-icon-size:15px;background:color-mix(in srgb,var(--primary-text-color,#000) 8%,transparent)}
.chip.active .ic{background:#ffb300;color:#3a2600}.chip.run .ic{background:#2e7d32;color:#fff}.chip.err .ic{background:#d32f2f;color:#fff}
.chip div{display:flex;flex-direction:column;gap:2px}.chip small{color:var(--secondary-text-color,#666);font-size:11px}
.sheet{position:absolute;left:10px;right:10px;bottom:10px;border-radius:18px;padding:14px;max-height:62%;overflow:auto;transform:translateY(24px);opacity:0;visibility:hidden;pointer-events:none;transition:transform .22s ease,opacity .22s ease,visibility 0s .22s}
.sheet.open{transform:none;opacity:1;visibility:visible;pointer-events:auto;transition:transform .22s ease,opacity .22s ease}
@media(min-width:700px){.sheet{left:auto;width:360px;top:70px;bottom:auto;max-height:calc(100% - 90px)}}
.sh-h{display:flex;align-items:center;gap:10px;margin-bottom:8px}
.sh-h .ic{width:38px;height:38px;border-radius:12px;display:grid;place-items:center;--mdc-icon-size:22px;font-size:20px;background:color-mix(in srgb,var(--primary-text-color,#000) 8%,transparent)}
.sh-h b{font-size:16px}.sh-h small{display:block;color:var(--secondary-text-color,#666);margin-top:2px}
.sh-h .x{margin-left:auto}
.acts{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0}
.acts button{flex:1 1 auto;padding:10px}
.rel{display:grid;grid-template-columns:1fr auto;gap:4px 10px;font-size:12px;margin-top:6px}
.rel span:nth-child(odd){color:var(--secondary-text-color,#666);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer}
.rel span:nth-child(even){text-align:right;font-weight:600}
input[type=range]{width:100%}
.load{position:absolute;inset:0;display:grid;place-items:center;font-size:13px;color:#e9eee9;pointer-events:none}
.load[hidden]{display:none}
.toast{position:absolute;left:50%;top:70px;transform:translateX(-50%);padding:6px 10px;border-radius:10px;font-size:12px;opacity:0;transition:opacity .2s;pointer-events:none}
.toast.show{opacity:1}
.prog{position:absolute;left:50%;bottom:78px;transform:translateX(-50%);padding:7px 12px;border-radius:12px;font-size:12px;white-space:nowrap}
.prog[hidden]{display:none}
@media(max-width:1100px){.tools .lb{display:none}}
@media(max-width:600px){.title{max-width:56%}.tools{max-width:44%;gap:4px;padding:5px}.tools button{padding:6px}.tools .lb{display:none}}
</style>
<div class="card" id="card">
  <div id="view"></div>
  <div id="rview" hidden></div>
  <div class="load" id="load">Caricamento della casa 3D…</div>
  <div class="labels" id="labels"></div>
  <div class="alarmb" id="alarmb"></div>
  <div class="dim" id="dim"></div>
  <div class="voice glass" id="voice"><span class="w"><i></i><i></i><i></i><i></i></span><span id="vtx"></span></div>
  <div class="quadro" id="quadro"></div>
  <div class="top">
    <div class="title glass"><b id="ttl"></b><div class="stat" id="stat"></div><div class="floors" id="floors"></div><div class="ppl" id="ppl"></div></div>
    <div class="tools glass">
      <button data-v="casa" title="Casa">${this._icon('mdi:home-outline')}<span class="lb">Casa</span></button><button data-v="interno" title="Interno">${this._icon('mdi:sofa-outline')}<span class="lb">Interno</span></button><button data-v="giardino" title="Giardino">${this._icon('mdi:tree-outline')}<span class="lb">Giardino</span></button><button data-v="alto" title="Vista dall'alto">${this._icon('mdi:arrow-collapse-down')}<span class="lb">Alto</span></button>
      <button id="cut" title="Pareti basse">${this._icon('mdi:wall')}<span class="lb">Pareti basse</span></button><button id="lbl" title="Etichette">${this._icon('mdi:label-outline')}<span class="lb">Etichette</span></button><button id="photo" title="Foto realistica">${this._icon('mdi:camera-iris')}<span class="lb">Foto</span></button><button id="mode" title="Cambia vista: foto / 3D">${this._icon('mdi:cube-outline')}<span class="lb">3D</span></button><button id="sim" title="Luce e meteo: simula ora e tempo">${this._icon('mdi:weather-sunset')}<span class="lb">Luce</span></button><button id="edit" title="Posiziona gli elementi sulla foto" hidden>${this._icon('mdi:pencil-ruler')}<span class="lb">Posiziona</span></button><button id="cfg" title="Impostazioni dell'app">${this._icon('mdi:cog-outline')}</button><button id="max" title="Schermo intero">${this._icon('mdi:fullscreen')}</button>
    </div>
  </div>
  <div class="sim glass" id="simp">
    <div class="row"><b id="simh">--:--</b><input type="range" id="simr" min="0" max="24" step="0.25"><button id="simlive" class="on">Live</button></div>
    <div class="wx" id="simw"></div>
    <small id="simi"></small>
  </div>
  <div class="tray glass" id="tray"></div>
  <div class="sheet glass" id="sheet"></div>
  <div class="toast glass" id="toast"></div>
  <div class="prog glass" id="prog" hidden></div>
</div>`;
    const $ = s => root.querySelector(s);
    this._$ = $;
    $('#ttl').textContent = c.title;
    root.querySelectorAll('[data-v]').forEach(b => b.addEventListener('click', () => this._scene && this._scene.setView(b.dataset.v)));
    $('#cut').addEventListener('click', e => { this._cut = !this._cut; e.currentTarget.classList.toggle('on', this._cut); this._scene && this._scene.setCutaway(this._cut); });
    // etichette: 0 = icone, 1 = icone e nomi, 2 = nascoste
    this._lblMode = 0;
    $('#lbl').addEventListener('click', e => { this._lblMode = (this._lblMode + 1) % 3; this._names = this._lblMode === 1; $('#card').classList.toggle('names', this._names); this._noPins = this._lblMode === 2; $('#card').classList.toggle('nolbl', this._noPins); e.currentTarget.classList.toggle('on', this._lblMode !== 0); this._scene && (this._scene.dirty = true); });
    $('#photo').addEventListener('click', e => this._togglePhoto(e.currentTarget));
    $('#cfg').addEventListener('click', () => this._appSettings());
    $('#edit').addEventListener('click', () => this._openEditor());
    this._editBtn();
    $('#max').addEventListener('click', () => { $('#card').classList.toggle('max'); setTimeout(() => { this._scene && this._scene.resize(); this._rv && this._rv.fit(); }, 50); });
    $('#mode').addEventListener('click', () => this._setMode(this._mode() === 'render' ? '3d' : 'render'));
    // pannello "Luce": anteprima di ora e meteo (non cambia nulla in Home Assistant)
    $('#sim').addEventListener('click', e => { const o = $('#simp').classList.toggle('open'); e.currentTarget.classList.toggle('on', o); this._simUi(); });
    $('#simr').addEventListener('input', e => { this._sim = { ...(this._sim || {}), hour: +e.target.value }; this._applySim(); });
    $('#simlive').addEventListener('click', () => { this._sim = null; this._sync(true); this._simUi(); });
    const wb = $('#simw');
    for (const k of ['sunny', 'partlycloudy', 'cloudy', 'rainy', 'pouring', 'lightning-rainy', 'fog', 'snowy']) {
      const b = document.createElement('button'); b.dataset.w = k; b.innerHTML = `${this._icon(WXI[k])}<span>${WXN[k]}</span>`;
      b.addEventListener('click', () => { this._sim = { ...(this._sim || {}), wx: k }; this._applySim(); }); wb.appendChild(b);
    }
    this._floorUi();
    this._applyMode();
  }
  // ------------------------------------------------------------------ piani
  // apre le impostazioni dell'app Companion (Android / iPhone); nel browser apre le Impostazioni di Home Assistant
  _appSettings() {
    const msg = { type: 'config_screen/show' };
    try {
      const ext = this._hass?.auth?.external;
      if (ext && ext.fireMessage) { ext.fireMessage(msg); return; }
      if (window.externalApp && window.externalApp.externalBus) { window.externalApp.externalBus(JSON.stringify({ id: Date.now() % 100000, ...msg })); return; }
      if (window.webkit?.messageHandlers?.externalBus) { window.webkit.messageHandlers.externalBus.postMessage({ id: Date.now() % 100000, ...msg }); return; }
    } catch (e) { console.warn('casa3d impostazioni', e); }
    history.pushState(null, '', '/config/dashboard');
    window.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: false } }));
  }
  // il configuratore si vede solo agli amministratori e solo se c'è la foto della casa
  _editBtn() {
    const b = this._$ && this._$('#edit'); if (!b) return;
    b.hidden = !(this._hass && this._hass.user && this._hass.user.is_admin && this._base && this._base.image);
  }
  async _openEditor() {
    if (!(this._hass && this._hass.user && this._hass.user.is_admin)) return;
    try { await import('./isola-live-editor.js' + VQ); }
    catch (e) { console.error('isola-live: configuratore', e); this._toast('Configuratore non trovato (isola-live-editor.js)'); return; }
    const t = this._saveTarget || { type: 'custom:isola-live', key: null, match: this._user };
    const ed = document.createElement('isola-live-editor');
    document.body.appendChild(ed);
    ed.open({
      hass: this._hass, config: this._base, target: t,
      onSaved: card => { if (t.onSaved) t.onSaved(card); this._applyUser(ed.apply(this._user)); },
      onRestored: card => { if (t.onSaved) { t.onSaved(card); this._applyUser({ image: card.image || this._user.image, ...(card[t.key] || {}) }); } else this._applyUser(card); },
    });
  }
  // nuova configurazione dopo il salvataggio: la foto si ridisegna subito
  _applyUser(u) {
    this.setConfig(u);
    if (this._hass) this.hass = this._hass;
    if (this._rv) { this._rv.dispose(); this._rv = null; this._pins = null; this._mk = null; this._chips = null; this._en = null; this._flows = null; this._last = {}; this._initRender(); }
  }
  _upperCfg(b) {
    const u = b.upper || {};
    // giardino, facciata e impianto sono gli stessi a ogni piano: luci esterne, paletti, telecamere, portone e fotovoltaico restano visibili
    return { ...b,
      lights: u.lights || [],
      ambient: [...(b.ambient || []).filter(a => a.kind === 'bollards'), ...(u.ambient || [])],
      devices: u.devices || [],
      sensors: [...b.sensors.filter(m => (m.type === 'camera' || m.type === 'lock') && !(u.hide || []).includes(m.id)), ...(u.sensors || [])],
      rooms: u.rooms || [], energy: { ...b.energy, scale: u.energy_scale ?? 0.8 } };
  }
  _floorUi() {
    const box = this._$ && this._$('#floors'); if (!box) return;
    const b = this._base || this._config;
    if (!b || !b.upper) { box.innerHTML = ''; return; }
    box.innerHTML = `<button data-f="0">Piano terra</button><button data-f="1">${b.upper.short || '1° piano'}</button>`;
    box.querySelectorAll('button').forEach(x => x.addEventListener('click', ev => { ev.stopPropagation(); this._setFloor(+x.dataset.f); }));
    this._floorMark();
  }
  _floorMark() { this._$('#floors')?.querySelectorAll('button').forEach(x => x.classList.toggle('on', +x.dataset.f === (this._floor || 0))); }
  _rvOpts(floor, holder) {
    const up = floor && this._base && this._base.upper;
    return { onPick: id => this._pick(id, {}), onPins: a => { if (this._mode() === 'render' && (!holder.rv || holder.rv === this._rv)) this._place(a); },
      onTap: (u, v, x, y) => this._roomTap(u, v, x, y), portrait: this._config.portrait, lowfx: this._config.effects === 'low',
      image: up ? up.image : this._config.image, data: up ? up.data : undefined, px: true, ppm: this._config.ppm, north: this._config.image_north ?? 0,
      rooms: [...((up ? (up.lights || []) : this._config.lights) || []).map(l => l.room).filter(Boolean), ...((up ? (up.ambient || []) : this._config.ambient) || []).map(l => l.room).filter(Boolean)] };
  }
  _registerRv(rv, c) {
    const L = (l, pin) => { if (!l.px) return; rv.addLight(l.id, { ...l, kind: undefined, position: l.px, points: [l.px], radius: l.radius || 3.2, height: 2, bulb: l.bulb || 0.35, pin }); };
    for (const l of c.lights) L(l, true);
    for (const l of c.ambient || []) L(l, false);
    for (const d of c.devices) { if (d.px) rv.addDevice(d.id, d.type, { ...d, position: d.px, area: d.area_px, draw: false }); }
    for (const m of c.sensors) rv.addMarker(m.id, m);
    if (c.energy && c.energy.px) { rv.addMarker('_energy', { px: c.energy.px }); rv.addMarker('_house', { px: c.energy.house_px }); }
  }
  // cambio piano: il nuovo piano si carica sotto e compare in dissolvenza, con la stessa inquadratura e lo stesso zoom
  async _setFloor(i) {
    i = i ? 1 : 0;
    const b = this._base; if (!b || (i && !b.upper)) return;
    if (i === (this._floor || 0) || this._switching) return;
    if (this._mode() !== 'render' || !this._rv) {
      this._floor = i; this._config = i ? this._upperCfg(b) : b; this._floorMark();
      this._pins = null; this._chips = null; if (this._rv) { this._buildPins(); this._buildMarkers(); } this._renderChips(); return;
    }
    this._switching = true; this._floor = i; this._floorMark();
    const card = this._$('#card'); card.classList.add('fl'); this._closeSheet();
    const old = this._rv, oldEl = old.el;
    const el = document.createElement('div'); el.className = 'rvx'; el.style.opacity = '0'; oldEl.after(el);
    const holder = {};
    try {
      const cfg = i ? this._upperCfg(b) : b;
      const { RenderView } = await import('./isola-live-render.js' + VQ);
      const rv = new RenderView(el, this._rvOpts(i, holder)); holder.rv = rv;
      await rv.init();
      if (old.view && old.rot === rv.rot) { rv.view = { ...old.view }; rv._apply(); }
      this._config = cfg; this._rv = rv;
      this._registerRv(rv, cfg);
      this._pins = null; this._chips = null; this._mk = null; this._en = null; this._flows = null; this._last = {};
      if (this._pp) for (const S of Object.values(this._pp)) S.arrive = null;
      this._buildPins(); this._buildMarkers();
      this._sync(true); rv.draw(); this._renderChips();
      requestAnimationFrame(() => requestAnimationFrame(() => { el.style.opacity = '1'; }));
      setTimeout(() => {
        old.dispose(); oldEl.remove(); el.id = 'rview'; el.classList.remove('rvx'); el.style.opacity = '';
        card.classList.remove('fl'); this._switching = false; rv.emit();
      }, 900);
    } catch (e) {
      console.error('casa3d piano', e); el.remove(); this._floor = i ? 0 : 1; this._floorMark(); card.classList.remove('fl'); this._switching = false;
      this._toast('Piano non disponibile: ' + e.message);
    }
  }
  async _togglePhoto(btn) {
    const s = this._scene; if (!s) return;
    this._photo = !this._photo; btn.classList.toggle('on', this._photo); s.dirty = true;
    this._$('#tray').style.display = this._photo ? 'none' : '';
    const bar = this._$('#prog');
    if (!this._photo) { bar.hidden = true; await s.setPhoto(false); return; }
    bar.hidden = false; bar.textContent = 'Preparo il rendering…';
    try {
      await s.setPhoto(true, (n, max) => { bar.textContent = n >= max ? 'Foto pronta · tocca 📷 per tornare alla vista animata' : `Rendering realistico · ${Math.round(n / max * 100)}%`; });
    } catch (e) { console.error(e); bar.textContent = 'Rendering non supportato su questo dispositivo'; this._photo = false; btn.classList.remove('on'); }
  }
  _mode() { return this._modeOverride || (this._config && this._config.mode) || 'render'; }
  _setMode(m) {
    this._modeOverride = m; this._applyMode();
    if (m === '3d' && !this._scene && !this._loading) this._initScene();
    if (m === 'render' && !this._rv && !this._loading) this._initRender();
    if (this._scene) { this._scene.paused = m !== '3d'; if (m === '3d') { this._scene.resize(); this._scene.dirty = true; } }
    if (m === 'render' && this._rv) { this._rv.fit(); }
    if (m === 'render' && this._photo) this._togglePhoto(this._$('#photo'));
  }
  _applyMode() {
    const m = this._mode(), $ = this._$;
    $('#card').classList.toggle('rmode', m === 'render');
    $('#view').hidden = m !== '3d'; $('#rview').hidden = m !== 'render';
    const b = $('#mode'); b.innerHTML = m === 'render' ? `${this._icon('mdi:cube-outline')}<span class="lb">3D</span>` : `${this._icon('mdi:image-outline')}<span class="lb">Foto casa</span>`;
  }
  async _initRender() {
    if (this._user && this._user.auto !== false && !this._hass) { this._waitHass = true; return; }
    if (!this._config.image) { const ld = this._$('#load'); if (ld) { ld.hidden = false; ld.innerHTML = 'Aggiungi la foto della casa: <b>image: /local/isola/casa.jpg</b> nella configurazione della card'; } this._renderChips(); return; }
    this._loading = true;
    const ld = this._$('#load'); if (ld) { ld.hidden = false; ld.textContent = 'Caricamento della casa…'; }
    try {
      const { RenderView } = await import('./isola-live-render.js' + VQ);
      const holder = {};
      const rv = new RenderView(this._$('#rview'), this._rvOpts(this._floor || 0, holder)); holder.rv = rv;
      await rv.init();
      this._rv = rv;
      const c = this._config;
      this._registerRv(rv, c);
      if (!this._pins) this._buildPins();
      this._buildMarkers();
      if (ld) ld.hidden = true;
      this._sync(true); rv.draw();
    } catch (e) {
      console.error('isola-live', e);
      if (ld) ld.textContent = 'Vista foto non disponibile: ' + e.message + ' – passo al 3D'; this._loading = false; this._setMode('3d'); return;
    } finally { this._loading = false; }
  }
  _icon(icon) {
    if (customElements.get('ha-icon')) return `<ha-icon icon="${icon}"></ha-icon>`;
    return EMOJI[icon] || '•';
  }
  _items() {
    const c = this._config;
    return [...c.lights.map(l => ({ ...l, cls: 'light' })), ...c.devices.map(d => ({ ...d, cls: 'device' }))];
  }

  // ------------------------------------------------------------------ scena
  async _initScene() {
    this._loading = true;
    try {
      const { CasaScene } = await import('./casa3d-scene.js' + VQ);
      const ld = this._$('#load'); if (ld) { ld.hidden = false; ld.textContent = 'Caricamento della casa 3D…'; }
      const s = new CasaScene(this._$('#view'), { quality: this._config.quality || 'auto', onPick: (id, info) => this._pick(id, info), onFrame: a => { if (this._mode() === '3d') this._place(a); } });
      await s.init();
      this._scene = s;
      const c = this._config;
      for (const l of c.lights) s.addLight(l.id, l.kind === 'outdoor' ? { ...l, kind: undefined } : l);
      for (const d of c.devices) if (d.type !== 'washer') s.addDevice(d.id, d.type, d);
      if (!this._pins) this._buildPins();
      if (ld) ld.hidden = true;
      this._built = true;
      this._sync(true);
    } catch (e) {
      console.error('isola-live', e);
      this._$('#load').textContent = 'Errore nel caricamento: ' + e.message;
    } finally { this._loading = false; }
  }
  _buildPins() {
    const box = this._$('#labels'); box.innerHTML = '';
    this._pins = new Map();
    for (const it of this._items()) {
      const el = document.createElement('div');
      el.className = 'pin glass hidden';
      el.innerHTML = `<span class="ic">${this._icon(it.icon)}</span>${it.type === 'climate' ? '<span class="tp"></span>' : ''}<span class="nm">${it.name}<small></small></span>`;
      let t = null, long = false;
      el.addEventListener('pointerdown', () => { long = false; t = setTimeout(() => { long = true; this._moreInfo(it.readonly ? (it.power || this._entityOf(it)) : this._entityOf(it)); }, 550); });
      el.addEventListener('pointerup', () => { clearTimeout(t); if (!long) this._tap(it); });
      el.addEventListener('pointerleave', () => clearTimeout(t));
      box.appendChild(el); this._pins.set(it.id, el);
    }
  }
  _place(list) {
    if (!this._pins) return;
    if (this._mk) {
      const pos = {};
      for (const a of list) pos[a.id] = a;
      for (const [id, el] of this._mk) { const a = pos[id]; if (a) el.style.transform = `translate(${a.x}px,${a.y}px) translate(-50%,-50%) scale(${this._zk()})`; }
      if (pos._energy) this._placeEnergy(pos._energy, pos._house);
      list = list.filter(a => this._pins.has(a.id));
    }
    const w = this.clientWidth || 400, compact = w < 640, zk = this._mode() === 'render' ? this._zk() : 1;
    this._$('#card').classList.toggle('narrow', w < 560);
    const placed = [];
    list.sort((p, q) => q.y - p.y);   // dal basso verso l'alto: le etichette vicine si impilano
    for (const a of list) {
      const el = this._pins.get(a.id); if (!el) continue;
      const vis = a.visible && a.dist < 60;
      el.classList.toggle('hidden', !!(!vis || this._noPins || this._photo));
      el.classList.toggle('compact', (compact || !this._names) && this._selected !== a.id);
      if (!vis) continue;
      const ew = (el.offsetWidth || 80) * zk, eh = (el.offsetHeight || 26) * zk;
      let x = a.x, y = a.y;
      for (let k = 0; k < 6; k++) {
        const hit = placed.find(r => Math.abs(r.x - x) < (r.w + ew) / 2 + 2 && Math.abs(r.y - y) < (r.h + eh) / 2 + 2);
        if (!hit) break;
        y = hit.y - (hit.h + eh) / 2 - 3;
      }
      placed.push({ x, y, w: ew, h: eh });
      el.style.transform = `translate(${x}px,${y}px) translate(-50%,${this._mode() === 'render' ? '-50%' : '-100%'}) scale(${zk})`;
    }
  }

  // ------------------------------------------------------------------ stati
  _st(id) { return id && this._hass ? this._hass.states[id] : undefined; }
  _entityOf(it) {
    if (it.entity) return it.entity;
    if (it.related && this._hass) {
      const keys = Object.keys(this._hass.states).filter(k => k.includes(it.related));
      return keys.find(k => k.startsWith('vacuum.')) || keys.find(k => k.startsWith('sensor.') && /status|state|stato/.test(k)) || keys.find(k => k.startsWith('sensor.'));
    }
    return undefined;
  }
  _summary(it) {
    const e = this._entityOf(it), s = this._st(e);
    if (!s) return { txt: it.entity ? 'Non trovata' : '', cls: '' };
    const st = s.state;
    if (it.cls === 'light') {
      const on = st === 'on'; const b = s.attributes.brightness;
      return { txt: on ? (b ? Math.round(b / 2.55) + '%' : 'Accesa') : tr(st), cls: on ? 'active' : '' };
    }
    if (it.type === 'washer') {
      const run = st === 'run';
      let rem = '';
      const ct = this._st(e.replace(/machine_state$/, 'completion_time'));
      if (run && ct && ct.state && !isNaN(Date.parse(ct.state))) { const m = Math.max(0, Math.round((Date.parse(ct.state) - Date.now()) / 60000)); rem = ` · ${m} min`; }
      return { txt: tr(st) + rem, cls: run ? 'run' : st === 'pause' ? 'active' : '' };
    }
    if (it.type === 'socket') {
      const on = st === 'on', w = this._watts(it.power), kwh = parseFloat(this._st(it.energy)?.state);
      const parts = [on ? 'Accesa' : st === 'off' ? 'Spenta' : tr(st)];
      if (w != null) parts.push(Math.round(w) + ' W');
      if (!isNaN(kwh)) parts.push(kwh.toLocaleString(i18nLoc(), { maximumFractionDigits: 2 }) + ' kWh oggi');
      return { txt: parts.join(' · '), cls: on ? 'active' : '' };
    }
    if (it.type === 'climate') {
      const a = s.attributes, act = a.hvac_action || '';
      const n = v => v == null || isNaN(+v) ? '—' : (+v).toLocaleString(i18nLoc(), { maximumFractionDigits: 1 }) + '°';
      const mode = { heat: 'Caldo', cool: 'Freddo', auto: 'Auto', heat_cool: 'Auto', dry: 'Deumid.', fan_only: 'Ventola', off: 'Spento' }[st] || tr(st);
      const hot = act === 'heating' || (!act && st === 'heat'), cold = act === 'cooling' || (!act && st === 'cool');
      return { txt: st === 'off' ? 'Spento' : `${mode} → ${n(a.temperature)}`, tp: n(a.current_temperature), cls: hot ? 'heat' : cold ? 'cool' : st !== 'off' && st !== 'unavailable' ? 'active' : '' };
    }
    if (it.type === 'tv') { const on = !['off', 'unavailable', 'standby', 'unknown'].includes(st); return { txt: on ? 'Accesa' : 'Spenta', cls: on ? 'active' : '' }; }
    if (it.status) { const st2 = this._devState(it), b2 = parseFloat(this._st(it.battery)?.state);
      return { txt: tr(st2) + (!isNaN(b2) ? ` · ${Math.round(b2)}%` : ''), cls: /error/.test(st2) ? 'err' : /mowing|returning/.test(st2) ? 'run' : '' }; }
    const bat = s.attributes.battery_level;
    return { txt: tr(st) + (bat != null ? ` · ${bat}%` : ''), cls: /error/.test(st) ? 'err' : /cleaning|mowing|returning/.test(st) ? 'run' : '' };
  }
  _sync(first) {
    const h = this._hass; if (!h) return;
    if (first) { this._sunKey = null; this._wxKey = null; }
    const T = [this._scene, this._rv].filter(Boolean); if (!T.length) return;
    const sc = { setSun: o => T.forEach(t => t.setSun ? t.setSun(o) : t.setDay(Math.max(0, Math.min(1, (o.elevation + 4) / 14)))),
      setLight: (...a) => T.forEach(t => t.setLight(...a)), setDeviceState: (...a) => T.forEach(t => t.setDeviceState(...a)) };
    const c = this._config;
    // sole e meteo (se il pannello Luce sta simulando, comanda la simulazione)
    if (this._sim) this._applySim(true);
    else {
      const sun = h.states[c.sun];
      if (sun) {
        const el = +sun.attributes.elevation, az = +sun.attributes.azimuth;
        const key = (Math.round(el * 2) / 2) + '/' + Math.round(az / 2);
        if (!isNaN(el) && key !== this._sunKey) { this._sunKey = key; sc.setSun({ elevation: el, azimuth: isNaN(az) ? 180 : az, northOffset: +c.north || 0 }); }
      }
      const w = h.states[c.weather];
      if (w && this._rv) {
        const a = w.attributes, o = { state: w.state, clouds: a.cloud_coverage != null ? +a.cloud_coverage : null, windBearing: a.wind_bearing != null ? +a.wind_bearing : null, windSpeed: a.wind_speed != null ? +a.wind_speed * (/m\/s/.test(a.wind_speed_unit || '') ? 3.6 : 1) : null };
        const key = JSON.stringify(o);
        if (key !== this._wxKey) { this._wxKey = key; this._rv.setWeather(o); }
      }
    }
    if (this._rv && c.image_north != null && this._northSet !== +c.image_north) { this._northSet = +c.image_north; this._rv.setNorth(+c.image_north); }
    for (const l of c.lights) {
      const s = h.states[l.entity]; if (!s) continue;
      const k = s.state + '|' + (s.attributes.brightness || '') + '|' + (s.attributes.rgb_color || '');
      if (this._last?.[l.id] === k && !first) continue;
      (this._last ||= {})[l.id] = k;
      sc.setLight(l.id, s.state === 'on', s.attributes.brightness ?? 255, s.attributes.rgb_color);
    }
    if (this._rv) for (const a of c.ambient || []) {
      if (!a.follow) continue;
      const on = a.follow.some(id => { const l = (this._base || c).lights.find(x => x.id === id); return l && h.states[l.entity]?.state === 'on'; });
      const k = 'f' + on; if (this._last?.['amb_' + a.id] === k && !first) continue; (this._last ||= {})['amb_' + a.id] = k;
      this._rv.setLight(a.id, on, 255);
    }
    if (this._rv) for (const d of c.devices) {
      if (!d.map && !d.gps) continue;
      const px = d.map ? this._robotPx(d.map) : this._gpsPx(d), k = px ? px.map(v => v.toFixed(1)).join(',') : 'none';
      if (this._last?.['px_' + d.id] !== k || first) { (this._last ||= {})['px_' + d.id] = k; this._rv.setDevicePx(d.id, px); }
      this._trail(d, px);
    }
    this._people(first);
    this._voice();
    for (const d of c.devices) {
      const e = this._entityOf(d), s = h.states[e]; if (!s) continue;
      const k = s.state + '|' + (s.attributes.hvac_action || ''); if (this._last?.[d.id] === k && !first) continue; (this._last ||= {})[d.id] = k;
      let mode = d.status ? this._devState(d) : s.state;
      if (d.type === 'climate') mode = s.attributes.hvac_action || ({ heat: 'heating', cool: 'cooling' }[s.state] || s.state);
      if (d.type === 'tv') mode = ['off', 'unavailable', 'standby', 'unknown'].includes(s.state) ? 'off' : 'on';
      if (d.type === 'mop') mode = /charg|carica/i.test(s.state) ? 'charging' : /err/i.test(s.state) ? 'error' : 'idle';
      sc.setDeviceState(d.id, { mode });
    }
    this._refreshPins();
    if (this._selected) this._openSheet(this._selected, true);
  }
  // ------------------------------------------------------------------ sensori sulla foto
  _buildMarkers() {
    const box = this._$('#labels'), c = this._config;
    this._mk = new Map();
    for (const m of c.sensors) {
      const el = document.createElement('div'); el.className = 'mk off ' + ({ window: 'win', motion: 'mot', camera: 'cam', lock: 'lock' }[m.type] || 'win');
      el.innerHTML = m.type === 'window' ? `<div class="b">${this._icon('mdi:window-open-variant')}<span>${m.name} aperta</span></div>`
        : m.type === 'motion' ? '<div class="r"></div><span class="ago"></span>'
        : m.type === 'camera' ? `<div class="b" title="${m.name}">${this._icon('mdi:cctv')}</div>`
        : `<div class="b" title="${m.name}">${this._icon('mdi:lock')}</div>`;
      if (m.type === 'camera' || m.type === 'lock') el.addEventListener('click', ev => { ev.stopPropagation(); this._moreInfo(m.entity); });
      box.appendChild(el); this._mk.set(m.id, el);
    }
    // fotovoltaico + batteria con i flussi
    if (c.energy && c.energy.px) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'flows');
      svg.innerHTML = '<path class="base" id="fb1"/><path id="f1"/><path class="base" id="fb2"/><path id="f2"/><path class="base" id="fb3"/><path id="f3"/>';
      box.prepend(svg); this._flows = svg;
      const en = document.createElement('div'); en.className = 'en glass';
      en.innerHTML = `<div class="t inv"><span class="ic">${this._icon('mdi:solar-power-variant')}</span><div><b class="pv">—</b><small>Fotovoltaico</small></div></div>
        <div class="t bat"><span class="bi"><i></i></span><div><b class="soc">—</b><small class="bp">Batteria</small></div></div>`;
      en.querySelector('.inv').addEventListener('click', () => this._moreInfo(c.energy.pv_power));
      en.querySelector('.bat').addEventListener('click', () => { const e = this._batt(); if (e.soc) this._moreInfo(e.soc); });
      box.appendChild(en); this._en = en;
    }
    this._refreshMarkers();
  }
  // fattore di scala di etichette e pulsanti: seguono lo zoom della foto
  _zk() { const s = this._rv && this._rv.view ? this._rv.view.s : 0.8; return Math.max(0.62, Math.min(1.15, s / 0.75)); }
  // posizione del robot sulla foto dalla mappa Dreame (attributi vacuum_position e rooms della camera mappa)
  _robotPx(m) {
    const st = this._st(m.entity); if (!st) return null;
    const a = st.attributes || {}, pos = a.vacuum_position || a.robot_position; if (!pos || pos.x == null) return null;
    if (m.saved_map_id != null && a.saved_map_id != null && +a.saved_map_id !== +m.saved_map_id) return null;
    // punti di controllo: centro di ogni stanza del robot -> centro della stessa stanza sulla foto, più la base
    const C = [];
    for (const [id, r] of Object.entries(a.rooms || {})) {
      const rect = m.rooms[id] || m.rooms[r.name]; if (!rect) continue;
      const vx = r.x ?? (r.x0 + r.x1) / 2, vy = r.y ?? (r.y0 + r.y1) / 2; if (vx == null || vy == null) continue;
      C.push([vx, vy, (rect[0] + rect[2]) / 2, (rect[1] + rect[3]) / 2]);
    }
    const ch = a.charger_position, dev = this._config.devices.find(d => d.map === m);
    if (ch && ch.x != null && m.base_px) C.push([ch.x, ch.y, m.base_px[0], m.base_px[1]]);
    if (C.length < 3) return null;
    // mappa continua: piano medio (minimi quadrati) + correzione pesata sulla distanza dai punti di controllo
    const fit = k => { let S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], B = [0, 0, 0];
      for (const c of C) { const v = [c[0], c[1], 1]; for (let i = 0; i < 3; i++) { B[i] += v[i] * c[k]; for (let j = 0; j < 3; j++) S[i][j] += v[i] * v[j]; } }
      const det = M => M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
      const D = det(S); if (!D) return [0, 0, 0];
      return [0, 1, 2].map(i => det(S.map((row, r) => row.map((x, cc) => cc === i ? B[r] : x))) / D); };
    const fx = fit(2), fy = fit(3), aff = (x, y) => [fx[0] * x + fx[1] * y + fx[2], fy[0] * x + fy[1] * y + fy[2]];
    let wx = 0, wy = 0, ws = 0;
    for (const c of C) {
      const d2 = (pos.x - c[0]) ** 2 + (pos.y - c[1]) ** 2;
      if (d2 < 1) { const q = aff(c[0], c[1]); wx = c[2] - q[0]; wy = c[3] - q[1]; ws = 1; break; }
      const w = 1 / d2; const q = aff(c[0], c[1]); wx += w * (c[2] - q[0]); wy += w * (c[3] - q[1]); ws += w;
    }
    const q = aff(pos.x, pos.y);
    return [q[0] + wx / ws, q[1] + wy / ws];
  }

  // ------------------------------------------------------------------ robot in tempo reale
  // stato vero del robot tagliaerba: se c'è il sensore di stato (status) vale quello
  _devState(d) {
    const s = this._st(this._entityOf(d)); let st = s ? String(s.state) : '';
    const x = d.status ? String(this._st(d.status)?.state || '').toLowerCase() : '';
    if (x && !/unknown|unavailable/.test(x)) {
      if (/work|mow|cut|border|edge|leav/.test(x)) st = 'mowing';
      else if (/return|back|homing|go.?home|going/.test(x)) st = 'returning';
      else if (/pause|stop/.test(x)) st = 'paused';
      else if (/error|fault|alarm|lift|stuck|trap|tilt/.test(x)) st = 'error';
      else if (/charg|standby|idle|dock|station|sleep|rest/.test(x)) st = 'docked';
    }
    return st;
  }
  _ls(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem('c3d_' + k) || 'null'); localStorage.setItem('c3d_' + k, JSON.stringify(v)); } catch (e) { return null; } }
  // tagliaerba con GPS: metri dalla base -> punto sulla foto (il lato alto della foto guarda verso image_north)
  _gpsPx(d) {
    const t = this._st(d.gps), m = this._st(this._entityOf(d)); if (!t || !this._rv) return null;
    const lat = +t.attributes.latitude, lon = +t.attributes.longitude; if (!isFinite(lat) || !isFinite(lon) || (!lat && !lon)) return null;
    const docked = /dock|charg/i.test(this._devState(d));
    let ref = d.gps_ref || this._ls('gps_' + d.id), org = d.position;
    if (docked) { if (!d.gps_ref) this._ls('gps_' + d.id, [lat, lon]); return null; }
    if (!ref) {   // base non ancora vista: si parte dal punto di zone.home (centro della casa)
      const hz = this._st('zone.home'); if (!hz || hz.attributes.latitude == null) return null;
      ref = [+hz.attributes.latitude, +hz.attributes.longitude]; org = d.gps_home_xz || [0, 0];
    }
    const N = (lat - ref[0]) * 111320, E = (lon - ref[1]) * 111320 * Math.cos(ref[0] * Math.PI / 180);
    const th = (+((this._base || this._config).image_north ?? 65)) * Math.PI / 180;
    const up = E * Math.sin(th) + N * Math.cos(th), right = E * Math.sin(th + Math.PI / 2) + N * Math.cos(th + Math.PI / 2);
    const a = d.gps_area || [-99, -99, 99, 99];
    const x = Math.max(a[0], Math.min(a[2], org[0] + right)), z = Math.max(a[1], Math.min(a[3], org[1] - up));
    return this._rv.proj(x, 0.55, z);
  }
  // scia: i punti del giro in corso restano disegnati (salvati sul dispositivo, così sopravvivono al ricaricamento)
  _trail(d, px) {
    if (!this._config.trail || !this._rv || !this._rv.setTrail) return;
    const s = this._st(this._entityOf(d)); if (!s) return;
    const dst = this._devState(d), run = /cleaning|mowing|returning/.test(dst), key = 'trail_' + d.id;
    let T = this._trails?.[d.id] || this._ls(key);
    const start = run ? ((d.status && this._st(d.status)?.last_changed) || s.last_changed) : null;
    if (run && (!T || (T.start !== start && !/returning/.test(dst)))) T = { start, pts: [], end: null };
    if (T && run && px) {
      const last = T.pts[T.pts.length - 1];
      if (!last || Math.hypot(px[0] - last[0], px[1] - last[1]) > 2.5) { T.pts.push([+px[0].toFixed(1), +px[1].toFixed(1)]); if (T.pts.length > 3000) T.pts.splice(0, T.pts.length - 3000); this._ls(key, T); }
    }
    if (T && !run && !T.end) { T.end = Date.now(); this._ls(key, T); }
    const age = T && T.end ? (Date.now() - T.end) / 3600000 : 0;
    if (T && age > 2) { T = null; this._ls(key, null); }
    (this._trails ||= {})[d.id] = T;
    this._rv.setTrail(d.id, T ? T.pts : [], { kind: d.type, fade: T && T.end ? Math.max(0.25, 1 - age / 2) : 1 });
  }

  // ------------------------------------------------------------------ persone
  _people(first) {
    const c = this._base || this._config, P = c.people || []; if (!this._hass) return;
    const box = this._$('#ppl'), home = this._st('zone.home'), now = Date.now();
    const hav = (a, b, cc, dd) => { const R = 6371, r = Math.PI / 180, x = Math.sin((cc - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(cc * r) * Math.sin((dd - b) * r / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
    const pic = st => st?.attributes?.entity_picture ? `background-image:url('${(this._hass.hassUrl ? this._hass.hassUrl(st.attributes.entity_picture) : st.attributes.entity_picture)}')` : '';
    const ini = p => (p.name || '?').slice(0, 1).toUpperCase();
    this._pp ||= {};
    const away = [];
    for (const p of P) {
      const st = this._st(p.entity); if (!st) continue;
      const S = this._pp[p.id] ||= { home: st.state === 'home', d: [] };
      const isHome = st.state === 'home';
      // distanza e direzione (si avvicina?)
      let km = null, coming = false;
      if (!isHome && home && st.attributes.latitude != null) {
        km = hav(+home.attributes.latitude, +home.attributes.longitude, +st.attributes.latitude, +st.attributes.longitude);
        S.d.push([now, km]); S.d = S.d.filter(x => now - x[0] < 900000);
        coming = S.d.length > 1 && S.d[0][1] - km > 0.4;
      }
      if (!isHome) {
        const zone = st.state !== 'not_home' ? st.state : null, eta = p.eta ? this._st(p.eta) : null;
        const et = eta && !isNaN(parseFloat(eta.state)) ? Math.round(parseFloat(eta.state)) : null;
        const fmt = k => k < 1 ? Math.round(k * 1000) + ' m' : (k < 10 ? k.toLocaleString(i18nLoc(), { maximumFractionDigits: 1 }) : Math.round(k)) + ' km';
        const txt = [zone, km != null && km > 0.15 ? fmt(km) : null, et != null ? (coming ? 'a casa tra ' + et + ' min' : et + ' min da casa') : (coming ? 'sta rientrando' : null)].filter(Boolean).join(' · ');
        away.push(`<span class="pp${coming ? ' come' : ''}" data-e="${p.entity}" style="--pc:${p.color}"><i style="${pic(st)}">${pic(st) ? '' : ini(p)}</i><b>${p.name}</b><small>${txt || 'fuori casa'}</small></span>`);
      }
      if (isHome && !S.home && !first) { S.arrive = now; this._setRoom(p.id, (c.presence_default || [700, 360]), now); }   // appena rientrato: camminata dal cancelletto
      S.home = isHome; S.st = st; S.p = p;
    }
    if (box) {
      const h = away.join('');
      if (box.dataset.h !== h) { box.dataset.h = h; box.innerHTML = h; box.querySelectorAll('[data-e]').forEach(x => x.onclick = ev => { ev.stopPropagation(); this._moreInfo(x.dataset.e); }); }
    }
    this._placePeople();
  }
  // stanza di ogni persona (ricordata sul dispositivo)
  _ping(el) { if (!el) return; el.classList.remove('ping'); void el.offsetWidth; el.classList.add('ping'); clearTimeout(el._pt); el._pt = setTimeout(() => el.classList.remove('ping'), 3200); }
  // comandi vocali: le frasi di Assist scrivono "Intento|ora" in input_text.casa3d_voce
  _voice() {
    const c = this._base || this._config, s = this._st(c.voice); if (!s || !s.state || s.state === 'unknown') return;
    if (this._vKey === undefined) { this._vKey = s.state; return; }    // all'avvio non ripete l'ultimo comando
    if (s.state === this._vKey) return; this._vKey = s.state;
    const it = s.state.split('|')[0];
    const MAP = { CasaRiepilogo: ['Come va la casa', []], CasaProduzione: ['Produzione', ['_en']], CasaBatteria: ['Batteria', ['_en']], CasaBolletta: ['Bolletta', ['_en']],
      CasaFinestre: ['Finestre', c.sensors.filter(m => m.type === 'window').map(m => m.id)], CasaPortoneStato: ['Portone', c.sensors.filter(m => m.type === 'lock').map(m => m.id)], CasaPortoneApri: ['Portone', c.sensors.filter(m => m.type === 'lock').map(m => m.id)],
      CasaCancelletto: ['Cancelletto', []], CasaLavatrice: ['Lavatrice', ['washer']], CasaChiCe: ['Chi c\u2019è in casa', (c.people || []).map(p => 'per_' + p.id)],
      CasaRaccoltaOggi: ['Raccolta di oggi', []], CasaRaccoltaDomani: ['Raccolta di domani', []] };
    const dv = (c.devices || []).find(d => d.name && it.toLowerCase().includes(String(d.name).toLowerCase()));
    let [label, ids] = MAP[it] || [dv ? dv.name : 'Comando vocale', dv ? [dv.id] : []];
    const v = this._$('#voice'); this._$('#vtx').textContent = '\u{1F399}\uFE0F ' + label;
    v.classList.add('on'); clearTimeout(this._vT); this._vT = setTimeout(() => v.classList.remove('on'), 4500);
    for (const id of ids) this._ping(id === '_en' ? this._en : this._pins?.get(id) || this._mk?.get(id));
    // anche il tablet si "sveglia": via la modalità quadro e l'oscuramento
    this._touchB && this._touchB();
  }
  _setRoom(id, px, t) { (this._proom ||= this._ls('proom') || {})[id] = { px: [...px], t }; this._ls('proom', this._proom); }
  // un movimento nuovo sposta una sola persona: nessuno se qualcuno è già lì, altrimenti chi è più vicino
  _assignMotion(home) {
    const c = this._base || this._config; this._proom ||= this._ls('proom') || {};
    let best = null;
    for (const [id, px] of Object.entries(c.presence || {})) {
      const s = this._st(id); if (!s) continue;
      const t = s.state === 'on' ? new Date(s.last_changed).getTime() : new Date(s.last_changed).getTime() - 1;
      if (!best || t > best.t) best = { t, px, on: s.state === 'on' };
    }
    if (!best || Date.now() - best.t > 30 * 60000) return;
    const lastT = this._ls('proom_t') || 0; if (best.t <= lastT) return;
    this._ls('proom_t', best.t);
    if (!home.length) return;
    const at = id => this._proom[id]?.px || c.presence_default || [700, 360];
    if (home.some(id => Math.hypot(at(id)[0] - best.px[0], at(id)[1] - best.px[1]) < 25)) return;   // è chi è già lì
    const pick = home.map(id => ({ id, d: Math.hypot(at(id)[0] - best.px[0], at(id)[1] - best.px[1]), t: this._proom[id]?.t || 0 }))
      .sort((x, y) => x.d - y.d || x.t - y.t)[0];
    this._setRoom(pick.id, best.px, best.t);
  }
  _personTarget(id, list) {
    const c = this._base || this._config, h = new Date().getHours(), al = this._st(c.alarm)?.state || '';
    const night = (h >= 22 || h < 8) && /armed_home|armed_night/.test(al), i = list.indexOf(id);
    if (night) return { floor: 1, px: (c.presence_bed || [])[i] || [880, 230] };
    const at = k => (this._proom?.[k]?.px) || c.presence_default || [700, 360];
    const base = at(id);
    // due persone nella stessa stanza: una accanto all'altra
    const same = list.filter(k => Math.hypot(at(k)[0] - base[0], at(k)[1] - base[1]) < 25), j = same.indexOf(id);
    const off = same.length > 1 ? (j - (same.length - 1) / 2) * 30 : 0;
    return { floor: 0, px: [base[0] + off, base[1] + (same.length > 1 ? (j % 2 ? 6 : -6) : 0)] };
  }
  _placePeople() {
    if (!this._rv || !this._mk) return;
    const c = this._base || this._config, list = Object.entries(this._pp || {}).filter(([, S]) => S.home);
    const fl = this._floor || 0, now = Date.now(), path = c.arrival_path || [];
    let anim = false;
    this._assignMotion(list.map(([k]) => k));
    for (const [id, S] of Object.entries(this._pp || {})) {
      const mid = 'per_' + id;
      let el = this._mk.get(mid);
      if (!el) {
        el = document.createElement('div'); el.className = 'mk per off'; el.style.setProperty('--pc', S.p.color);
        el.innerHTML = `<div class="av"></div><span class="nm"></span>`;
        el.style.pointerEvents = 'auto'; el.addEventListener('click', ev => { ev.stopPropagation(); this._moreInfo(S.p.entity); });
        this._$('#labels').appendChild(el); this._mk.set(mid, el);
        this._rv.anchors.set(mid, () => ({ px: this._pp?.[id]?.px || [0, 0] }));
      }
      const av = el.querySelector('.av'), st = S.st, url = st?.attributes?.entity_picture;
      const bg = url ? `url('${this._hass.hassUrl ? this._hass.hassUrl(url) : url}')` : '';
      if (av.dataset.bg !== bg) { av.dataset.bg = bg; av.style.backgroundImage = bg; av.textContent = bg ? '' : (S.p.name || '?')[0].toUpperCase(); }
      el.querySelector('.nm').textContent = S.p.name;
      if (!S.home || (!c.presence_default && !Object.keys(c.presence || {}).length)) { el.classList.add('off'); continue; }
      const T = this._personTarget(id, list.map(([k]) => k));
      let px = T.px, walk = false, onFloor = T.floor === fl;
      // camminata di arrivo (4 secondi) dal cancelletto al portone, poi nella stanza
      if (S.arrive && now - S.arrive < 6000 && path.length > 1 && fl === 0) {
        const pts = [...path, T.floor === 0 ? T.px : path[path.length - 1]], t = Math.min(1, (now - S.arrive) / 5500);
        const L = []; let tot = 0; for (let k = 1; k < pts.length; k++) { const l = Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]); L.push(l); tot += l; }
        let dd = t * tot, k = 0; while (k < L.length - 1 && dd > L[k]) { dd -= L[k]; k++; }
        const f = L[k] ? dd / L[k] : 1; px = [pts[k][0] + (pts[k + 1][0] - pts[k][0]) * f, pts[k][1] + (pts[k + 1][1] - pts[k][1]) * f];
        walk = t < 1; onFloor = true; anim = true;
      } else if (S.px && Math.hypot(S.px[0] - px[0], S.px[1] - px[1]) > 1 && S.fl === T.floor) {
        // spostamento morbido verso la nuova stanza
        px = [S.px[0] + (px[0] - S.px[0]) * 0.15, S.px[1] + (px[1] - S.px[1]) * 0.15]; walk = true; anim = true;
      }
      S.px = px; S.fl = T.floor;
      el.classList.toggle('off', !onFloor); el.classList.toggle('walk', walk);
    }
    this._rv.emit();
    if (anim && !this._pRaf) this._pRaf = requestAnimationFrame(() => { this._pRaf = null; this._placePeople(); });
  }
  _batt() {
    const c = this._config.energy, S = this._hass ? this._hass.states : {};
    const find = re => Object.keys(S).find(k => re.test(k));
    return { soc: c.battery_soc || find(/^sensor\.batter(y|ies)(_\d+)?_state_of_capacity$/), pw: c.battery_power || find(/^sensor\.batter(y|ies)(_\d+)?_charge_discharge_power$/) };
  }
  _watts(id) {
    const s = this._st(id); if (!s) return null;
    const v = parseFloat(s.state); if (isNaN(v)) return null;
    const u = (s.attributes.unit_of_measurement || 'W'); return u === 'kW' ? v * 1000 : u === 'MW' ? v * 1e6 : v;
  }
  _refreshMarkers() {
    if (!this._mk || !this._hass) return;
    const c = this._config, on = id => this._st(id)?.state === 'on';
    const open = [];
    for (const m of c.sensors) {
      const el = this._mk.get(m.id), s = this._st(m.entity); if (!el) continue;
      if (!s) { el.classList.add('off'); continue; }
      if (m.type === 'window') { const o = s.state === 'on'; el.classList.toggle('off', !o); if (o) open.push(m.name); }
      else if (m.type === 'motion') {
        const on = s.state === 'on', min = (Date.now() - new Date(s.last_changed).getTime()) / 60000, rec = !on && min < (+c.motion_recent || 0);
        el.classList.toggle('off', !on && !rec); el.classList.toggle('recent', rec);
        if (rec) el.querySelector('.ago').textContent = min < 1 ? 'ora' : Math.round(min) + ' min';
      }
      else if (m.type === 'camera') { el.classList.remove('off'); el.classList.toggle('alert', on(m.motion) || on(m.ding)); }
      else if (m.type === 'lock') {
        el.classList.remove('off');
        const ok = s.state === 'locked', op = ['unlocked', 'open', 'opening', 'unlocking', 'jammed'].includes(s.state);
        el.classList.toggle('ok', ok); el.classList.toggle('open', op);
        el.querySelector('.b').innerHTML = this._icon(ok ? 'mdi:lock' : 'mdi:lock-open-variant');
      }
    }
    this._open = (this._base || c).sensors.filter(m => m.type === 'window' && this._st(m.entity)?.state === 'on').map(m => m.name);
    // allarme: bordo della mappa
    const al = this._st(c.alarm), b = this._$('#alarmb');
    if (b) { const st = al ? al.state : ''; b.className = 'alarmb ' + (st === 'triggered' ? 'away trig' : /armed_(away|night|vacation|custom)/.test(st) ? 'away' : st === 'armed_home' ? 'home' : /arming|pending/.test(st) ? 'home trig' : ''); }
    // energia
    if (this._en) {
      const pv = this._watts(c.energy.pv_power), bt = this._batt();
      let bp = this._watts(bt.pw); if (bp !== null && c.energy.battery_invert) bp = -bp;
      const soc = bt.soc ? parseFloat(this._st(bt.soc)?.state) : NaN;
      const kw = w => (Math.abs(w) / 1000).toLocaleString(i18nLoc(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' kW';
      this._en.querySelector('.pv').textContent = pv === null ? '—' : pv < 20 ? 'Fermo' : kw(pv);
      const bat = this._en.querySelector('.bat');
      bat.classList.toggle('miss', isNaN(soc));
      this._en.querySelector('.soc').textContent = isNaN(soc) ? 'Batteria' : Math.round(soc) + '%';
      this._en.querySelector('.bp').textContent = isNaN(soc) ? 'in arrivo' : bp === null || Math.abs(bp) < 20 ? 'In attesa' : (bp > 0 ? 'Carica ' : 'Scarica ') + kw(bp);
      const bi = this._en.querySelector('.bi'); bi.style.color = isNaN(soc) ? '#9e9e9e' : soc < 20 ? '#e53935' : soc < 50 ? '#f5a524' : '#43a047';
      bi.querySelector('i').style.height = (isNaN(soc) ? 0 : Math.max(4, Math.min(100, soc)) * 0.82) + '%';
      this._flow = { pv: pv || 0, ch: bp !== null && bp > 20 ? bp : 0, dis: bp !== null && bp < -20 ? -bp : 0 };
      this._placeEnergy();
    }
  }
  _placeEnergy(a, h) {
    if (a) this._enA = a; if (h) this._enH = h;
    a = this._enA; h = this._enH; const en = this._en, svg = this._flows;
    if (!en || !a || !h) return;
    const zk = this._zk(); en.style.transformOrigin = '100% 50%'; const ek = zk * (+this._config.energy.scale || 1); en.style.transform = `translate(${a.x - 8 * ek}px,${a.y}px) translate(-100%,-50%) scale(${ek})`;
    const box = this._$('#labels').getBoundingClientRect(), ri = en.querySelector('.inv').getBoundingClientRect(), rb = en.querySelector('.bat').getBoundingClientRect();
    const P = (r, sx, sy) => [r.left - box.left + r.width * sx, r.top - box.top + r.height * sy];
    const f = this._flow || { pv: 0, ch: 0, dis: 0 };
    const curve = (p, q) => { const dx = Math.max(40 * zk, Math.abs(q[0] - p[0]) * 0.5); return `M${p[0].toFixed(1)},${p[1].toFixed(1)} C${(p[0] + dx).toFixed(1)},${p[1].toFixed(1)} ${(q[0] - dx * 0.3).toFixed(1)},${(q[1] + 30).toFixed(1)} ${q[0].toFixed(1)},${q[1].toFixed(1)}`; };
    const inv = P(ri, 1, 0.5), bat = P(rb, 1, 0.5), house = [h.x, h.y];
    const toHouse = Math.max(0, f.pv - f.ch);
    const set = (id, d, w, color, on) => {
      const pth = svg.querySelector('#' + id), base = svg.querySelector('#fb' + id.slice(1));
      pth.setAttribute('d', d); base.setAttribute('d', d);
      pth.style.color = color; pth.style.stroke = color; base.style.stroke = color;
      pth.style.display = on ? '' : 'none'; base.style.display = on ? '' : 'none';
      pth.style.animationDuration = Math.max(0.45, 2.4 - w / 1000 * 0.55).toFixed(2) + 's';
      pth.style.strokeWidth = ((2.6 + Math.min(3, w / 1500)) * zk).toFixed(1); base.style.strokeWidth = (2 * zk).toFixed(1);
    };
    set('f1', curve(inv, house), toHouse, '#ffb300', toHouse > 20);
    // carica: dall'inverter alla batteria (arco sul lato sinistro del riquadro)
    const l1 = P(ri, 0, 0.5), l2 = P(rb, 0, 0.5);
    set('f2', `M${l1[0].toFixed(1)},${l1[1].toFixed(1)} C${(l1[0] - 18).toFixed(1)},${l1[1].toFixed(1)} ${(l2[0] - 18).toFixed(1)},${l2[1].toFixed(1)} ${l2[0].toFixed(1)},${l2[1].toFixed(1)}`, f.ch, '#43a047', f.ch > 0);
    set('f3', curve(bat, house), f.dis, '#26c6da', f.dis > 0);
  }
  _roomTap(u, v, x, y) {
    const r = (this._config.rooms || []).find(r => { let ins = false; const p = r.poly; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { if ((p[i][1] > v) !== (p[j][1] > v) && u < (p[j][0] - p[i][0]) * (v - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0]) ins = !ins; } return ins; });
    this._$('.roomchip')?.remove();
    if (!r) return;
    const chip = document.createElement('div'); chip.className = 'roomchip glass';
    chip.innerHTML = `${r.name} ${this._icon('mdi:chevron-right')}`;
    chip.style.left = x + 'px'; chip.style.top = y + 'px';
    chip.addEventListener('click', ev => { ev.stopPropagation(); chip.remove(); history.pushState(null, '', r.path); window.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: false } })); });
    this._$('#labels').appendChild(chip);
    clearTimeout(this._chipT); this._chipT = setTimeout(() => chip.remove(), 3500);
  }
  _latlon() { const k = this._hass?.config || {}; return [k.latitude ?? 41.77, k.longitude ?? 12.23]; }
  _applySim(quiet) {
    const rv = this._rv; if (!rv || !this._sim) return;
    const now = new Date(), sm = this._sim;
    if (sm.hour == null) sm.hour = now.getHours() + now.getMinutes() / 60;
    const d = new Date(now); d.setHours(Math.floor(sm.hour), Math.round((sm.hour % 1) * 60), 0, 0);
    const [lat, lon] = this._latlon(), p = sunPos(d, lat, lon);
    rv.setSun(p);
    const w = this._st(this._config.weather), a = w ? w.attributes : {};
    const st = sm.wx || (w ? w.state : 'sunny');
    rv.setWeather({ state: st, clouds: sm.wx ? null : (a.cloud_coverage ?? null), windBearing: a.wind_bearing ?? 250, windSpeed: Math.max(14, +a.wind_speed || 0) });
    this._sunKey = null; this._wxKey = null;
    if (!quiet) this._simUi();
  }
  _simUi() {
    const $ = this._$; if (!$('#simp').classList.contains('open')) return;
    const now = new Date(), sm = this._sim;
    const hr = sm?.hour ?? now.getHours() + now.getMinutes() / 60;
    $('#simr').value = hr; $('#simh').textContent = `${String(Math.floor(hr)).padStart(2, '0')}:${String(Math.round((hr % 1) * 60)).padStart(2, '0')}`;
    $('#simlive').classList.toggle('on', !sm);
    const w = this._st(this._config.weather), cur = sm?.wx || w?.state;
    $('#simw').querySelectorAll('button').forEach(b => b.classList.toggle('on', !!sm?.wx && b.dataset.w === cur));
    const a = this._rv?.atm, s = this._rv?.sun;
    $('#simi').textContent = sm ? 'Anteprima: non cambia nulla in casa. Tocca Live per tornare al cielo reale.' : (s ? `Sole a ${Math.round(s.elevation)}° · azimut ${Math.round(s.azimuth)}° · ${w ? (WXN[w.state] || w.state) : 'meteo non trovato'}` : '');
  }
  _refreshPins() {
    if (!this._pins) return;
    for (const it of this._items()) {
      const el = this._pins.get(it.id); if (!el) continue;
      const sm = this._summary(it);
      el.querySelector('small').textContent = sm.txt ? ' · ' + sm.txt : '';
      const tp = el.querySelector('.tp'); if (tp) tp.textContent = sm.tp || '';
      const sk = this._st(this._entityOf(it))?.state, pk = (this._pingS ||= {});
      if (pk[it.id] !== undefined && pk[it.id] !== sk) this._ping(el);
      pk[it.id] = sk;
      el.classList.remove('active', 'run', 'err', 'heat', 'cool'); if (sm.cls) el.classList.add(sm.cls);
    }
  }
  _renderChips() {
    if (!this._root || !this._config) return;
    const h = this._hass, c = this._config;
    const tray = this._$('#tray');
    const items = this._items();
    if (!this._chips) {
      tray.innerHTML = '';
      this._chips = new Map();
      for (const it of items) {
        const el = document.createElement('div'); el.className = 'chip';
        el.innerHTML = `<span class="ic">${this._icon(it.icon)}</span><div><span>${it.name}</span><small></small></div>`;
        el.addEventListener('click', () => { if (this._mode() === '3d' && this._scene) this._scene.focus(it.id); this._openSheet(it.id); });
        tray.appendChild(el); this._chips.set(it.id, el);
      }
    }
    for (const it of items) {
      const el = this._chips.get(it.id); if (!el) continue;
      const sm = this._summary(it); el.querySelector('small').textContent = sm.txt || '—';
      el.classList.remove('active', 'run', 'err', 'heat', 'cool'); if (sm.cls) el.classList.add(sm.cls);
    }
    // riepilogo in alto
    if (h) {
      const on = c.lights.filter(l => h.states[l.entity]?.state === 'on').length;
      const al = h.states[c.alarm];
      const parts = [`${this._icon('mdi:ceiling-light')} ${on ? on + (on === 1 ? ' luce accesa' : ' luci accese') : 'Luci spente'}`];
      if (al) parts.push(`${this._icon('mdi:shield-home')} ${tr(al.state)}`);
      const running = [...(this._base || c).devices, ...((this._base || c).upper?.devices || [])].filter(d => /cleaning|mowing|run/.test(d.status ? this._devState(d) : (h.states[this._entityOf(d)]?.state || ''))).map(d => d.name);
      if (running.length) parts.push('▶ ' + running.join(', '));
      if (this._open && this._open.length) parts.unshift(`<b style="color:#e53935">${this._icon('mdi:window-open-variant')} ${this._open.length === 1 ? 'Finestra aperta: ' : 'Finestre aperte: '}${this._open.join(', ')}</b>`);
      const w = h.states[c.weather];
      if (w) { const t = w.attributes.temperature; parts.push(`${this._icon(WXI[w.state] || 'mdi:weather-partly-cloudy')} ${WXN[w.state] || w.state}${t != null ? ' · ' + Math.round(t) + '°' : ''}`); }
      this._$('#stat').innerHTML = parts.map(p => `<span>${p}</span>`).join('');
    }
  }

  // ------------------------------------------------------------------ interazione
  _find(id) { return this._items().find(x => x.id === id); }
  _pick(id, info) {
    if (!id) {
      this._closeSheet();
      if (this._config.debug && info && info.point) this._toast(`position: [${info.point.x.toFixed(2)}, ${info.point.z.toFixed(2)}]`);
      return;
    }
    const it = this._find(id); if (it) this._tap(it);
  }
  _tap(it) {
    if (it.cls === 'light' && !it.readonly) { this._toggle(it); return; }
    this._openSheet(it.id);
  }
  _toggle(it) {
    const e = this._entityOf(it); if (!e || !this._hass) return;
    const dom = e.split('.')[0];
    this._hass.callService(dom === 'light' ? 'light' : dom === 'media_player' ? 'media_player' : 'homeassistant', 'toggle', { entity_id: e });
    this._toast((this._st(e)?.state === 'on' ? 'Spengo ' : 'Accendo ') + it.name);
  }
  _call(domain, service, data) { this._hass && this._hass.callService(domain, service, data); }
  _moreInfo(entityId) {
    if (!entityId) return;
    this.dispatchEvent(new CustomEvent('hass-more-info', { bubbles: true, composed: true, detail: { entityId } }));
  }
  _toast(t) { const el = this._$('#toast'); el.textContent = t; el.classList.add('show'); clearTimeout(this._tt); this._tt = setTimeout(() => el.classList.remove('show'), 1600); }
  _closeSheet() { this._selected = null; this._$('#sheet').classList.remove('open'); }
  _openSheet(id, refresh) {
    const it = this._find(id); if (!it) return;
    this._selected = id;
    const sh = this._$('#sheet'), e = this._entityOf(it), s = this._st(e), sm = this._summary(it);
    const acts = [];
    if (it.cls === 'light') {
      acts.push(['toggle', s?.state === 'on' ? 'Spegni' : 'Accendi']);
    } else if (it.type === 'vacuum') acts.push(['v_start', 'Avvia'], ['v_pause', 'Pausa'], ['v_home', 'Alla base'], ['v_locate', 'Trova']);
    else if (it.type === 'mower') acts.push(['m_start', 'Avvia taglio'], ['m_pause', 'Pausa'], ['m_dock', 'Alla base']);
    else if (it.type === 'tv') acts.push(['toggle', s && s.state !== 'off' ? 'Spegni' : 'Accendi']);
    else if (it.type === 'socket') acts.push(['s_power', 'Consumo'], ['s_energy', 'Energia oggi']);
    else if (it.type === 'climate') acts.push(['c_down', '− 0,5°'], ['c_up', '+ 0,5°'], ['c_heat', 'Caldo'], ['c_cool', 'Freddo'], ['c_off', 'Spegni']);
    acts.push(['more', 'Dettagli']);
    let extra = '';
    if (it.cls === 'light' && s && e.startsWith('light.') && s.state === 'on' && s.attributes.brightness != null)
      extra = `<label style="font-size:12px;color:var(--secondary-text-color)">Luminosità</label><input type="range" min="1" max="100" value="${Math.round(s.attributes.brightness / 2.55)}" id="bri">`;
    // entità collegate (stato a colpo d'occhio)
    let rel = '';
    if (it.related && this._hass) {
      const keys = Object.keys(this._hass.states).filter(k => k.includes(it.related) && /^(sensor|binary_sensor|select|vacuum|lawn_mower)\./.test(k)).slice(0, 14);
      rel = '<div class="rel">' + keys.map(k => { const x = this._hass.states[k]; const u = x.attributes.unit_of_measurement || ''; let v = x.state;
        if (x.attributes.device_class === 'timestamp' && !isNaN(Date.parse(v))) v = new Date(v).toLocaleTimeString(i18nLoc(), { hour: '2-digit', minute: '2-digit' });
        const nm = (x.attributes.friendly_name || k).replace(it.name, '').trim(); return `<span data-e="${k}">${NAMES[nm.toLowerCase()] || nm || 'Stato'}</span><span>${tr(v)} ${u}</span>`; }).join('') + '</div>';
    }
    sh.innerHTML = `<div class="sh-h"><span class="ic">${this._icon(it.icon)}</span><div><b>${it.name}</b><small>${sm.txt || (e ? '' : 'Entità non configurata')}</small></div><button class="x" id="x">✕</button></div>
      ${extra}<div class="acts">${acts.map(([k, l]) => `<button data-a="${k}">${l}</button>`).join('')}</div>${rel}`;
    sh.querySelector('#x').onclick = () => this._closeSheet();
    sh.querySelectorAll('[data-e]').forEach(x => x.onclick = () => this._moreInfo(x.dataset.e));
    const bri = sh.querySelector('#bri'); if (bri) bri.onchange = () => this._call('light', 'turn_on', { entity_id: e, brightness_pct: +bri.value });
    sh.querySelectorAll('[data-a]').forEach(b => b.onclick = () => {
      const a = b.dataset.a;
      if (a === 'more') return this._moreInfo(it.readonly ? (it.power || e) : e);
      if (a === 'toggle') return this._toggle(it);
      if (a === 's_power') return this._moreInfo(it.power);
      if (a === 's_energy') return this._moreInfo(it.energy);
      if (a === 'c_up' || a === 'c_down') {
        const t = Math.round((+(s?.attributes.temperature ?? 21) + (a === 'c_up' ? 0.5 : -0.5)) * 2) / 2;
        this._call('climate', 'set_temperature', { entity_id: e, temperature: t }); this._toast(it.name + ' · ' + t.toLocaleString(i18nLoc()) + '°'); return;
      }
      if (a === 'c_heat' || a === 'c_cool' || a === 'c_off') {
        this._call('climate', 'set_hvac_mode', { entity_id: e, hvac_mode: { c_heat: 'heat', c_cool: 'cool', c_off: 'off' }[a] }); this._toast(b.textContent + ' · ' + it.name); return;
      }
      const map = { v_start: ['vacuum', 'start'], v_pause: ['vacuum', 'pause'], v_home: ['vacuum', 'return_to_base'], v_locate: ['vacuum', 'locate'],
        m_start: ['lawn_mower', 'start_mowing'], m_pause: ['lawn_mower', 'pause'], m_dock: ['lawn_mower', 'dock'] }[a];
      if (map) { this._call(map[0], map[1], { entity_id: e }); this._toast(b.textContent + ' · ' + it.name); }
    });
    if (!refresh) sh.classList.add('open');
  }
}
if (!customElements.get('isola-live')) customElements.define('isola-live', Casa3DCard);
window.customCards = window.customCards || [];
if (!window.customCards.find(x => x.type === 'isola-live')) window.customCards.push({ type: 'isola-live', name: 'Isola Live', description: 'La casa viva per tablet a parete e hub fissi (Isola è per smartphone)', preview: false });
console.info(`%c ISOLA LIVE %c ${VERSION} `, 'background:#2e7d32;color:#fff;border-radius:3px 0 0 3px', 'background:#ddd;color:#222;border-radius:0 3px 3px 0');
