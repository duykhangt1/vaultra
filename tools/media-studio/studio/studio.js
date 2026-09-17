import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';

RectAreaLightUniformsLib.init();
const Q = new URLSearchParams(location.search);
const W = +(Q.get('w') ?? 1600), H = +(Q.get('h') ?? 900);
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
const pmrem = new THREE.PMREMGenerator(renderer);
const roomEnv = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

/* ───────── utils ───────── */
let seed = 1;
function rng() { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
const R = (a, b) => a + (b - a) * rng();
const pick = (a) => a[Math.floor(rng() * a.length)];
const C = { ink: 0x0e1b2c, ink2: 0x14304f, ink3: 0x1e4672, brass: 0xc8963e, brassL: 0xddb065, paper: 0xf6f3ec, steel: 0xc9ced4 };

function ctex(w, h, draw, { srgb = true, rep = [1, 1] } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); t.anisotropy = 8;
  return t;
}
function speckle(g, w, h, n, a, light = true) {
  for (let i = 0; i < n; i++) { g.fillStyle = `rgba(${light ? '255,255,255' : '0,0,0'},${Math.random() * a})`; g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 1.5, 1 + Math.random() * 1.5); }
}
function blotch(g, w, h, n, a) {
  for (let i = 0; i < n; i++) {
    const x = Math.random() * w, y = Math.random() * h, r = 20 + Math.random() * 160;
    const gr = g.createRadialGradient(x, y, 0, x, y, r); const l = Math.random() > 0.5;
    gr.addColorStop(0, `rgba(${l ? '255,255,255' : '0,0,0'},${a * Math.random()})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
}
const hex = (n) => '#' + n.toString(16).padStart(6, '0');

/* ───────── textures & materials ───────── */
const texCache = {};
function doorTex(color) {
  const k = 'door' + color; if (texCache[k]) return texCache[k];
  const map = ctex(256, 512, (g, w, h) => {
    g.fillStyle = hex(color); g.fillRect(0, 0, w, h); blotch(g, w, h, 30, 0.05);
    for (let y = 0; y < h - 28; y += 14) { g.fillStyle = 'rgba(0,0,0,.38)'; g.fillRect(0, y, w, 2); g.fillStyle = 'rgba(255,255,255,.13)'; g.fillRect(0, y + 2, w, 1); g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(0, y + 6, w, 4); }
    g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(0, h - 26, w, 26); g.fillStyle = '#9aa3ad'; g.fillRect(w / 2 - 22, h - 46, 44, 8);
    g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(w / 2 - 6, h - 40, 12, 12);
  });
  const bump = ctex(256, 512, (g, w, h) => { g.fillStyle = '#808080'; g.fillRect(0, 0, w, h); for (let y = 0; y < h - 28; y += 14) { g.fillStyle = '#202020'; g.fillRect(0, y, w, 2); g.fillStyle = '#c0c0c0'; g.fillRect(0, y + 3, w, 8); } }, { srgb: false });
  return (texCache[k] = { map, bump });
}
function doorMat(color) { const t = doorTex(color); return new THREE.MeshStandardMaterial({ map: t.map, bumpMap: t.bump, bumpScale: 1.2, metalness: 0.55, roughness: 0.4 }); }
const corrMat = (color = C.steel, rep = 6) => { const m = ctex(128, 128, (g, w, h) => { g.fillStyle = hex(color); g.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 16) { g.fillStyle = 'rgba(0,0,0,.14)'; g.fillRect(x, 0, 3, h); g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(x + 5, 0, 4, h); } speckle(g, w, h, 200, 0.06, false); }, { rep: [rep, 1] }); return new THREE.MeshStandardMaterial({ map: m, metalness: 0.35, roughness: 0.5 }); };
function concrete(base = '#8e949b', rep = 4, rough = 0.3) {
  const map = ctex(1024, 1024, (g, w, h) => { g.fillStyle = base; g.fillRect(0, 0, w, h); blotch(g, w, h, 260, 0.07); speckle(g, w, h, 9000, 0.12, false); speckle(g, w, h, 5000, 0.1, true); g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 2; g.strokeRect(0, 0, w, h); }, { rep: [rep, rep] });
  const rmap = ctex(512, 512, (g, w, h) => { g.fillStyle = '#7a7a7a'; g.fillRect(0, 0, w, h); blotch(g, w, h, 140, 0.25); }, { srgb: false, rep: [rep, rep] });
  return new THREE.MeshStandardMaterial({ map, roughnessMap: rmap, roughness: rough * 1.6, metalness: 0 });
}
const cardTex = () => texCache.card ?? (texCache.card = ctex(256, 256, (g, w, h) => {
  g.fillStyle = '#b8895a'; g.fillRect(0, 0, w, h); blotch(g, w, h, 30, 0.08); speckle(g, w, h, 2500, 0.08, false);
  for (let y = 0; y < h; y += 5) { g.fillStyle = 'rgba(0,0,0,.025)'; g.fillRect(0, y, w, 2); }
  g.fillStyle = 'rgba(214,180,128,.85)'; g.fillRect(w / 2 - 22, 0, 44, h); g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(w / 2 - 22, 0, 6, h);
  g.strokeStyle = 'rgba(60,35,15,.55)'; g.lineWidth = 3; g.beginPath(); g.moveTo(30, 190); g.lineTo(30, 160); g.lineTo(22, 170); g.moveTo(30, 160); g.lineTo(38, 170); g.moveTo(54, 190); g.lineTo(54, 160); g.lineTo(46, 170); g.moveTo(54, 160); g.lineTo(62, 170); g.stroke();
}));
const cardMats = [0, 1, 2, 3].map((i) => new THREE.MeshStandardMaterial({ map: cardTex(), color: new THREE.Color().setHSL(0.08, 0.1 + i * 0.05, 0.82 + i * 0.04), roughness: 0.85 }));
function labelTex(text, { bg = '#0e1b2c', fg = '#ddb065', w = 512, h = 128, font = '700 72px Consolas, monospace', border } = {}) {
  return ctex(w, h, (g) => { g.fillStyle = bg; g.fillRect(0, 0, w, h); if (border) { g.strokeStyle = border; g.lineWidth = 6; g.strokeRect(6, 6, w - 12, h - 12); } g.fillStyle = fg; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 4); });
}
const M = {
  brass: new THREE.MeshStandardMaterial({ color: C.brass, metalness: 0.85, roughness: 0.32 }),
  brassPaint: new THREE.MeshStandardMaterial({ color: C.brass, metalness: 0.1, roughness: 0.55 }),
  ink: new THREE.MeshStandardMaterial({ color: C.ink, metalness: 0.2, roughness: 0.6 }),
  ceil: new THREE.MeshStandardMaterial({ color: 0x151d29, roughness: 0.9 }),
  steelDark: new THREE.MeshStandardMaterial({ color: 0x3a4350, metalness: 0.7, roughness: 0.4 }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 1, roughness: 0.15 }),
  rubber: new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.85 }),
  white: new THREE.MeshStandardMaterial({ color: 0xeeeeea, roughness: 0.4 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x8a5a36, roughness: 0.6 }),
  woodL: new THREE.MeshStandardMaterial({ color: 0xc49a6c, roughness: 0.6 }),
  roomWall: new THREE.MeshStandardMaterial({ color: 0xd9dbd8, roughness: 0.8 }),
  led: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff3e0, emissiveIntensity: 4 }),
  ledWarm: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffd9a0, emissiveIntensity: 3 }),
  glassDark: new THREE.MeshPhysicalMaterial({ color: 0x0a1420, metalness: 0.2, roughness: 0.05, transmission: 0, reflectivity: 1, clearcoat: 1 }),
  green: new THREE.MeshStandardMaterial({ color: 0x2f5a35, roughness: 0.8 }),
  green2: new THREE.MeshStandardMaterial({ color: 0x3e7040, roughness: 0.8 }),
  trunk: new THREE.MeshStandardMaterial({ color: 0x4a3626, roughness: 0.9 }),
};
const fabric = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95 });

/* ───────── props ───────── */
function mesh(geo, mat, x = 0, y = 0, z = 0, cast = true) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = true; return m; }
const rbox = (w, h, d, r = 0.02, s = 3) => new RoundedBoxGeometry(w, h, d, s, Math.min(r, w / 2.1, h / 2.1, d / 2.1));
function cardboard(w, h, d) { const m = mesh(rbox(w, h, d, 0.012, 2), pick(cardMats)); return m; }
function boxStack(x, z, n, scale = 1) {
  const g = new THREE.Group(); let y = 0;
  for (let i = 0; i < n; i++) {
    const [w, h, d] = pick([[0.6, 0.42, 0.42], [0.5, 0.36, 0.4], [0.45, 0.32, 0.35], [0.62, 0.45, 0.45], [0.4, 0.3, 0.3]]).map((v, j) => v * scale * (j === 1 ? 1 : 1));
    const b = cardboard(w, h, d); b.position.set(R(-0.04, 0.04), y + h / 2, R(-0.04, 0.04)); b.rotation.y = R(-0.12, 0.12); g.add(b); y += h;
  }
  g.position.set(x, 0, z); return g;
}
function sofa(len = 1.9, col = 0x5b6b7d) {
  const g = new THREE.Group(), f = fabric(col);
  g.add(mesh(rbox(len, 0.42, 0.85, 0.06), f, 0, 0.3, 0)); g.add(mesh(rbox(len, 0.5, 0.2, 0.06), f, 0, 0.62, -0.33));
  g.add(mesh(rbox(0.2, 0.6, 0.85, 0.06), f, -len / 2 + 0.1, 0.38, 0)); g.add(mesh(rbox(0.2, 0.6, 0.85, 0.06), f, len / 2 - 0.1, 0.38, 0));
  const n = Math.round(len / 0.7); for (let i = 0; i < n; i++) g.add(mesh(rbox((len - 0.4) / n - 0.03, 0.14, 0.62, 0.05), f, -len / 2 + 0.2 + ((len - 0.4) / n) * (i + 0.5), 0.58, 0.07));
  [-1, 1].forEach((s) => [-1, 1].forEach((t) => g.add(mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.1), M.wood, s * (len / 2 - 0.1), 0.05, t * 0.35))));
  return g;
}
function mattress(w = 1.6, l = 2) { const g = new THREE.Group(); const m = mesh(rbox(w, l, 0.24, 0.08), fabric(0xe8e6e0), 0, l / 2 + 0.02, 0); m.rotation.x = -0.12; g.add(m); return g; }
function fridge() { const g = new THREE.Group(); g.add(mesh(rbox(0.68, 1.75, 0.68, 0.04), M.white, 0, 0.875, 0)); g.add(mesh(new THREE.BoxGeometry(0.66, 0.01, 0.01), M.steelDark, 0, 1.15, 0.345)); g.add(mesh(rbox(0.03, 0.5, 0.04, 0.01), M.chrome, 0.26, 1.45, 0.36)); g.add(mesh(rbox(0.03, 0.4, 0.04, 0.01), M.chrome, 0.26, 0.8, 0.36)); return g; }
function wardrobe(w = 1.0) { const g = new THREE.Group(); g.add(mesh(rbox(w, 1.9, 0.58, 0.02), M.woodL, 0, 0.95, 0)); g.add(mesh(new THREE.BoxGeometry(0.008, 1.8, 0.01), M.wood, 0, 0.95, 0.295)); g.add(mesh(rbox(0.02, 0.25, 0.03, 0.008), M.chrome, -0.05, 1.0, 0.31)); g.add(mesh(rbox(0.02, 0.25, 0.03, 0.008), M.chrome, 0.05, 1.0, 0.31)); return g; }
function table() { const g = new THREE.Group(); g.add(mesh(rbox(1.2, 0.04, 0.7, 0.01), M.woodL, 0, 0.74, 0)); [-1, 1].forEach((s) => [-1, 1].forEach((t) => g.add(mesh(new THREE.BoxGeometry(0.045, 0.72, 0.045), M.ink, s * 0.55, 0.36, t * 0.3)))); return g; }
function chair(col = C.ink) { const g = new THREE.Group(); const m = new THREE.MeshStandardMaterial({ color: col, roughness: 0.6 }); g.add(mesh(rbox(0.45, 0.05, 0.45, 0.02), m, 0, 0.46, 0)); g.add(mesh(rbox(0.45, 0.45, 0.04, 0.02), m, 0, 0.7, -0.21)); [-1, 1].forEach((s) => [-1, 1].forEach((t) => g.add(mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.46), M.chrome, s * 0.2, 0.23, t * 0.2)))); return g; }
function suitcase(col = 0x2c5d8f, h = 0.66) { const g = new THREE.Group(); const m = new THREE.MeshStandardMaterial({ color: col, roughness: 0.35, metalness: 0.1 }); g.add(mesh(rbox(0.42, h, 0.26, 0.05), m, 0, h / 2 + 0.04, 0)); g.add(mesh(new THREE.BoxGeometry(0.02, 0.3, 0.02), M.chrome, -0.08, h + 0.17, -0.09)); g.add(mesh(new THREE.BoxGeometry(0.02, 0.3, 0.02), M.chrome, 0.08, h + 0.17, -0.09)); g.add(mesh(new THREE.BoxGeometry(0.2, 0.03, 0.03), M.rubber, 0, h + 0.32, -0.09)); [-0.15, 0.15].forEach((x) => g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.03), M.rubber, x, 0.03, 0.08))); return g; }
function wheel(r = 0.33, t = 0.03) { const g = new THREE.Group(); const tire = mesh(new THREE.TorusGeometry(r, t, 12, 40), M.rubber); g.add(tire); for (let i = 0; i < 12; i++) { const s = mesh(new THREE.CylinderGeometry(0.003, 0.003, r * 2), M.chrome); s.rotation.z = (i / 12) * Math.PI; g.add(s); } { const _m = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.06), M.chrome); _m.rotation.x = Math.PI / 2; g.add(_m); } return g; }
function bicycle(col = 0xb3362b) {
  const g = new THREE.Group(); const fm = new THREE.MeshStandardMaterial({ color: col, metalness: 0.5, roughness: 0.35 });
  const w1 = wheel(); w1.position.set(-0.52, 0.36, 0); const w2 = wheel(); w2.position.set(0.52, 0.36, 0); g.add(w1, w2);
  const tube = (a, b, r = 0.018) => { const v = new THREE.Vector3().subVectors(b, a); const m = mesh(new THREE.CylinderGeometry(r, r, v.length()), fm); m.position.copy(a).addScaledVector(v, 0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.clone().normalize()); g.add(m); };
  const P = (x, y) => new THREE.Vector3(x, y, 0); const bb = P(-0.02, 0.38), seat = P(-0.14, 0.86), head = P(0.36, 0.86);
  tube(bb, seat); tube(seat, head); tube(bb, head); tube(bb, P(-0.52, 0.36)); tube(seat, P(-0.52, 0.36)); tube(head, P(0.52, 0.36)); tube(head, P(0.32, 1.0));
  g.add(mesh(rbox(0.22, 0.05, 0.1, 0.02), M.rubber, -0.16, 0.9, 0)); { const _m = mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.5), M.chrome, 0.32, 1.0, 0); _m.rotation.x = Math.PI / 2; g.add(_m); }
  return g;
}
function scooter(col = 0xeeeeea) {
  const g = new THREE.Group(); const b = new THREE.MeshStandardMaterial({ color: col, metalness: 0.2, roughness: 0.25, });
  const w1 = wheel(0.25, 0.06); w1.position.set(-0.62, 0.3, 0); const w2 = wheel(0.25, 0.06); w2.position.set(0.62, 0.3, 0); g.add(w1, w2);
  g.add(mesh(rbox(0.7, 0.42, 0.42, 0.15), b, -0.38, 0.62, 0)); g.add(mesh(rbox(0.6, 0.12, 0.36, 0.05), M.rubber, -0.38, 0.88, 0)); g.add(mesh(rbox(0.6, 0.08, 0.32, 0.03), M.ink, 0.05, 0.36, 0));
  const f = mesh(rbox(0.16, 0.75, 0.36, 0.06), b, 0.5, 0.75, 0); f.rotation.z = -0.3; g.add(f); { const _m = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.62), M.chrome, 0.62, 1.12, 0); _m.rotation.x = Math.PI / 2; g.add(_m); } g.add(mesh(rbox(0.12, 0.08, 0.2, 0.03), M.chrome, 0.66, 1.06, 0));
  return g;
}
function carCovered() {
  const g = new THREE.Group(); const f = fabric(0x8d939a);
  g.add(mesh(rbox(4.3, 0.85, 1.82, 0.32, 5), f, 0, 0.68, 0)); g.add(mesh(rbox(2.3, 0.7, 1.6, 0.3, 5), f, -0.25, 1.32, 0));
  [[-1.4, 1], [1.35, 1], [-1.4, -1], [1.35, -1]].forEach(([x, s]) => { const w = mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.22, 24), M.rubber, x, 0.33, s * 0.82); w.rotation.x = Math.PI / 2; g.add(w); });
  for (let i = 0; i < 6; i++) { const wr = mesh(new THREE.TorusGeometry(R(0.2, 0.5), 0.015, 6, 20, Math.PI), f, R(-1.6, 1.6), R(0.9, 1.2), 0.91); wr.rotation.z = R(0, 3); g.add(wr); }
  return g;
}
function shelving(w = 1.8, h = 2.2, d = 0.6, levels = 4, fill = 0.85) {
  const g = new THREE.Group(); const fm = new THREE.MeshStandardMaterial({ color: 0x2c5d8f, metalness: 0.4, roughness: 0.45 }); const bm = new THREE.MeshStandardMaterial({ color: 0xc8963e, metalness: 0.3, roughness: 0.5 });
  [-1, 1].forEach((s) => [-1, 1].forEach((t) => g.add(mesh(new THREE.BoxGeometry(0.06, h, 0.06), fm, s * (w / 2 - 0.03), h / 2, t * (d / 2 - 0.03)))));
  for (let i = 0; i < levels; i++) {
    const y = 0.12 + (i * (h - 0.2)) / (levels - 0.5);
    g.add(mesh(new THREE.BoxGeometry(w, 0.05, 0.08), bm, 0, y, d / 2 - 0.04)); g.add(mesh(new THREE.BoxGeometry(w, 0.05, 0.08), bm, 0, y, -d / 2 + 0.04)); g.add(mesh(new THREE.BoxGeometry(w - 0.1, 0.02, d - 0.1), M.woodL, 0, y + 0.02, 0));
    let x = -w / 2 + 0.08; while (x < w / 2 - 0.4) { const bw = R(0.3, 0.5); if (rng() < fill) { const bh = R(0.22, Math.min(0.42, (h - 0.2) / (levels - 0.5) - 0.08)); const b = cardboard(bw, bh, d * R(0.7, 0.85)); b.position.set(x + bw / 2, y + 0.03 + bh / 2, R(-0.03, 0.03)); g.add(b); } x += bw + 0.04; }
  }
  return g;
}
function pallet() { const g = new THREE.Group(); for (let i = 0; i < 5; i++) g.add(mesh(new THREE.BoxGeometry(1.2, 0.025, 0.14), M.woodL, 0, 0.13, -0.5 + i * 0.25)); for (let i = 0; i < 3; i++) g.add(mesh(new THREE.BoxGeometry(0.1, 0.1, 1.0), M.woodL, -0.55 + i * 0.55, 0.06, 0)); return g; }
function trolley() { const g = new THREE.Group(); g.add(mesh(rbox(0.5, 0.03, 0.3, 0.01), M.steelDark, 0, 0.05, 0.1)); [-0.2, 0.2].forEach((x) => { g.add(mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.25), M.brass, x, 0.65, -0.05)); const w = mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.05, 20), M.rubber, x * 1.25, 0.11, -0.08); w.rotation.z = Math.PI / 2; g.add(w); }); { const _m = mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.42), M.brass, 0, 1.27, -0.05); _m.rotation.z = Math.PI / 2; g.add(_m); } g.rotation.x = -0.05; return g; }
function plant(h = 1.3) { const g = new THREE.Group(); g.add(mesh(new THREE.CylinderGeometry(0.22, 0.17, 0.45, 24), M.ink, 0, 0.225, 0)); for (let i = 0; i < 18; i++) { const l = mesh(new THREE.SphereGeometry(R(0.12, 0.22), 10, 8), rng() > 0.5 ? M.green : M.green2, R(-0.25, 0.25), R(0.6, h), R(-0.25, 0.25)); l.scale.set(1, R(1.3, 2), 0.5); l.rotation.set(R(0, 3), R(0, 3), R(0, 3)); g.add(l); } return g; }
function tree(h = 6, tropical = false) { const g = new THREE.Group(); g.add(mesh(new THREE.CylinderGeometry(0.12, 0.2, h * 0.55, 8), M.trunk, 0, h * 0.275, 0)); const n = tropical ? 9 : 14; for (let i = 0; i < n; i++) { const s = mesh(new THREE.IcosahedronGeometry(R(h * 0.15, h * 0.24), 1), rng() > 0.5 ? M.green : M.green2, R(-h * 0.2, h * 0.2), h * R(0.55, 0.9), R(-h * 0.2, h * 0.2)); s.scale.y = tropical ? 0.5 : 0.85; g.add(s); } return g; }
function lamp(h = 6) { const g = new THREE.Group(); g.add(mesh(new THREE.CylinderGeometry(0.06, 0.09, h, 10), M.steelDark, 0, h / 2, 0)); g.add(mesh(new THREE.BoxGeometry(0.9, 0.08, 0.2), M.steelDark, 0.4, h, 0)); g.add(mesh(new THREE.BoxGeometry(0.5, 0.03, 0.16), M.ledWarm, 0.6, h - 0.05, 0, false)); const pl = new THREE.PointLight(0xffc98a, 40, 18, 2); pl.position.set(0.6, h - 0.3, 0); g.add(pl); return g; }
function car(col) { const g = new THREE.Group(); const p = new THREE.MeshPhysicalMaterial({ color: col, metalness: 0.6, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 }); g.add(mesh(rbox(4.4, 0.7, 1.8, 0.25, 4), p, 0, 0.62, 0)); g.add(mesh(rbox(2.4, 0.62, 1.62, 0.25, 4), M.glassDark, -0.2, 1.2, 0)); [[-1.4, 1], [1.4, 1], [-1.4, -1], [1.4, -1]].forEach(([x, s]) => { const w = mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.24, 24), M.rubber, x, 0.34, s * 0.82); w.rotation.x = Math.PI / 2; g.add(w); }); g.add(mesh(new THREE.BoxGeometry(0.05, 0.1, 1.4), new THREE.MeshStandardMaterial({ emissive: 0xff2a1a, emissiveIntensity: 2, color: 0x330000 }), -2.2, 0.75, 0, false)); return g; }

/* fill a storage room of w×d (origin at room front-center, interior toward -z) */
function fillRoom(g, kind, w, d, h) {
  const at = (o, x, z, ry = 0) => { o.position.set(x, 0, z); o.rotation.y = ry; g.add(o); return o; };
  const backZ = -d + 0.35;
  const stacks = (n, x0, x1, z0, z1, hmin, hmax) => { for (let i = 0; i < n; i++) g.add(boxStack(R(x0, x1), R(z0, z1), Math.round(R(hmin, hmax)))); };
  if (kind === 'XS') { g.add(boxStack(-0.22, backZ + 0.05, 4)); g.add(boxStack(0.2, backZ + 0.05, 3)); at(suitcase(0x2c5d8f), 0.15, -0.35, 0.3); g.add(boxStack(-0.2, -0.4, 1, 0.9)); }
  if (kind === 'S') { g.add(boxStack(-0.5, backZ, 5)); g.add(boxStack(0.05, backZ, 4)); g.add(boxStack(0.55, backZ, 5)); at(suitcase(0xc8963e), -0.45, -0.75, 0.2); at(suitcase(0x2c5d8f, 0.55), -0.05, -0.7, -0.1); at(chair(0x5b6b7d), 0.45, -0.75, 0.5); }
  if (kind === 'M' || kind === 'MG') {
    at(mattress(1.5, 1.9), -w / 2 + 0.25, backZ + 0.2, Math.PI / 2 - 0.1).rotation.z = 0;
    at(sofa(1.6, 0x5b6b7d), 0.1, backZ + 0.45, 0);
    g.add(boxStack(w / 2 - 0.35, backZ - 0.05, 5)); g.add(boxStack(w / 2 - 0.35, backZ + 0.55, 4));
    if (kind === 'MG') at(scooter(), 0.0, -0.9, 0.1); else { at(bicycle(), -0.1, -1.05, 0.15); g.add(boxStack(0.75, -1.0, 3)); }
    g.add(boxStack(-0.6, -0.6, 2));
  }
  if (kind === 'L') {
    at(wardrobe(1.0), -w / 2 + 0.6, backZ, 0); at(fridge(), -w / 2 + 1.45, backZ, 0); at(mattress(1.6, 2), w / 2 - 0.25, backZ + 0.3, -Math.PI / 2 + 0.1);
    at(sofa(2.0, 0x8a6a4a), -0.2, -2.0, 0); at(table(), 0.6, -1.0, 0.1); at(chair(), 0.2, -0.5, 0.3); at(bicycle(0x1f7a52), -0.5, -0.65, -0.3);
    stacks(4, 0.5, w / 2 - 0.35, -3.4, -2.4, 3, 6);
  }
  if (kind === 'XL') {
    at(shelving(2.0, 2.4, 0.6, 5), -w / 2 + 1.1, backZ, 0); at(shelving(2.0, 2.4, 0.6, 5), w / 2 - 1.1, backZ, 0);
    at(shelving(2.4, 2.4, 0.6, 5), -w / 2 + 0.35, -2.3, Math.PI / 2);
    const p = at(pallet(), 0.4, -2.25); g.add(boxStack(0.1, -2.5, 4)); g.add(boxStack(0.65, -2.5, 3)); g.add(boxStack(0.1, -2.0, 4)); g.add(boxStack(0.65, -2.0, 5)); void p;
    at(sofa(2.0, 0x5b6b7d), 1.0, -1.2, -Math.PI / 2 + 0.2); at(trolley(), -0.6, -0.7, 0.4); g.add(boxStack(-0.6, -0.55, 2));
  }
  if (kind === 'VEHICLE') { at(carCovered(), 0.1, -d / 2 - 0.2, Math.PI / 2 - 0.32); at(shelving(1.6, 2.0, 0.5, 4), w / 2 - 0.35, backZ - 0.1 + 0.2, -Math.PI / 2); }
  if (kind === 'CORR') { const n = Math.round(R(3, 5)); for (let i = 0; i < n; i++) g.add(boxStack(R(-0.75, 0.75), R(-1.9, -0.45), Math.round(R(2, 5)))); if (rng() > 0.5) at(bicycle(pick([0xb3362b, 0x1f7a52, 0x2c5d8f])), R(-0.3, 0.3), -0.9, R(-0.3, 0.3)); else at(sofa(1.6, pick([0x5b6b7d, 0x8a6a4a])), 0, -d + 0.6, 0); }
}

/* a storage room shell: opening at z=0 (width w, height dh), room depth d, height h; local -z = inside */
function room(w, d, h, { light = 0xfff1dc, intensity = 6, shadow = true, rect = true, lit = true } = {}) {
  const g = new THREE.Group(); const wall = M.roomWall;
  const fl = mesh(new THREE.PlaneGeometry(w, d), concrete('#9b9d9e', Math.max(1, d / 2), 0.55)); fl.rotation.x = -Math.PI / 2; fl.position.set(0, 0.001, -d / 2); g.add(fl);
  const back = mesh(new THREE.PlaneGeometry(w, h), corrMat(0xd5d8dc, Math.round(w * 3)), 0, h / 2, -d); g.add(back);
  [-1, 1].forEach((s) => { const sw = mesh(new THREE.PlaneGeometry(d, h), corrMat(0xd0d4d8, Math.round(d * 3)), s * w / 2, h / 2, -d / 2); sw.rotation.y = -s * Math.PI / 2; g.add(sw); });
  const c = mesh(new THREE.PlaneGeometry(w, d), wall, 0, h, -d / 2); c.rotation.x = Math.PI / 2; g.add(c);
  g.add(mesh(new THREE.BoxGeometry(Math.min(1.2, w * 0.6), 0.03, 0.12), M.led, 0, h - 0.02, -d / 2, false));
  if (rect) { const rl = new THREE.RectAreaLight(light, intensity, Math.min(1.2, w * 0.6), 0.5); rl.position.set(0, h - 0.04, -d / 2); rl.rotation.x = -Math.PI / 2; g.add(rl); }
  if (!lit) return g;
  const pl = new THREE.PointLight(light, intensity * 0.8, Math.max(w, d) * 2.2, 2); pl.position.set(0, h - 0.3, -d * 0.45); pl.castShadow = shadow; pl.shadow.mapSize.set(1024, 1024); pl.shadow.bias = -0.002; pl.shadow.radius = 4; g.add(pl);
  return g;
}

/* ───────── corridor ───────── */
const BAY = 2.4;
function corridor({ bays = 40, period = 3, pattern, palette, zone = 'A', width = 3.2, height = 3.6, dh = 2.4, startBay = -8, lightIntensity = 12, seedBase = 7, litFrom = -2, litTo = 15 }) {
  const g = new THREE.Group(); const half = width / 2;
  const floor = concrete('#8b9097', 2, 0.18); floor.map.repeat.set(1.5, (bays * BAY) / 3); floor.roughnessMap.repeat.copy(floor.map.repeat);
  const fl = mesh(new THREE.PlaneGeometry(width + 0.1, bays * BAY), floor); fl.rotation.x = -Math.PI / 2; fl.position.set(0, 0, -(startBay + bays / 2) * BAY); fl.castShadow = false; g.add(fl); g.userData.floor = fl;
  const ce = mesh(new THREE.PlaneGeometry(width + 0.1, bays * BAY), M.ceil); ce.rotation.x = Math.PI / 2; ce.position.set(0, height, -(startBay + bays / 2) * BAY); g.add(ce);
  [-1, 1].forEach((s) => { const ln = mesh(new THREE.BoxGeometry(0.07, 0.004, bays * BAY), M.brassPaint, s * (half - 0.45), 0.002, -(startBay + bays / 2) * BAY, false); g.add(ln); });
  const pil = corrMat(0xbfc5cc, 1); const header = corrMat(0xc5cad0, 6);
  const plates = {};
  for (let b = startBay; b < startBay + bays; b++) {
    const k = ((b % period) + period) % period; const zc = -(b + 0.5) * BAY;
    seed = seedBase * 1000 + k * 17;
    [-1, 1].forEach((s, si) => {
      const p = pattern[si][k]; const col = palette[si][k];
      const side = new THREE.Group(); side.position.set(s * half, 0, zc); side.rotation.y = -s * Math.PI / 2; g.add(side);
      // pilaster + header
      side.add(mesh(new THREE.BoxGeometry(BAY - 2.0, height, 0.12), pil, BAY / 2, height / 2, -0.06));
      side.add(mesh(new THREE.BoxGeometry(2.0, height - dh, 0.1), header, 0, dh + (height - dh) / 2, -0.05));
      const key = `${zone}-${String(100 + k + 1 + si * 10)}`;
      plates[key] ??= new THREE.MeshStandardMaterial({ map: labelTex(key, { bg: '#0e1b2c', fg: '#ddb065', border: '#c8963e' }), emissive: 0xffffff, emissiveMap: labelTex(key, { bg: '#000', fg: '#6b5320' }), roughness: 0.5 });
      side.add(mesh(new THREE.PlaneGeometry(0.5, 0.125), plates[key], 0, dh + 0.25, 0.01, false));
      side.add(mesh(new THREE.BoxGeometry(2.04, 0.06, 0.06), M.steelDark, 0, dh + 0.03, 0.0));
      if (p === 'open') {
        const L = b >= litFrom && b <= litTo; const r = room(2.0, 2.6, height - 0.3, { intensity: 5, shadow: false, rect: false, lit: L }); r.position.z = -0.02; side.add(r); fillRoom(r, 'CORR', 2.0, 2.6, height - 0.3);
        side.add(mesh(new THREE.PlaneGeometry(2.0, 0.22), doorMat(col), 0, dh - 0.11, 0.0, false));
      } else {
        const dm = mesh(new THREE.PlaneGeometry(2.0, dh), doorMat(col), 0, dh / 2, 0.0, false); side.add(dm);
        side.add(mesh(new THREE.BoxGeometry(2.0, dh, 0.05), M.ink, 0, dh / 2, -0.04, false));
      }
    });
    g.add(mesh(new THREE.BoxGeometry(0.1, 0.03, 1.9), M.led, 0, height - 0.02, zc, false));
    g.add(mesh(new THREE.BoxGeometry(0.16, 0.05, 1.96), M.steelDark, 0, height - 0.005, zc, false));
    if (b >= litFrom && b <= litTo) { const rl = new THREE.RectAreaLight(0xfff4e6, lightIntensity, 0.14, 1.9); rl.position.set(0, height - 0.04, zc); rl.rotation.x = -Math.PI / 2; g.add(rl); }
  }
  return g;
}

/* ───────── sky ───────── */
function sky(top, horizon, ground, sunDir, sunCol, sunPow = 1) {
  const m = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, uniforms: { top: { value: new THREE.Color(top) }, hor: { value: new THREE.Color(horizon) }, gr: { value: new THREE.Color(ground) }, sd: { value: sunDir.clone().normalize() }, sc: { value: new THREE.Color(sunCol) }, sp: { value: sunPow } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: 'uniform vec3 top,hor,gr,sd,sc; uniform float sp; varying vec3 vP; void main(){ float h=vP.y; vec3 c = h>0. ? mix(hor, top, pow(clamp(h,0.,1.),.45)) : mix(hor, gr, clamp(-h*6.,0.,1.)); float s=max(dot(normalize(vP),sd),0.); c += sc*(pow(s,600.)*8.+pow(s,24.)*.5+pow(s,4.)*.18)*sp; gl_FragColor=vec4(c,1.); }' });
  return new THREE.Mesh(new THREE.SphereGeometry(800, 48, 24), m);
}
function envFrom(obj) { const s = new THREE.Scene(); s.add(obj.clone()); return pmrem.fromScene(s, 0).texture; }

/* ───────── post ───────── */
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uVig: { value: 0.35 }, uGrain: { value: 0.035 }, uRes: { value: new THREE.Vector2(W, H) }, uSplit: { value: 0.3 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime,uVig,uGrain,uSplit; uniform vec2 uRes; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
    void main(){ vec4 c=texture2D(tDiffuse,vUv); float d=distance(vUv,vec2(.5)); c.rgb*=mix(1.,1.-uVig,smoothstep(.25,.9,d));
      float l=dot(c.rgb,vec3(.299,.587,.114)); c.rgb=mix(c.rgb, c.rgb*vec3(.9,.97,1.1), (1.-l)*uSplit); c.rgb*=mix(vec3(1.), vec3(1.05,1.,.92), l*uSplit);
      c.rgb += (hash(vUv*uRes+uTime*91.7)-.5)*uGrain; gl_FragColor=c; }`,
};
function composerFor(scene, camera, o = {}) {
  const comp = new EffectComposer(renderer); comp.setSize(W, H);
  comp.addPass(new RenderPass(scene, camera));
  if (o.ao !== false) { const ao = new GTAOPass(scene, camera, W, H); ao.updateGtaoMaterial({ radius: o.aoRadius ?? 0.35, distanceExponent: 1.5, thickness: 1, scale: 1 }); ao.blendIntensity = o.aoBlend ?? 0.9; comp.addPass(ao); }
  if (o.bokeh) comp.addPass(new BokehPass(scene, camera, { focus: o.bokeh.focus, aperture: o.bokeh.aperture, maxblur: o.bokeh.maxblur ?? 0.01 }));
  comp.addPass(new UnrealBloomPass(new THREE.Vector2(W, H), o.bloom ?? 0.35, 0.65, o.bloomTh ?? 0.85));
  comp.addPass(new OutputPass());
  const gp = new ShaderPass(GradeShader); gp.uniforms.uVig.value = o.vig ?? 0.35; gp.uniforms.uGrain.value = o.grain ?? 0.03; gp.uniforms.uSplit.value = o.split ?? 0.3; comp.addPass(gp);
  comp.grade = gp; return comp;
}
function floorReflect(scene, floorMesh, pos) {
  const rt = new THREE.WebGLCubeRenderTarget(512, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
  const cc = new THREE.CubeCamera(0.05, 200, rt); cc.position.copy(pos); scene.add(cc); floorMesh.visible = false; cc.update(renderer, scene); floorMesh.visible = true;
  floorMesh.material.envMap = pmrem.fromCubemap(rt.texture).texture; floorMesh.material.envMapIntensity = 0.9; floorMesh.material.needsUpdate = true;
}

/* ───────── scenes ───────── */
const PAL = {
  brand: [[C.ink, C.ink2, C.brass], [C.ink2, C.brass, C.ink]],
  navy: [[C.ink, C.ink3, C.ink], [C.ink3, C.ink, C.brass]],
  warm: [[C.brass, C.ink, 0x96691f], [C.ink, 0x96691f, C.ink2]],
};
const SCENES = {};

SCENES.corridor = (o) => {
  const scene = new THREE.Scene(); scene.background = new THREE.Color(o.fog ?? 0x070d17); scene.fog = new THREE.FogExp2(o.fog ?? 0x070d17, o.fogD ?? 0.05);
  scene.environment = roomEnv; scene.environmentIntensity = o.envI ?? 0.12;
  const pattern = o.pattern ?? [['closed', 'open', 'closed'], ['closed', 'closed', 'open']];
  const cor = corridor({ pattern, palette: PAL[o.pal ?? 'brand'], zone: o.zone ?? 'A', bays: 44, startBay: -6, seedBase: o.seed ?? 7, lightIntensity: o.li ?? 14 });
  scene.add(cor);
  const cam = new THREE.PerspectiveCamera(o.fov ?? 52, W / H, 0.05, 200);
  floorReflect(scene, cor.userData.floor, new THREE.Vector3(0, -1.5, -12));
  const loopLen = 3 * BAY;
  const update = (t) => {
    const z = -t * loopLen + (o.z0 ?? 0); const sw = Math.sin(t * Math.PI * 2);
    cam.position.set((o.x ?? 0) + sw * 0.06, (o.y ?? 1.55) + Math.sin(t * Math.PI * 4) * 0.012, z);
    cam.lookAt((o.lx ?? 0) + sw * 0.04, o.ly ?? 1.45, z - 10);
    if (o.roll) cam.rotation.z += o.roll;
  };
  update(0);
  return { scene, cam, update, post: { aoRadius: 0.4, bloom: 0.45, vig: 0.42, grain: 0.03 } };
};

SCENES.unit = (o) => {
  const kind = o.kind;
  const D = { LOCKER: [3, 1, 2.4], XS: [1.0, 1.0, 2.0], S: [1.6, 1.6, 2.4], M: [2.0, 2.5, 2.4], MG: [2.2, 3.0, 2.6], L: [2.6, 4.0, 2.6], XL: [4.0, 5.0, 2.8], VEHICLE: [3.2, 6.0, 2.9] }[kind];
  const [w, d, h] = D; seed = 4242 + kind.length * 31 + kind.charCodeAt(0);
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0b121d); scene.environment = roomEnv; scene.environmentIntensity = 0.22; scene.fog = new THREE.Fog(0x0b121d, 10, 30);
  const wallH = Math.max(3.4, h + 0.9);
  // corridor floor (toward +z) and ceiling
  const fm = concrete('#8b9097', 3, 0.2); const fl = mesh(new THREE.PlaneGeometry(30, 12), fm, 0, 0, 6); fl.rotation.x = -Math.PI / 2; scene.add(fl);
  scene.add(mesh(new THREE.BoxGeometry(30, 0.004, 0.07), M.brassPaint, 0, 0.002, 0.5, false));
  const ce = mesh(new THREE.PlaneGeometry(30, 12), M.ceil, 0, wallH, 6); ce.rotation.x = Math.PI / 2; scene.add(ce);
  const pil = corrMat(0xbfc5cc, 1), hdr = corrMat(0xc5cad0, 6);
  // neighbour units
  const nW = kind === 'VEHICLE' || kind === 'XL' ? 3.2 : 2.0;
  const slots = [];
  let x = -w / 2 - 0.2; for (let i = 0; i < 4; i++) { x -= nW; slots.push([x + nW / 2, nW, i]); x -= 0.4; }
  x = w / 2 + 0.2; for (let i = 0; i < 4; i++) { slots.push([x + nW / 2, nW, i + 5]); x += nW + 0.4; }
  const cols = [C.ink, C.ink2, C.brass, C.ink, C.ink2, C.ink, C.brass, C.ink2, C.ink];
  if (kind === 'LOCKER') {
    // locker wall
    const lg = new THREE.Group(); const lw = 0.6; const lm = new THREE.MeshStandardMaterial({ color: C.ink2, metalness: 0.5, roughness: 0.38 }); const lb = new THREE.MeshStandardMaterial({ color: C.brass, metalness: 0.6, roughness: 0.35 });
    for (let c = 0; c < 5; c++) for (let r = 0; r < 4; r++) {
      const px = (c - 2) * (lw + 0.02), py = 0.15 + r * (lw + 0.02) + lw / 2; const open = c === 2 && r === 1;
      if (!open) { const dm = mesh(rbox(lw, lw, 0.03, 0.01), (c + r) % 4 === 0 ? lb : lm, px, py, 0); lg.add(dm); lg.add(mesh(rbox(0.04, 0.12, 0.02, 0.006), M.chrome, px + lw / 2 - 0.08, py, 0.02)); for (let v = 0; v < 3; v++) lg.add(mesh(new THREE.BoxGeometry(0.2, 0.012, 0.005), M.ink, px - 0.05, py + lw / 2 - 0.08 - v * 0.03, 0.017)); const lab = mesh(new THREE.PlaneGeometry(0.16, 0.05), new THREE.MeshStandardMaterial({ map: labelTex(`L${r + 1}${String(c + 1).padStart(2, '0')}`, { w: 256, h: 80, font: '700 48px Consolas' }) }), px - 0.15, py - lw / 2 + 0.08, 0.017, false); lg.add(lab); }
      else { const inner = new THREE.Group(); inner.position.set(px, py - lw / 2, 0); [[0, -lw / 2, lw, 0.01, lw, 'b'], [0, lw / 2, lw, 0.01, lw], [-lw / 2, 0, 0.01, lw, lw], [lw / 2, 0, 0.01, lw, lw]].forEach(() => {}); lg.add(inner);
        const box = mesh(new THREE.BoxGeometry(lw, lw, 0.6), new THREE.MeshStandardMaterial({ color: 0xd5d8dc, roughness: 0.7, side: THREE.BackSide }), px, py, -0.3); lg.add(box);
        const b1 = cardboard(0.4, 0.28, 0.4); b1.position.set(px - 0.05, py - lw / 2 + 0.14, -0.3); lg.add(b1); const b2 = cardboard(0.3, 0.2, 0.3); b2.position.set(px + 0.05, py - lw / 2 + 0.38, -0.32); b2.rotation.y = 0.2; lg.add(b2);
        const pl = new THREE.PointLight(0xfff1dc, 1.2, 1.2, 2); pl.position.set(px, py + 0.22, -0.2); lg.add(pl);
        const door = mesh(rbox(lw, lw, 0.03, 0.01), lb, px - lw / 2 - 0.02, py, lw / 2); door.rotation.y = -Math.PI / 2 + 0.25; door.position.set(px - lw / 2 + 0.07 - Math.cos(0.25) * 0, py, lw / 2 - 0.02); lg.add(door);
      }
    }
    lg.add(mesh(new THREE.BoxGeometry(5 * (lw + 0.02) + 0.1, 0.12, 0.6), M.ink, 0, 0.06, -0.25));
    scene.add(lg);
    const back = mesh(new THREE.PlaneGeometry(30, wallH), corrMat(0xc5cad0, 40), 0, wallH / 2, -0.62); scene.add(back);
  } else {
    // featured opening
    const dh = Math.min(h - 0.1, kind === 'VEHICLE' || kind === 'MG' ? 2.6 : 2.3);
    const r = room(w, d, h, { intensity: kind === 'XL' || kind === 'VEHICLE' ? 9 : 6 }); scene.add(r); fillRoom(r, kind, w, d, h);
    scene.add(mesh(new THREE.BoxGeometry(w + 0.4, wallH - dh, 0.12), hdr, 0, dh + (wallH - dh) / 2, 0.06));
    scene.add(mesh(new THREE.PlaneGeometry(w, 0.24), doorMat(kind === 'XL' || kind === 'VEHICLE' ? C.brass : C.ink2), 0, dh - 0.12, 0.125, false));
    scene.add(mesh(new THREE.BoxGeometry(w + 0.04, 0.08, 0.1), M.steelDark, 0, dh + 0.04, 0.12));
    [-1, 1].forEach((s) => scene.add(mesh(new THREE.BoxGeometry(0.2, wallH, 0.14), pil, s * (w / 2 + 0.1), wallH / 2, 0.05)));
    const plate = mesh(new THREE.PlaneGeometry(0.7, 0.175), new THREE.MeshStandardMaterial({ map: labelTex({ XS: 'B-012', S: 'B-118', M: 'C-204', MG: 'G-021', L: 'D-306', XL: 'E-410', VEHICLE: 'P-007' }[kind], { border: '#c8963e' }), emissive: 0x332200 }), 0, dh + 0.3, 0.125, false); scene.add(plate);
    slots.forEach(([cx, sw, i]) => {
      const g = new THREE.Group(); g.position.set(cx, 0, 0); scene.add(g);
      g.add(mesh(new THREE.PlaneGeometry(sw, dh), doorMat(cols[i % cols.length]), 0, dh / 2, 0.12, false));
      g.add(mesh(new THREE.BoxGeometry(sw + 0.4, wallH - dh, 0.12), hdr, 0, dh + (wallH - dh) / 2, 0.06));
      g.add(mesh(new THREE.BoxGeometry(0.2, wallH, 0.14), pil, sw / 2 + 0.1, wallH / 2, 0.05));
      g.add(mesh(new THREE.BoxGeometry(sw + 0.04, 0.08, 0.1), M.steelDark, 0, dh + 0.04, 0.12));
    });
  }
  // corridor ceiling lights
  for (let i = -3; i <= 3; i++) { scene.add(mesh(new THREE.BoxGeometry(1.9, 0.03, 0.1), M.led, i * 2.6, wallH - 0.02, 1.6, false)); const rl = new THREE.RectAreaLight(0xfff4e6, 9, 1.9, 0.14); rl.position.set(i * 2.6, wallH - 0.04, 1.6); rl.rotation.x = -Math.PI / 2; scene.add(rl); }
  const sl = new THREE.SpotLight(0xfff2e0, 25, 20, 0.7, 0.6, 1.6); sl.position.set(1.2, wallH - 0.2, 3.5); sl.target.position.set(0, 0.8, -d * 0.4); sl.castShadow = true; sl.shadow.mapSize.set(2048, 2048); sl.shadow.bias = -0.0005; scene.add(sl, sl.target);
  const cam = new THREE.PerspectiveCamera(42, W / H, 0.05, 200);
  const dist = { LOCKER: 3.8, XS: 3.0, S: 3.8, M: 4.6, MG: 5.0, L: 5.4, XL: 6.0, VEHICLE: 6.2 }[kind];
  const ty = kind === 'LOCKER' ? 1.2 : h * 0.42;
  cam.position.set(dist * 0.18, kind === 'LOCKER' ? 1.45 : kind === 'VEHICLE' || kind === 'XL' ? 2.0 : 1.6, dist); cam.lookAt(0, ty, kind === 'LOCKER' ? 0 : -d * 0.35);
  floorReflect(scene, fl, new THREE.Vector3(0, -1.4, 2.2));
  return { scene, cam, post: { aoRadius: 0.3, bloom: 0.3, vig: 0.3, grain: 0.02 } };
};

function buildSign(text, w, h, { fg = '#ddb065', bg = null, font = '800 220px "Segoe UI", Arial', glow = 2.2 } = {}) {
  const t = labelTex(text, { bg: bg ?? '#000', fg, w: 1400, h: 300, font });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: glow, transparent: !bg, alphaMap: bg ? null : labelTex(text, { bg: '#000', fg: '#fff', w: 1400, h: 300, font }), roughness: 0.4 }));
}
function logoMark(r = 1) {
  const g = new THREE.Group(); const em = new THREE.MeshStandardMaterial({ color: C.brass, emissive: C.brass, emissiveIntensity: 1.5, metalness: 0.5, roughness: 0.3 });
  g.add(mesh(rbox(r * 2, r * 2, 0.12, r * 0.5), M.ink, 0, 0, 0)); const ring = mesh(new THREE.TorusGeometry(r * 0.52, r * 0.07, 12, 48), em, 0, 0, 0.08); g.add(ring); g.add(mesh(new THREE.CircleGeometry(r * 0.15, 32), em, 0, 0, 0.07));
  [[0, 1], [0, -1], [1, 0], [-1, 0]].forEach(([x, y]) => g.add(mesh(new THREE.BoxGeometry(x ? r * 0.22 : r * 0.1, y ? r * 0.22 : r * 0.1, 0.06), em, x * r * 0.72, y * r * 0.72, 0.08)));
  return g;
}
function windowsTex(cols, rows, litP, warm = true) {
  return ctex(cols * 64, rows * 64, (g, w, h) => { g.fillStyle = '#05080d'; g.fillRect(0, 0, w, h); for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) { const lit = Math.random() < litP; const a = lit ? 0.55 + Math.random() * 0.45 : 0.04 + Math.random() * 0.05; g.fillStyle = lit ? (warm ? `rgba(255,${200 + Math.random() * 40},${140 + Math.random() * 50},${a})` : `rgba(220,235,255,${a})`) : `rgba(120,150,190,${a})`; g.fillRect(c * 64 + 4, r * 64 + 6, 56, 52); } });
}

SCENES.exterior = (o) => {
  const v = o.variant; seed = 900 + v.length * 13;
  const scene = new THREE.Scene();
  const SKY = { cg: [0x0d1a33, 0xd88a5a, 0x1a1a22, new THREE.Vector3(-0.6, 0.06, -0.8), 0xffb070, 0.8], q7: [0x2a5a90, 0xf5c08a, 0x2a2a2a, new THREE.Vector3(-0.35, 0.28, 0.9), 0xffd2a0, 1.2], td: [0x0a1428, 0xb0606a, 0x111116, new THREE.Vector3(0.2, 0.03, -1), 0xff9a6a, 0.6] }[v];
  const sk = sky(...SKY); scene.add(sk); scene.environment = envFrom(sk); scene.environmentIntensity = 0.9;
  scene.fog = new THREE.Fog(SKY[1], 60, 260);
  const sun = new THREE.DirectionalLight(SKY[4], v === 'q7' ? 3.2 : 0.9); sun.position.copy(SKY[3]).multiplyScalar(80); sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096); Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 300 }); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03; scene.add(sun);
  const asphalt = concrete('#2b2f35', 30, 0.5); const gr = mesh(new THREE.PlaneGeometry(400, 400), asphalt); gr.rotation.x = -Math.PI / 2; gr.castShadow = false; scene.add(gr);
  const walkM = concrete('#8c8a84', 8, 0.7);
  const paint = new THREE.MeshStandardMaterial({ color: 0xe8e2d0, roughness: 0.6 });
  const cam = new THREE.PerspectiveCamera(38, W / H, 0.3, 1200);
  const panel = (col, rx = 6, ry = 6) => { const t = ctex(256, 256, (g, w, h) => { g.fillStyle = hex(col); g.fillRect(0, 0, w, h); blotch(g, w, h, 20, 0.05); g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 3; g.strokeRect(0, 0, w, h); g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.stroke(); }, { rep: [rx, ry] }); return new THREE.MeshStandardMaterial({ map: t, roughness: 0.7, metalness: 0.1 }); };
  if (v === 'cg') {
    const B = new THREE.Group(); scene.add(B);
    const bw = 26, bh = 24, bd = 16;
    B.add(mesh(new THREE.BoxGeometry(bw, bh, bd), panel(0x18263a, 10, 8), 0, bh / 2, 0));
    const glass = mesh(new THREE.PlaneGeometry(bw - 2, bh - 7), new THREE.MeshStandardMaterial({ map: windowsTex(16, 6, 0.42), emissive: 0xffffff, emissiveMap: windowsTex(16, 6, 0.42), emissiveIntensity: 1.3, roughness: 0.08, metalness: 0.6 }), 0, (bh - 7) / 2 + 5.2, bd / 2 + 0.02, false); B.add(glass);
    for (let i = 0; i <= 20; i++) B.add(mesh(new THREE.BoxGeometry(0.14, bh - 6.5, 0.7), M.brass, -bw / 2 + 1 + (i * (bw - 2)) / 20, (bh - 6.5) / 2 + 5.2, bd / 2 + 0.35));
    for (let r = 0; r <= 6; r++) B.add(mesh(new THREE.BoxGeometry(bw - 1.6, 0.25, 0.9), panel(0x0e1b2c, 4, 1), 0, 5.1 + r * ((bh - 7) / 6), bd / 2 + 0.3));
    const lobby = mesh(new THREE.PlaneGeometry(12, 3.8), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffe2b8, emissiveIntensity: 0.55, roughness: 0.1 }), -4, 2.1, bd / 2 + 0.05, false); B.add(lobby);
    for (let i = 0; i <= 6; i++) B.add(mesh(new THREE.BoxGeometry(0.08, 3.9, 0.12), M.ink, -10 + i * 2, 2.05, bd / 2 + 0.1));
    B.add(mesh(new THREE.BoxGeometry(14, 0.35, 3.2), M.ink, -4, 4.4, bd / 2 + 1.6)); B.add(mesh(new THREE.BoxGeometry(13, 0.05, 0.12), M.ledWarm, -4, 4.22, bd / 2 + 3.1, false));
    // drive-up doors right
    for (let i = 0; i < 3; i++) { B.add(mesh(new THREE.PlaneGeometry(3.2, 3.6), doorMat(i === 1 ? C.brass : C.ink2), 5.5 + i * 3.8, 1.8, bd / 2 + 0.03, false)); B.add(mesh(new THREE.BoxGeometry(0.6, 0.08, 0.3), M.ledWarm, 5.5 + i * 3.8, 3.9, bd / 2 + 0.15, false)); const pl = new THREE.PointLight(0xffd09a, 25, 8, 2); pl.position.set(5.5 + i * 3.8, 3.7, bd / 2 + 1.2); B.add(pl); }
    const sign = buildSign('VAULTRA', 15, 3.2); sign.position.set(-1.5, bh + 1.5, bd / 2 - 1); B.add(sign); B.add(mesh(new THREE.BoxGeometry(17, 0.3, 0.3), M.steelDark, -1.5, bh + 0.1, bd / 2 - 1.1));
    const lm = logoMark(1.6); lm.position.set(bw / 2 + 0.07, bh - 3, 3); lm.rotation.y = Math.PI / 2; B.add(lm);
    const vs = buildSign('KHO TỰ QUẢN 24/7', 9, 1.6, { font: '700 160px "Segoe UI", Arial', glow: 1.4 }); vs.position.set(bw / 2 + 0.08, bh - 6, 3); vs.rotation.y = Math.PI / 2; vs.scale.setScalar(0.55); B.add(vs);
    B.rotation.y = -0.15;
    const walk = mesh(new THREE.BoxGeometry(80, 0.18, 7), walkM, 0, 0.09, bd / 2 + 3.5); scene.add(walk); walk.rotation.y = -0.15;
    for (let i = -4; i < 6; i++) { const t = tree(R(6, 8)); t.position.set(i * 11 + R(-1, 1) - 3, 0, 15.5 + i * 1.33); if (Math.abs(i * 11 - 3) < 9) t.visible = false; scene.add(t); const l = lamp(7); l.position.set(i * 9 + 4.5, 0, 13 + i * 1.33); l.rotation.y = Math.PI / 2; scene.add(l); }
    for (let i = 0; i < 4; i++) { const c = car(pick([0xeeeeee, 0x1a1a1a, 0x8a1c1c, 0x2c5d8f, 0x777777])); c.position.set(-14 + i * 5.2, 0, 20 + i * 0.3); c.rotation.y = Math.PI / 2 - 0.15; scene.add(c); }
    for (let i = -8; i < 12; i++) { const _m = mesh(new THREE.BoxGeometry(3, 0.01, 0.18), paint, i * 6, 0.01, 23 + i * 0.85, false); _m.rotation.y = -0.15; scene.add(_m); }
    // background city
    for (let i = 0; i < 40; i++) { const h = R(10, 55), ww = R(8, 20); const b = mesh(new THREE.BoxGeometry(ww, h, R(8, 20)), new THREE.MeshStandardMaterial({ color: 0x141b26, emissive: 0xffffff, emissiveMap: windowsTex(8, 12, 0.25), emissiveIntensity: 0.5, roughness: 0.8 }), R(-160, 160), h / 2, R(-150, -40)); scene.add(b); }
    cam.position.set(-30, 3.2, 46); cam.lookAt(0, 13.5, 0);
  }
  if (v === 'q7') {
    const B = new THREE.Group(); scene.add(B); const bw = 46, bh = 12, bd = 18;
    B.add(mesh(new THREE.BoxGeometry(bw, bh, bd), panel(0xe6e0d2, 14, 4), 0, bh / 2, 0));
    B.add(mesh(new THREE.BoxGeometry(bw + 0.4, 2.6, bd + 0.4), panel(0x0e1b2c, 14, 1), 0, bh + 1.2, 0));
    const sign = buildSign('VAULTRA', 12, 2.6); sign.position.set(-8, bh + 1.25, bd / 2 + 0.22); B.add(sign);
    const lm = logoMark(1.1); lm.position.set(-16.5, bh + 1.25, bd / 2 + 0.2); B.add(lm);
    const tag = buildSign('SELF STORAGE · QUẬN 7', 10, 1.4, { font: '700 130px "Segoe UI", Arial', glow: 1.2, fg: '#f6f3ec' }); tag.position.set(10, bh + 1.25, bd / 2 + 0.22); tag.scale.setScalar(0.8); B.add(tag);
    B.add(mesh(new THREE.PlaneGeometry(bw - 6, 2.4), new THREE.MeshStandardMaterial({ map: windowsTex(24, 1, 0.5), emissive: 0xffffff, emissiveMap: windowsTex(24, 1, 0.5), emissiveIntensity: 0.9, roughness: 0.08, metalness: 0.5 }), 0, 8.2, bd / 2 + 0.02, false));
    B.add(mesh(new THREE.BoxGeometry(bw, 0.5, 1.2), M.ink, 0, 5.6, bd / 2 + 0.6));
    for (let i = 0; i < 9; i++) { const x = -bw / 2 + 3.2 + i * 4.8; const c = [C.ink2, C.brass, C.ink, C.ink2, C.ink, C.brass, C.ink2, C.ink, C.ink2][i]; B.add(mesh(new THREE.PlaneGeometry(3.6, 4.2), doorMat(c), x, 2.1, bd / 2 + 0.03, false)); B.add(mesh(new THREE.PlaneGeometry(0.9, 0.3), new THREE.MeshStandardMaterial({ map: labelTex(`D-${String(i + 1).padStart(2, '0')}`, { border: '#c8963e' }) }), x, 4.6, bd / 2 + 0.04, false)); }
    const lob = mesh(new THREE.PlaneGeometry(6, 4.6), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffe6c4, emissiveIntensity: 1.1 }), bw / 2 - 0.2 + 0.25, 2.4, bd / 2 - 4, false); lob.rotation.y = Math.PI / 2; B.add(lob);
    B.rotation.y = 0.35;
    const apron = mesh(new THREE.BoxGeometry(70, 0.06, 10), concrete('#7d7b76', 10, 0.6), 0, 0.03, bd / 2 + 5); apron.rotation.y = 0.35; scene.add(apron);
    for (let i = 0; i < 7; i++) { const t = tree(R(5, 7), true); t.position.set(-30 + i * 10 + R(-2, 2), 0, 24 + R(-2, 2) - i * 3.5); scene.add(t); }
    const c1 = car(0xf2f2f2); c1.position.set(-3, 0, 16); c1.rotation.y = 0.35 + 0.2; scene.add(c1); const vn = car(0x1e4672); vn.scale.set(1.15, 1.25, 1.1); vn.position.set(6, 0, 13); vn.rotation.y = 0.35 + Math.PI / 2; scene.add(vn);
    for (let i = 0; i < 3; i++) { const l = lamp(7); l.position.set(-20 + i * 16, 0, 26 - i * 5.5); scene.add(l); }
    for (let i = 0; i < 30; i++) { const h = R(20, 70); scene.add(mesh(new THREE.BoxGeometry(R(10, 22), h, R(10, 22)), new THREE.MeshStandardMaterial({ color: 0x2a3444, emissive: 0xffffff, emissiveMap: windowsTex(8, 14, 0.12), emissiveIntensity: 0.25, roughness: 0.7 }), R(-200, 200), h / 2, R(-220, -60))); }
    cam.position.set(-36, 3.4, 46); cam.lookAt(2, 6.5, 0);
  }
  if (v === 'td') {
    const rowM = panel(0xe9e4d8, 10, 1); const roofM = panel(0x14304f, 20, 1);
    [-1, 1].forEach((s) => {
      const G = new THREE.Group(); G.position.set(s * 7.5, 0, -20); scene.add(G);
      G.add(mesh(new THREE.BoxGeometry(6, 4.2, 70), rowM, s * 3, 2.1, 0)); G.add(mesh(new THREE.BoxGeometry(7.2, 0.4, 71), roofM, s * 2.8, 4.4, 0));
      for (let i = 0; i < 18; i++) { const z = 33 - i * 3.8; const c = pick([C.ink2, C.ink, C.ink2, C.brass, C.ink3]); const dm = mesh(new THREE.PlaneGeometry(3.0, 3.2), doorMat(c), 0.02 * -s * -1, 1.6, z); dm.rotation.y = -s * Math.PI / 2; dm.position.x = -s * -0.0 + (s < 0 ? 0.02 : -0.02); G.add(dm);
        const lt = mesh(new THREE.BoxGeometry(0.15, 0.06, 0.5), M.ledWarm, s < 0 ? 0.15 : -0.15, 3.65, z, false); G.add(lt); if (i % 2 === 0 && i < 12) { const pl = new THREE.PointLight(0xffcf96, 14, 9, 2); pl.position.set(s < 0 ? 1.0 : -1.0, 3.4, z); G.add(pl); }
        const lb = mesh(new THREE.PlaneGeometry(0.8, 0.22), new THREE.MeshStandardMaterial({ map: labelTex(`${s < 0 ? 'A' : 'B'}-${String(i + 1).padStart(2, '0')}`, { border: '#c8963e' }) }), s < 0 ? 0.03 : -0.03, 3.4, z); lb.rotation.y = -s * Math.PI / 2; G.add(lb); }
    });
    // office at end
    const O = new THREE.Group(); O.position.set(0, 0, -62); scene.add(O);
    O.add(mesh(new THREE.BoxGeometry(26, 9, 10), panel(0x0e1b2c, 8, 3), 0, 4.5, 0)); O.add(mesh(new THREE.PlaneGeometry(22, 5), new THREE.MeshStandardMaterial({ map: windowsTex(14, 2, 0.6), emissive: 0xffffff, emissiveMap: windowsTex(14, 2, 0.6), emissiveIntensity: 1.2, roughness: 0.1, metalness: 0.5 }), 0, 4.2, 5.02, false));
    const s2 = buildSign('VAULTRA', 9, 1.9); s2.position.set(0, 10.4, 4); O.add(s2); const lm = logoMark(0.9); lm.position.set(-6.2, 10.4, 4); O.add(lm);
    const lane = mesh(new THREE.PlaneGeometry(0.15, 80), paint, 0, 0.012, -20); lane.rotation.x = -Math.PI / 2; scene.add(lane);
    for (let i = 0; i < 12; i++) { const d = mesh(new THREE.PlaneGeometry(0.15, 2), new THREE.MeshStandardMaterial({ color: C.brass, roughness: 0.6 }), 0, 0.013, 12 - i * 6); d.rotation.x = -Math.PI / 2; scene.add(d); }
    const tr = car(0xe8e8e8); tr.scale.set(1.2, 1.35, 1.15); tr.position.set(-3.4, 0, -6); tr.rotation.y = Math.PI / 2 + 0.05; scene.add(tr);
    const t1 = trolley(); t1.position.set(-5.4, 0, -2); t1.rotation.y = 1.2; scene.add(t1); const bs = boxStack(-5.6, -1.5, 3); scene.add(bs);
    for (let i = 0; i < 8; i++) { const t = tree(R(7, 10)); t.position.set(pick([-1, 1]) * R(16, 30), 0, R(-80, 10)); scene.add(t); }
    cam.position.set(1.2, 1.7, 22); cam.lookAt(-0.4, 3.2, -30);
  }
  return { scene, cam, post: { ao: v !== 'cg', aoRadius: 1.2, bloom: 0.55, bloomTh: 0.8, vig: 0.38, grain: 0.025, split: 0.25 } };
};

SCENES.lobby = (o) => {
  const v = o.variant ?? 'a'; seed = 77 + v.charCodeAt(0);
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0b121d); scene.environment = roomEnv; scene.environmentIntensity = 0.35;
  const Wd = 12, Dp = 10, Hh = 4;
  const fl = mesh(new THREE.PlaneGeometry(Wd, Dp), concrete('#b7b3aa', 3, 0.16), 0, 0, 0); fl.rotation.x = -Math.PI / 2; fl.castShadow = false; scene.add(fl);
  const backWall = mesh(new THREE.PlaneGeometry(Wd, Hh), new THREE.MeshStandardMaterial({ color: C.ink, roughness: 0.75 }), 0, Hh / 2, -Dp / 2); scene.add(backWall);
  // fluted wood side wall
  const sideL = new THREE.Group(); scene.add(sideL); for (let i = 0; i < 70; i++) { sideL.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, Hh, 10), M.woodL, -Wd / 2 + 0.06, Hh / 2, -Dp / 2 + 0.1 + i * 0.14)); }
  const sideR = mesh(new THREE.PlaneGeometry(Dp, Hh), corrMat(0xbfc5cc, 30), Wd / 2, Hh / 2, 0); sideR.rotation.y = -Math.PI / 2; scene.add(sideR);
  const ce = mesh(new THREE.PlaneGeometry(Wd, Dp), M.ceil, 0, Hh, 0); ce.rotation.x = Math.PI / 2; scene.add(ce);
  const sign = buildSign('VAULTRA', 4.2, 0.9); sign.position.set(0.6, 2.75, -Dp / 2 + 0.02); scene.add(sign); const lm = logoMark(0.45); lm.position.set(-2.2, 2.75, -Dp / 2 + 0.06); scene.add(lm);
  const sub = buildSign('SELF  STORAGE', 3.0, 0.4, { font: '600 140px "Segoe UI", Arial', fg: '#f6f3ec', glow: 0.9 }); sub.position.set(0.1, 2.08, -Dp / 2 + 0.02); scene.add(sub);
  // reception desk
  const desk = new THREE.Group(); desk.position.set(-0.5, 0, -2.2); scene.add(desk);
  desk.add(mesh(rbox(4.2, 1.05, 0.8, 0.04), M.ink, 0, 0.525, 0)); desk.add(mesh(rbox(4.4, 0.05, 0.95, 0.02), M.white, 0, 1.08, 0));
  for (let i = 0; i < 52; i++) desk.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.98, 10), M.brass, -2.05 + i * 0.08, 0.52, 0.42));
  desk.add(mesh(new THREE.BoxGeometry(4.1, 0.02, 0.02), M.ledWarm, 0, 0.04, 0.45, false));
  const mon = mesh(rbox(0.55, 0.34, 0.03, 0.01), new THREE.MeshStandardMaterial({ color: 0x0a0a0a, emissive: 0x2c5d8f, emissiveIntensity: 0.6 }), 0.9, 1.35, -0.1); mon.rotation.y = 0.4; desk.add(mon);
  desk.add(mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.2), M.steelDark, 0.9, 1.18, -0.12)); desk.add(plant(0.9).translateX(-1.7).translateY(1.1).translateZ(-0.15));
  // pendant lights
  for (let i = 0; i < 3; i++) { const x = -1.7 + i * 1.6; scene.add(mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.6), M.rubber, x, Hh - 0.3, -2.2, false)); scene.add(mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.25, 32, 1, true), M.brass, x, Hh - 0.72, -2.2)); { const _m = mesh(new THREE.CircleGeometry(0.17, 32), M.ledWarm, x, Hh - 0.84, -2.2, false); _m.rotation.x = Math.PI / 2; scene.add(_m); } const pl = new THREE.PointLight(0xffd6a0, 6, 6, 2); pl.position.set(x, Hh - 0.95, -2.2); pl.castShadow = i === 1; scene.add(pl); }
  // access gate on right
  const gate = new THREE.Group(); gate.position.set(3.8, 0, -1.5); scene.add(gate);
  const glassM = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transmission: 0.9, roughness: 0.05, thickness: 0.02, metalness: 0 });
  gate.add(mesh(rbox(0.28, 1.05, 1.2, 0.04), M.steelDark, 0, 0.525, 0)); gate.add(mesh(rbox(0.28, 1.05, 1.2, 0.04), M.steelDark, 1.3, 0.525, 0));
  gate.add(mesh(new THREE.BoxGeometry(0.02, 0.9, 0.7), glassM, 0.65, 0.95, 0)); gate.add(mesh(new THREE.BoxGeometry(0.22, 0.02, 0.18), new THREE.MeshStandardMaterial({ emissive: 0x31c48d, emissiveIntensity: 2 }), 0, 1.06, 0.35, false));
  const kp = mesh(rbox(0.14, 0.22, 0.04, 0.01), M.ink, -0.16, 1.25, 0.3); gate.add(kp); gate.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.25), M.steelDark, -0.16, 1.1, 0.3));
  // corridor glimpse through opening in right wall: doors
  for (let i = 0; i < 3; i++) { const d = mesh(new THREE.PlaneGeometry(1.6, 2.3), doorMat([C.ink2, C.brass, C.ink][i]), Wd / 2 - 0.02, 1.15, 1.2 + i * 1.8, false); d.rotation.y = -Math.PI / 2; scene.add(d); }
  // seating
  const s1 = sofa(1.6, 0x8a6a4a); s1.position.set(-4.4, 0, 1.6); s1.rotation.y = Math.PI / 2; scene.add(s1);
  scene.add(mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.04, 32), M.woodL, -3.3, 0.42, 1.6)); scene.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.4), M.ink, -3.3, 0.2, 1.6));
  const p2 = plant(1.6); p2.position.set(-5.3, 0, -4.2); scene.add(p2);
  const rug = mesh(new THREE.PlaneGeometry(3, 2.2), new THREE.MeshStandardMaterial({ color: 0x5b6b7d, roughness: 1 }), -3.8, 0.004, 1.6, false); rug.rotation.x = -Math.PI / 2; scene.add(rug);
  for (let i = 0; i < 4; i++) { const rl = new THREE.RectAreaLight(0xfff1e0, 6, 3, 0.12); rl.position.set(-3 + i * 2.2, Hh - 0.02, 1.5); rl.rotation.x = -Math.PI / 2; scene.add(rl); scene.add(mesh(new THREE.BoxGeometry(3, 0.03, 0.1), M.led, -3 + i * 2.2, Hh - 0.015, 1.5, false)); }
  const wash = new THREE.RectAreaLight(0xffe2b8, 4, Wd, 0.2); wash.position.set(0, Hh - 0.05, -Dp / 2 + 0.3); wash.lookAt(0, 0, -Dp / 2 + 0.6); scene.add(wash);
  const cam = new THREE.PerspectiveCamera(46, W / H, 0.05, 100);
  if (v === 'a') { cam.position.set(2.6, 1.55, 4.4); cam.lookAt(-0.6, 1.5, -3); } else { cam.position.set(-3.2, 1.5, 4.2); cam.lookAt(1.4, 1.4, -3); }
  floorReflect(scene, fl, new THREE.Vector3(0, -1.5, 0));
  return { scene, cam, post: { aoRadius: 0.35, bloom: 0.4, vig: 0.32, grain: 0.02 } };
};

SCENES.keypad = (o) => {
  seed = 555; const scene = new THREE.Scene(); scene.background = new THREE.Color(0x070d17); scene.fog = new THREE.FogExp2(0x070d17, 0.06); scene.environment = roomEnv; scene.environmentIntensity = 0.15;
  const cor = corridor({ pattern: [['closed', 'open', 'closed'], ['closed', 'closed', 'open']], palette: PAL.brand, bays: 16, startBay: -1, seedBase: 9, lightIntensity: 14 }); cor.position.x = 0.4; scene.add(cor);
  floorReflect(scene, cor.userData.floor, new THREE.Vector3(0, -1.5, -8));
  const pad = new THREE.Group(); pad.position.set(-1.12, 1.3, -1.0); pad.rotation.y = Math.PI / 2 - 0.05; scene.add(pad);
  pad.add(mesh(rbox(0.34, 0.5, 0.06, 0.02), M.steelDark, 0, 0, -0.03));
  pad.add(mesh(rbox(0.16, 0.25, 0.035, 0.012), M.ink, 0, -0.02, 0.01));
  const scr = mesh(new THREE.PlaneGeometry(0.11, 0.035), new THREE.MeshStandardMaterial({ map: labelTex('• • • • ', { bg: '#0a0f0a', fg: '#ddb065', font: '700 96px Consolas' }), emissive: 0xffffff, emissiveMap: labelTex('• • • • ', { bg: '#000', fg: '#c8963e', font: '700 96px Consolas' }), emissiveIntensity: 1.5 }), 0, 0.075, 0.029, false); pad.add(scr);
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];
  keys.forEach((k, i) => { const c = i % 3, r = Math.floor(i / 3); const t = labelTex(k, { bg: '#1e2a38', fg: '#f6f3ec', w: 128, h: 128, font: '600 80px "Segoe UI"' }); const em = labelTex(k, { bg: '#000', fg: i === 4 ? '#ddb065' : '#5a6878', w: 128, h: 128, font: '600 80px "Segoe UI"' }); const key = mesh(rbox(0.036, 0.03, 0.012, 0.004), [new THREE.MeshStandardMaterial({ color: 0x1e2a38 }), new THREE.MeshStandardMaterial({ color: 0x1e2a38 }), new THREE.MeshStandardMaterial({ color: 0x1e2a38 }), new THREE.MeshStandardMaterial({ color: 0x1e2a38 }), new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: em, emissiveIntensity: 1.6, roughness: 0.35 }), new THREE.MeshStandardMaterial({ color: 0x1e2a38 })], (c - 1) * 0.044, 0.025 - r * 0.038, 0.033, false); pad.add(key); });
  pad.add(mesh(new THREE.CircleGeometry(0.006, 16), new THREE.MeshStandardMaterial({ emissive: 0x31c48d, emissiveIntensity: 4 }), 0.06, 0.105, 0.028, false));
  const logo = mesh(new THREE.PlaneGeometry(0.12, 0.026), new THREE.MeshStandardMaterial({ map: labelTex('VAULTRA', { bg: '#3a4350', fg: '#ddb065', font: '800 84px "Segoe UI"' }) }), 0, -0.19, 0.001, false); pad.add(logo);
  const kl = new THREE.SpotLight(0xfff0dc, 3, 3, 0.4, 0.8, 2); kl.position.set(-0.6, 1.8, -0.6); kl.target = pad; scene.add(kl);
  const cam = new THREE.PerspectiveCamera(30, W / H, 0.02, 100); cam.position.set(-0.6, 1.34, -0.62); cam.lookAt(-1.12, 1.29, -1.08);
  return { scene, cam, post: { aoRadius: 0.05, bokeh: { focus: 0.62, aperture: 0.012, maxblur: 0.012 }, bloom: 0.5, vig: 0.4, grain: 0.02 } };
};

SCENES.moving = (o) => {
  seed = 321; const scene = new THREE.Scene(); scene.background = new THREE.Color(0x070d17); scene.fog = new THREE.FogExp2(0x070d17, 0.045); scene.environment = roomEnv; scene.environmentIntensity = 0.15;
  const cor = corridor({ pattern: [['open', 'closed', 'closed'], ['closed', 'open', 'closed']], palette: PAL.warm, bays: 18, startBay: -2, seedBase: 3, lightIntensity: 14, zone: 'C' }); scene.add(cor);
  floorReflect(scene, cor.userData.floor, new THREE.Vector3(0, -1.5, -6));
  const tr = trolley(); tr.position.set(-0.7, 0, -2.4); tr.rotation.y = 0.6; scene.add(tr); const st = boxStack(0, 0, 3); st.position.set(-0.7, 0.07, -2.33); st.rotation.y = 0.6; scene.add(st);
  scene.add(boxStack(-0.2, -1.6, 2)); scene.add(boxStack(0.25, -1.9, 1)); const sc = suitcase(0xc8963e); sc.position.set(0.3, 0, -1.3); sc.rotation.y = -0.4; scene.add(sc);
  const cam = new THREE.PerspectiveCamera(48, W / H, 0.05, 100); cam.position.set(0.9, 0.9, 1.8); cam.lookAt(-0.9, 1.1, -3.4);
  return { scene, cam, post: { aoRadius: 0.35, bloom: 0.45, vig: 0.4, grain: 0.025 } };
};

SCENES.business = (o) => {
  seed = 99; const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0b121d); scene.environment = roomEnv; scene.environmentIntensity = 0.3;
  const w = 5, d = 7, h = 3;
  const r = room(w, d, h, { intensity: 10 }); scene.add(r);
  [[-w / 2 + 0.35, -1.5, Math.PI / 2], [-w / 2 + 0.35, -4.2, Math.PI / 2], [w / 2 - 0.35, -1.5, -Math.PI / 2], [w / 2 - 0.35, -4.2, -Math.PI / 2]].forEach(([x, z, ry]) => { const s = shelving(2.5, 2.6, 0.6, 5, 0.95); s.position.set(x, 0, z); s.rotation.y = ry; r.add(s); });
  const s3 = shelving(3.0, 2.6, 0.6, 5, 0.9); s3.position.set(0, 0, -d + 0.4); r.add(s3);
  r.add(table().translateX(0.2).translateZ(-2.4)); const lap = mesh(rbox(0.34, 0.015, 0.24, 0.005), M.steelDark, 0.1, 0.77, -2.4); r.add(lap); const scr = mesh(rbox(0.34, 0.22, 0.01, 0.005), new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x2c5d8f, emissiveIntensity: 0.8 }), 0.1, 0.88, -2.52); scr.rotation.x = -0.25; r.add(scr);
  r.add(chair().translateX(0.2).translateZ(-1.8)); const tl = trolley(); tl.position.set(-0.9, 0, -1.1); tl.rotation.y = 0.5; r.add(tl); const bx = boxStack(-0.9, -1.05, 3); bx.rotation.y = 0.5; r.add(bx);
  const p = pallet(); p.position.set(1.0, 0, -0.9); r.add(p); r.add(boxStack(0.8, -1.05, 3)); r.add(boxStack(1.25, -0.75, 2));
  for (let i = 0; i < 6; i++) { const lb = mesh(new THREE.PlaneGeometry(0.12, 0.06), new THREE.MeshStandardMaterial({ color: 0xffffff }), 0, 0, 0, false); void lb; }
  const fl = mesh(new THREE.PlaneGeometry(20, 10), concrete('#8b9097', 3, 0.22), 0, 0, 5); fl.rotation.x = -Math.PI / 2; scene.add(fl);
  scene.add(mesh(new THREE.BoxGeometry(w + 0.6, 1.2, 0.12), corrMat(0xc5cad0, 6), 0, h + 0.6, 0.06)); scene.add(mesh(new THREE.PlaneGeometry(w, 0.25), doorMat(C.brass), 0, h - 0.125, 0.125, false));
  const cam = new THREE.PerspectiveCamera(50, W / H, 0.05, 100); cam.position.set(0.6, 1.6, 2.4); cam.lookAt(0, 1.2, -4);
  const sl = new THREE.SpotLight(0xfff2e0, 18, 15, 0.8, 0.6, 1.6); sl.position.set(0, 3.2, 2.5); sl.target.position.set(0, 0.5, -3); sl.castShadow = true; scene.add(sl, sl.target);
  return { scene, cam, post: { aoRadius: 0.3, bloom: 0.3, vig: 0.32, grain: 0.02 } };
};

/* ───────── driver API ───────── */
let cur = null, comp = null;
window.studio = {
  setup(name, opts = {}) {
    cur = SCENES[name](opts); cur.cam.aspect = W / H; cur.cam.updateProjectionMatrix();
    // Seamless loop for still scenes: the camera drifts on a closed periodic path, so frame N meets frame 0.
    if (!cur.update && opts.drift) {
      const cam = cur.cam; cam.updateMatrixWorld();
      const p0 = cam.position.clone(); const dir = new THREE.Vector3(); cam.getWorldDirection(dir);
      const tgt = p0.clone().addScaledVector(dir, opts.drift.dist ?? 6);
      const [ax, ay, az] = opts.drift.amp ?? [0.3, 0.05, 0.3];
      cur.update = (t) => {
        const a = t * Math.PI * 2;
        cam.position.set(p0.x + Math.sin(a) * ax, p0.y + Math.sin(a * 2) * ay, p0.z - (1 - Math.cos(a)) * 0.5 * az);
        cam.lookAt(tgt.x + Math.sin(a) * ax * (opts.drift.look ?? 0.35), tgt.y + Math.sin(a * 2) * ay * 0.5, tgt.z);
      };
    }
    comp = composerFor(cur.scene, cur.cam, cur.post); return true;
  },
  frame(t = 0, i = 0, fmt = 'image/png', q = 0.95) {
    if (cur.update) cur.update(t);
    comp.grade.uniforms.uTime.value = i * 0.37 + 0.1; comp.render();
    return renderer.domElement.toDataURL(fmt, q);
  },
};
window.studioReady = true;
