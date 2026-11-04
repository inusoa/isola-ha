// Casa 3D – vista "render": immagine fotorealistica (Planner 5D) con luci e dispositivi interattivi.
// La camera del render è stata ricostruita: ogni punto 3D della casa si proietta sul pixel giusto.
const VQ = new URL(import.meta.url).search;
const GARDEN = 0.0;        // quota del giardino nel render di Planner 5D
// meteo di Home Assistant -> nuvole (c), pioggia (r), neve (s), nebbia (f), grandine (h), temporale (l)
const WX = {
  'sunny': { c: 0.04 }, 'clear-night': { c: 0.04 }, 'partlycloudy': { c: 0.45 }, 'cloudy': { c: 0.9 },
  'fog': { c: 0.7, f: 1 }, 'rainy': { c: 0.9, r: 0.55 }, 'pouring': { c: 1, r: 1 },
  'lightning': { c: 0.85, l: 1 }, 'lightning-rainy': { c: 0.95, r: 0.8, l: 1 }, 'hail': { c: 0.9, r: 0.6, h: 1 },
  'snowy': { c: 0.9, s: 0.7 }, 'snowy-rainy': { c: 0.9, r: 0.4, s: 0.35 }, 'windy': { c: 0.3 }, 'windy-variant': { c: 0.6 }, 'exceptional': { c: 0.6 },
};

export class RenderView {
  constructor(el, opts = {}) {
    this.el = el;
    this.base = opts.base || new URL('./', import.meta.url).href;
    this.onPick = opts.onPick || (() => {});
    this.onPins = opts.onPins || (() => {});
    this.onTap = opts.onTap || null;
    this.portrait = opts.portrait || 'rotate';   // telefono in verticale: 'rotate' = immagine ruotata per riempire lo schermo, 'contain' = intera
    this.rot = 0;
    this.lowfx = !!opts.lowfx;   // effetti leggeri: niente sfocature né fusioni di colore (tablet che sfarfallano)
    this.anchors = new Map();   // id -> {p:[x,y,z]} oppure funzione
    this.lights = new Map();
    this.devices = new Map();
    this.day = 1;
    this.view = { s: 1, tx: 0, ty: 0 };
    this.imgUrl = opts.image || null;
    this.px = !!opts.px;                 // Isola Live: posizioni in pixel della foto, nessuna calibrazione 3D
    this.ppm = this.px ? (+opts.ppm || 40) : 1;   // pixel per metro (raggi delle luci, velocità dei robot)
    this.pxRooms = opts.rooms || [];
    this.pxOpts = opts;   // piano diverso: stessa camera (view.json), altra immagine e altre stanze
    this.dataUrl = opts.data || null;
  }

  async init() {
    const j = u => fetch(new URL(u + VQ, this.base)).then(r => { if (!r.ok) throw new Error(u + ' non trovato'); return r.json(); });
    if (this.px) {
      const im0 = new Image(); im0.src = new URL(this.imgUrl, location.href).href;
      try { await im0.decode(); } catch (e) { throw new Error('foto della casa non trovata (' + this.imgUrl + ')'); }
      const W = im0.naturalWidth, H = im0.naturalHeight, o = this.pxOpts;
      this.v = { W, H, full: [W, H], offset: [0, 0], image: this.imgUrl, edge: o.edge ?? 0, north: o.north ?? 0, focus: o.focus || null, px: true };
      this.data = { floors: this.pxRooms.map(p => ({ points: p })), furniture: [] };
    } else {
      this.v = await j('render/view.json');
      this.data = await j(this.dataUrl || 'isola-live-data.json');
    }
    this.data.furniture = this.data.furniture || []; this.data.floors = this.data.floors || [];
    if (!this.px) {
    const c = this.v.cam, cy = Math.cos(c.yaw), sy = Math.sin(c.yaw), cp = Math.cos(c.pitch), sp = Math.sin(c.pitch), cr = Math.cos(c.roll), sr = Math.sin(c.roll);
    // R = Ry * Rx * Rz (camera -> mondo)
    const Ry = [[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]], Rx = [[1, 0, 0], [0, cp, -sp], [0, sp, cp]], Rz = [[cr, -sr, 0], [sr, cr, 0], [0, 0, 1]];
    const mul = (A, B) => A.map((r, i) => [0, 1, 2].map(k => r[0] * B[0][k] + r[1] * B[1][k] + r[2] * B[2][k]));
    this.R = mul(mul(Ry, Rx), Rz);
    }

    const el = this.el;
    const edge = this.v.edge ?? 0.72;
    const mask = edge ? `-webkit-mask-image:radial-gradient(ellipse ${edge * 100}% ${edge * 94}% at 50% 50%,#000 72%,transparent 100%);mask-image:radial-gradient(ellipse ${edge * 100}% ${edge * 94}% at 50% 50%,#000 72%,transparent 100%)` : '';
    const T = 'transition:opacity 2.5s ease,background-color 2.5s ease,filter 2.5s ease';
    const LO = this.lowfx;
    el.innerHTML = `<div class="rv-bg" style="position:absolute;inset:-60px;background-size:cover;background-position:center;${LO ? 'display:none;' : 'filter:blur(34px) brightness(.8) saturate(1.1);transform:scale(1.08);'}transition:filter 2.5s ease"></div><div class="rv-stage" style="position:absolute;left:0;top:0;transform-origin:0 0;will-change:transform;${mask}">
      <img alt="Casa" draggable="false" style="display:block;width:${this.v.W}px;height:${this.v.H}px;user-select:none;-webkit-user-drag:none;${T}">
      <canvas class="rv-obj" width="${this.v.W}" height="${this.v.H}" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none"></canvas>
      <canvas class="rv-trail" width="${this.v.W * 2}" height="${this.v.H * 2}" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none"></canvas>
      <div class="rv-tint" style="position:absolute;inset:0;background:${LO ? 'transparent' : '#fff'};${LO ? '' : 'mix-blend-mode:multiply;'}pointer-events:none;${T}"></div>
      <div class="rv-sun" style="position:absolute;inset:0;mix-blend-mode:soft-light;opacity:0;pointer-events:none;${LO ? 'display:none;' : ''}${T}"></div>
      <div class="rv-cloud" style="position:absolute;inset:-12%;mix-blend-mode:multiply;opacity:0;pointer-events:none;${LO ? 'display:none;' : ''}${T}"></div>
      <div class="rv-haze" style="position:absolute;inset:0;opacity:0;pointer-events:none;${T}"></div>
      <canvas class="rv-light" width="${this.v.W}" height="${this.v.H}" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none"></canvas>
      <div class="rv-wet" style="position:absolute;inset:0;mix-blend-mode:screen;opacity:0;pointer-events:none;${LO ? 'display:none;' : ''}${T}"></div>
    </div>
    <canvas class="rv-fx" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none"></canvas>
    <div class="rv-flash" style="position:absolute;inset:0;background:#dfe8ff;opacity:0;pointer-events:none;mix-blend-mode:screen"></div>`;
    el.style.cssText += ';position:absolute;inset:0;overflow:hidden;background:#232a24;touch-action:none;cursor:grab;transition:background-color 2.5s ease';
    const q = s => el.querySelector(s);
    this.bgEl = q('.rv-bg'); this.stage = q('.rv-stage'); this.img = q('img'); this.canvas = q('.rv-light');
    this.L = { tint: q('.rv-tint'), sun: q('.rv-sun'), cloud: q('.rv-cloud'), haze: q('.rv-haze'), wet: q('.rv-wet'), fx: q('.rv-fx'), flash: q('.rv-flash') };
    this.ctx = this.canvas.getContext('2d'); this.octx = q('.rv-obj').getContext('2d');
    await new Promise((res, rej) => { this.img.onload = res; this.img.onerror = () => rej(new Error('immagine del render non trovata')); this.img.src = this.px ? new URL(this.imgUrl, location.href).href : new URL((this.imgUrl || this.v.image) + VQ, this.base).href; });
    this.bgEl.style.backgroundImage = `url("${this.img.src}")`;
    try { // sfondo della card uguale al fondo del render
      const t = document.createElement('canvas'); t.width = t.height = 4; const tg = t.getContext('2d'); tg.drawImage(this.img, 0, 0, 40, 40, 0, 0, 4, 4);
      const px = tg.getImageData(1, 1, 1, 1).data; this.bg = [px[0], px[1], px[2]]; this._applyBg();
    } catch (e) { /* immagine non leggibile: resta lo sfondo predefinito */ }
    // paletti: posizioni dell'immagine attuale (view.json) oppure quelle del DXF
    this.bollards = this.v.bollards || this.data.furniture.filter(f => f.type === 'bollard');
    this.north = this.v.north ?? 0;
    this.sun = { elevation: 35, azimuth: 200 }; this.wx = { state: 'sunny' };
    this.floors = this.data.floors.map(f => f.points);
    this._bindInput();
    this._ro = new ResizeObserver(() => this.fit()); this._ro.observe(el);
    this.fit();
    return this;
  }

  // punto 3D (metri, coordinate della scena) -> pixel dell'immagine
  proj(x, y, z) {
    if (this.px) return [x, z];
    const c = this.v.cam, d = [x - c.pos[0], y - c.pos[1], z - c.pos[2]], R = this.R;
    const cx = d[0] * R[0][0] + d[1] * R[1][0] + d[2] * R[2][0];
    const cyy = d[0] * R[0][1] + d[1] * R[1][1] + d[2] * R[2][1];
    const cz = -(d[0] * R[0][2] + d[1] * R[1][2] + d[2] * R[2][2]);
    return [this.v.full[0] / 2 + c.f * cx / cz - this.v.offset[0], this.v.full[1] / 2 - c.f * cyy / cz - this.v.offset[1]];
  }

  // ------------------------------------------------------------ registrazione
  addLight(id, cfg) {
    const base = { level: 0, auto: cfg.auto || null, pin: cfg.pin !== false };
    if (cfg.kind === 'bollards') {
      const m = this.bollards.filter(b => !cfg.group || cfg.group === 'all' || b.group === cfg.group);
      if (!m.length) return;
      const cx = m.reduce((s, b) => s + b.x, 0) / m.length, cz = m.reduce((s, b) => s + b.z, 0) / m.length;
      this.lights.set(id, { ...base, kind: 'bollards', members: m });
      if (base.pin) this.anchors.set(id, [cx, GARDEN + 0.9, cz]);
    } else if (cfg.kind === 'outdoor') {
      // plafoniera da esterno: corpo nero disegnato sulla foto, luce sul terrazzo davanti
      const f = cfg.fixture, pool = cfg.pool || [f[0], f[2] + 1];
      this.lights.set(id, { ...base, kind: 'outdoor', f, pool, edge: cfg.edge ?? pool[1] - 0.6, r: cfg.radius || 2.6, size: cfg.size || 0.15 });
      if (base.pin) this.anchors.set(id, cfg.pin_at ? [cfg.pin_at[0], 0, cfg.pin_at[1]] : [pool[0], 0, pool[1]]);
      this._objDirty = true;
    } else {
      const pts = cfg.points || [cfg.position];
      this.lights.set(id, { ...base, kind: 'pendant', pts, x: pts[0][0], z: pts[0][1], r: cfg.radius || 4.6, h: cfg.height || 1.85, bulb: cfg.bulb || 0.5, rgb: [255, 196, 120] });
      if (base.pin) this.anchors.set(id, [cfg.position ? cfg.position[0] : pts[0][0], 2.05, cfg.position ? cfg.position[1] : pts[0][1]]);
    }
  }
  addDevice(id, kind, cfg) {
    const garden = kind === 'mower';
    const y = { vacuum: 0.35, mop: 1.25, mower: GARDEN + 0.55, washer: 1.05, tv: 1.25, climate: 2.15, socket: 1.25 }[kind] ?? 0.8;
    const pos = cfg.position || (kind === 'washer' ? this._washerPos() : [0, 0]);
    const dev = { kind, home: [pos[0], pos[1]], cur: [pos[0], pos[1]], y, area: cfg.area, garden, mode: 'idle', glow: cfg.glow_dir || null, blow: cfg.blow || [0, 1] };
    if (kind === 'tv' && cfg.draw !== false) { dev.screen = { x: pos[0], z: pos[1], w: cfg.width || 1.23, y0: cfg.bottom ?? 0.62, y1: (cfg.bottom ?? 0.62) + (cfg.width || 1.23) * 0.58 }; this._objDirty = true; }
    this.devices.set(id, dev);
    const az = kind === 'tv' && dev.screen ? -(dev.screen.w / 2 + 0.3) : 0;
    this.anchors.set(id, () => dev.px ? { px: dev.px } : [dev.cur[0], y, dev.cur[1] + az]);
  }
  // segnaposto (sensori, energia): px = pixel dell'immagine, oppure position = [x, z] e height
  addMarker(id, cfg) {
    if (cfg.px) this.anchors.set(id, { px: cfg.px });
    else if (cfg.position) this.anchors.set(id, [cfg.position[0], cfg.height ?? 1.2, cfg.position[1]]);
  }
  // posizione reale (pixel dell'immagine), per esempio dalla mappa del robot; null = torna alla posizione simulata
  setDevicePx(id, px) {
    const d = this.devices.get(id); if (!d) return;
    if (!px) { d.px = d.pxT = null; this.emit(); return; }
    d.pxT = px; if (!d.px) { d.px = [...px]; this.emit(); return; }
    if (this._pxRaf) return;
    const step = () => {
      let moving = false;
      for (const dv of this.devices.values()) {
        if (!dv.px || !dv.pxT) continue;
        const dx = dv.pxT[0] - dv.px[0], dy = dv.pxT[1] - dv.px[1];
        if (Math.hypot(dx, dy) < 0.3) { dv.px = [...dv.pxT]; continue; }
        dv.px = [dv.px[0] + dx * 0.12, dv.px[1] + dy * 0.12]; moving = true;
      }
      this.emit();
      this._pxRaf = moving ? requestAnimationFrame(step) : null;
    };
    this._pxRaf = requestAnimationFrame(step);
  }
  _washerPos() { const w = this.data.furniture.find(f => f.type === 'washer'); return w ? [w.x, w.z] : [0, 0]; }

  // ------------------------------------------------------------ stati
  _applyBg() { if (!this.bg) return; const k = 0.3 + 0.7 * this.day; this.el.style.backgroundColor = `rgb(${this.bg.map(c => Math.round(c * k * (1 - (1 - this.day) * 0.15))).join(',')})`; }
  // compatibilità: 0 = notte, 1 = giorno
  setDay(day) { this.setSun({ elevation: day * 14 - 4, azimuth: this.sun.azimuth }); }
  setSun(o) { this.sun = { elevation: +o.elevation, azimuth: +o.azimuth }; this._atmos(); }
  setWeather(w) { this.wx = w || { state: 'sunny' }; this._atmos(); }
  setNorth(n) { this.north = +n || 0; this._atmos(); }

  // ------------------------------------------------------------ atmosfera: sole + meteo
  _atmos() {
    if (!this.L) return;
    const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    const e = this.sun.elevation, wx = WX[this.wx.state] || WX.sunny;
    let c = wx.c;
    const cc = this.wx.clouds;
    if (cc != null && !isNaN(cc) && !wx.r && !wx.s && !wx.f) c = 0.35 * c + 0.65 * Math.max(0, Math.min(1, cc / 100));
    const r = wx.r || 0, sn = wx.s || 0, fg = wx.f || 0;
    const D = sm(-10, 6, e);                         // luce del giorno
    const G = sm(-3, 2, e) * (1 - sm(9, 24, e));    // ora d'oro
    const B = sm(-11, -3, e) * (1 - sm(-3, 3, e));  // ora blu
    const M = sm(12, 35, e);                        // sole alto
    const S = D * (1 - 0.88 * c);                   // sole diretto (sparisce col coperto)
    const N = 1 - D;
    this.atm = { D, G, B, M, S, c, r, sn, fg, e };
    // 1) immagine: esposizione, saturazione, contrasto
    const bright = (0.26 + 0.74 * D) * (1 - 0.2 * c * D - 0.1 * r) * (1 + 0.05 * M * (1 - c)) * (1 - 0.1 * G * (1 - M) * (1 - c));
    const sat = (0.5 + 0.5 * D) * (1 - 0.32 * c - 0.12 * r - 0.3 * fg) * (1 + 0.06 * G);
    const con = 1 + 0.05 * M * (1 - c) - 0.15 * c * D - 0.2 * fg + 0.06 * r;
    this.img.style.filter = `brightness(${bright.toFixed(3)}) saturate(${sat.toFixed(3)}) contrast(${con.toFixed(3)})`;
    this._bgF = `brightness(${(bright * 0.72).toFixed(3)}) saturate(${sat.toFixed(3)})`;
    // 2) colore della luce: prodotto di più filtri "moltiplica" in un solo strato
    const k = [1, 1, 1];
    const mul = (hex, a) => { if (a <= 0) return; const v = [1, 3, 5].map(i => parseInt(hex.substr(i, 2), 16) / 255); for (let i = 0; i < 3; i++) k[i] *= 1 - a + a * v[i]; };
    mul('#e6eeff', 0.55 * M * (1 - c));      // mezzogiorno: luce più bianca e fredda della foto al tramonto
    mul('#ffc48a', 0.16 * G * (1 - 0.8 * c)); // tramonto/alba: luce calda
    mul('#6f86cc', 0.55 * B);                 // ora blu
    mul('#2c3d78', 0.62 * N * (1 - B));        // notte
    mul('#c3cad6', 0.45 * c * D);             // cielo coperto
    mul('#9ba8ba', 0.3 * r * D);              // pioggia
    mul('#eef3ff', 0.25 * sn * D);
    if (this.lowfx) {   // senza "moltiplica": velo scuro colorato con la stessa resa media
      const kk = k.map(x => Math.max(0, Math.min(1, x))), avg = (kk[0] + kk[1] + kk[2]) / 3, mx = Math.max(...kk, 0.01);
      this.L.tint.style.backgroundColor = `rgba(${kk.map(x => Math.round(x / mx * 38)).join(",")},${Math.min(0.9, (1 - avg) * 1.1).toFixed(3)})`;
    } else this.L.tint.style.backgroundColor = `rgb(${k.map(x => Math.round(Math.max(0, Math.min(1, x)) * 255)).join(',')})`;
    if (this.bgEl) this.bgEl.style.filter = `blur(34px) ${this._bgF} brightness(${((k[0] + k[1] + k[2]) / 3).toFixed(3)})`;
    // 3) direzione del sole: lato al sole più luminoso e caldo, lato opposto più freddo
    const th = ((this.sun.azimuth - this.north) % 360 + 360) % 360;
    const warm = G > 0.3 ? 'rgba(255,145,55,.7)' : 'rgba(255,236,200,.65)';
    this.L.sun.style.background = `linear-gradient(${th.toFixed(1)}deg, rgba(30,50,105,.75) 0%, rgba(128,128,128,0) 42%, rgba(128,128,128,0) 55%, ${warm} 100%)`;
    this.L.sun.style.opacity = (S * (0.16 + 0.3 * G + 0.06 * M)).toFixed(3);
    // 4) ombre delle nuvole che scorrono col vento
    const cs = D * (1 - fg) * Math.min(1, 3.4 * c * (1 - c)) * (1 - 0.6 * r);
    this._clouds(cs);
    // 5) nebbia / foschia
    const hz = Math.min(0.6, 0.46 * fg + 0.1 * r + 0.18 * sn + 0.04 * c);
    const hc = N > 0.5 ? '70,80,105' : '228,232,238';
    this.L.haze.style.background = `radial-gradient(ellipse 70% 65% at 50% 50%, rgba(${hc},.55), rgba(${hc},.95))`;
    this.L.haze.style.opacity = hz.toFixed(3);
    // 6) superfici bagnate: riflesso freddo leggero
    this.L.wet.style.background = 'linear-gradient(180deg, rgba(120,140,170,.25), rgba(90,105,130,.12))';
    this.L.wet.style.opacity = (r * (0.5 + 0.5 * D)).toFixed(3);
    // luci di casa: di sera o col cielo scuro si vedono di più
    this.day = D * (1 - 0.3 * c - 0.15 * r);
    this._applyBg();
    this.draw();
    this._fxSetup();
  }
  _clouds(op) {
    const el = this.L.cloud;
    if (op < 0.02 || this.lowfx) { el.style.opacity = 0; this._cloudAnim?.pause(); return; }
    if (!this._cloudTile) {
      const T = 512, c = document.createElement('canvas'); c.width = c.height = T; const g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, T, T);
      let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      for (let i = 0; i < 16; i++) {
        const x = rnd() * T, y = rnd() * T, rad = 70 + rnd() * 150, a = 0.35 + rnd() * 0.35;
        for (const ox of [-T, 0, T]) for (const oy of [-T, 0, T]) {
          const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
          gr.addColorStop(0, `rgba(40,50,75,${a})`); gr.addColorStop(0.6, `rgba(40,50,75,${a * 0.5})`); gr.addColorStop(1, 'rgba(40,50,75,0)');
          g.fillStyle = gr; g.beginPath(); g.arc(x + ox, y + oy, rad, 0, Math.PI * 2); g.fill();
        }
      }
      this._cloudTile = c.toDataURL('image/png');
      el.style.backgroundImage = `url(${this._cloudTile})`;
      el.style.backgroundSize = '820px 820px';
    }
    el.style.opacity = Math.min(1, op).toFixed(3);
    // direzione: il vento arriva da wind_bearing, le nuvole vanno dalla parte opposta
    const wb = this.wx.windBearing ?? 250, ws = this.wx.windSpeed ?? 12;
    const ang = (wb + 180 - this.north) * Math.PI / 180, dx = Math.sin(ang), dy = -Math.cos(ang);
    const key = Math.round(ang * 20) + '/' + Math.round(ws / 3);
    if (this._cloudKey !== key) {
      this._cloudKey = key; this._cloudAnim?.cancel();
      const pxs = 6 + ws * 1.1, dur = 820 / pxs * 1000;
      this._cloudAnim = el.animate([{ backgroundPosition: '0px 0px' }, { backgroundPosition: `${(dx * 820).toFixed(1)}px ${(dy * 820).toFixed(1)}px` }], { duration: dur, iterations: Infinity });
    } else this._cloudAnim?.play();
  }

  // ------------------------------------------------------------ pioggia, neve, lampi
  _fxSetup() {
    const a = this.atm, wx = WX[this.wx.state] || {};
    this._fx = { rain: a.r, snow: a.sn, hail: !!wx.h, storm: !!wx.l };
    const need = a.r > 0 || a.sn > 0 || wx.l;
    const cv = this.L.fx;
    if (!need) { cancelAnimationFrame(this._fxRaf); this._fxRaf = null; clearTimeout(this._boltT); this._boltT = null; cv.getContext('2d').clearRect(0, 0, cv.width, cv.height); return; }
    if (wx.l && !this._boltT) this._bolt();
    if (!wx.l) { clearTimeout(this._boltT); this._boltT = null; }
    if (!this._fxRaf) { this._fxLast = performance.now(); this._fxRaf = requestAnimationFrame(t => this._fxStep(t)); }
  }
  _bolt() {
    this._boltT = setTimeout(() => {
      if (!this._fx?.storm) { this._boltT = null; return; }
      if (!document.hidden) this.L.flash.animate([{ opacity: 0 }, { opacity: 0.55, offset: 0.05 }, { opacity: 0.08, offset: 0.18 }, { opacity: 0.4, offset: 0.26 }, { opacity: 0 }], { duration: 900, easing: 'ease-out' });
      this._bolt();
    }, 4000 + Math.random() * 11000);
  }
  _fxStep(now) {
    this._fxRaf = requestAnimationFrame(t => this._fxStep(t));
    if (document.hidden || !this.el.offsetWidth) return;
    if (now - this._fxLast < (this.lowfx ? 66 : 33)) return;            // ~30 fps (15 con effetti leggeri)
    const dt = Math.min(0.08, (now - this._fxLast) / 1000); this._fxLast = now;
    const cv = this.L.fx, dpr = Math.min(1.5, window.devicePixelRatio || 1), w = this.el.clientWidth, h = this.el.clientHeight;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    const f = this._fx, P = this._parts ||= [];
    const ws = this.wx.windSpeed ?? 10, wb = this.wx.windBearing ?? 250, ang = (wb + 180 - this.north) * Math.PI / 180;
    const wv = [Math.sin(ang) * Math.min(1, ws / 40), -Math.cos(ang) * Math.min(1, ws / 40)];
    const nRain = Math.round(f.rain * (w * h) / 2600), nSnow = Math.round(f.snow * (w * h) / 5200);
    const night = 1 - this.day;
    // pioggia: gocce che cadono verso il basso (camera inclinata) spinte dal vento
    let rn = P.filter(p => p.k === 'r').length, sw = P.filter(p => p.k === 's').length;
    while (rn < nRain) { P.push({ k: 'r', x: Math.random() * w, y: Math.random() * h, v: 0.7 + Math.random() * 0.6, l: 10 + Math.random() * 16 }); rn++; }
    while (sw < nSnow) { P.push({ k: 's', x: Math.random() * w, y: Math.random() * h, v: 0.5 + Math.random(), r: 1 + Math.random() * 2.2, p: Math.random() * 6.28 }); sw++; }
    if (rn > nRain || sw > nSnow) { let dr = rn - nRain, ds = sw - nSnow; for (let i = P.length - 1; i >= 0; i--) { if (P[i].k === 'r' && dr > 0) { P.splice(i, 1); dr--; } else if (P[i].k === 's' && ds > 0) { P.splice(i, 1); ds--; } } }
    const dir = [wv[0] * 0.9 + 0.08, 1], dl = Math.hypot(dir[0], dir[1]); dir[0] /= dl; dir[1] /= dl;
    g.lineCap = 'round';
    g.strokeStyle = night > 0.5 ? 'rgba(170,190,230,.32)' : 'rgba(225,235,250,.42)'; g.lineWidth = f.hail ? 2.2 : 1.1;
    g.beginPath();
    for (const p of P) {
      if (p.k !== 'r') continue;
      const sp = (900 + 500 * f.rain) * p.v * dt; p.x += dir[0] * sp; p.y += dir[1] * sp;
      if (p.y > h + 20 || p.x < -30 || p.x > w + 30) { p.y = -20 - Math.random() * 40; p.x = Math.random() * (w + 60) - 30; if (Math.random() < 0.35) (this._rip ||= []).push({ x: Math.random() * w, y: Math.random() * h, t: 0 }); }
      const L = f.hail ? 3 : p.l; g.moveTo(p.x, p.y); g.lineTo(p.x - dir[0] * L, p.y - dir[1] * L);
    }
    g.stroke();
    // cerchi delle gocce a terra
    if (this._rip?.length) {
      g.lineWidth = 1;
      this._rip = this._rip.filter(r => (r.t += dt) < 0.5);
      for (const r of this._rip) { const k = r.t / 0.5; g.strokeStyle = `rgba(220,230,245,${0.35 * (1 - k)})`; g.beginPath(); g.ellipse(r.x, r.y, 2 + 9 * k, (2 + 9 * k) * 0.55, 0, 0, Math.PI * 2); g.stroke(); }
      if (this._rip.length > 120) this._rip.splice(0, this._rip.length - 120);
    }
    // neve
    g.fillStyle = 'rgba(255,255,255,.85)';
    for (const p of P) {
      if (p.k !== 's') continue;
      p.p += dt * 1.5; p.x += (wv[0] * 60 + Math.sin(p.p) * 18) * dt; p.y += (40 + 30 * p.v) * dt;
      if (p.y > h + 6) { p.y = -6; p.x = Math.random() * w; }
      if (p.x < -6) p.x = w + 5; if (p.x > w + 6) p.x = -5;
      g.beginPath(); g.arc(p.x, p.y, p.r, 0, Math.PI * 2); g.fill();
    }
  }
  // scia dei robot: il robot aspirapolvere lascia una striscia chiara dove ha pulito, il tagliaerba una striscia d'erba più chiara dove ha tagliato
  setTrail(id, pts, o = {}) {
    (this._trails ||= {})[id] = { pts: pts || [], ...o };
    const cv = this.el.querySelector('.rv-trail'); if (!cv) return;
    const g = cv.getContext('2d'); g.setTransform(2, 0, 0, 2, 0, 0); g.clearRect(0, 0, this.v.W, this.v.H);
    for (const T of Object.values(this._trails)) {
      if (!T.pts || T.pts.length < 2) continue;
      const mow = T.kind === 'mower', w = mow ? 13 : 9, f = T.fade ?? 1;
      const line = (col, lw) => { g.strokeStyle = col; g.lineWidth = lw; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); T.pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.stroke(); };
      g.globalCompositeOperation = 'source-over';
      if (mow) { line(`rgba(190,235,140,${0.22 * f})`, w); line(`rgba(230,255,200,${0.18 * f})`, w * 0.35); }
      else { line(`rgba(255,255,255,${0.16 * f})`, w); line(`rgba(120,190,255,${0.5 * f})`, 1.6); }
      // ultimo tratto più vivo: la direzione del robot
      const n = T.pts.length, tail = T.pts.slice(Math.max(0, n - 12));
      g.strokeStyle = mow ? `rgba(220,255,180,${0.55 * f})` : `rgba(140,205,255,${0.8 * f})`; g.lineWidth = 2.4; g.beginPath(); tail.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.stroke();
    }
  }
  setLight(id, on, brightness = 255, rgb) {
    const L = this.lights.get(id); if (!L) return;
    L.level = on ? Math.max(0.2, brightness / 255) : 0;
    if (rgb) L.rgb = rgb;
    this.draw();
  }
  setDeviceState(id, st) {
    const d = this.devices.get(id); if (!d) return;
    d.mode = st.mode;
    const moving = st.mode === 'cleaning' || st.mode === 'mowing' || st.mode === 'returning';
    if (!moving && st.mode === 'docked') d.cur = [...d.home];
    if (st.mode === 'returning') d.path = [[...d.home]];
    if (moving) this._startAnim(); else this.draw();
  }

  // ------------------------------------------------------------ disegno dei bagliori
  // strato di luce per una lampada: la foto stessa, scaldata e ritagliata con l'attenuazione della luce
  // (così sotto la lampada si vedono davvero parquet, mobili e tessuti, non solo un alone colorato)
  _layer(L) {
    if (L.canvas) return L.canvas;
    const W = this.v.W, H = this.v.H, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    const scale = (x, y, z, r) => { if (this.px) return r * this.ppm; const a = this.proj(x, y, z), b = this.proj(x + r, y, z); return Math.hypot(b[0] - a[0], b[1] - a[1]); };
    // maschera
    g.fillStyle = '#000';
    const blob = (x, y, z, r, k, sy = 0.82) => {
      const c0 = this.proj(x, y, z), rad = scale(x, y, z, r);
      const grd = g.createRadialGradient(c0[0], c0[1], 0, c0[0], c0[1], rad);
      grd.addColorStop(0, `rgba(0,0,0,${k})`); grd.addColorStop(0.35, `rgba(0,0,0,${0.75 * k})`); grd.addColorStop(0.7, `rgba(0,0,0,${0.3 * k})`); grd.addColorStop(1, 'rgba(0,0,0,0)');
      // gradiente schiacciato insieme all'ellisse: il bordo sfuma senza tagli netti
      g.save(); g.translate(c0[0], c0[1]); g.scale(1, sy); g.translate(-c0[0], -c0[1]);
      g.fillStyle = grd; g.beginPath(); g.arc(c0[0], c0[1], rad, 0, Math.PI * 2); g.fill(); g.restore();
    };
    if (L.kind === 'outdoor') {
      const [fx, fy, fz] = L.f, [px, pz] = L.pool;
      blob(px, 0, pz, L.r, 1.0, 0.75); blob(px, 0, pz - 0.2, L.r * 0.45, 0.6, 0.7);
      // solo davanti alla facciata (sotto la plafoniera nell'immagine), più un alone sul muro
      const r = document.createElement('canvas'); r.width = W; r.height = H; const rg = r.getContext('2d'); rg.fillStyle = '#000';
      const q4 = [this.proj(px - 8, 0, L.edge), this.proj(px + 8, 0, L.edge), this.proj(px + 8, 0, L.edge + 9), this.proj(px - 8, 0, L.edge + 9)];
      rg.beginPath(); q4.forEach((q, i) => i ? rg.lineTo(q[0], q[1]) : rg.moveTo(q[0], q[1])); rg.closePath(); rg.fill();
      g.globalCompositeOperation = 'destination-in'; g.drawImage(r, 0, 0); g.globalCompositeOperation = 'source-over';
      blob(fx, fy, fz, 0.9, 0.55, 0.8);
    } else if (L.kind === 'pendant') {
      for (const [x, z] of L.pts) { blob(x, 0.0, z, L.r, 1.0); blob(x, 1.2, z, L.r * 0.7, 0.7, 1.1); }
      const poly = this.floors.find(p => inPoly(L.x, L.z, p));
      if (poly) {
        // regione della stanza: pavimento + facce interne delle pareti che la camera vede
        const r = document.createElement('canvas'); r.width = W; r.height = H; const rg = r.getContext('2d'); rg.fillStyle = '#000';
        const path = pts => { rg.beginPath(); pts.forEach((q, i) => i ? rg.lineTo(q[0], q[1]) : rg.moveTo(q[0], q[1])); rg.closePath(); rg.fill(); };
        path(poly.map(([x, z]) => this.proj(x, 0, z)));
        let area = 0; for (let i = 0; i < poly.length; i++) { const [x1, z1] = poly[i], [x2, z2] = poly[(i + 1) % poly.length]; area += x1 * z2 - x2 * z1; }
        const cam = this.px ? null : this.v.cam.pos;
        for (let i = 0; cam && i < poly.length; i++) {
          const [x1, z1] = poly[i], [x2, z2] = poly[(i + 1) % poly.length];
          const ex = x2 - x1, ez = z2 - z1; let nx = -ez, nz = ex; if (area < 0) { nx = -nx; nz = -nz; }  // normale verso l'interno
          if ((cam[0] - x1) * nx + (cam[2] - z1) * nz <= 0) continue;
          const wh = this.v.wallHeight || 2.7; path([this.proj(x1, 0, z1), this.proj(x2, 0, z2), this.proj(x2, wh, z2), this.proj(x1, wh, z1)]);
        }
        if (this.data.clip_top) {
          // primo piano: la luce resta dentro il contorno dei muri (non illumina la facciata sotto)
          const wh = this.v.wallHeight || 2.7, top = poly.map(([x, z]) => this.proj(x, wh, z));
          rg.globalCompositeOperation = 'destination-in'; rg.beginPath(); top.forEach((q, i) => i ? rg.lineTo(q[0], q[1]) : rg.moveTo(q[0], q[1])); rg.closePath(); rg.fill(); rg.globalCompositeOperation = 'source-over';
        }
        g.globalCompositeOperation = 'destination-in'; g.drawImage(r, 0, 0); g.globalCompositeOperation = 'source-over';
      }
    } else {
      for (const b of L.members) blob(b.x, GARDEN, b.z, 1.7, 1.0, 0.8);
    }
    // foto scaldata, poi ritagliata con la maschera
    const tint = L.kind === 'pendant' ? '#ffcf96' : L.kind === 'outdoor' ? '#ffd7a6' : '#ffc684';
    this._tinted = this._tinted || {};
    if (!this._tinted[tint]) {
      const t = document.createElement('canvas'); t.width = W; t.height = H; const tg = t.getContext('2d');
      tg.drawImage(this.img, 0, 0, W, H); tg.globalCompositeOperation = 'multiply'; tg.fillStyle = tint; tg.fillRect(0, 0, W, H);
      this._tinted[tint] = t;
    }
    g.globalCompositeOperation = 'source-in'; g.drawImage(this._tinted[tint], 0, 0);
    g.globalCompositeOperation = 'source-over';
    L.canvas = c;
    return c;
  }
  draw() {
    const g = this.ctx, W = this.v.W, H = this.v.H, night = 1 - this.day;
    g.clearRect(0, 0, W, H);
    const scale = (x, y, z, r) => { if (this.px) return r * this.ppm; const a = this.proj(x, y, z), b = this.proj(x + r, y, z); return Math.hypot(b[0] - a[0], b[1] - a[1]); };
    // 1) luce "vera": la stanza illuminata ricompare dal buio
    if (this._objDirty) this._drawObj();
    const autoOn = (() => { const D = this.atm ? this.atm.D : this.day, t = Math.max(0, Math.min(1, ((1 - D) - 0.3) / 0.45)); return t * t * (3 - 2 * t); })();
    const lv = L => L.auto === 'night' ? autoOn * (L.autoLevel || 0.85) : L.level;
    for (const L of this.lights.values()) {
      if (!lv(L)) continue;
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = Math.min(1, lv(L) * (0.18 + 0.82 * night) * 1.05);
      g.drawImage(this._layer(L), 0, 0);
    }
    g.globalAlpha = 1;
    // 2) bagliore delle sorgenti
    g.globalCompositeOperation = 'lighter';
    for (const L of this.lights.values()) {
      const level = lv(L); if (!level) continue;
      const pts = L.kind === 'pendant' ? L.pts.map(([x, z]) => [x, L.h, z, L.bulb]) : L.kind === 'outdoor' ? [[L.f[0], L.f[1], L.f[2], 0.42]] : L.members.map(b => [b.x, GARDEN + 0.55, b.z, 0.28]);
      for (const [x, y, z, r] of pts) {
        const t = this.proj(x, y, z), tr = scale(x, y, z, r);
        const gb = g.createRadialGradient(t[0], t[1], 0, t[0], t[1], tr);
        gb.addColorStop(0, `rgba(255,238,205,${(0.5 + 0.45 * night) * level})`); gb.addColorStop(0.4, `rgba(255,200,130,${0.25 * level * (0.3 + night)})`); gb.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gb; g.beginPath(); g.arc(t[0], t[1], tr, 0, Math.PI * 2); g.fill();
      }
    }
    for (const d of this.devices.values()) {
      if (d.kind === 'tv' && d.mode === 'on' && d.screen) {
        const f = this._tvFace(d.screen);
        const a = this.proj(...f[0]), b = this.proj(...f[2]);
        const sg = g.createLinearGradient(a[0], a[1], b[0], b[1]);
        sg.addColorStop(0, `rgba(90,140,255,${0.55 + 0.3 * night})`); sg.addColorStop(1, `rgba(150,110,255,${0.45 + 0.3 * night})`);
        g.fillStyle = sg; g.beginPath(); f.forEach((p, i) => { const q = this.proj(...p); i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); }); g.closePath(); g.fill();
      }
      if (d.kind === 'climate' && (d.mode === 'heating' || d.mode === 'cooling')) {
        // aria del climatizzatore: alone caldo o freddo davanti all'unità
        const col = d.mode === 'heating' ? '255,140,60' : '80,160,255', xf = d.cur[0] + d.blow[0] * 0.9 * this.ppm, zf = d.cur[1] + d.blow[1] * 0.9 * this.ppm;
        const c = this.proj(xf, 1.3, zf), rad = scale(xf, 1.3, zf, 1.9);
        const grd = g.createRadialGradient(c[0], c[1], 0, c[0], c[1], rad);
        grd.addColorStop(0, `rgba(${col},${0.2 + 0.08 * night})`); grd.addColorStop(0.55, `rgba(${col},${0.07 + 0.04 * night})`); grd.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grd; g.beginPath(); g.ellipse(c[0], c[1], rad, rad * 0.8, 0, 0, Math.PI * 2); g.fill();
      }
      if (d.kind === 'tv' && d.mode === 'on' && d.glow) {
        // luce dello schermo proiettata verso il letto: cono allungato nella direzione indicata, che sfuma
        const [dx, dz] = d.glow, n = Math.hypot(dx, dz) || 1, ux = dx / n, uz = dz / n;
        const a = this.proj(d.cur[0], 0.6, d.cur[1]), b = this.proj(d.cur[0] + ux * 3.2 * this.ppm, 0.3, d.cur[1] + uz * 3.2 * this.ppm);
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]), ang = Math.atan2(b[1] - a[1], b[0] - a[0]), wid = scale(d.cur[0], 0.6, d.cur[1], 1.25);
        g.save(); g.translate(a[0], a[1]); g.rotate(ang);
        const lg = g.createLinearGradient(0, 0, len, 0);
        lg.addColorStop(0, `rgba(120,160,255,${0.42 + 0.3 * night})`); lg.addColorStop(0.45, `rgba(110,150,255,${0.18 + 0.16 * night})`); lg.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = lg; g.beginPath(); g.moveTo(0, -wid * 0.3); g.lineTo(len, -wid); g.lineTo(len, wid); g.lineTo(0, wid * 0.3); g.closePath();
        g.filter = 'blur(' + Math.max(4, wid * 0.35).toFixed(0) + 'px)'; g.fill(); g.filter = 'none'; g.restore();
        const s0 = scale(d.cur[0], 0.8, d.cur[1], 0.7), gg = g.createRadialGradient(a[0], a[1], 0, a[0], a[1], s0);
        gg.addColorStop(0, `rgba(140,175,255,${0.35 + 0.3 * night})`); gg.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gg; g.beginPath(); g.arc(a[0], a[1], s0, 0, Math.PI * 2); g.fill();
      } else if (d.kind === 'tv' && d.mode === 'on') {
        const c = this.proj(d.cur[0], 1.0, d.cur[1]), rad = scale(d.cur[0], 1.0, d.cur[1], 1.6);
        const grd = g.createRadialGradient(c[0], c[1], 0, c[0], c[1], rad);
        grd.addColorStop(0, `rgba(120,160,255,${0.3 + 0.35 * night})`); grd.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grd; g.beginPath(); g.arc(c[0], c[1], rad, 0, Math.PI * 2); g.fill();
      }
    }
    g.globalCompositeOperation = 'source-over';
    this.emit();
  }

  // ------------------------------------------------------------ oggetti aggiunti alla foto (TV, plafoniere)
  _tvFace(sc) {   // faccia dello schermo rivolta verso il divano (lato x minore)
    const x = sc.x - 0.03, z0 = sc.z - sc.w / 2, z1 = sc.z + sc.w / 2;
    return [[x, sc.y1, z0], [x, sc.y1, z1], [x, sc.y0, z1], [x, sc.y0, z0]];
  }
  _drawObj() {
    this._objDirty = false;
    const g = this.octx; g.clearRect(0, 0, this.v.W, this.v.H);
    const poly = (pts, fill) => { g.beginPath(); pts.forEach((p, i) => { const q = this.proj(...p); i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); }); g.closePath(); g.fillStyle = fill; g.fill(); };
    for (const d of this.devices.values()) {
      const sc = d.screen; if (!sc) continue;
      const x0 = sc.x - 0.03, x1 = sc.x + 0.03, z0 = sc.z - sc.w / 2, z1 = sc.z + sc.w / 2;
      // ombra morbida sul mobile, piedino, pannello (fronte, bordo, sopra)
      g.save(); g.filter = 'blur(3px)'; poly([[x0 - 0.12, sc.y0 - 0.06, z0 + 0.05], [x0 - 0.12, sc.y0 - 0.06, z1 + 0.05], [x1 + 0.1, sc.y0 - 0.06, z1 + 0.05], [x1 + 0.1, sc.y0 - 0.06, z0 + 0.05]], 'rgba(0,0,0,.35)'); g.restore();
      poly([[x0 - 0.1, sc.y0 - 0.06, sc.z - 0.16], [x0 - 0.1, sc.y0 - 0.06, sc.z + 0.16], [x1 + 0.08, sc.y0 - 0.06, sc.z + 0.16], [x1 + 0.08, sc.y0 - 0.06, sc.z - 0.16]], '#1b1d21');
      const f = this._tvFace(sc), a = this.proj(...f[0]), b = this.proj(...f[2]);
      const lg = g.createLinearGradient(a[0], a[1], b[0], b[1]); lg.addColorStop(0, '#22262d'); lg.addColorStop(0.45, '#0c0e12'); lg.addColorStop(1, '#16191f');
      poly(f, lg);
      poly([[x0, sc.y1, z1], [x1, sc.y1, z1], [x1, sc.y0, z1], [x0, sc.y0, z1]], '#2a2d33');
      poly([[x0, sc.y1, z0], [x1, sc.y1, z0], [x1, sc.y1, z1], [x0, sc.y1, z1]], '#3a3e45');
    }
    for (const L of this.lights.values()) {
      if (L.kind !== 'outdoor') continue;
      const [x, y, z] = L.f, c = this.proj(x, y, z), rad = Math.hypot(...[0, 1].map(i => this.proj(x + L.size, y, z)[i] - c[i]));
      g.save(); g.filter = 'blur(2px)'; g.fillStyle = 'rgba(0,0,0,.4)'; g.beginPath(); g.ellipse(c[0] + rad * 0.25, c[1] + rad * 0.45, rad * 1.05, rad * 0.8, 0, 0, Math.PI * 2); g.fill(); g.restore();
      const gr = g.createRadialGradient(c[0] - rad * 0.3, c[1] - rad * 0.35, rad * 0.1, c[0], c[1], rad);
      gr.addColorStop(0, '#4a4d52'); gr.addColorStop(0.55, '#1a1b1e'); gr.addColorStop(1, '#070708');
      g.fillStyle = gr; g.beginPath(); g.ellipse(c[0], c[1], rad, rad * 0.86, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = Math.max(0.6, rad * 0.12); g.beginPath(); g.ellipse(c[0], c[1], rad * 0.62, rad * 0.53, 0, 0, Math.PI * 2); g.stroke();
    }
  }

  // ------------------------------------------------------------ robot in movimento (dimostrativo)
  _startAnim() {
    if (this._raf) return;
    let last = performance.now();
    const step = now => {
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      let any = false;
      for (const d of this.devices.values()) {
        if (!(d.mode === 'cleaning' || d.mode === 'mowing' || d.mode === 'returning') || d.pxT) continue;
        any = true;
        if (!d.path || !d.path.length) {
          if (d.mode === 'returning') { d.cur = [...d.home]; d.mode = 'docked'; continue; }
          const a = (d.area || [])[Math.floor(Math.random() * (d.area || []).length)];
          if (!a) continue;
          d.path = [[a[0] + Math.random() * (a[2] - a[0]), a[1] + Math.random() * (a[3] - a[1])]];
        }
        const t = d.path[0], dx = t[0] - d.cur[0], dz = t[1] - d.cur[1], dist = Math.hypot(dx, dz), sp = (d.kind === 'mower' ? 0.45 : 0.3) * dt * this.ppm;
        if (dist <= sp) { d.cur = [...t]; d.path.shift(); } else { d.cur = [d.cur[0] + dx / dist * sp, d.cur[1] + dz / dist * sp]; }
      }
      this.emit();
      if (any) this._raf = requestAnimationFrame(step); else this._raf = null;
    };
    this._raf = requestAnimationFrame(step);
  }

  // ------------------------------------------------------------ zoom e spostamento
  // immagine -> schermo (con eventuale rotazione di 90° in senso orario)
  _m(u, v) { const { s, tx, ty } = this.view; return this.rot ? [tx - v * s, ty + u * s] : [tx + u * s, ty + v * s]; }
  _um(x, y) { const { s, tx, ty } = this.view, dx = (x - tx) / s, dy = (y - ty) / s; return this.rot ? [dy, -dx] : [dx, dy]; }
  fit() {
    const cw = this.el.clientWidth || 400, ch = this.el.clientHeight || 400, W = this.v.W, H = this.v.H;
    this.rot = this.portrait === 'rotate' && W > H * 1.2 && ch > cw * 1.15 ? 90 : 0;
    const iw = this.rot ? H : W, ih = this.rot ? W : H;
    let s = Math.min(cw / iw, ch / ih) * (this.rot ? 1.0 : 1.04), cx = W / 2, cy = H / 2;
    this.sMin = s * 0.9;
    // schermi stretti: inquadra la casa (focus) invece di tutta l'immagine
    const fc = this.v.focus;
    if (fc) {
      const fw = this.rot ? fc[3] - fc[1] : fc[2] - fc[0], fh = this.rot ? fc[2] - fc[0] : fc[3] - fc[1];
      const fs = Math.min(cw / fw, ch / fh);
      if (fs > s * 1.08) { s = Math.min(fs, Math.max(cw / iw, ch / ih)); cx = (fc[0] + fc[2]) / 2; cy = (fc[1] + fc[3]) / 2; }
    }
    this.s0 = s;
    this.view = { s, tx: 0, ty: 0 };
    const c0 = this._m(cx, cy);
    this.view = { s, tx: cw / 2 - c0[0], ty: ch / 2 - c0[1] };
    this._apply();
  }
  _apply() {
    const { s, tx, ty } = this.view;
    this.stage.style.transform = `translate(${tx}px,${ty}px) scale(${s})${this.rot ? ' rotate(90deg)' : ''}`;
    this.emit();
  }
  zoomAt(px, py, k) {
    const v = this.view, ns = Math.min(this.s0 * 5, Math.max(this.sMin ?? this.s0 * 0.9, v.s * k));
    const f = ns / v.s;
    this.view = { s: ns, tx: px - (px - v.tx) * f, ty: py - (py - v.ty) * f };
    this._apply();
  }
  _bindInput() {
    const el = this.el, pts = new Map(); let start = null, moved = 0, lastTap = 0;
    const rel = e => { const r = el.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    el.addEventListener('pointerdown', e => { el.setPointerCapture(e.pointerId); pts.set(e.pointerId, rel(e)); start = { ...this.view, p: [...pts.values()].map(p => [...p]) }; moved = 0; });
    el.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, rel(e));
      const P = [...pts.values()];
      if (P.length === 1 && start.p.length === 1) {
        const dx = P[0][0] - start.p[0][0], dy = P[0][1] - start.p[0][1]; moved = Math.max(moved, Math.hypot(dx, dy));
        this.view = { s: start.s, tx: start.tx + dx, ty: start.ty + dy }; this._apply();
      } else if (P.length >= 2 && start.p.length >= 2) {
        const d0 = Math.hypot(start.p[0][0] - start.p[1][0], start.p[0][1] - start.p[1][1]), d1 = Math.hypot(P[0][0] - P[1][0], P[0][1] - P[1][1]);
        const m0 = [(start.p[0][0] + start.p[1][0]) / 2, (start.p[0][1] + start.p[1][1]) / 2], m1 = [(P[0][0] + P[1][0]) / 2, (P[0][1] + P[1][1]) / 2];
        const ns = Math.min(this.s0 * 5, Math.max(this.sMin ?? this.s0 * 0.9, start.s * d1 / d0)), f = ns / start.s;
        this.view = { s: ns, tx: m1[0] - (m0[0] - start.tx) * f, ty: m1[1] - (m0[1] - start.ty) * f }; moved = 99; this._apply();
      }
    });
    const up = e => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      if (pts.size) { start = { ...this.view, p: [...pts.values()].map(p => [...p]) }; return; }
      if (moved < 6) {
        const now = performance.now();
        if (now - lastTap < 320) { const p = rel(e); if (this.view.s > this.s0 * 1.3) this.fit(); else this.zoomAt(p[0], p[1], 2.2); lastTap = 0; }
        else { lastTap = now; this.onPick(null); if (this.onTap) { const p = rel(e), q = this._um(p[0], p[1]); this.onTap(q[0], q[1], p[0], p[1]); } }
      }
    };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', e => { e.preventDefault(); const p = rel(e); this.zoomAt(p[0], p[1], Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
  }

  // posizioni sullo schermo delle etichette
  emit() {
    if (!this.v) return;
    const out = [];
    for (const [id, a] of this.anchors) {
      const p = typeof a === 'function' ? a() : a, q = p.px ? p.px : this.proj(p[0], p[1], p[2]);
      const sc = this._m(q[0], q[1]);
      out.push({ id, x: sc[0], y: sc[1], visible: true, dist: 0 });
    }
    this.onPins(out);
  }
  toScreen(u, v) { return this._m(u, v); }
  dispose() { this._ro?.disconnect(); cancelAnimationFrame(this._raf); cancelAnimationFrame(this._fxRaf); clearTimeout(this._boltT); this._cloudAnim?.cancel(); this.el.innerHTML = ''; }
}
function inPoly(x, z, poly) {
  let ins = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) ins = !ins;
  }
  return ins;
}
