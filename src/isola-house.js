/* Isola Live · casa automatica
 * 1. layout(): dispone le stanze (aree di Home Assistant) in una pianta credibile, casuale ma stabile
 *    (stesso seme = stessa casa). Il garage sta fuori dal blocco principale, accanto alla facciata.
 * 2. buildScene(): costruisce il modello 3D (pavimenti, muri con porte e finestre, arredi, giardino).
 * Le unità sono metri: x verso destra, z verso il basso della foto (facciata d'ingresso a sud), y in alto.
 */

// ------------------------------------------------------------------ tipi di stanza
export const TYPES = [
  ['living', /soggiorno|salone|salotto|living|lounge|family/i, 30],
  ['kitchen', /cucina|kitchen|cottura|angolo cottura/i, 15],
  ['dining', /pranzo|dining/i, 13],
  ['kids', /cameretta|bimb|bambin|kids|nursery|ragazz/i, 11],
  ['bedroom', /camera|letto|bedroom|master|ospiti|guest/i, 15],
  ['bath', /bagno|bath|toilet|wc|doccia|servizi/i, 6.5],
  ['laundry', /lavanderia|laundry|utility|ripostiglio|storage|dispensa|pantry|sgabuzzino/i, 5],
  ['office', /studio|ufficio|office|study/i, 10],
  ['hall', /ingresso|corridoio|disimpegno|hall|entrance|hallway|corridor|scala|stairs/i, 7],
  ['garage', /garage|box auto|autorimessa|carport/i, 20],
];
export const OUTDOOR = /giardino|garden|terrazz|balcon|patio|cortile|yard|porch|veranda|piscina|pool|esterno|outdoor|prato|lawn|orto/i;
export const roomType = name => (TYPES.find(t => t[1].test(name)) || ['room', null, 12])[0];
const AREA = t => (TYPES.find(x => x[0] === t) || [0, 0, 12])[2];

// generatore casuale con seme (mulberry32) + seme dal testo
export function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export const hash = s => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

// ------------------------------------------------------------------ disposizione
// floors: [{ id, name, areas: [{ area_id, name }] }]  → stesse misure esterne per tutti i piani
export function layout(floors, opts = {}) {
  const R = rng(opts.seed ?? hash(floors.map(f => f.areas.map(a => a.name).join(',')).join('|')));
  const swaps = opts.swaps || [];   // [[area_id, area_id], …] stanze scambiate dall'utente
  const all = floors.flatMap(f => f.areas);
  const outdoor = all.filter(a => OUTDOOR.test(a.name));
  const per = floors.map(f => f.areas.filter(a => !OUTDOOR.test(a.name)).map(a => ({ ...a, t: roomType(a.name) })));
  const garage = per.flat().find(a => a.t === 'garage');
  const inner = per.map(list => list.filter(a => a.t !== 'garage'));
  // superficie: la più grande tra i piani (stessa sagoma per tutti)
  const sizeOf = list => list.reduce((s, a) => s + AREA(a.t) * (0.85 + 0.3 * R()), 0) || 60;
  const A = Math.max(...inner.map(sizeOf), 40);
  const ratio = 1.35 + R() * 0.55;
  const W = Math.round(Math.sqrt(A * ratio) * 2) / 2, D = Math.round(A / W * 2) / 2;
  const out = { W, D, floors: [], garage: null, lot: null, entrance: null };
  // garage: fuori dal blocco, a sinistra o a destra, allineato alla facciata
  if (garage) {
    const gw = 3.6, gd = Math.min(D, 6), left = R() < 0.5;
    out.garage = { ...garage, x: left ? -gw : W, z: D - gd, w: gw, d: gd, side: left ? 'left' : 'right' };
  }
  inner.forEach((list, fi) => {
    let rooms = [];
    const weight = a => AREA(a.t) * (0.9 + 0.2 * R());
    const items = list.map(a => ({ ...a, v: weight(a) }));
    // ingresso e soggiorno verso la facciata, notte verso il retro: si ordina prima di dividere
    const front = t => ({ hall: 0, living: 1, kitchen: 2, dining: 2, office: 3, bath: 4, laundry: 4, room: 4, kids: 5, bedroom: 5 }[t] ?? 4);
    items.sort((a, b) => front(a.t) - front(b.t) || (R() - 0.5));
    const split = (arr, x, z, w, d, depth) => {
      if (!arr.length) return;
      if (arr.length === 1) { rooms.push({ ...arr[0], x, z, w, d }); return; }
      const tot = arr.reduce((s, a) => s + a.v, 0);
      // si provano tutti i tagli possibili (punto e direzione) e si sceglie quello con le stanze più proporzionate,
      // con un po' di caso tra quelli quasi equivalenti; una stanza singola non deve diventare un corridoio
      const asp = (a, b) => Math.max(a / b, b / a);
      const pen = (n, a, b) => { const r = asp(a, b); return n === 1 ? (r > 2 ? (r - 2) * 4 : 0) + Math.max(0, 2.6 - Math.min(a, b)) * 3 : Math.max(0, r - 2.6); };
      let best = null;
      for (let i = 1; i < arr.length; i++) {
        const f0 = arr.slice(0, i).reduce((s, a) => s + a.v, 0) / tot, n1 = i, n2 = arr.length - i;
        for (const vert of [true, false]) {
          const sc = vert ? pen(n1, w * f0, d) + pen(n2, w * (1 - f0), d) : pen(n1, w, d * f0) + pen(n2, w, d * (1 - f0));
          const score = sc + Math.abs(f0 - 0.5) * 0.6 + R() * 0.25;
          if (!best || score < best.score) best = { score, k: i, vert, f: f0 };
        }
      }
      const k = best.k, A1 = arr.slice(0, k), A2 = arr.slice(k), f = best.f, vertical = best.vert;
      const snap = v => Math.round(v * 10) / 10;
      if (vertical) { const w1 = snap(w * f); split(A1, x, z, w1, d, depth + 1); split(A2, x + w1, z, w - w1, d, depth + 1); }
      else { // le stanze "di facciata" (A1) restano davanti (sud = z alto)
        const d2 = snap(d * f); split(A1, x, z + d - d2, w, d2, depth + 1); split(A2, x, z, w, d - d2, depth + 1); }
    };
    split(items, 0, 0, W, D, 0);
    // scambi chiesti dall'utente: due stanze si scambiano il rettangolo
    for (const [a, b] of swaps) {
      const ra = rooms.find(r => r.area_id === a), rb = rooms.find(r => r.area_id === b);
      if (ra && rb) { const ka = ['x', 'z', 'w', 'd'].map(k => ra[k]); ['x', 'z', 'w', 'd'].forEach((k, i) => { ra[k] = rb[k]; rb[k] = ka[i]; }); }
    }
    out.floors.push({ id: floors[fi].id, name: floors[fi].name, rooms, doors: [], windows: [] });
  });
  if (out.garage && out.floors[0]) out.floors[0].rooms.push({ ...out.garage, t: 'garage', outside: true });
  // porte: un albero che collega tutte le stanze partendo da ingresso/soggiorno
  const EPS = 0.05;
  const shared = (a, b) => {
    if (Math.abs(a.x + a.w - b.x) < EPS || Math.abs(b.x + b.w - a.x) < EPS) { const x = Math.abs(a.x + a.w - b.x) < EPS ? b.x : a.x; const z0 = Math.max(a.z, b.z), z1 = Math.min(a.z + a.d, b.z + b.d); return z1 - z0 > 1.1 ? { o: 'v', x, z0, z1 } : null; }
    if (Math.abs(a.z + a.d - b.z) < EPS || Math.abs(b.z + b.d - a.z) < EPS) { const z = Math.abs(a.z + a.d - b.z) < EPS ? b.z : a.z; const x0 = Math.max(a.x, b.x), x1 = Math.min(a.x + a.w, b.x + b.w); return x1 - x0 > 1.1 ? { o: 'h', z, x0, x1 } : null; }
    return null;
  };
  out.floors.forEach((F, fi) => {
    const rooms = F.rooms;
    const hubRank = t => ({ hall: 0, living: 1, dining: 2, kitchen: 3 }[t] ?? 9);
    const start = [...rooms].filter(r => !r.outside).sort((a, b) => hubRank(a.t) - hubRank(b.t))[0];
    const seen = new Set(start ? [start] : []), queue = start ? [start] : [];
    while (queue.length) {
      const r = queue.shift();
      const nb = rooms.filter(o => !seen.has(o) && shared(r, o)).sort((a, b) => hubRank(a.t) - hubRank(b.t));
      for (const o of nb) {
        const s = shared(r, o); seen.add(o); queue.push(o);
        const wDoor = o.t === 'garage' ? 0.9 : 0.85;
        if (s.o === 'v') F.doors.push({ o: 'v', x: s.x, c: s.z0 + (s.z1 - s.z0) * (0.3 + R() * 0.4), w: wDoor, rooms: [r.area_id, o.area_id] });
        else F.doors.push({ o: 'h', z: s.z, c: s.x0 + (s.x1 - s.x0) * (0.3 + R() * 0.4), w: wDoor, rooms: [r.area_id, o.area_id] });
      }
    }
    // ingresso: sulla facciata (z = D), nella stanza "hub" che la tocca
    if (fi === 0) {
      const fr = rooms.filter(r => !r.outside && Math.abs(r.z + r.d - D) < EPS).sort((a, b) => hubRank(a.t) - hubRank(b.t))[0];
      if (fr) { out.entrance = { x: fr.x + fr.w * (0.35 + R() * 0.3), z: D, w: 1.0, room: fr.area_id }; }
      if (out.garage) { const g = out.garage; F.doors.push({ o: 'h', z: g.z + g.d, c: g.x + g.w / 2, w: 2.6, garage: true }); }
    }
    // finestre sui muri esterni
    for (const r of rooms) {
      if (r.t === 'garage') continue;
      const ext = [];
      if (Math.abs(r.z) < EPS) ext.push({ o: 'h', z: 0, a: r.x, b: r.x + r.w });
      if (Math.abs(r.z + r.d - D) < EPS) ext.push({ o: 'h', z: D, a: r.x, b: r.x + r.w });
      if (Math.abs(r.x) < EPS && !(out.garage && out.garage.side === 'left' && r.z + r.d > out.garage.z + 0.5)) ext.push({ o: 'v', x: 0, a: r.z, b: r.z + r.d });
      if (Math.abs(r.x + r.w - W) < EPS && !(out.garage && out.garage.side === 'right' && r.z + r.d > out.garage.z + 0.5)) ext.push({ o: 'v', x: W, a: r.z, b: r.z + r.d });
      for (const e of ext) {
        const len = e.b - e.a; if (len < 1.8) continue;
        let c = e.a + len / 2; const w = Math.min(r.t === 'bath' ? 0.8 : r.t === 'living' ? 2.2 : 1.4, len - 0.8);
        if (fi === 0 && out.entrance && e.o === 'h' && e.z === D && Math.abs(c - out.entrance.x) < w / 2 + 0.8) c = out.entrance.x < c ? Math.min(e.b - w / 2 - 0.3, out.entrance.x + w / 2 + 0.9) : Math.max(e.a + w / 2 + 0.3, out.entrance.x - w / 2 - 0.9);
        F.windows.push({ ...e, c, w, room: r.area_id });
      }
    }
  });
  // lotto: giardino intorno, più ampio davanti
  const gx0 = Math.min(0, out.garage ? out.garage.x : 0) - 3.2, gx1 = Math.max(W, out.garage ? out.garage.x + out.garage.w : W) + 3.2;
  out.lot = { x0: gx0, z0: -2.6, x1: gx1, z1: D + 5.2, garden: !!outdoor.length, outdoor };
  return out;
}

// ------------------------------------------------------------------ texture disegnate al volo
function canvasTex(THREE, w, h, draw, rep) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (rep) t.repeat.set(rep[0], rep[1]);
  return t;
}
const TEX = {
  wood: (THREE, R) => canvasTex(THREE, 512, 512, (g, w, h) => {
    const tones = ['#b98a5e', '#b3845a', '#c09165', '#ad7e55', '#bc8d61', '#a87a52'];
    for (let y = 0; y < h; y += 32) { let x = -(R() * 300) | 0; while (x < w) { const L = 180 + R() * 220; g.fillStyle = tones[(R() * tones.length) | 0]; g.fillRect(x, y, L, 32); for (let k = 0; k < 6; k++) { g.strokeStyle = 'rgba(80,50,25,' + (0.05 + R() * 0.08) + ')'; g.lineWidth = 1; g.beginPath(); const yy = y + 4 + R() * 24; g.moveTo(x, yy); g.bezierCurveTo(x + L * .3, yy + R() * 4 - 2, x + L * .6, yy + R() * 4 - 2, x + L, yy); g.stroke(); } g.fillStyle = 'rgba(60,35,15,.35)'; g.fillRect(x, y, 1.5, 32); x += L; } g.fillStyle = 'rgba(60,35,15,.3)'; g.fillRect(0, y, w, 1.5); }
  }),
  tile: (THREE, R, base = '#eeebe5', grout = '#d6d1c8') => canvasTex(THREE, 256, 256, (g, w, h) => { g.fillStyle = grout; g.fillRect(0, 0, w, h); for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { const v = (R() * 10 - 5) | 0; g.fillStyle = base; g.filter = `brightness(${100 + v}%)`; g.fillRect(x * 64 + 1.5, y * 64 + 1.5, 61, 61); } g.filter = 'none'; }),
  grass: (THREE, R) => canvasTex(THREE, 512, 512, (g, w, h) => { g.fillStyle = '#6d9a4c'; g.fillRect(0, 0, w, h); for (let i = 0; i < 40; i++) { const x = R() * w, y = R() * h, r = 30 + R() * 90; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `hsla(${85 + R() * 30},40%,${30 + R() * 14}%,.35)`); gr.addColorStop(1, 'hsla(90,40%,35%,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r); } for (let i = 0; i < 14000; i++) { g.fillStyle = `hsla(${84 + R() * 26},${36 + R() * 22}%,${28 + R() * 22}%,.8)`; g.fillRect(R() * w, R() * h, 1, 1.5 + R() * 2.5); } for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? 'rgba(255,255,210,.025)' : 'rgba(0,30,0,.02)'; g.fillRect(0, i * 128, w, 128); } }),
  stone: (THREE, R) => canvasTex(THREE, 256, 256, (g, w, h) => { g.fillStyle = '#a69d8e'; g.fillRect(0, 0, w, h); for (let y = 0; y < 4; y++) for (let x = -1; x < 4; x++) { const o = y % 2 ? 32 : 0; g.fillStyle = `hsl(38,${10 + R() * 8}%,${70 + R() * 9}%)`; g.beginPath(); g.roundRect(x * 64 + o + 3, y * 64 + 3, 58, 58, 8); g.fill(); } }),
  deck: (THREE, R) => canvasTex(THREE, 256, 256, (g, w, h) => { for (let y = 0; y < h; y += 21) { g.fillStyle = `hsl(28,${35 + R() * 10}%,${36 + R() * 8}%)`; g.fillRect(0, y, w, 19); g.fillStyle = 'rgba(30,15,5,.6)'; g.fillRect(0, y + 19, w, 2); } }),
  gravel: (THREE, R) => canvasTex(THREE, 256, 256, (g, w, h) => { g.fillStyle = '#cfc8bb'; g.fillRect(0, 0, w, h); for (let i = 0; i < 5000; i++) { g.fillStyle = `hsl(35,${8 + R() * 10}%,${62 + R() * 26}%)`; g.fillRect(R() * w, R() * h, 2, 2); } }),
  concrete: (THREE, R) => canvasTex(THREE, 256, 256, (g, w, h) => { g.fillStyle = '#b9b5ae'; g.fillRect(0, 0, w, h); for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(${R() < .5 ? 0 : 255},${R() < .5 ? 0 : 255},${R() < .5 ? 0 : 255},.04)`; g.fillRect(R() * w, R() * h, 3, 3); } }),
};

// ------------------------------------------------------------------ scena 3D
export function buildScene(THREE, plan, floorIndex = 0, opts = {}) {
  const R = rng(hash('arredi' + floorIndex + plan.W + plan.D));
  const F = plan.floors[floorIndex];
  const scene = new THREE.Scene();
  const M = (color, rough = 0.85, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra });
  const mats = {
    wall: M('#f4f1ec', 0.95), wallTop: M('#ffffff', 0.9), glass: new THREE.MeshStandardMaterial({ color: '#bfe2f0', roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.55 }),
    white: M('#f7f5f1', 0.6), cream: M('#ece5d8', 0.8), sofa: M('#b9bcb5', 0.95), sofa2: M('#d4d6d0', 0.95), wood: M('#8f6b4a', 0.7), wood2: M('#a98260', 0.7), dark: M('#2f3438', 0.5),
    green: M('#2f5a48', 0.55), counter: M('#e9e4dc', 0.4), bed: M('#fbfaf7', 0.95), blanket: M('#c9b8a1', 0.95), blanket2: M('#a9c6d4', 0.95), rug: M('#d9cbb5', 1), rug2: M('#c9d6c6', 1),
    porcelain: M('#ffffff', 0.25), water: new THREE.MeshStandardMaterial({ color: '#4fbad3', roughness: 0.15, metalness: 0.1 }), leaf: M('#4f7f35', 0.9), leaf2: M('#6a9c45', 0.9), trunk: M('#6b4f35', 0.9), pot: M('#c9b7a0', 0.8),
    car: M('#5c6c78', 0.35, { metalness: 0.3 }), metal: M('#9aa3a8', 0.4, { metalness: 0.4 }),
  };
  const add = (geo, mat, x, y, z, cast = true, recv = true) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = recv; scene.add(m); return m; };
  const box = (w, h, d, mat, x, y, z, r = 0) => add(new THREE.BoxGeometry(w, h, d), mat, x + w / 2, y + h / 2, z + d / 2);
  const round = (w, h, d, mat, x, y, z) => { const r = Math.min(0.08, w / 4, d / 4, h / 2); const s = new THREE.Shape(); s.moveTo(r, 0); s.lineTo(w - r, 0); s.quadraticCurveTo(w, 0, w, r); s.lineTo(w, d - r); s.quadraticCurveTo(w, d, w - r, d); s.lineTo(r, d); s.quadraticCurveTo(0, d, 0, d - r); s.lineTo(0, r); s.quadraticCurveTo(0, 0, r, 0); const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: true, bevelThickness: Math.min(0.03, h / 4), bevelSize: Math.min(0.03, r / 2), bevelSegments: 2, curveSegments: 4 }); g.rotateX(Math.PI / 2); g.translate(0, h, 0); const m = add(g, mat, x, y, z); return m; };
  const cyl = (r, h, mat, x, y, z, seg = 24) => add(new THREE.CylinderGeometry(r, r, h, seg), mat, x, y + h / 2, z);
  const plant = (x, z, s = 1) => { cyl(0.18 * s, 0.32 * s, mats.pot, x, 0, z); const g = new THREE.IcosahedronGeometry(0.34 * s, 1); add(g, R() < .5 ? mats.leaf : mats.leaf2, x, 0.55 * s, z); add(new THREE.IcosahedronGeometry(0.22 * s, 1), mats.leaf2, x + 0.12 * s, 0.75 * s, z - 0.08 * s); };
  const tree = (x, z, s = 1) => { cyl(0.14 * s, 1.6 * s, mats.trunk, x, 0, z, 8); const n = 6 + (R() * 4 | 0); for (let i = 0; i < n; i++) { const a = R() * Math.PI * 2, rr = (i ? 0.35 + R() * 0.55 : 0) * s; const g = new THREE.IcosahedronGeometry((0.55 + R() * 0.45) * s, 2); const mt = M(`hsl(${95 + R() * 25},${35 + R() * 15}%,${28 + R() * 14}%)`, 0.95); add(g, mt, x + Math.cos(a) * rr, (2.1 + R() * 0.9) * s, z + Math.sin(a) * rr); } };
  // ---------- terreno
  const L = plan.lot, T = TEX;
  const grass = T.grass(THREE, R); grass.repeat.set((L.x1 - L.x0 + 20) / 7, (L.z1 - L.z0 + 20) / 7);
  const ground = add(new THREE.PlaneGeometry(L.x1 - L.x0 + 20, L.z1 - L.z0 + 20), new THREE.MeshStandardMaterial({ map: L.garden ? grass : T.gravel(THREE, R), roughness: 1 }), (L.x0 + L.x1) / 2, 0, (L.z0 + L.z1) / 2, false, true);
  ground.rotation.x = -Math.PI / 2; if (!L.garden) ground.material.map.repeat.set(12, 8);
  const flat = (w, d, mat, x, z, y = 0.01) => { const m = add(new THREE.PlaneGeometry(w, d), mat, x + w / 2, y, z + d / 2, false, true); m.rotation.x = -Math.PI / 2; return m; };
  // vialetto d'ingresso, terrazza sul retro, passo carraio
  const stone = T.stone(THREE, R);
  if (floorIndex === 0 && plan.entrance) { const s2 = stone.clone(); s2.needsUpdate = true; s2.repeat.set(0.8, 3); flat(1.6, L.z1 - plan.D + 4, M('#fff', 1, { map: s2 }), plan.entrance.x - 0.8, plan.D, 0.012); }
  if (plan.garage && floorIndex === 0) { const g = plan.garage; const c2 = T.concrete(THREE, R); c2.repeat.set(1, 2); flat(g.w, L.z1 - (g.z + g.d) + 4, M('#fff', 1, { map: c2 }), g.x, g.z + g.d, 0.012); }
  const deck = T.deck(THREE, R); deck.repeat.set(plan.W / 3, 1);
  flat(plan.W * 0.6, 1.8, M('#fff', 0.9, { map: deck }), plan.W * 0.2, -1.8, 0.015);
  // ---------- pavimenti
  const woodTex = T.wood(THREE, R), tileTex = T.tile(THREE, R), bathTex = T.tile(THREE, R, '#e3eaec', '#c9d3d6'), concTex = T.concrete(THREE, R);
  for (const r of F.rooms) {
    const tex = (r.t === 'bath' || r.t === 'laundry') ? bathTex : r.t === 'kitchen' ? tileTex : r.t === 'garage' ? concTex : woodTex;
    const t = tex.clone(); t.needsUpdate = true; t.repeat.set(r.w / (tex === woodTex ? 3.2 : 2.4), r.d / (tex === woodTex ? 3.2 : 2.4));
    flat(r.w, r.d, new THREE.MeshStandardMaterial({ map: t, roughness: tex === woodTex ? 0.55 : 0.35 }), r.x, r.z, 0.02);
  }
  // ---------- muri con porte e finestre
  const H = opts.wallH ?? 1.25, TH = 0.14, EXT = 0.24;
  const segs = new Map();   // muri senza doppioni: chiave "h:z:x0:x1"
  const edges = [];
  for (const r of F.rooms) {
    edges.push({ o: 'h', z: r.z, a: r.x, b: r.x + r.w }, { o: 'h', z: r.z + r.d, a: r.x, b: r.x + r.w }, { o: 'v', x: r.x, a: r.z, b: r.z + r.d }, { o: 'v', x: r.x + r.w, a: r.z, b: r.z + r.d });
  }
  // fondo i tratti sulla stessa linea (pareti in comune)
  const lines = {};
  for (const e of edges) { const k = e.o + ':' + (e.o === 'h' ? e.z : e.x).toFixed(2); (lines[k] = lines[k] || []).push([e.a, e.b]); }
  const isExt = (o, v) => o === 'h' ? (Math.abs(v) < 0.05 || Math.abs(v - plan.D) < 0.05) : (Math.abs(v) < 0.05 || Math.abs(v - plan.W) < 0.05);
  for (const [k, list] of Object.entries(lines)) {
    const [o, vs] = k.split(':'), v = +vs;
    list.sort((p, q) => p[0] - q[0]);
    const merged = []; for (const s of list) { const last = merged[merged.length - 1]; if (last && s[0] <= last[1] + 0.05) last[1] = Math.max(last[1], s[1]); else merged.push([...s]); }
    for (const [a, b] of merged) {
      // aperture su questa linea
      const holes = [];
      for (const d of F.doors) if (d.o === o && Math.abs((o === 'h' ? d.z : d.x) - v) < 0.05 && d.c > a && d.c < b) holes.push({ a: d.c - d.w / 2, b: d.c + d.w / 2, k: 'door' });
      for (const w of F.windows) if (w.o === o && Math.abs((o === 'h' ? w.z : w.x) - v) < 0.05 && w.c > a && w.c < b) holes.push({ a: w.c - w.w / 2, b: w.c + w.w / 2, k: 'win' });
      if (floorIndex === 0 && plan.entrance && o === 'h' && Math.abs(v - plan.D) < 0.05 && plan.entrance.x > a && plan.entrance.x < b) holes.push({ a: plan.entrance.x - 0.5, b: plan.entrance.x + 0.5, k: 'door' });
      holes.sort((p, q) => p.a - q.a);
      const th = isExt(o, v) || (plan.garage && floorIndex === 0) && false ? EXT : TH;
      const wall = (s, e, y0, y1) => { if (e - s < 0.02 || y1 - y0 < 0.02) return; if (o === 'h') box(e - s + (s === a ? th / 2 : 0) + (e === b ? th / 2 : 0), y1 - y0, th, mats.wall, s - (s === a ? th / 2 : 0), y0, v - th / 2); else box(th, y1 - y0, e - s + (s === a ? th / 2 : 0) + (e === b ? th / 2 : 0), mats.wall, v - th / 2, y0, s - (s === a ? th / 2 : 0)); };
      let cur = a;
      for (const h of holes) {
        wall(cur, h.a, 0, H);
        if (h.k === 'win') { wall(h.a, h.b, 0, Math.min(0.9, H - 0.4)); const g = o === 'h' ? new THREE.BoxGeometry(h.b - h.a, 0.02, 0.04) : new THREE.BoxGeometry(0.04, 0.02, h.b - h.a); const m = add(g, mats.glass, o === 'h' ? (h.a + h.b) / 2 : v, Math.min(0.9, H - 0.4) + 0.02, o === 'h' ? v : (h.a + h.b) / 2, false, false); m.scale.y = 1; const gl = o === 'h' ? new THREE.BoxGeometry(h.b - h.a, H - Math.min(0.9, H - 0.4), 0.03) : new THREE.BoxGeometry(0.03, H - Math.min(0.9, H - 0.4), h.b - h.a); add(gl, mats.glass, o === 'h' ? (h.a + h.b) / 2 : v, Math.min(0.9, H - 0.4) + (H - Math.min(0.9, H - 0.4)) / 2, o === 'h' ? v : (h.a + h.b) / 2, false, false); }
        cur = h.b;
      }
      wall(cur, b, 0, H);
    }
  }
  // ---------- arredi per stanza
  for (const r of F.rooms) furnish(r);
  function furnish(r) {
    const { x, z, w, d, t } = r, m = 0.25, cx = x + w / 2, cz = z + d / 2;
    const doorsHere = F.doors.filter(dd => (dd.o === 'h' && (Math.abs(dd.z - z) < .05 || Math.abs(dd.z - z - d) < .05) && dd.c > x && dd.c < x + w) || (dd.o === 'v' && (Math.abs(dd.x - x) < .05 || Math.abs(dd.x - x - w) < .05) && dd.c > z && dd.c < z + d));
    const backN = !doorsHere.some(dd => dd.o === 'h' && Math.abs(dd.z - z) < .05);   // muro nord libero?
    if (t === 'living') {
      const sw = Math.min(w * 0.55, 3.0), sd = 0.95;
      const sx = cx - sw / 2, sz = backN ? z + d * 0.42 : z + d * 0.3;
      round(sw, 0.42, sd, mats.sofa, sx, 0, sz); round(sw, 0.35, 0.22, mats.sofa, sx, 0.42, sz); round(0.85, 0.42, Math.min(1.8, d * 0.35), mats.sofa, sx, 0, sz + sd - 0.02);
      for (let i = 0; i < 3; i++) round(sw / 3 - 0.08, 0.14, 0.6, mats.sofa2, sx + 0.04 + i * sw / 3, 0.42, sz + 0.24);
      flat(Math.min(w * 0.5, 2.6), Math.min(d * 0.35, 1.9), mats.rug, cx - Math.min(w * 0.5, 2.6) / 2 + 0.3, sz + sd + 0.2, 0.03);
      round(1.1, 0.38, 0.6, mats.wood, cx - 0.2, 0, sz + sd + 0.55);
      box(Math.min(w * 0.4, 2.0), 0.45, 0.42, mats.wood2, cx - Math.min(w * 0.4, 2.0) / 2 + 0.3, 0, z + d - 0.6);
      box(Math.min(w * 0.3, 1.4), 0.75, 0.06, mats.dark, cx - Math.min(w * 0.3, 1.4) / 2 + 0.3, 0.6, z + d - 0.45);
      plant(x + w - 0.45, z + 0.45, 1.3);
    } else if (t === 'kitchen' || t === 'dining') {
      if (t === 'kitchen') {
        const along = w >= d;
        if (along) { round(w - 2 * m, 0.9, 0.62, mats.counter, x + m, 0, z + 0.2); box(w - 2 * m, 0.04, 0.6, mats.green, x + m, 0.88, z + 0.21); box(0.6, 0.02, 0.5, mats.dark, x + m + 0.7, 0.93, z + 0.26); }
        else { round(0.62, 0.9, d - 2 * m, mats.counter, x + 0.2, 0, z + m); box(0.6, 0.04, d - 2 * m, mats.green, x + 0.21, 0.88, z + m); }
        if (w > 3.2 && d > 3.2) round(Math.min(2.2, w * 0.45), 0.92, 0.95, mats.counter, cx - Math.min(2.2, w * 0.45) / 2, 0, cz + 0.2);
      }
      if (t === 'dining' || (w * d > 18)) { const tw = Math.min(2.0, w * 0.5), tz = t === 'dining' ? cz - 0.5 : z + d - 1.6; round(tw, 0.74, 1.0, mats.wood, cx - tw / 2, 0, tz); for (let i = 0; i < 3; i++) { round(0.42, 0.45, 0.42, mats.cream, cx - tw / 2 + 0.1 + i * (tw - 0.6) / 2, 0, tz - 0.5); round(0.42, 0.45, 0.42, mats.cream, cx - tw / 2 + 0.1 + i * (tw - 0.6) / 2, 0, tz + 1.08); } }
      plant(x + w - 0.4, z + d - 0.4);
    } else if (t === 'bedroom' || t === 'kids') {
      const bw = t === 'kids' ? 0.95 : Math.min(1.7, w - 1.2), bl = t === 'kids' ? 1.95 : 2.05;
      const left = R() < 0.5, bx = t === 'kids' ? (left ? x + m : x + w - m - bw) : cx - bw / 2, bz = z + 0.2;
      round(bw, 0.42, bl, mats.bed, bx, 0, bz); round(bw + 0.06, 0.9, 0.1, mats.wood, bx - 0.03, 0, bz - 0.05);
      if (t === 'kids') round(bw - 0.2, 0.12, 0.45, mats.white, bx + 0.1, 0.42, bz + 0.12); else { round(bw / 2 - 0.12, 0.13, 0.45, mats.white, bx + 0.08, 0.42, bz + 0.12); round(bw / 2 - 0.12, 0.13, 0.45, mats.white, bx + bw / 2 + 0.04, 0.42, bz + 0.12); }
      round(bw + 0.04, 0.08, bl * 0.58, t === 'kids' ? mats.blanket2 : mats.blanket, bx - 0.02, 0.4, bz + bl * 0.4);
      if (t === 'bedroom') { round(0.45, 0.5, 0.4, mats.wood2, bx - 0.55, 0, bz + 0.05); round(0.45, 0.5, 0.4, mats.wood2, bx + bw + 0.1, 0, bz + 0.05); }
      // armadio sul muro libero
      const ww = Math.min(w - 0.6, 2.4); box(ww, 2.0, 0.6, mats.white, cx - ww / 2, 0, z + d - 0.68);
      if (t === 'kids') { round(1.1, 0.74, 0.55, mats.wood2, left ? x + w - m - 1.1 : x + m, 0, cz); flat(1.4, 1.0, mats.rug2, cx - 0.7, cz + 0.2, 0.03); }
      else flat(Math.min(2.2, w - 1), 1.2, mats.rug, cx - Math.min(2.2, w - 1) / 2, bz + bl - 0.3, 0.03);
    } else if (t === 'bath') {
      const tw = Math.min(0.8, w * 0.4), tl = Math.min(1.7, d - 0.6);
      round(tw, 0.55, tl, mats.porcelain, x + 0.12, 0, z + 0.15); add(new THREE.BoxGeometry(tw - 0.16, 0.02, tl - 0.16), mats.water, x + 0.12 + tw / 2, 0.52, z + 0.15 + tl / 2, false, false);
      round(0.6, 0.85, 0.45, mats.white, x + w - 0.75, 0, z + 0.12); add(new THREE.CylinderGeometry(0.18, 0.16, 0.06, 24), mats.porcelain, x + w - 0.45, 0.85, z + 0.34);
      round(0.38, 0.42, 0.6, mats.porcelain, x + w - 0.55, 0, z + d - 0.75);
    } else if (t === 'laundry') {
      for (let i = 0; i < Math.max(1, Math.min(3, Math.floor((w - 0.4) / 0.68))); i++) { round(0.6, 0.85, 0.6, mats.white, x + 0.2 + i * 0.68, 0, z + 0.15); add(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 24), mats.metal, x + 0.5 + i * 0.68, 0.86, z + 0.45, false); }
    } else if (t === 'office') {
      round(Math.min(1.6, w - 0.6), 0.74, 0.7, mats.wood2, x + 0.3, 0, z + 0.2); add(new THREE.CylinderGeometry(0.28, 0.28, 0.45, 20), mats.dark, x + 0.3 + Math.min(0.8, (w - 0.6) / 2), 0.22, z + 1.25);
      box(0.06, 0.4, 0.5, mats.dark, x + 0.6, 0.74, z + 0.3); box(Math.min(1.8, w - 0.6), 1.9, 0.35, mats.white, x + 0.3, 0, z + d - 0.45); plant(x + w - 0.4, z + d - 0.9, 0.9);
    } else if (t === 'hall') {
      box(Math.min(1.2, w - 0.4), 0.8, 0.35, mats.wood2, x + 0.2, 0, z + 0.2); flat(Math.min(1.2, w - 0.6), Math.min(2.0, d - 0.6), mats.rug, cx - Math.min(1.2, w - 0.6) / 2, cz - Math.min(1.0, (d - 0.6) / 2), 0.03); plant(x + w - 0.4, z + 0.4, 0.9);
    } else if (t === 'garage') {
      round(1.8, 1.3, Math.min(4.3, d - 0.8), mats.car, cx - 0.9, 0, z + 0.4); round(1.5, 0.35, 1.8, mats.dark, cx - 0.75, 1.3, z + 1.2); box(w - 0.4, 1.0, 0.4, mats.metal, x + 0.2, 0, z + 0.05);
    } else {
      round(Math.min(1.6, w * 0.5), 0.45, 0.8, mats.cream, cx - Math.min(1.6, w * 0.5) / 2, 0, cz - 0.4); flat(Math.min(2, w - 1), Math.min(1.5, d - 1), mats.rug, cx - Math.min(2, w - 1) / 2, cz - Math.min(1.5, d - 1) / 2, 0.03); plant(x + w - 0.4, z + 0.4);
    }
  }
  // ---------- giardino: alberi e siepi nel lotto, lontano dalla casa
  if (L.garden) {
    const spots = [[L.x0 + 1.4, L.z0 + 1.6], [L.x1 - 1.6, L.z0 + 1.2], [L.x0 + 1.2, L.z1 - 1.8], [L.x1 - 1.3, L.z1 - 2.6], [L.x0 + 1.0, (L.z0 + L.z1) / 2]];
    spots.forEach(([tx, tz], i) => { if (R() < 0.85) tree(tx + R() * 0.6 - 0.3, tz + R() * 0.6 - 0.3, 0.8 + R() * 0.4); });
    for (let i = 0; i < 6; i++) { const px = L.x0 + 0.6 + R() * (L.x1 - L.x0 - 1.2); plant(px, L.z1 - 0.5, 1.4); }
    // tavolo in terrazza
    round(1.4, 0.74, 0.8, mats.wood, plan.W * 0.5 - 0.7, 0, -1.4);
    if (L.outdoor.some(a => /piscina|pool/i.test(a.name))) { const pw = Math.min(6, plan.W * 0.5); flat(pw + 0.6, 3.6, mats.cream, L.x1 - pw - 2.2, L.z1 - 5.2, 0.02); flat(pw, 3.0, mats.water, L.x1 - pw - 1.9, L.z1 - 4.9, 0.03); }
  }
  return scene;
}

// ------------------------------------------------------------------ resa come "foto"
// restituisce l'immagine e una funzione che porta un punto (x, y, z) in metri sul pixel della foto
export async function renderPhoto(THREE, scene, plan, opts = {}) {
  const Wpx = opts.width || 1600, Hpx = opts.height || 900;
  const L = plan.lot, gx0 = Math.min(0, plan.garage ? plan.garage.x : 0) - 1.6, gx1 = Math.max(plan.W, plan.garage ? plan.garage.x + plan.garage.w : plan.W) + 1.6, gz0 = -1.9, gz1 = plan.D + 2.4;
  const cx = (gx0 + gx1) / 2, cz = (gz0 + gz1) / 2;
  const tilt = (opts.tilt ?? 18) * Math.PI / 180, fov = opts.fov ?? 28;
  const cam = new THREE.PerspectiveCamera(fov, Wpx / Hpx, 0.5, 400);
  // distanza per far stare il lotto nell'inquadratura
  const spanX = gx1 - gx0, spanZ = gz1 - gz0;
  const vf = 2 * Math.tan(fov * Math.PI / 360), dist = Math.max(spanZ / vf, spanX / (vf * Wpx / Hpx));
  cam.position.set(cx, Math.cos(tilt) * dist, cz + Math.sin(tilt) * dist);
  cam.lookAt(cx, 0, cz);
  cam.updateMatrixWorld(); cam.updateProjectionMatrix();
  // luce: sole basso da sud-ovest + cielo
  const hemi = new THREE.HemisphereLight('#eef4ff', '#6a6050', 1.35); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff3df', 2.6);
  sun.position.set(cx - 14, 26, cz + 18); sun.target.position.set(cx, 0, cz); scene.add(sun, sun.target);
  sun.castShadow = true; const S = Math.max(spanX, spanZ) * 0.75; Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 1, far: 90 });
  sun.shadow.mapSize.set(opts.shadowSize || 4096, opts.shadowSize || 4096); sun.shadow.radius = 5; sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
  scene.add(new THREE.AmbientLight('#ffffff', 0.25));
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1); renderer.setSize(Wpx, Hpx, false);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05; renderer.outputColorSpace = THREE.SRGBColorSpace;
  let composer = null;
  if (opts.ao && opts.EffectComposer) {
    composer = new opts.EffectComposer(renderer); composer.setSize(Wpx, Hpx);
    composer.addPass(new opts.RenderPass(scene, cam));
    const ao = new opts.GTAOPass(scene, cam, Wpx, Hpx); ao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.4, thickness: 1.2, scale: 1.2 }); ao.blendIntensity = 0.85; composer.addPass(ao);
    composer.addPass(new opts.OutputPass());
    composer.render();
  } else renderer.render(scene, cam);
  const url = renderer.domElement.toDataURL('image/jpeg', opts.quality ?? 0.86);
  // libera la memoria della scheda grafica (importante sui tablet)
  scene.traverse(o => { if (o.geometry) o.geometry.dispose(); const m = o.material; if (m) (Array.isArray(m) ? m : [m]).forEach(x => { if (x.map) x.map.dispose(); x.dispose(); }); });
  renderer.forceContextLoss && renderer.forceContextLoss();
  const v = new THREE.Vector3();
  const project = (x, y, z) => { v.set(x, y, z).project(cam); return [Math.round((v.x + 1) / 2 * Wpx), Math.round((1 - v.y) / 2 * Hpx)]; };
  renderer.dispose();
  return { url, width: Wpx, height: Hpx, project };
}

// ------------------------------------------------------------------ dalla casa alla configurazione di Isola Live
export function liveConfig(plan, floorIndex, project, hass) {
  const F = plan.floors[floorIndex], S = hass.states, E = hass.entities || {}, Dv = hass.devices || {};
  const areaOf = id => E[id]?.area_id || (E[id]?.device_id && Dv[E[id].device_id]?.area_id);
  const room = id => F.rooms.find(r => r.area_id === areaOf(id));
  const poly = r => [[r.x, r.z], [r.x + r.w, r.z], [r.x + r.w, r.z + r.d], [r.x, r.z + r.d]].map(([x, z]) => project(x, 0, z));
  const bbox = pts => { const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; };
  const ppm = Math.round(Math.hypot(...[0, 1].map(i => project(plan.W / 2 + 1, 0, plan.D / 2)[i] - project(plan.W / 2, 0, plan.D / 2)[i])) * 10) / 10;
  const lights = [], cnt = {};
  for (const id of Object.keys(S).filter(x => x.startsWith('light.'))) {
    const r = room(id); if (!r) continue;
    const n = cnt[r.area_id] = (cnt[r.area_id] || 0) + 1;
    const off = (n - 1) * Math.min(1.2, r.w / 4) * (n % 2 ? 1 : -1);
    lights.push({ id: id.split('.')[1], px: project(r.x + r.w / 2 + off, 0, r.z + r.d * 0.45), room: poly(r), radius: Math.round(Math.max(2.2, Math.min(5, Math.max(r.w, r.d) / 1.9)) * 10) / 10 });
  }
  const sensors = [];
  for (const id of Object.keys(S)) {
    const dc = S[id].attributes?.device_class, r = room(id);
    if (id.startsWith('binary_sensor.') && /^(window|door|opening|garage_door)$/.test(dc || '') && r) {
      const w = F.windows.find(x => x.room === r.area_id);
      sensors.push({ id: id.split('.')[1], type: 'window', entity: id, name: S[id].attributes.friendly_name, px: w ? (w.o === 'h' ? project(w.c, 1.2, w.z) : project(w.x, 1.2, w.c)) : project(r.x + r.w / 2, 1.2, r.z) });
    }
  }
  const front = plan.entrance;
  const locks = Object.keys(S).filter(x => x.startsWith('lock.'));
  if (front && locks[0] && floorIndex === 0) sensors.push({ id: locks[0].split('.')[1], type: 'lock', entity: locks[0], name: S[locks[0]].attributes.friendly_name, px: project(front.x + 0.9, 0.5, plan.D + 0.4) });
  const cams = Object.keys(S).filter(x => x.startsWith('camera.'));
  cams.slice(0, 3).forEach((c, i) => sensors.push({ id: c.split('.')[1], type: 'camera', entity: c, name: S[c].attributes.friendly_name, px: project(plan.lot.x1 - 1 - i * 2, 0.5, plan.lot.z1 - 1.2) }));
  const presence = {};
  for (const id of Object.keys(S)) if (id.startsWith('binary_sensor.') && /^(motion|occupancy|presence)$/.test(S[id].attributes?.device_class || '') && room(id)) { const r = room(id); presence[id] = project(r.x + r.w * 0.55, 0, r.z + r.d * 0.55); }
  const devices = [];
  const house = bbox([[0, 0], [plan.W, 0], [plan.W, plan.D], [0, plan.D]].map(([x, z]) => project(x, 0, z)));
  for (const id of Object.keys(S)) {
    if (id.startsWith('vacuum.')) { const r = room(id) || (floorIndex === 0 ? F.rooms.find(x => x.t === 'living') || F.rooms[0] : null); if (!r) continue; devices.push({ id: id.split('.')[1], px: project(r.x + r.w - 0.5, 0, r.z + r.d - 0.5), area_px: [house] }); }
    if (id.startsWith('lawn_mower.') && plan.lot.garden && floorIndex === 0) { const L = plan.lot; devices.push({ id: id.split('.')[1], px: project(L.x0 + 1.2, 0, plan.D + 1.2), area_px: [bbox([[L.x0 + 0.5, plan.D + 0.6], [plan.entrance ? plan.entrance.x - 1.2 : plan.W / 2, L.z1 - 0.6]].map(([x, z]) => project(x, 0, z))), bbox([[plan.entrance ? plan.entrance.x + 1.2 : plan.W / 2, plan.D + 0.6], [L.x1 - 0.5, L.z1 - 0.6]].map(([x, z]) => project(x, 0, z)))] }); }
  }
  const out = { lights, sensors, presence, devices, ppm, rooms: F.rooms.map(r => ({ area_id: r.area_id, name: r.name, poly: poly(r) })) };
  if (front && floorIndex === 0) { out.energy = { px: project(front.x - 2.6, 0, plan.D + 1.3), house_px: project(plan.W / 2, 0, plan.D / 2) }; out.arrival_path = [project(front.x, 0, plan.lot.z1 + 2), project(front.x, 0, plan.D + 0.3)]; }
  return out;
}

// ------------------------------------------------------------------ piani e aree di Home Assistant
// piano terra per primo (livello 0, o il più basso), poi i piani sopra; aree senza piano al piano terra
export function floorsFromHass(h) {
  const A = Object.values(h.areas || {}), FL = Object.values(h.floors || {}).sort((a, b) => (a.level ?? 0) - (b.level ?? 0));
  const of = f => A.filter(a => a.floor_id === f.floor_id).map(a => ({ area_id: a.area_id, name: a.name }));
  let floors = FL.map(f => ({ id: f.floor_id, name: f.name, level: f.level ?? 0, areas: of(f) })).filter(f => f.areas.length);
  const g = floors.findIndex(f => f.level === 0); if (g > 0) floors = floors.slice(g);
  const loose = A.filter(a => !a.floor_id || !floors.some(f => f.id === a.floor_id)).map(a => ({ area_id: a.area_id, name: a.name }));
  if (!floors.length) floors = [{ id: 'casa', name: '', level: 0, areas: loose }];
  else if (loose.length) floors[0].areas.push(...loose);
  return floors.filter(f => f.areas.length);
}
