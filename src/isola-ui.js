/* Isola · integrazione con l'interfaccia di Home Assistant
 * - editor visivi delle due card (niente YAML per le opzioni principali)
 * - dashboard "Isola" pronta nella finestra "Nuova dashboard" (Home Assistant 2026.5+)
 * - sezione "Isola Live" tra le sezioni della community (Home Assistant 2026.11+)
 */
const DOCS = 'https://github.com/inusoa/isola-ha';
const it = h => /^it/i.test((h && ((h.locale && h.locale.language) || h.language)) || navigator.language || 'it');

// ------------------------------------------------------------------ editor visivi (ha-form)
const LABELS = {
  image: ['Foto della casa (vuoto = casa 3D automatica)', 'Home photo (empty = automatic 3D home)'],
  title: ['Titolo', 'Title'],
  language: ['Lingua', 'Language'],
  kiosk: ['Schermo intero (tablet)', 'Full screen (tablet)'],
  night_dim: ['Di notte lo schermo si abbassa', 'Dim the screen at night'],
  quadro: ['Modalità quadro dopo qualche minuto', 'Picture-frame mode after a few minutes'],
  house: ['Casa 3D automatica quando manca la foto', 'Automatic 3D home when there is no photo'],
  auto: ['Configurazione automatica da aree e dispositivi', 'Automatic setup from areas and devices'],
};
const HELP = {
  image: ['Per esempio /local/isola/casa.jpg. Senza foto Isola Live disegna la casa dalle tue aree.', 'For example /local/isola/casa.jpg. Without a photo, Isola Live draws the home from your areas.'],
  house: ['Disposizione, Rigenera e Scambia stanze si scelgono con 📐 Posiziona.', 'Layout, Regenerate and Swap rooms are in 📐 Place.'],
};
const LANG_SEL = h => ({ select: { mode: 'dropdown', options: [{ value: 'auto', label: it(h) ? 'Come Home Assistant' : 'Same as Home Assistant' }, { value: 'it', label: 'Italiano' }, { value: 'en', label: 'English' }] } });
const SCHEMA = {
  'isola-live': h => [
    { name: 'image', selector: { text: {} } }, { name: 'title', selector: { text: {} } }, { name: 'language', selector: LANG_SEL(h) },
    { type: 'grid', name: '', schema: [{ name: 'kiosk', selector: { boolean: {} } }, { name: 'night_dim', selector: { boolean: {} } }, { name: 'quadro', selector: { boolean: {} } }, { name: 'house', selector: { boolean: {} } }] },
  ],
  'isola-mobile': h => [
    { name: 'image', selector: { text: {} } }, { name: 'language', selector: LANG_SEL(h) }, { name: 'auto', selector: { boolean: {} } },
  ],
};
class IsolaCardEditor extends HTMLElement {
  constructor(kind) { super(); this._kind = kind; }
  setConfig(c) { this._c = { ...(c || {}) }; this._draw(); }
  set hass(h) { this._h = h; if (this._f) this._f.hass = h; else this._draw(); }
  _data() {
    const c = this._c || {};
    return { ...c, language: c.language || 'auto', house: c.house !== false, auto: c.auto !== false, night_dim: c.night_dim !== false, kiosk: !!c.kiosk, quadro: c.quadro !== false };
  }
  _draw() {
    if (!this._h || !this._c) return;
    if (!this._f) {
      if (!customElements.get('ha-form')) { this.innerHTML = '<p style="padding:8px 0">Usa l’editor YAML · use the YAML editor</p>'; return; }
      this._f = document.createElement('ha-form');
      this._f.computeLabel = s => (LABELS[s.name] || [s.name, s.name])[it(this._h) ? 0 : 1];
      this._f.computeHelper = s => HELP[s.name] ? HELP[s.name][it(this._h) ? 0 : 1] : undefined;
      this._f.addEventListener('value-changed', e => this._changed(e.detail.value));
      this.appendChild(this._f);
    }
    this._f.hass = this._h; this._f.schema = SCHEMA[this._kind](this._h); this._f.data = this._data();
  }
  _changed(v) {
    const c = { ...this._c };
    for (const [k, x] of Object.entries(v)) {
      if (k === 'language') { if (x === 'auto') delete c.language; else c.language = x; }
      else if (k === 'house') { if (x) { if (c.house === false) delete c.house; } else c.house = false; }
      else if (k === 'auto') { if (x) delete c.auto; else c.auto = false; }
      else if (k === 'night_dim' || k === 'quadro') { if (x) delete c[k]; else c[k] = false; }
      else if (k === 'kiosk') { if (x) c.kiosk = true; else delete c.kiosk; }
      else if (x === '' || x == null) delete c[k]; else c[k] = x;
    }
    this._c = c;
    this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: c }, bubbles: true, composed: true }));
  }
}
class IsolaLiveCardEditor extends IsolaCardEditor { constructor() { super('isola-live'); } }
class IsolaMobileCardEditor extends IsolaCardEditor { constructor() { super('isola-mobile'); } }
if (!customElements.get('isola-live-card-editor')) customElements.define('isola-live-card-editor', IsolaLiveCardEditor);
if (!customElements.get('isola-mobile-card-editor')) customElements.define('isola-mobile-card-editor', IsolaMobileCardEditor);

// ------------------------------------------------------------------ dashboard "Isola" (finestra Nuova dashboard)
class IsolaDashboardStrategy extends HTMLElement {
  static async generate(config) {
    return {
      title: 'Isola',
      views: [
        { title: 'Isola', path: 'isola', icon: 'mdi:cellphone', type: 'panel', cards: [{ type: 'custom:isola-mobile', ...((config && config.mobile) || {}) }] },
        { title: 'Isola Live', path: 'live', icon: 'mdi:tablet', type: 'panel', cards: [{ type: 'custom:isola-live', ...((config && config.live) || {}) }] },
      ],
    };
  }
}
if (!customElements.get('ll-strategy-dashboard-isola')) customElements.define('ll-strategy-dashboard-isola', IsolaDashboardStrategy);

// ------------------------------------------------------------------ sezione "Isola Live" (sezioni della community, 2026.11)
class IsolaLiveSectionStrategy extends HTMLElement {
  static async generate(config, hass) {
    const card = { type: 'custom:isola-live', ...((config && config.card) || {}), grid_options: { columns: 'full', rows: (config && config.rows) || 8 } };
    return { type: 'grid', cards: [card] };
  }
  static getStubConfig() { return { rows: 8 }; }
}
if (!customElements.get('ll-strategy-section-isola-live')) customElements.define('ll-strategy-section-isola-live', IsolaLiveSectionStrategy);

window.customStrategies = window.customStrategies || [];
const addS = s => { if (!window.customStrategies.find(x => x.type === s.type && x.strategyType === s.strategyType)) window.customStrategies.push(s); };
const I0 = /^it/i.test(navigator.language || '');
addS({ type: 'isola', strategyType: 'dashboard', name: 'Isola', description: I0 ? 'La casa sul telefono e sul tablet, già pronta: si configura da sola dalle tue aree.' : 'Your home on phone and tablet, ready to go: it sets itself up from your areas.', documentationURL: DOCS });
addS({ type: 'isola-live', strategyType: 'section', name: 'Isola Live', description: I0 ? 'La casa vista dall’alto, viva: luci, robot, persone.' : 'Your home from above, alive: lights, robots, people.', documentationURL: DOCS });
