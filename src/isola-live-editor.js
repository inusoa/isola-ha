/* Isola Live · configuratore visivo
 * Si apre dal pulsante "Posiziona" di Isola Live (solo per gli amministratori).
 * Mette luci, robot, sensori, movimento ed energia sulla foto della casa, disegna le stanze
 * e le zone di lavoro dei robot, misura la scala e salva davvero nella dashboard
 * (con copia di sicurezza della configurazione precedente e ripristino).
 */
import { i18nAttach, i18nLang, i18nLoc } from './isola-i18n.js';
const EDITOR_VERSION = '1.0.0-beta.5';
const BACKUP_KEY = 'isola_live_backup';
const DEF_RADIUS = 4.6;

// ------------------------------------------------------------------ utilità
const clone = o => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));
const stable = o => Array.isArray(o) ? '[' + o.map(stable).join(',') + ']'
  : o && typeof o === 'object' ? '{' + Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + stable(o[k])).join(',') + '}'
  : JSON.stringify(o);
const same = (a, b) => stable(a) === stable(b);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const R0 = v => Math.round(v);
const pt = p => [R0(p[0]), R0(p[1])];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// YAML semplice (solo ciò che serve alla card): liste di numeri in riga
function yaml(v, ind = 0) {
  const pad = ' '.repeat(ind);
  const sc = x => {
    if (x === null || x === undefined) return 'null';
    if (typeof x === 'number' || typeof x === 'boolean') return String(x);
    const s = String(x);
    return /^[\w./@:+-][\w ./@:+-]*$/.test(s) && !/^(true|false|null|yes|no|on|off|~|\d.*)$/i.test(s) && !/:\s|\s#|:$/.test(s) ? s : JSON.stringify(s);
  };
  const inline = x => Array.isArray(x) && x.every(y => typeof y === 'number' || (Array.isArray(y) && y.every(z => typeof z === 'number')));
  const flow = x => Array.isArray(x) ? '[' + x.map(flow).join(', ') + ']' : sc(x);
  if (Array.isArray(v)) {
    if (!v.length) return pad + '[]';
    return v.map(x => {
      if (x && typeof x === 'object' && !Array.isArray(x)) {
        const b = yaml(x, ind + 2).split('\n');
        return pad + '- ' + b[0].trimStart() + (b.length > 1 ? '\n' + b.slice(1).join('\n') : '');
      }
      return pad + '- ' + (inline(x) ? flow(x) : sc(x));
    }).join('\n');
  }
  if (v && typeof v === 'object') {
    const ks = Object.keys(v);
    if (!ks.length) return pad + '{}';
    return ks.map(k => {
      const x = v[k], key = pad + (/^[\w-]+$/.test(k) ? k : JSON.stringify(k)) + ':';
      if (x && typeof x === 'object') {
        if (inline(x)) return key + ' ' + flow(x);
        if (!Array.isArray(x) && !Object.keys(x).length) return key + ' {}';
        if (Array.isArray(x) && !x.length) return key + ' []';
        return key + '\n' + yaml(x, ind + 2);
      }
      return key + ' ' + sc(x);
    }).join('\n');
  }
  return pad + sc(v);
}

// cerca nel DOM di Home Assistant (anche dentro gli shadow root)
function findDeep(sel, root = document, depth = 0) {
  if (!root || depth > 12) return null;
  const hit = root.querySelector && root.querySelector(sel);
  if (hit) return hit;
  const all = root.querySelectorAll ? root.querySelectorAll('*') : [];
  for (const el of all) if (el.shadowRoot) { const r = findDeep(sel, el.shadowRoot, depth + 1); if (r) return r; }
  return null;
}
// tutte le card di un tipo dentro una configurazione di dashboard (viste, sezioni, pile, condizionali…)
function findCards(cfg, type) {
  const out = [];
  const walk = (o, view, path) => {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o)) { o.forEach((x, i) => { if (x && typeof x === 'object') { if (x.type === type) out.push({ holder: o, key: i, view, path: path + '/' + i }); walk(x, view, path + '/' + i); } }); return; }
    for (const k of Object.keys(o)) {
      const x = o[k];
      if (x && typeof x === 'object') {
        if (!Array.isArray(x) && x.type === type) out.push({ holder: o, key: k, view, path: path + '/' + k });
        walk(x, view, path + '/' + k);
      }
    }
  };
  (cfg.views || []).forEach((v, i) => walk(v, v.title || v.path || 'Vista ' + (i + 1), 'v' + i));
  return out;
}

// icone (tratto semplice, nessuna dipendenza)
const IC = {
  light: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>',
  vacuum: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3"/>',
  mower: '<path d="M4 16h16l-2-6H8z"/><circle cx="8" cy="18" r="2"/><circle cx="17" cy="18" r="2"/><path d="M8 10 6 5"/>',
  window: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M12 3v18M4 12h16"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  camera: '<rect x="3" y="7" width="13" height="10" rx="2"/><path d="m16 11 5-3v8l-5-3"/>',
  motion: '<circle cx="13" cy="4.5" r="2"/><path d="m9 21 3-7 3 3v5M7 12l3-4 4 1 3 3"/>',
  energy: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  ruler: '<path d="M3 17 17 3l4 4L7 21z"/><path d="m7 13 2 2M10 10l2 2M13 7l2 2"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  pen: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4-4"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  room: '<path d="M4 4h10v6h6v10H4z"/>',
  house: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 9.5V20h13V9.5"/>',
  chev: '<path d="m9 6 6 6-6 6"/>',
  restore: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
};
const icon = (k, s = 18, w = 2) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${IC[k] || IC.pin}</svg>`;

const KIND = {
  light: { group: 'Luci', color: '#f5b544', steps: ['pos', 'room'] },
  vacuum: { group: 'Robot', color: '#4caf7d', steps: ['pos', 'zone'] },
  mower: { group: 'Robot', color: '#4caf7d', steps: ['pos', 'zone'] },
  window: { group: 'Porte e finestre', color: '#e57373', steps: ['pos'] },
  lock: { group: 'Sicurezza', color: '#4caf7d', steps: ['pos'] },
  camera: { group: 'Sicurezza', color: '#78909c', steps: ['pos'] },
  motion: { group: 'Movimento', color: '#26a69a', steps: ['pos'] },
  energy: { group: 'Energia', color: '#f5b544', steps: ['pos', 'house'] },
};
const GROUPS = ['Luci', 'Robot', 'Porte e finestre', 'Sicurezza', 'Movimento', 'Energia'];
const STEP = {
  pos: { name: 'Posizione', hint: it => it.k === 'energy' ? 'Tocca la foto dove vuoi il riquadro del fotovoltaico.' : it.k === 'vacuum' || it.k === 'mower' ? 'Tocca la foto dove sta la base di ricarica.' : it.k === 'motion' ? 'Tocca il punto della stanza dove compaiono le persone quando c’è movimento.' : 'Tocca la foto nel punto in cui si trova.' },
  room: { name: 'Stanza', hint: () => 'Tocca gli angoli della stanza, uno dopo l’altro: la luce resterà dentro i muri.' },
  zone: { name: 'Zona di lavoro', hint: () => 'Trascina sulla foto per disegnare il rettangolo in cui si muove. Puoi aggiungerne più di uno.' },
  house: { name: 'Punto della casa', hint: () => 'Tocca il punto della casa verso cui scorre l’energia.' },
};

const CSS = `
:host{position:fixed;inset:0;z-index:2147483000;display:block;font-family:Inter,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;-webkit-font-smoothing:antialiased;color:#f3efe7;
  --bg:#0d1114;--surf:#161c20;--surf2:#1f272c;--line:rgba(243,239,231,.11);--mut:rgba(243,239,231,.62);--sea:#5fd0bd;--sun:#f5b544;--red:#ef6b5b;
  --st:env(safe-area-inset-top,0px);--sb:env(safe-area-inset-bottom,0px)}
*{box-sizing:border-box}
button{font:inherit;color:inherit;border:0;background:none;cursor:pointer;-webkit-tap-highlight-color:transparent}
.ed{position:absolute;inset:0;background:var(--bg);display:grid;grid-template-columns:minmax(0,1fr) 340px;grid-template-rows:auto minmax(0,1fr);gap:10px;padding:calc(10px + var(--st)) 10px calc(10px + var(--sb))}
.top{grid-column:1;display:flex;align-items:center;gap:8px;min-width:0}
.mode{display:flex;align-items:center;gap:8px;padding:8px 14px 8px 8px;border-radius:999px;background:rgba(245,181,68,.14);border:1px solid rgba(245,181,68,.35);color:var(--sun);font-weight:700;font-size:14px;white-space:nowrap}
.mode i{width:24px;height:24px;border-radius:12px;background:var(--sun);color:#2a1a00;display:grid;place-items:center}
.ttl{min-width:0;flex:1;padding-left:4px}
.ttl b{display:block;font-size:17px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ttl small{display:block;color:var(--mut);font-size:13px;margin-top:1px;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.tb{display:flex;align-items:center;gap:7px;height:40px;padding:0 13px;border-radius:12px;background:var(--surf);border:1px solid var(--line);font-size:14px;font-weight:600;white-space:nowrap}
.tb.on{background:#f3efe7;color:var(--bg)}
.tb.pri{background:var(--sea);color:#08201b;border-color:transparent}
.tb.ic{width:40px;padding:0;justify-content:center}
.tb:disabled{opacity:.35}
.vp{grid-column:1;position:relative;overflow:hidden;border-radius:16px;background:#0a0d0f;touch-action:none;user-select:none;-webkit-user-select:none}
.stage{position:absolute;left:0;top:0;transform-origin:0 0}
.stage img{display:block;pointer-events:none;-webkit-user-drag:none}
.stage svg{position:absolute;left:0;top:0;overflow:visible}
.zoom{position:absolute;left:10px;bottom:10px;display:flex;flex-direction:column;gap:6px}
.zoom button{width:40px;height:40px;border-radius:12px;background:rgba(22,28,32,.88);border:1px solid var(--line);display:grid;place-items:center}
.tip{position:absolute;left:50%;top:10px;transform:translateX(-50%);max-width:calc(100% - 20px);padding:9px 14px;border-radius:999px;background:rgba(13,17,20,.86);border:1px solid var(--line);font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none}
.tip:empty{display:none}
.pn{grid-column:2;grid-row:1/3;display:flex;flex-direction:column;min-height:0;border-radius:18px;background:var(--surf);border:1px solid var(--line);overflow:hidden}
.grab{display:none}
.ph{padding:16px 16px 10px}
.ph h3{margin:0;font-size:17px}
.prog{margin-top:10px;height:6px;border-radius:3px;background:var(--surf2);overflow:hidden}
.prog span{display:block;height:100%;background:linear-gradient(90deg,var(--sea),#9be8d9)}
.ph small{display:block;color:var(--mut);font-size:12.5px;margin-top:7px}
.find{margin:2px 12px 4px;display:flex;align-items:center;gap:8px;padding:0 12px;height:38px;border-radius:12px;background:var(--surf2);color:var(--mut)}
.find input{flex:1;min-width:0;background:none;border:0;outline:0;color:#f3efe7;font:inherit;font-size:14px}
.list{flex:1;overflow:auto;padding:0 8px 10px;-webkit-overflow-scrolling:touch}
.grp{font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--mut);padding:14px 8px 6px}
.it{width:100%;display:flex;align-items:center;gap:11px;padding:8px 9px;border-radius:12px;font-size:14px;text-align:left}
.it:hover{background:rgba(255,255,255,.03)}
.it .ic{width:34px;height:34px;border-radius:11px;display:grid;place-items:center;background:var(--surf2);flex:none}
.it .nm{flex:1;min-width:0}
.it .nm span{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.it .nm small{display:block;font-size:12px;color:var(--mut);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.st{font-size:11.5px;font-weight:700;padding:4px 8px;border-radius:999px;white-space:nowrap}
.st.ok{color:var(--sea);background:rgba(95,208,189,.12)}
.st.no{color:var(--sun);background:rgba(245,181,68,.12)}
.it.sel{background:rgba(245,181,68,.12);box-shadow:0 0 0 1.5px rgba(245,181,68,.6) inset}
.card{margin:12px 12px 0;padding:13px;border-radius:16px;background:var(--surf2);display:flex;gap:12px;align-items:center}
.card .ic{width:38px;height:38px;border-radius:12px;display:grid;place-items:center;background:rgba(255,255,255,.05);flex:none}
.card h4{margin:0;font-size:16px}
.card p{margin:2px 0 0;font-size:12.5px;color:var(--mut);word-break:break-all}
.back{margin:12px 12px 0;display:flex;align-items:center;gap:6px;font-size:13px;font-weight:600;color:var(--mut)}
.back svg{transform:rotate(180deg)}
.steps{margin:12px 12px 0;display:flex;flex-direction:column;gap:8px}
.step{width:100%;display:flex;gap:12px;align-items:flex-start;padding:11px 12px;border-radius:14px;border:1px solid var(--line);font-size:14px;text-align:left}
.step .n{width:24px;height:24px;border-radius:12px;display:grid;place-items:center;font-size:12px;font-weight:800;background:var(--surf2);flex:none}
.step.done .n{background:var(--sea);color:#08201b}
.step.cur{border-color:rgba(245,181,68,.6);background:rgba(245,181,68,.08)}
.step.cur .n{background:var(--sun);color:#2a1a00}
.step small{display:block;color:var(--mut);font-size:12px;margin-top:2px}
.opt{margin:12px 12px 0;display:flex;flex-direction:column;gap:8px}
.ob{width:100%;padding:11px 13px;border-radius:12px;background:var(--surf2);font-size:13.5px;font-weight:600;display:flex;gap:10px;align-items:center;text-align:left}
.ob.dan{color:#ff9d90}
.ob:disabled{opacity:.4}
.rng{margin:12px 12px 0;padding:12px 13px;border-radius:12px;background:var(--surf2);font-size:13px}
.rng div{display:flex;justify-content:space-between;color:var(--mut);margin-bottom:8px}
.rng b{color:#f3efe7}
.rng input{width:100%;accent-color:var(--sun)}
.sp{flex:1}
.pf{padding:12px;border-top:1px solid var(--line);display:flex;gap:8px}
.btn{flex:1;text-align:center;padding:13px;border-radius:14px;font-weight:700;font-size:15px;background:var(--surf2)}
.btn.pri{background:var(--sea);color:#08201b}
.btn:disabled{opacity:.4}
.veil{position:absolute;inset:0;background:rgba(5,8,10,.6);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);display:grid;place-items:center;padding:16px;z-index:5}
.dlg{width:min(640px,100%);max-height:100%;overflow:auto;border-radius:22px;background:var(--surf);border:1px solid var(--line);padding:22px;box-shadow:0 40px 100px -20px #000}
.dlg h3{margin:0;font-size:22px;letter-spacing:-.01em}
.dlg p{color:var(--mut);font-size:14.5px;margin:6px 0 0;line-height:1.45}
.sum{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:16px}
.sum div{padding:12px;border-radius:14px;background:var(--surf2)}
.sum b{display:block;font-size:22px}
.sum small{color:var(--mut);font-size:11.5px}
textarea.y{width:100%;margin-top:14px;height:180px;padding:12px 14px;border-radius:14px;background:#0a0e10;border:1px solid var(--line);font:12.5px/1.5 ui-monospace,Menlo,Consolas,monospace;color:#cfe9e3;resize:vertical;white-space:pre;outline:0}
.acts{display:flex;gap:10px;margin-top:16px;flex-wrap:wrap}
.acts .btn{min-width:150px}
.note{display:flex;gap:10px;align-items:flex-start;margin-top:12px;font-size:13px;color:var(--mut);line-height:1.4}
.note i{width:8px;height:8px;border-radius:4px;background:var(--sea);flex:none;margin-top:5px}
.note.bad i{background:var(--red)}
.num{display:flex;gap:10px;align-items:center;margin-top:14px}
.num input{flex:1;height:48px;border-radius:12px;background:var(--surf2);border:1px solid var(--line);color:#f3efe7;font:inherit;font-size:20px;padding:0 14px;outline:0}
.pick{display:flex;flex-direction:column;gap:8px;margin-top:14px}
.toast{position:absolute;left:50%;bottom:calc(22px + var(--sb));transform:translate(-50%,20px);opacity:0;transition:.25s;padding:11px 16px;border-radius:999px;background:#f3efe7;color:var(--bg);font-weight:700;font-size:14px;pointer-events:none;z-index:9;white-space:nowrap}
.toast.show{opacity:1;transform:translate(-50%,0)}
/* telefono e schermi in verticale: foto sopra, pannello sotto */
@media (max-width:820px), (orientation:portrait) and (max-width:1100px){
  .ed{grid-template-columns:minmax(0,1fr);grid-template-rows:auto minmax(0,1fr) auto;gap:8px;padding:calc(8px + var(--st)) 8px calc(8px + var(--sb))}
  .zoom{left:auto;right:8px;bottom:8px;flex-direction:row}
  .zoom button{width:36px;height:36px}
  .pn{grid-column:1;grid-row:3;max-height:42svh;border-radius:18px 18px 16px 16px}
  .pn.min{max-height:none}
  .pn.min .body{display:none}
  .grab{display:flex;justify-content:center;padding:8px 0 0}
  .grab span{width:40px;height:5px;border-radius:3px;background:rgba(243,239,231,.25)}
  .lb{display:none}
  .tb{padding:0 11px}
  .ttl small{-webkit-line-clamp:1}
  .sum{grid-template-columns:repeat(2,1fr)}
  .acts .btn{min-width:0}
}
@media (max-width:480px){ .mode span{display:none} .mode{padding:8px} }
.body{display:flex;flex-direction:column;min-height:0;flex:1}
`;

class IsolaLiveEditor extends HTMLElement {
  // ------------------------------------------------------------------ apertura
  open(o) {
    this._o = o;
    this._hass = o.hass;
    const c = o.config || {};
    this._img = c.image;
    this._ppm0 = c.ppm;
    this._items = this._collect(c);
    this.st = { ppm: +c.ppm || 40, items: this._items };
    this._init = stable(this.st);
    this._undo = [];
    this.sel = -1; this.mode = 'list'; this.q = '';
    this.view = { s: 1, x: 0, y: 0 };
    this.draft = null;   // stanza in disegno, rettangolo, misura
    i18nLang(o.hass, o.config && o.config.language);
    this._root = this.attachShadow({ mode: 'open' }); i18nAttach(this._root);
    this._root.innerHTML = `<style>${CSS}</style><div class="ed">
      <div class="top"></div>
      <div class="vp"><div class="stage"><img alt=""><svg></svg></div><div class="tip"></div>
        <div class="zoom"><button data-z="in" aria-label="Ingrandisci">${icon('plus')}</button><button data-z="out" aria-label="Riduci">${icon('minus')}</button><button data-z="fit" aria-label="Adatta">${icon('fit')}</button></div></div>
      <div class="pn"><div class="grab"><span></span></div><div class="body"></div></div>
      <div class="toast"></div>
    </div>`;
    const $ = s => this._root.querySelector(s);
    this.$ = $;
    this._vp = $('.vp'); this._stage = $('.stage'); this._svg = $('svg'); this._imgEl = $('img');
    this._imgEl.addEventListener('load', () => { this.W = this._imgEl.naturalWidth; this.H = this._imgEl.naturalHeight; this._svg.setAttribute('width', this.W); this._svg.setAttribute('height', this.H); this._svg.setAttribute('viewBox', `0 0 ${this.W} ${this.H}`); this.fit(); this.draw(); });
    this._imgEl.addEventListener('error', () => this.toast('Foto della casa non trovata: ' + this._img));
    this._imgEl.src = this._img;
    this._root.addEventListener('click', e => this._click(e));
    this._root.addEventListener('input', e => this._input(e));
    this._root.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('[data-num]')) this._act('scale-ok'); });
    $('.grab').addEventListener('click', () => $('.pn').classList.toggle('min'));
    this._pointer();
    this._onResize = () => { this.fit(true); };
    window.addEventListener('resize', this._onResize);
    this._onKey = e => {
      if (e.key === 'Escape') { if (this._root.querySelector('.veil')) this._closeDlg(); else if (this.draft) { this.draft = null; this.draw(); } else this._act('close'); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); this._act('undo'); }
    };
    window.addEventListener('keydown', this._onKey);
    this.render();
    this._loadBackup();
  }
  disconnectedCallback() { window.removeEventListener('resize', this._onResize); window.removeEventListener('keydown', this._onKey); }

  // elementi: dalla configurazione della card + quelli che Home Assistant conosce ma non sono ancora sulla foto
  _collect(c) {
    const h = this._hass || {}, S = h.states || {}, E = h.entities || {}, D = h.devices || {}, A = h.areas || {};
    const nm = id => S[id]?.attributes?.friendly_name || String(id).split('.')[1]?.replace(/_/g, ' ') || id;
    const area = id => { const e = E[id]; const a = e?.area_id || (e?.device_id && D[e.device_id]?.area_id); return a && A[a] ? A[a].name : ''; };
    const vis = id => { const e = E[id]; return !e || (!e.hidden && !e.entity_category); };
    const its = [];
    const cp = p => (Array.isArray(p) && p.length === 2 && p.every(n => typeof n === 'number') ? [p[0], p[1]] : null);
    for (const l of c.lights || []) {
      if (!l || !l.entity && !l.id) continue;
      its.push({ k: 'light', id: l.id || String(l.entity).split('.')[1], entity: l.entity || 'light.' + l.id, name: l.name || nm(l.entity), area: area(l.entity), px: cp(l.px), room: Array.isArray(l.room) ? l.room.map(p => [p[0], p[1]]) : null, radius: l.radius ?? null });
    }
    for (const d of c.devices || []) {
      if (!d || !(d.type === 'vacuum' || d.type === 'mower')) continue;
      its.push({ k: d.type, id: d.id, entity: d.entity, name: d.name || nm(d.entity), area: area(d.entity), px: cp(d.px), area_px: Array.isArray(d.area_px) ? d.area_px.map(r => r.slice(0, 4)) : [] });
    }
    const sens = (c.sensors || []).filter(m => m && m.entity);
    for (const m of sens) {
      const k = m.type === 'motion' ? 'motion' : m.type === 'lock' ? 'lock' : m.type === 'camera' ? 'camera' : m.type === 'window' ? 'window' : null;
      if (!k || k === 'motion') continue;
      its.push({ k, id: m.id || String(m.entity).split('.')[1], entity: m.entity, name: m.name || nm(m.entity), area: area(m.entity), px: cp(m.px), stype: m.type });
    }
    const have = new Set(its.map(x => x.entity));
    // nuovi: porte, finestre, serrature, telecamere
    for (const id of Object.keys(S)) {
      if (have.has(id) || !vis(id)) continue;
      const d = id.split('.')[0], dc = S[id].attributes?.device_class;
      let k = null;
      if (d === 'binary_sensor' && /^(window|door|garage_door|opening)$/.test(dc || '')) k = 'window';
      else if (d === 'lock') k = 'lock';
      else if (d === 'camera') k = 'camera';
      if (k) { its.push({ k, id: id.split('.')[1], entity: id, name: nm(id), area: area(id), px: null, stype: k, fresh: true }); have.add(id); }
    }
    // movimento: dove compaiono le persone (presence)
    const pres = c.presence || {};
    const mo = new Set(Object.keys(pres));
    for (const id of Object.keys(S)) if (id.startsWith('binary_sensor.') && /^(motion|occupancy|presence)$/.test(S[id].attributes?.device_class || '') && vis(id)) mo.add(id);
    for (const id of mo) its.push({ k: 'motion', id, entity: id, name: nm(id), area: area(id), px: cp(pres[id]) });
    // energia
    const en = c.energy || {};
    if (en.pv_power || en.battery_soc || en.px) its.push({ k: 'energy', id: 'energy', entity: en.pv_power || en.battery_soc || '', name: 'Fotovoltaico e batteria', area: '', px: cp(en.px), house: cp(en.house_px) });
    return its;
  }

  // ------------------------------------------------------------------ stato e annulla
  get items() { return this.st.items; }
  get it() { return this.items[this.sel]; }
  snap() { this._undo.push(JSON.stringify(this.st)); if (this._undo.length > 60) this._undo.shift(); }
  dirty() { return stable(this.st) !== this._init; }
  done(it) {
    if (!it.px) return false;
    if (it.k === 'light') return !!(it.room && it.room.length >= 3);
    if (it.k === 'vacuum' || it.k === 'mower') return !!(it.area_px && it.area_px.length);
    if (it.k === 'energy') return !!it.house;
    return true;
  }
  stepDone(it, s) { return s === 'pos' ? !!it.px : s === 'room' ? !!(it.room && it.room.length >= 3) : s === 'zone' ? !!(it.area_px && it.area_px.length) : s === 'house' ? !!it.house : false; }

  // ------------------------------------------------------------------ vista: zoom e spostamento
  fit(keep) {
    if (!this.W) return;
    const r = this._vp.getBoundingClientRect(); if (!r.width || !r.height) return;
    const s = Math.min(r.width / this.W, r.height / this.H) * 0.98;
    if (keep && this._fitS && Math.abs(this.view.s - this._fitS) > 1e-3) { this.clampView(); this.applyView(); return; }
    this._fitS = s;
    this.view = { s, x: (r.width - this.W * s) / 2, y: (r.height - this.H * s) / 2 };
    this.applyView();
  }
  clampView() {
    const r = this._vp.getBoundingClientRect(), v = this.view, w = this.W * v.s, h = this.H * v.s, m = 60;
    v.x = w < r.width ? (r.width - w) / 2 : Math.min(m, Math.max(r.width - w - m, v.x));
    v.y = h < r.height ? (r.height - h) / 2 : Math.min(m, Math.max(r.height - h - m, v.y));
  }
  zoomAt(f, cx, cy) {
    const v = this.view, ns = Math.max(this._fitS * 0.8, Math.min(this._fitS * 8, v.s * f));
    v.x = cx - (cx - v.x) * ns / v.s; v.y = cy - (cy - v.y) * ns / v.s; v.s = ns;
    this.clampView(); this.applyView(); this.draw();
  }
  applyView() { const v = this.view; this._stage.style.transform = `translate(${v.x}px,${v.y}px) scale(${v.s})`; }
  toImg(cx, cy) { const r = this._vp.getBoundingClientRect(), v = this.view; return [(cx - r.left - v.x) / v.s, (cy - r.top - v.y) / v.s]; }
  inImg(p) { return p[0] >= 0 && p[1] >= 0 && p[0] <= this.W && p[1] <= this.H; }

  // ------------------------------------------------------------------ tocchi e mouse sulla foto
  _pointer() {
    const vp = this._vp, P = new Map();
    let g = null;   // gesto in corso
    const local = e => { const r = vp.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    vp.addEventListener('pointerdown', e => {
      if (e.target.closest('.zoom')) return;
      try { vp.setPointerCapture(e.pointerId); } catch (err) { }
      P.set(e.pointerId, local(e));
      if (P.size === 2) {
        const [a, b] = [...P.values()];
        g = { t: 'pinch', d: dist(a, b), m: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], s: this.view.s, x: this.view.x, y: this.view.y };
        if (this.draft && this.draft.t === 'rect') this.draft = null;
        return;
      }
      const p0 = local(e), ip = this.toImg(e.clientX, e.clientY);
      const pin = e.target.closest('[data-pin]'), vtx = e.target.closest('[data-vtx]');
      if (vtx && this.mode === 'room' && this.draft && this.draft.t === 'poly') { g = { t: 'vtx', i: +vtx.dataset.vtx, p0, moved: false }; return; }
      if (pin && (this.mode === 'list' || this.mode === 'pos')) {
        const i = +pin.dataset.pin, which = pin.dataset.w || 'px';
        g = { t: 'pin', i, which, p0, moved: false, snap: false };
        return;
      }
      if (this.mode === 'zone' || (this.mode === 'room' && this.draft && this.draft.rect)) { g = { t: 'rect', a: ip, p0, moved: false }; return; }
      g = { t: 'pan', p0, x: this.view.x, y: this.view.y, moved: false, ip };
    });
    vp.addEventListener('pointermove', e => {
      if (!P.has(e.pointerId)) { this._hover(e); return; }
      P.set(e.pointerId, local(e));
      if (!g) return;
      if (g.t === 'pinch' && P.size >= 2) {
        const [a, b] = [...P.values()], d = dist(a, b), m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        const ns = Math.max(this._fitS * 0.8, Math.min(this._fitS * 8, g.s * d / g.d));
        this.view.s = ns; this.view.x = m[0] - (g.m[0] - g.x) * ns / g.s; this.view.y = m[1] - (g.m[1] - g.y) * ns / g.s;
        this.clampView(); this.applyView(); this._needDraw(); return;
      }
      const p = local(e), mv = dist(p, g.p0) > 6;
      if (g.t === 'pan') { if (mv || g.moved) { g.moved = true; this.view.x = g.x + p[0] - g.p0[0]; this.view.y = g.y + p[1] - g.p0[1]; this.clampView(); this.applyView(); } return; }
      if (g.t === 'pin') {
        if (!mv && !g.moved) return;
        if (!g.moved) { this.snap(); g.moved = true; this.sel = g.i; }
        const it = this.items[g.i], ip = this.clampPt(this.toImg(e.clientX, e.clientY));
        if (g.which === 'house') it.house = ip; else it.px = ip;
        this.draw(); return;
      }
      if (g.t === 'vtx') {
        if (!mv && !g.moved) return;
        g.moved = true; this.draft.pts[g.i] = this.snapPt(this.clampPt(this.toImg(e.clientX, e.clientY)));
        this.draw(); return;
      }
      if (g.t === 'rect') {
        if (!mv && !g.moved) return;
        g.moved = true; this.draft = { ...(this.draft || {}), t: this.mode === 'zone' ? 'zone' : 'poly', rect: true, ra: this.clampPt(g.a), rb: this.clampPt(this.toImg(e.clientX, e.clientY)), pts: (this.draft && this.draft.pts) || [] };
        this.draw(); return;
      }
    });
    const end = e => {
      if (!P.has(e.pointerId)) return;
      P.delete(e.pointerId);
      if (g && g.t === 'pinch') { if (P.size === 0) g = null; else { const [a] = [...P.values()]; g = { t: 'pan', p0: a, x: this.view.x, y: this.view.y, moved: true }; } this.draw(); return; }
      if (!g) return;
      const gg = g; g = null;
      if (e.type === 'pointercancel') return;
      if (gg.t === 'pin') {
        if (gg.moved) { this.render(); this.toast('Spostato'); }
        else if ((this.mode === 'pos' || this.mode === 'house') && gg.i !== this.sel) this._tap(this.toImg(e.clientX, e.clientY));
        else this._tapPin(gg.i);
        return;
      }
      if (gg.t === 'vtx') { if (!gg.moved && gg.i === 0 && this.draft.pts.length >= 3) this._act('room-close'); return; }
      if (gg.t === 'rect') { if (gg.moved) this._rectDone(); else this._tap(this.toImg(e.clientX, e.clientY)); return; }
      if (gg.t === 'pan' && !gg.moved) this._tap(this.toImg(e.clientX, e.clientY));
    };
    vp.addEventListener('pointerup', end);
    vp.addEventListener('pointercancel', end);
    vp.addEventListener('wheel', e => { e.preventDefault(); const p = local(e); this.zoomAt(Math.exp(-e.deltaY * 0.0015), p[0], p[1]); }, { passive: false });
    this._root.querySelector('.zoom').addEventListener('click', e => {
      const b = e.target.closest('[data-z]'); if (!b) return;
      const r = vp.getBoundingClientRect();
      if (b.dataset.z === 'fit') { this._fitS = null; this.fit(); this.draw(); } else this.zoomAt(b.dataset.z === 'in' ? 1.5 : 1 / 1.5, r.width / 2, r.height / 2);
    });
  }
  _needDraw() { if (this._raf) return; this._raf = requestAnimationFrame(() => { this._raf = null; this.draw(); }); }
  _hover(e) {
    if (this.mode === 'pos' || this.mode === 'house') { this._hv0 = this.clampPt(this.toImg(e.clientX, e.clientY)); this._needDraw(); return; }
    this._hv0 = null;
    if (!(this.mode === 'room' && this.draft && this.draft.t === 'poly' && !this.draft.rect) && this.mode !== 'scale') { if (this._hv) { this._hv = null; this._needDraw(); } return; }
    this._hv = this.snapPt(this.clampPt(this.toImg(e.clientX, e.clientY))); this._needDraw();
  }
  clampPt(p) { return [Math.max(0, Math.min(this.W, p[0])), Math.max(0, Math.min(this.H, p[1]))]; }
  // aggancio agli angoli delle altre stanze (pareti in comune perfettamente allineate)
  snapPt(p) {
    const lim = 12 / this.view.s; let best = null, bd = lim;
    for (const it of this.items) if (it.k === 'light' && it.room && it !== this.it) for (const q of it.room) { const d = dist(p, q); if (d < bd) { bd = d; best = q; } }
    return best ? [best[0], best[1]] : p;
  }

  _tap(p) {
    if (!this.inImg(p)) return;
    const it = this.it;
    if (this.mode === 'scale') {
      const d = this.draft && this.draft.t === 'scale' ? this.draft : (this.draft = { t: 'scale', pts: [] });
      if (d.pts.length >= 2) d.pts = [];
      d.pts.push(p);
      this.draw();
      if (d.pts.length === 2) this._scaleDlg();
      else this.render();
      return;
    }
    if (!it) return;
    if (this.mode === 'pos') {
      this.snap(); it.px = p;
      this.toast(it.k === 'energy' ? 'Riquadro messo' : 'Messo sulla foto');
      this._next(); return;
    }
    if (this.mode === 'house') { this.snap(); it.house = p; this._next(); return; }
    if (this.mode === 'room') {
      const d = this.draft && this.draft.t === 'poly' ? this.draft : (this.draft = { t: 'poly', pts: [] });
      if (d.rect) return;
      const q = this.snapPt(p);
      if (d.pts.length >= 3 && dist(q, d.pts[0]) < 14 / this.view.s) { this._act('room-close'); return; }
      d.pts.push(q); this.draw(); this.render(); return;
    }
  }
  _tapPin(i) { this.sel = i; this.mode = 'list'; this.draft = null; this.render(); this.draw(); }
  _rectDone() {
    const d = this.draft; if (!d || !d.ra) return;
    const x0 = Math.min(d.ra[0], d.rb[0]), y0 = Math.min(d.ra[1], d.rb[1]), x1 = Math.max(d.ra[0], d.rb[0]), y1 = Math.max(d.ra[1], d.rb[1]);
    if (x1 - x0 < 8 || y1 - y0 < 8) { this.draft = this.mode === 'zone' ? null : { t: 'poly', rect: true, pts: [] }; this.draw(); return; }
    const it = this.it;
    if (this.mode === 'zone') {
      this.snap(); it.area_px = [...(it.area_px || []), [x0, y0, x1, y1].map(R0)];
      this.draft = null; this.render(); this.draw(); this.toast('Zona aggiunta'); return;
    }
    this.snap(); it.room = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(pt);
    this.draft = null; this.toast('Stanza fatta'); this._next();
  }
  // passo successivo dell'elemento, oppure il prossimo elemento da mettere
  _next() {
    const it = this.it;
    const s = KIND[it.k].steps.find(x => !this.stepDone(it, x));
    this.draft = null;
    if (s && s !== 'pos') { this.mode = s; this.render(); this.draw(); return; }
    this.mode = 'list';
    this.render(); this.draw();
  }
  _goNext() {
    const order = this._ordered().map(x => x.i);
    const pos = order.indexOf(this.sel);
    const nx = [...order.slice(pos + 1), ...order.slice(0, pos + 1)].find(i => !this.done(this.items[i]));
    if (nx === undefined) { this.sel = -1; this.mode = 'list'; this.toast('Tutto al suo posto'); }
    else this._select(nx);
    this.render(); this.draw();
  }
  _select(i) {
    this.sel = i; this.draft = null;
    const it = this.it, s = KIND[it.k].steps.find(x => !this.stepDone(it, x));
    this.mode = s || 'list';
    if (it.px) this._center(it.px);
  }
  _center(p) {
    const r = this._vp.getBoundingClientRect(), v = this.view;
    const sx = p[0] * v.s + v.x, sy = p[1] * v.s + v.y;
    if (sx > 40 && sx < r.width - 40 && sy > 40 && sy < r.height - 40) return;
    v.x = r.width / 2 - p[0] * v.s; v.y = r.height / 2 - p[1] * v.s; this.clampView(); this.applyView();
  }
  _ordered() {
    const q = this.q.trim().toLowerCase();
    return this.items.map((it, i) => ({ it, i })).filter(({ it }) => !q || (it.name + ' ' + it.entity + ' ' + it.area).toLowerCase().includes(q))
      .sort((a, b) => GROUPS.indexOf(KIND[a.it.k].group) - GROUPS.indexOf(KIND[b.it.k].group) || (a.it.area || '~').localeCompare(b.it.area || '~', 'it') || a.it.name.localeCompare(b.it.name, 'it'));
  }

  // ------------------------------------------------------------------ disegno sulla foto
  draw() {
    if (!this.W) return;
    const s = this.view.s, k = 1 / s, its = this.items, ppm = this.st.ppm || 40, sel = this.it;
    const o = [];
    o.push(`<defs><radialGradient id="gl"><stop offset="0" stop-color="#ffd27a" stop-opacity=".78"/><stop offset=".45" stop-color="#ffb84d" stop-opacity=".32"/><stop offset="1" stop-color="#ffb84d" stop-opacity="0"/></radialGradient>`);
    its.forEach((it, i) => { if (it.k === 'light' && it.px && it.room && it.room.length >= 3) o.push(`<clipPath id="c${i}"><polygon points="${it.room.map(p => p.join(',')).join(' ')}"/></clipPath>`); });
    const dpoly = this.draft && this.draft.t === 'poly' && this.draft.pts && this.draft.pts.length >= 3 ? this.draft.pts : null;
    if (dpoly) o.push(`<clipPath id="cd"><polygon points="${dpoly.map(p => p.join(',')).join(' ')}"/></clipPath>`);
    o.push('</defs>');
    // luci: bagliore dentro la stanza (anteprima dal vivo)
    its.forEach((it, i) => {
      if (it.k !== 'light' || !it.px) return;
      const r = (it.radius || DEF_RADIUS) * ppm, isSel = it === sel;
      const clip = isSel && dpoly ? 'url(#cd)' : it.room && it.room.length >= 3 ? `url(#c${i})` : '';
      o.push(`<circle cx="${it.px[0]}" cy="${it.px[1]}" r="${r}" fill="url(#gl)" ${clip ? `clip-path="${clip}"` : ''} opacity="${isSel ? 1 : this.mode === 'list' ? .55 : .3}"/>`);
    });
    // stanze
    its.forEach(it => {
      if (it.k !== 'light' || !it.room || it.room.length < 3) return;
      const isSel = it === sel && !(this.draft && this.draft.t === 'poly');
      if (!isSel && this.mode !== 'room') return;
      o.push(`<polygon points="${it.room.map(p => p.join(',')).join(' ')}" fill="${isSel ? 'rgba(245,181,68,.08)' : 'none'}" stroke="${isSel ? '#f5b544' : 'rgba(255,255,255,.5)'}" stroke-width="${(isSel ? 2.5 : 1.3) * k}" stroke-dasharray="${isSel ? '' : 5 * k + ' ' + 5 * k}" stroke-linejoin="round"/>`);
      if (this.mode === 'room') it.room.forEach(p => o.push(`<circle cx="${p[0]}" cy="${p[1]}" r="${3.5 * k}" fill="rgba(255,255,255,.7)"/>`));
    });
    // zone dei robot
    its.forEach(it => {
      if (!(it.k === 'vacuum' || it.k === 'mower') || !it.area_px) return;
      const isSel = it === sel; if (!isSel && this.mode !== 'list') return;
      it.area_px.forEach(r => o.push(`<rect x="${Math.min(r[0], r[2])}" y="${Math.min(r[1], r[3])}" width="${Math.abs(r[2] - r[0])}" height="${Math.abs(r[3] - r[1])}" fill="${isSel ? 'rgba(76,175,125,.18)' : 'rgba(76,175,125,.07)'}" stroke="#4caf7d" stroke-width="${(isSel ? 2.2 : 1) * k}" stroke-dasharray="${6 * k} ${5 * k}" rx="${4 * k}"/>`));
    });
    // energia: linea verso la casa
    its.forEach(it => { if (it.k === 'energy' && it.px && it.house) o.push(`<line x1="${it.px[0]}" y1="${it.px[1]}" x2="${it.house[0]}" y2="${it.house[1]}" stroke="#f5b544" stroke-width="${2 * k}" stroke-dasharray="${2 * k} ${6 * k}" stroke-linecap="round" opacity="${it === sel ? 1 : .5}"/>`); });
    // bozza: stanza a punti
    const d = this.draft;
    if (d && d.t === 'poly' && !d.rect && d.pts.length) {
      o.push(`<polyline points="${d.pts.map(p => p.join(',')).join(' ')}" fill="${d.pts.length >= 3 ? 'rgba(245,181,68,.1)' : 'none'}" stroke="#f5b544" stroke-width="${3 * k}" stroke-linejoin="round"/>`);
      const last = d.pts[d.pts.length - 1];
      if (this._hv) o.push(`<line x1="${last[0]}" y1="${last[1]}" x2="${this._hv[0]}" y2="${this._hv[1]}" stroke="#f5b544" stroke-width="${2 * k}" stroke-dasharray="${6 * k} ${6 * k}"/>`);
      if (d.pts.length >= 3) o.push(`<line x1="${last[0]}" y1="${last[1]}" x2="${d.pts[0][0]}" y2="${d.pts[0][1]}" stroke="#f5b544" stroke-width="${1.4 * k}" stroke-dasharray="${3 * k} ${6 * k}" opacity=".7"/>`);
      d.pts.forEach((p, i) => o.push(`<circle data-vtx="${i}" cx="${p[0]}" cy="${p[1]}" r="${(i === 0 ? 10 : 8) * k}" fill="${i === 0 ? '#fff' : '#f5b544'}" stroke="#0d1114" stroke-width="${2 * k}" style="cursor:move"/>`));
      if (d.pts.length >= 2) { const a = d.pts[d.pts.length - 2], m = [(a[0] + last[0]) / 2, (a[1] + last[1]) / 2]; o.push(this._label(m, (dist(a, last) / ppm).toFixed(1).replace('.', ',') + ' m', k)); }
    }
    if (d && d.rect && d.ra && d.rb) {
      const x0 = Math.min(d.ra[0], d.rb[0]), y0 = Math.min(d.ra[1], d.rb[1]), w = Math.abs(d.rb[0] - d.ra[0]), h = Math.abs(d.rb[1] - d.ra[1]);
      const col = this.mode === 'zone' ? '#4caf7d' : '#f5b544';
      o.push(`<rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="${col}22" stroke="${col}" stroke-width="${2.5 * k}"/>`);
      o.push(this._label([x0 + w / 2, y0 + h + 16 * k], (w / ppm).toFixed(1).replace('.', ',') + ' × ' + (h / ppm).toFixed(1).replace('.', ',') + ' m', k));
    }
    if (d && d.t === 'scale' && d.pts.length) {
      const [a, b] = d.pts;
      o.push(`<circle cx="${a[0]}" cy="${a[1]}" r="${6 * k}" fill="#5fd0bd" stroke="#0d1114" stroke-width="${2 * k}"/>`);
      const e = b || this._hv;
      if (e) {
        o.push(`<line x1="${a[0]}" y1="${a[1]}" x2="${e[0]}" y2="${e[1]}" stroke="#5fd0bd" stroke-width="${3 * k}"/>`);
        if (b) o.push(`<circle cx="${b[0]}" cy="${b[1]}" r="${6 * k}" fill="#5fd0bd" stroke="#0d1114" stroke-width="${2 * k}"/>`);
        o.push(this._label([(a[0] + e[0]) / 2, (a[1] + e[1]) / 2], Math.round(dist(a, e)) + ' px', k));
      }
    }
    // pin
    const pinsFor = it => it.k === 'energy' ? [['px', it.px], ['house', it.house]] : [['px', it.px]];
    its.forEach((it, i) => {
      for (const [w, p] of pinsFor(it)) {
        if (!p) continue;
        const isSel = it === sel, r = (isSel ? 17 : 13) * k, col = KIND[it.k].color;
        if (w === 'house') { o.push(`<g data-pin="${i}" data-w="house" transform="translate(${p[0]},${p[1]})" style="cursor:grab"><circle r="${r + 6 * k}" fill="transparent"/><circle r="${9 * k}" fill="#fff" stroke="${col}" stroke-width="${3 * k}"/><g transform="scale(${k * 0.6}) translate(-12,-12)" stroke="#0d1114" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${IC.house}</g></g>`); continue; }
        o.push(`<g data-pin="${i}" data-w="px" transform="translate(${p[0]},${p[1]})" style="cursor:grab">
          <circle r="${r + 8 * k}" fill="transparent"/>
          ${isSel ? `<circle r="${r + 6 * k}" fill="none" stroke="#fff" stroke-width="${2 * k}" opacity=".9"/>` : ''}
          <circle r="${r + 2.5 * k}" fill="rgba(0,0,0,.35)"/><circle r="${r}" fill="#fff"/><circle r="${r - 2.6 * k}" fill="${col}"/>
          <g transform="scale(${k * (isSel ? .85 : .66)}) translate(-12,-12)" stroke="#fff" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${IC[it.k]}</g>
        </g>`);
      }
    });
    if (sel && sel.px && this.mode !== 'scale') o.push(this._label([sel.px[0], sel.px[1] + 30 * k], sel.name, k));
    // mirino nel modo "posizione"
    if ((this.mode === 'pos' || this.mode === 'house') && this._hv0) { const p = this._hv0; o.push(`<g transform="translate(${p[0]},${p[1]})" stroke="#f5b544" stroke-width="${2 * k}"><circle r="${24 * k}" fill="none" stroke-dasharray="${4 * k} ${5 * k}"/><path d="M${-36 * k} 0h${22 * k}M${14 * k} 0h${22 * k}M0 ${-36 * k}v${22 * k}M0 ${14 * k}v${22 * k}"/></g>`); }
    this._svg.innerHTML = o.join('');
    this.$('.tip').textContent = this._tip();
  }
  _label(p, t, k) {
    const w = (String(t).length * 7.2 + 20) * k;
    return `<g transform="translate(${p[0]},${p[1]})" pointer-events="none"><rect x="${-w / 2}" y="${-12 * k}" width="${w}" height="${24 * k}" rx="${12 * k}" fill="rgba(13,17,20,.86)"/><text y="${4.5 * k}" text-anchor="middle" fill="#f3efe7" font-family="Inter,system-ui,sans-serif" font-size="${12.5 * k}" font-weight="600">${esc(t)}</text></g>`;
  }
  _tip() {
    const it = this.it;
    if (this.mode === 'scale') { const n = this.draft && this.draft.t === 'scale' ? this.draft.pts.length : 0; return n === 0 ? 'Tocca un’estremità di un muro di cui conosci la lunghezza' : n === 1 ? 'Ora tocca l’altra estremità' : ''; }
    if (!it) return '';
    if (this.mode === 'pos') return STEP.pos.hint(it);
    if (this.mode === 'house') return STEP.house.hint(it);
    if (this.mode === 'zone') return 'Trascina per disegnare la zona · due dita per spostare la foto';
    if (this.mode === 'room') { const d = this.draft; if (d && d.rect) return 'Trascina da un angolo all’angolo opposto'; const n = d && d.pts ? d.pts.length : 0; return n === 0 ? 'Tocca il primo angolo della stanza' : n < 3 ? 'Tocca l’angolo successivo' : 'Tocca il primo punto (bianco) per chiudere la stanza'; }
    return '';
  }

  // ------------------------------------------------------------------ pannello e barra
  render() {
    const it = this.it, its = this.items, tot = its.length, ok = its.filter(x => this.done(x)).length;
    const scaleOn = this.mode === 'scale';
    const title = scaleOn ? 'Misura la scala' : it ? it.name : 'Posiziona gli elementi';
    const sub = scaleOn ? `Ora: ${String(this.st.ppm).replace('.', ',')} pixel per metro` : it ? (this.mode === 'list' ? (this.done(it) ? 'Completo. Trascina il segnaposto per spostarlo.' : 'Scegli un passo qui a lato.') : (STEP[this.mode]?.hint(it) || '')) : 'Scegli un elemento e toccalo sulla foto. I segnaposto si trascinano.';
    this.$('.top').innerHTML = `
      <span class="mode"><i>${icon('pen', 14, 2.6)}</i><span>Posiziona</span></span>
      <div class="ttl"><b>${esc(title)}</b><small>${esc(sub)}</small></div>
      <button class="tb ic" data-a="undo" title="Annulla" ${this._undo.length ? '' : 'disabled'}>${icon('undo')}</button>
      <button class="tb${scaleOn ? ' on' : ''}" data-a="scale" title="Misura la scala">${icon('ruler')}<span class="lb">Scala</span></button>
      <button class="tb pri" data-a="save">${icon('check')}<span class="lb">Salva</span></button>
      <button class="tb ic" data-a="close" title="Chiudi">${icon('close')}</button>`;
    let b = '';
    if (it && !scaleOn) {
      const steps = KIND[it.k].steps, cur = this.mode;
      b += `<button class="back" data-a="list">${icon('chev', 14, 2.4)}Tutti gli elementi</button>
        <div class="card"><span class="ic" style="color:${KIND[it.k].color}">${icon(it.k, 20)}</span><div style="min-width:0"><h4>${esc(it.name)}</h4><p>${esc(it.entity)}${it.area ? ' · ' + esc(it.area) : ''}</p></div></div>
        <div class="steps">${steps.map((s, n) => {
          const dn = this.stepDone(it, s), isCur = cur === s;
          const det = s === 'pos' ? (it.px ? 'Sulla foto · trascina per spostare' : 'Non ancora sulla foto')
            : s === 'room' ? (it.room && it.room.length >= 3 ? it.room.length + ' angoli' : 'Facoltativa, ma la luce resta dentro i muri')
            : s === 'zone' ? (it.area_px && it.area_px.length ? it.area_px.length + (it.area_px.length > 1 ? ' zone' : ' zona') : 'Dove si muove mentre lavora')
            : s === 'house' ? (it.house ? 'Messo' : 'Verso dove scorre l’energia') : '';
          const dis = s !== 'pos' && !it.px;
          return `<button class="step${dn ? ' done' : ''}${isCur ? ' cur' : ''}" data-a="step" data-s="${s}" ${dis ? 'disabled style="opacity:.45"' : ''}><span class="n">${dn && !isCur ? icon('check', 13, 3) : n + 1}</span><div>${STEP[s].name}<small>${det}</small></div></button>`;
        }).join('')}</div>`;
      if (cur === 'room') {
        const d = this.draft, others = its.filter(x => x !== it && x.k === 'light' && x.room && x.room.length >= 3);
        const uniq = []; for (const x of others) if (!uniq.some(u => same(u.room, x.room))) uniq.push(x);
        b += `<div class="opt">
          <button class="ob" data-a="room-undo" ${d && d.pts && d.pts.length && !d.rect ? '' : 'disabled'}>${icon('undo')}Togli l’ultimo angolo</button>
          <button class="ob" data-a="room-close" ${d && d.pts && d.pts.length >= 3 && !d.rect ? '' : 'disabled'}>${icon('check')}Chiudi la stanza</button>
          <button class="ob" data-a="room-rect">${icon('room')}${d && d.rect ? 'Torna agli angoli' : 'Rettangolo: trascina da angolo ad angolo'}</button>
          ${uniq.slice(0, 6).map(x => `<button class="ob" data-a="room-copy" data-i="${its.indexOf(x)}">${icon('light')}Usa la stanza di ${esc(x.name)}</button>`).join('')}
          ${it.room ? `<button class="ob dan" data-a="room-del">${icon('trash')}Togli la stanza</button>` : ''}
        </div>`;
      }
      if (cur === 'zone') b += `<div class="opt">${(it.area_px || []).length ? `<button class="ob" data-a="zone-undo">${icon('undo')}Togli l’ultima zona</button><button class="ob dan" data-a="zone-del">${icon('trash')}Togli tutte le zone</button>` : ''}</div>`;
      if (it.k === 'light' && it.px) b += `<div class="rng"><div><span>Grandezza della luce</span><b data-rv>${String(it.radius || DEF_RADIUS).replace('.', ',')} m</b></div><input type="range" min="1.5" max="9" step="0.1" value="${it.radius || DEF_RADIUS}" data-radius></div>`;
      b += `<div class="opt">${it.px ? `<button class="ob" data-a="step" data-s="pos">${icon('pin')}Rimettilo in un altro punto</button><button class="ob dan" data-a="remove">${icon('trash')}Togli dalla foto</button>` : ''}</div>`;
      b += `<div class="sp"></div><div class="pf"><button class="btn" data-a="list">Elenco</button><button class="btn pri" data-a="next">${this.mode === 'room' || this.mode === 'zone' || this.mode === 'house' ? 'Fatto' : 'Prossimo'}</button></div>`;
    } else if (scaleOn) {
      b += `<div class="ph"><h3>Scala della foto</h3><small>Serve per la grandezza delle luci e la velocità dei robot. Tocca le due estremità di un muro, poi scrivi quanto è lungo.</small></div>
        <div class="rng"><div><span>Pixel per metro</span><b>${String(this.st.ppm).replace('.', ',')}</b></div><input type="range" min="5" max="200" step="0.5" value="${this.st.ppm}" data-ppm></div>
        <div class="sp"></div><div class="pf"><button class="btn pri" data-a="scale">Fatto</button></div>`;
    } else {
      const list = this._ordered();
      let grp = '';
      b += `<div class="ph"><h3>Da mettere sulla foto</h3><div class="prog"><span style="width:${tot ? Math.round(ok / tot * 100) : 0}%"></span></div><small>${ok} di ${tot} elementi completi</small></div>
        <label class="find">${icon('search', 16)}<input type="search" placeholder="Cerca per nome o stanza" value="${esc(this.q)}" data-q></label><div class="list">`;
      for (const { it: x, i } of list) {
        const g = KIND[x.k].group;
        if (g !== grp) { grp = g; b += `<div class="grp">${g}</div>`; }
        const dn = this.done(x), part = x.px && !dn;
        b += `<button class="it" data-a="sel" data-i="${i}"><span class="ic" style="color:${dn ? '#5fd0bd' : KIND[x.k].color}">${icon(x.k)}</span><span class="nm"><span>${esc(x.name)}</span><small>${esc(x.area || x.entity)}</small></span><span class="st ${dn ? 'ok' : 'no'}">${dn ? 'fatto' : part ? 'a metà' : 'da mettere'}</span></button>`;
      }
      if (!list.length) b += `<div class="grp" style="text-transform:none;letter-spacing:0">Nessun elemento trovato</div>`;
      b += `</div>`;
    }
    const body = this.$('.body'), keepScroll = body.querySelector('.list')?.scrollTop || 0, hadFocus = this._root.activeElement && this._root.activeElement.matches('[data-q]');
    body.innerHTML = b;
    const l = body.querySelector('.list'); if (l) l.scrollTop = keepScroll;
    if (hadFocus) { const q = body.querySelector('[data-q]'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
  }

  _input(e) {
    const t = e.target;
    if (t.matches('[data-q]')) { this.q = t.value; this.render(); return; }
    if (t.matches('[data-radius]')) {
      if (!this._rdrag) { this.snap(); this._rdrag = true; setTimeout(() => { this._rdrag = false; }, 600); }
      this.it.radius = Math.round(+t.value * 10) / 10; this.$('[data-rv]').textContent = String(this.it.radius).replace('.', ',') + ' m'; this.draw(); return;
    }
    if (t.matches('[data-ppm]')) { if (!this._rdrag) { this.snap(); this._rdrag = true; setTimeout(() => { this._rdrag = false; }, 600); } this.st.ppm = +t.value; this.render(); this.draw(); }
  }

  _click(e) {
    const b = e.target.closest('[data-a]'); if (!b || b.disabled) return;
    this._act(b.dataset.a, b);
  }
  _act(a, b) {
    const it = this.it;
    switch (a) {
      case 'sel': this._select(+b.dataset.i); break;
      case 'list': this.sel = -1; this.mode = 'list'; this.draft = null; break;
      case 'step': this.mode = b.dataset.s; this.draft = null; if (this.mode === 'room' && it.room) this.draft = { t: 'poly', pts: it.room.map(p => [p[0], p[1]]) }; break;
      case 'next':
        if (this.mode === 'room' && this.draft && this.draft.pts && this.draft.pts.length >= 3 && !this.draft.rect) { this._act('room-close'); return; }
        this._goNext(); return;
      case 'remove': this.snap(); it.px = null; if (it.k === 'light') it.room = null; if (it.area_px) it.area_px = []; if (it.k === 'energy') it.house = null; this.mode = 'list'; this.draft = null; this.toast('Tolto dalla foto'); break;
      case 'room-undo': if (this.draft && this.draft.pts) this.draft.pts.pop(); break;
      case 'room-close': {
        const d = this.draft; if (!d || !d.pts || d.pts.length < 3) return;
        this.snap(); it.room = d.pts.map(pt); this.draft = null; this.toast('Stanza fatta'); this._next(); return;
      }
      case 'room-rect': this.draft = this.draft && this.draft.rect ? { t: 'poly', pts: [] } : { t: 'poly', rect: true, pts: [] }; break;
      case 'room-copy': this.snap(); it.room = this.items[+b.dataset.i].room.map(p => [p[0], p[1]]); this.draft = null; this.toast('Stanza copiata'); this._next(); return;
      case 'room-del': this.snap(); it.room = null; this.draft = { t: 'poly', pts: [] }; break;
      case 'zone-undo': this.snap(); it.area_px.pop(); break;
      case 'zone-del': this.snap(); it.area_px = []; break;
      case 'undo': {
        const s = this._undo.pop(); if (!s) return;
        const keepSel = this.sel; this.st = JSON.parse(s); this.sel = keepSel < this.items.length ? keepSel : -1; this.draft = null;
        if (this.mode !== 'list' && this.mode !== 'scale' && this.it) { const st = KIND[this.it.k].steps.find(x => !this.stepDone(this.it, x)); this.mode = st || 'list'; }
        this.toast('Annullato'); break;
      }
      case 'scale': if (this.mode === 'scale') { this.mode = 'list'; this.draft = null; } else { this.mode = 'scale'; this.draft = { t: 'scale', pts: [] }; } break;
      case 'scale-ok': {
        const v = parseFloat(String(this.$('[data-num]').value).replace(',', '.'));
        if (!(v > 0)) { this.$('[data-num]').focus(); return; }
        const d = this.draft; const px = dist(d.pts[0], d.pts[1]);
        this.snap(); this.st.ppm = Math.round(px / v * 10) / 10;
        this._closeDlg(); this.mode = 'list'; this.draft = null; this.toast(`Scala: ${String(this.st.ppm).replace('.', ',')} pixel per metro`); break;
      }
      case 'dlg-x': this._closeDlg(); if (this.mode === 'scale') this.draft = { t: 'scale', pts: [] }; break;
      case 'save': this._saveDlg(); return;
      case 'copy': this._copy(); return;
      case 'do-save': this._save(); return;
      case 'restore': this._restore(); return;
      case 'pick': this._pickResolve && this._pickResolve(+b.dataset.i); return;
      case 'close':
        if (this.dirty() && !this._saved) { this._dlg(`<h3>Uscire senza salvare?</h3><p>Le modifiche fatte qui andranno perse.</p><div class="acts"><button class="btn" data-a="dlg-x">Resta</button><button class="btn" data-a="quit" style="color:#ff9d90">Esci senza salvare</button><button class="btn pri" data-a="save">Salva</button></div>`); return; }
        this.remove(); return;
      case 'quit': this.remove(); return;
    }
    this.render(); this.draw();
  }

  // ------------------------------------------------------------------ finestre
  _dlg(html) { this._closeDlg(); const v = document.createElement('div'); v.className = 'veil'; v.innerHTML = `<div class="dlg">${html}</div>`; v.addEventListener('click', e => { if (e.target === v) this._act('dlg-x'); }); this.$('.ed').appendChild(v); return v; }
  _closeDlg() { this._root.querySelectorAll('.veil').forEach(v => v.remove()); }
  _scaleDlg() {
    const d = this.draft, px = Math.round(dist(d.pts[0], d.pts[1]));
    const v = this._dlg(`<h3>Quanto è lungo?</h3><p>Hai misurato ${px} pixel. Scrivi la lunghezza vera in metri (per esempio la parete della cucina).</p>
      <div class="num"><input data-num inputmode="decimal" placeholder="es. 4,5" autocomplete="off"><b>m</b></div>
      <div class="acts"><button class="btn" data-a="dlg-x">Rifai</button><button class="btn pri" data-a="scale-ok">Usa questa misura</button></div>`);
    setTimeout(() => v.querySelector('[data-num]').focus(), 50);
  }
  toast(t) { const el = this.$('.toast'); el.textContent = t; el.classList.add('show'); clearTimeout(this._tt); this._tt = setTimeout(() => el.classList.remove('show'), 1700); }

  // ------------------------------------------------------------------ cosa si scrive nella card
  // applica le posizioni a una configurazione utente (solo le chiavi del configuratore; il resto non si tocca)
  apply(user) {
    const out = clone(user || {}) || {};
    const its = this.items;
    const isBare = (e, keys) => Object.keys(e).every(k => keys.includes(k));
    const upsert = (list, it, fill, clear, bare) => {
      const L = Array.isArray(list) ? list : [];
      const i = L.findIndex(x => x && ((it.id && x.id === it.id) || (it.entity && x.entity === it.entity)));
      if (it.px) { const e = i >= 0 ? L[i] : { _new: 1 }; fill(e); if (e._new) { delete e._new; L.push(e); } }
      else if (i >= 0) { clear(L[i]); if (isBare(L[i], bare)) L.splice(i, 1); }
      return L;
    };
    // luci
    let L = Array.isArray(out.lights) ? out.lights : [];
    for (const it of its.filter(x => x.k === 'light')) {
      L = upsert(L, it, e => {
        if (e._new) { e.id = it.id; e.entity = it.entity; }
        e.px = pt(it.px);
        if (it.room && it.room.length >= 3) e.room = it.room.map(pt); else delete e.room;
        if (it.radius && Math.abs(it.radius - DEF_RADIUS) > 0.05) e.radius = it.radius; else if (it.radius === null || Math.abs((it.radius || DEF_RADIUS) - DEF_RADIUS) <= 0.05) delete e.radius;
      }, e => { delete e.px; delete e.room; delete e.radius; }, ['id', 'entity']);
    }
    if (L.length) out.lights = L; else delete out.lights;
    // robot
    let Dv = Array.isArray(out.devices) ? out.devices : [];
    for (const it of its.filter(x => x.k === 'vacuum' || x.k === 'mower')) {
      Dv = upsert(Dv, it, e => {
        if (e._new) { e.id = it.id; e.entity = it.entity; e.type = it.k; }
        e.px = pt(it.px);
        if (it.area_px && it.area_px.length) e.area_px = it.area_px.map(r => r.map(R0)); else delete e.area_px;
      }, e => { delete e.px; delete e.area_px; }, ['id', 'entity', 'type']);
    }
    if (Dv.length) out.devices = Dv; else delete out.devices;
    // porte, finestre, serrature, telecamere
    let Sn = Array.isArray(out.sensors) ? out.sensors : [];
    for (const it of its.filter(x => ['window', 'lock', 'camera'].includes(x.k))) {
      Sn = upsert(Sn, it, e => {
        if (e._new) { e.id = it.id; e.type = it.stype || it.k; e.entity = it.entity; e.name = it.name; }
        e.px = pt(it.px);
      }, e => { delete e.px; }, ['id', 'type', 'entity', 'name']);
    }
    if (Sn.length) out.sensors = Sn; else delete out.sensors;
    // movimento
    const pres = { ...(out.presence || {}) };
    for (const it of its.filter(x => x.k === 'motion')) { if (it.px) pres[it.entity] = pt(it.px); else delete pres[it.entity]; }
    if (Object.keys(pres).length) out.presence = pres; else delete out.presence;
    // energia
    const en = its.find(x => x.k === 'energy');
    if (en) {
      const E = { ...(out.energy || {}) };
      if (en.px) E.px = pt(en.px); else delete E.px;
      if (en.house) E.house_px = pt(en.house); else delete E.house_px;
      if (Object.keys(E).length) out.energy = E; else delete out.energy;
    }
    // scala
    if (this.st.ppm && (this._ppm0 !== undefined || Math.abs(this.st.ppm - 40) > 0.01)) out.ppm = this.st.ppm;
    return out;
  }
  // configurazione della card come va scritta nella dashboard
  cardFor(match) {
    const t = this._o.target;
    return t.key ? { ...clone(match), [t.key]: this.apply((match || {})[t.key] || {}) } : this.apply(match);
  }

  // ------------------------------------------------------------------ salvataggio
  _panel() {
    const p = findDeep('ha-panel-lovelace');
    return p && p.lovelace ? p : null;
  }
  _urlPath() { const seg = decodeURIComponent(location.pathname.split('/')[1] || ''); return !seg || seg === 'lovelace' ? null : seg; }
  async _dashboard() {
    const panel = this._panel(), ll = panel && panel.lovelace, url = this._urlPath();
    if (ll && (ll.urlPath ?? null) === url) {
      const raw = ll.rawConfig || ll.config;
      return { raw: clone(raw), mode: ll.mode || 'storage', save: async cfg => { await ll.saveConfig(cfg); }, via: 'panel' };
    }
    const h = this._hass;
    if (!h || !h.callWS) throw new Error('Home Assistant non raggiungibile');
    const raw = await h.callWS({ type: 'lovelace/config', url_path: url, force: false });
    return { raw: clone(raw), mode: 'storage', save: async cfg => { await h.callWS({ type: 'lovelace/config/save', url_path: url, config: cfg }); }, via: 'ws' };
  }
  async _locate(raw, match) {
    const t = this._o.target, all = findCards(raw, t.type);
    if (!all.length) return null;
    const eq = all.filter(x => same(x.holder[x.key], match));
    if (eq.length >= 1) return eq[0];
    if (all.length === 1) return all[0];
    // più card dello stesso tipo e nessuna uguale: si sceglie
    return new Promise(res => {
      this._pickResolve = i => { this._pickResolve = null; this._closeDlg(); res(all[i]); };
      this._dlg(`<h3>Quale card aggiorno?</h3><p>In questa dashboard ci sono più card ${esc(t.type.replace('custom:', ''))}.</p><div class="pick">${all.map((x, i) => `<button class="ob" data-a="pick" data-i="${i}">${icon('pin')}${esc(x.view)} · card ${i + 1}</button>`).join('')}</div><div class="acts"><button class="btn" data-a="save">Indietro</button></div>`);
    });
  }
  _counts() {
    const its = this.items;
    return { lights: its.filter(x => x.k === 'light' && x.px).length, rooms: its.filter(x => x.k === 'light' && x.room && x.room.length >= 3).length, robots: its.filter(x => (x.k === 'vacuum' || x.k === 'mower') && x.px).length, sensors: its.filter(x => ['window', 'lock', 'camera', 'motion'].includes(x.k) && x.px).length };
  }
  _yamlOut() {
    const card = this.cardFor(this._o.target.match);
    return yaml(card);
  }
  async _saveDlg(state) {
    const c = this._counts(), admin = !!(this._hass && this._hass.user && this._hass.user.is_admin);
    const y = this._yamlOut();
    const st = state || {};
    const v = this._dlg(`<h3>${st.ok ? 'Salvato nella dashboard' : 'Salvare la posizione degli elementi?'}</h3>
      <p>${st.ok ? 'Isola Live usa già le nuove posizioni. La configurazione precedente è stata tenuta da parte.' : 'Viene aggiornata solo la configurazione di questa card: il resto della dashboard non si tocca.'}</p>
      <div class="sum"><div><b>${c.lights}</b><small>luci (${c.rooms} con stanza)</small></div><div><b>${c.robots}</b><small>robot</small></div><div><b>${c.sensors}</b><small>sensori e movimento</small></div><div><b>${String(this.st.ppm).replace('.', ',')}</b><small>pixel per metro</small></div></div>
      <textarea class="y" readonly spellcheck="false">${esc(y)}</textarea>
      <div class="acts">
        ${st.ok ? `<button class="btn" data-a="restore">${icon('restore', 16)} Annulla il salvataggio</button><button class="btn pri" data-a="quit">Chiudi</button>`
        : `<button class="btn" data-a="copy">Copia YAML</button><button class="btn pri" data-a="do-save" ${admin ? '' : 'disabled'}>Salva nella dashboard</button>`}
      </div>
      ${st.err ? `<div class="note bad"><i></i><span>${esc(st.err)}</span></div>` : ''}
      ${!admin ? '<div class="note bad"><i></i><span>Solo un amministratore di Home Assistant può salvare nella dashboard. Puoi copiare lo YAML.</span></div>' : ''}
      ${!st.ok && this._backup ? `<div class="note"><i></i><span>C’è una copia della configurazione salvata il ${esc(new Date(this._backup.at).toLocaleString(i18nLoc(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))}. <button class="ob" data-a="restore" style="display:inline-flex;width:auto;margin-top:8px">${icon('restore', 16)} Ripristina quella versione</button></span></div>` : ''}
      ${!st.ok && !st.err ? '<div class="note"><i></i><span>Prima di salvare viene tenuta una copia della configurazione precedente: si torna indietro con un tocco.</span></div>' : ''}
      ${!st.ok ? '<div class="acts" style="margin-top:10px"><button class="btn" data-a="dlg-x">Continua a modificare</button></div>' : ''}`);
    return v;
  }
  async _copy() {
    const y = this._yamlOut();
    let ok = false;
    try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(y); ok = true; } } catch (e) { }
    if (!ok) { const ta = this._root.querySelector('textarea.y'); if (ta) { ta.removeAttribute('readonly'); ta.focus(); ta.select(); try { ok = document.execCommand('copy'); } catch (e) { } ta.setAttribute('readonly', ''); } }
    this.toast(ok ? 'YAML copiato' : 'Seleziona il testo e copialo');
  }
  _busy(on, t) { const b = this._root.querySelector('[data-a="do-save"],[data-a="restore"]'); this._root.querySelectorAll('.dlg .btn').forEach(x => { x.disabled = on; }); if (on && b) b.textContent = t || 'Salvo…'; }
  async _save() {
    if (!(this._hass && this._hass.user && this._hass.user.is_admin)) return;
    this._busy(true);
    const t = this._o.target;
    try {
      const db = await this._dashboard();
      if (db.raw && db.raw.strategy) throw new Error('Questa dashboard è generata da Home Assistant: per salvare, prima prendine il controllo (matita › Prendi il controllo), oppure copia lo YAML.');
      if (db.mode === 'yaml') throw new Error('Questa dashboard è scritta in YAML: copia lo YAML e incollalo nel file della dashboard.');
      const loc = await this._locate(db.raw, t.match);
      if (!loc) throw new Error('Non trovo questa card nella dashboard aperta. Copia lo YAML e incollalo nella card.');
      const before = clone(loc.holder[loc.key]);
      const after = this.cardFor(before);
      const backup = { at: new Date().toISOString(), url_path: this._urlPath(), type: t.type, before, after };
      await this._putBackup(backup);
      loc.holder[loc.key] = after;
      await db.save(db.raw);
      this._backup = backup; this._saved = true;
      this._init = stable(this.st);
      t.match = after;
      try { this._o.onSaved && this._o.onSaved(after); } catch (e) { console.warn('isola-live editor: aggiornamento', e); }
      this._saveDlg({ ok: true });
    } catch (e) {
      console.error('isola-live editor: salvataggio', e);
      const msg = e && (e.message || e.error?.message || e.code) || String(e), code = String(e && (e.code || e.error?.code) || '');
      this._saveDlg({ err: /^(Questa|Non trovo)/.test(msg) ? msg : /not_found/.test(code + msg) ? 'Dashboard non trovata: apri il configuratore dalla dashboard in cui si trova la card.' : /yaml|not_writable|not supported|unauthorized/i.test(code + ' ' + msg) ? 'Questa dashboard non si può modificare da qui (è scritta in YAML o non hai i permessi). Copia lo YAML e incollalo a mano.' : 'Salvataggio non riuscito: ' + msg });
    }
  }
  async _restore() {
    const bk = this._backup; if (!bk) return;
    this._busy(true, 'Ripristino…');
    try {
      const db = await this._dashboard();
      const all = findCards(db.raw, bk.type);
      const loc = all.find(x => same(x.holder[x.key], bk.after)) || all.find(x => same(x.holder[x.key], this._o.target.match)) || (all.length === 1 ? all[0] : null);
      if (!loc) throw new Error('La card è cambiata nel frattempo: non posso ripristinare in automatico.');
      loc.holder[loc.key] = clone(bk.before);
      await db.save(db.raw);
      this._o.target.match = clone(bk.before);
      try { this._o.onRestored && this._o.onRestored(clone(bk.before)); } catch (e) { console.warn('isola-live editor: ripristino locale', e); }
      await this._putBackup(null);
      this._backup = null; this._saved = true;
      this._closeDlg();
      this._dlg(`<h3>Versione precedente ripristinata</h3><p>La card è tornata com’era prima del salvataggio.</p><div class="acts"><button class="btn pri" data-a="quit">Chiudi</button></div>`);
    } catch (e) {
      console.error('isola-live editor: ripristino', e);
      this._saveDlg({ err: e.message || String(e) });
    }
  }
  async _putBackup(v) {
    try { localStorage.setItem(BACKUP_KEY, JSON.stringify(v)); } catch (e) { }
    try { if (this._hass && this._hass.callWS) await this._hass.callWS({ type: 'frontend/set_user_data', key: BACKUP_KEY, value: v }); } catch (e) { console.warn('isola-live editor: copia di sicurezza', e); }
  }
  async _loadBackup() {
    let v = null;
    try { if (this._hass && this._hass.callWS) { const r = await this._hass.callWS({ type: 'frontend/get_user_data', key: BACKUP_KEY }); v = r && r.value; } } catch (e) { }
    if (!v) { try { v = JSON.parse(localStorage.getItem(BACKUP_KEY) || 'null'); } catch (e) { } }
    if (v && v.type === this._o.target.type && (v.url_path ?? null) === this._urlPath()) this._backup = v;
  }
}

if (!customElements.get('isola-live-editor')) customElements.define('isola-live-editor', IsolaLiveEditor);
export { IsolaLiveEditor, findCards, yaml, EDITOR_VERSION };
