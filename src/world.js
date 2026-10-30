import * as THREE from 'three';
import { mulberry32, hash3, hashStr, createNoise2D, clamp } from './rng.js';
import { GeoBuilder, BASE, mat, makeHaloTexture } from './geo.js';
import { Whales } from './whales.js';

const _v = new THREE.Vector3();
const _c = new THREE.Color();

// The world is an endless grid of cells; each cell holds at most one floating island.
// Islands never cross their cell border, so collision only needs the player's own cell.
export const CELL = 72;
const VIEW = 4; // cells streamed around the player (fog hides the edge)
const TAU = Math.PI * 2;
const STEP = 0.6; // highest ledge the player walks up without jumping

const hex = (h) => new THREE.Color(h);
const pal = (arr) => arr.map(hex);

const SOIL = pal(['#a08494', '#927790', '#8a6f8c']);
const ROCK = pal(['#77709c', '#625b8a', '#6c6696', '#58517e']);
const DEEP = pal(['#4a4475', '#3f3a66', '#463f70']);
const STONE = pal(['#ddd7ec', '#cdc6e0', '#e8e3f2']);
export const GLOW = pal(['#8ff0ff', '#b49cff', '#ff9ce6', '#9cffd8']);

const BIOMES = {
  meadow: { w: 3, grass: pal(['#93d9a4', '#a9e4a8', '#80cda3']), leaf: pal(['#5fbf9f', '#77d1ad', '#4fae96']), trunk: hex('#8a6a5a'), tree: 'round', density: 1 },
  blossom: { w: 2, grass: pal(['#bfe8b4', '#d0efc2', '#b1e0ad']), leaf: pal(['#f7b6d2', '#f2a2c6', '#fbcde0']), trunk: hex('#7e5e6e'), tree: 'round', density: 0.9 },
  pine: { w: 2, grass: pal(['#7fd0b6', '#93dcc2', '#86d6bc']), leaf: pal(['#3f9a8c', '#4aa898', '#368a80']), trunk: hex('#6e5a50'), tree: 'pine', density: 1.3 },
  crystal: { w: 1.5, grass: pal(['#cbc4f2', '#bab1eb', '#d8d2f7']), leaf: pal(['#9ad8f0', '#b4e4f7']), trunk: hex('#6c6390'), tree: 'pine', density: 0.4, crystals: true },
  ruins: { w: 1.5, grass: pal(['#abdcc2', '#bfe6cd', '#a3d6bb']), leaf: pal(['#6cc3a5', '#8fd3b6']), trunk: hex('#7d6658'), tree: 'round', density: 0.5, ruins: true },
  autumn: { w: 1.5, grass: pal(['#e9dba3', '#f1e4b3', '#ddce95']), leaf: pal(['#f2b35e', '#eb9a52', '#f5c56f']), trunk: hex('#7a5a48'), tree: 'round', density: 1 },
};
const BIOME_KEYS = Object.keys(BIOMES);
const BIOME_TOTAL = BIOME_KEYS.reduce((s, k) => s + BIOMES[k].w, 0);

function pickBiome(rand) {
  let v = rand() * BIOME_TOTAL;
  for (const k of BIOME_KEYS) {
    v -= BIOMES[k].w;
    if (v <= 0) return k;
  }
  return 'meadow';
}

const NAME_A = ['霧', '星', '月', '風', '琉璃', '蒼', '螢', '銀', '幽', '澄', '雲', '夢', '晨', '暮', '靜', '鈴', '虹', '霜'];
const NAME_B = ['語', '光', '影', '歌', '羽', '息', '痕', '眠', '鏡', '燈', '紗', '潮'];
const NAME_C = {
  meadow: ['之島', '浮嶼', '草原', '之丘'],
  blossom: ['花苑', '之庭', '花嶼'],
  pine: ['松林', '之森', '浮嶼'],
  crystal: ['晶窟', '晶原', '聖所'],
  ruins: ['遺跡', '古城', '聖所'],
  autumn: ['楓原', '之丘', '金嶼'],
};

export const LORE = [
  '「在雲海之下，沉睡著第一座燈塔的影子。」',
  '「每一片碎片，都是一顆墜落的星留下的記憶。」',
  '「風會記得旅人走過的路。」',
  '「古人乘著上升氣流，越過了無盡的蒼穹。」',
  '「當所有祭壇被點亮，天空將再次歌唱。」',
  '「別害怕墜落，雲海總會把你送回來。」',
  '「晶石在夜裡低語，訴說著群島分離的那一天。」',
  '「我們曾經是同一片大地。」',
  '「點燈的人，從來不是獨自一人。」',
  '「沿著光柱前進，你會找到同伴。」',
  '「月亮升起時，浮島會輕輕地呼吸。」',
  '「遺跡上的文字寫著：向上，再向上。」',
  '「最古老的島嶼，漂浮在最遙遠的東方。」',
  '「旅人的歌聲，能讓沉睡的祭壇甦醒。」',
  '「星光碎片會呼應彼此，越靠近越明亮。」',
  '「天空沒有盡頭，旅程也是。」',
];

export class Island {
  edge(a) {
    return this.r * (0.9 + 0.06 * Math.sin(3 * a + this.p1) + 0.04 * Math.sin(5 * a + this.p2));
  }
  surf(x, z, t) {
    const n = this.noise(x * 0.07 + this.nOff, z * 0.07);
    return this.y + (1 - t * t * t * t) * this.hill * (0.6 + 0.4 * n);
  }
  // returns {t, d} when inside the footprint, null otherwise
  footprint(x, z) {
    const dx = x - this.x, dz = z - this.z;
    const d = Math.hypot(dx, dz);
    const R = this.edge(Math.atan2(dz, dx));
    return d > R ? null : d / R;
  }
  topAt(x, z) {
    const t = this.footprint(x, z);
    return t === null ? null : this.surf(x, z, t);
  }
}

// ---------- world ----------

export class World {
  constructor(scene, worldCode, state) {
    this.scene = scene;
    this.seed = hashStr(worldCode);
    this.noise = createNoise2D(mulberry32(this.seed));
    this.collected = state.collected; // Set of shard ids (shared by the room)
    this.lit = state.lit; // Set of altar ids (shared by the room)
    this.cache = new Map(); // cell key -> Island | null
    this.chunks = new Map(); // cell key -> built meshes
    this.queue = [];
    this.center = null;
    this.beacons = new Map();
    this.time = 0;

    this.terrainMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.glowBase = new THREE.Color(1, 1, 1);

    const halo = makeHaloTexture();
    this.shardGeo = new THREE.OctahedronGeometry(0.42, 0);
    this.shardMat = new THREE.MeshBasicMaterial({ color: '#fff1a8' });
    this.shardHaloMat = new THREE.SpriteMaterial({ map: halo, color: '#ffd76a', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    this.orbGeo = new THREE.IcosahedronGeometry(0.5, 1);
    this.orbOffMat = new THREE.MeshLambertMaterial({ color: '#6d6894', flatShading: true });
    this.orbOnMat = new THREE.MeshBasicMaterial({ color: '#fff0b8' });
    this.orbHaloMat = new THREE.SpriteMaterial({ map: halo, color: '#ffcf6a', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });

    this.updraftGeo = makeUpdraftGeometry();
    this.updraftMat = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, pr: { value: 1 }, color: { value: new THREE.Color('#e8fbff') } },
      vertexShader: UPDRAFT_VS,
      fragmentShader: UPDRAFT_FS,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.beaconGeo = new THREE.CylinderGeometry(1.4, 1.4, 700, 10, 1, true);
    this.beaconGeo.translate(0, 350, 0);
    this.beaconMat = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, color: { value: new THREE.Color('#ffd98a') } },
      vertexShader: BEACON_VS,
      fragmentShader: BEACON_FS,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: false,
    });

    for (const id of this.lit) this._addBeacon(id);
    this.whales = new Whales(this);
  }

  // ----- data -----

  data(cx, cz) {
    const key = cx + ',' + cz;
    let isl = this.cache.get(key);
    if (isl === undefined) {
      isl = this._gen(cx, cz);
      this.cache.set(key, isl);
    }
    return isl;
  }

  islandAt(x, z) {
    return this.data(Math.floor(x / CELL), Math.floor(z / CELL));
  }

  spawnPoint() {
    const isl = this.data(0, 0);
    const x = isl.x - 8, z = isl.z + 6;
    return new THREE.Vector3(x, isl.topAt(x, z) + 0.2, z);
  }

  _gen(cx, cz) {
    const rand = mulberry32(hash3(this.seed, cx, cz));
    const spawn = cx === 0 && cz === 0;
    if (!spawn && rand() > 0.7) return null;
    const big = spawn || rand() < 0.14;
    const r = spawn ? 28 : big ? 22 + rand() * 11 : 9 + rand() * 11;
    const jit = Math.max(0, CELL / 2 - r - 3);
    const isl = new Island();
    Object.assign(isl, {
      key: cx + ',' + cz,
      cx, cz, r,
      noise: this.noise,
      hash: hash3(this.seed, cx * 7 + 3, cz * 13 + 5),
      x: (cx + 0.5) * CELL + (rand() * 2 - 1) * jit,
      z: (cz + 0.5) * CELL + (rand() * 2 - 1) * jit,
      y: spawn ? 55 : clamp(50 + this.noise(cx * 0.17, cz * 0.17) * 26 + (rand() - 0.5) * 14, 16, 96),
      hill: r * (0.08 + rand() * 0.14),
      depth: r * (0.9 + rand() * 0.6),
      p1: rand() * TAU,
      p2: rand() * TAU,
      nOff: rand() * 100,
      biome: spawn ? 'meadow' : pickBiome(rand),
      decor: [],
      colliders: [],
      shards: [],
      altar: null,
      updraft: null,
    });
    const B = BIOMES[isl.biome];
    isl.name = spawn
      ? '啟程之島'
      : NAME_A[Math.floor(rand() * NAME_A.length)] + NAME_B[Math.floor(rand() * NAME_B.length)] + NAME_C[isl.biome][Math.floor(rand() * NAME_C[isl.biome].length)];

    const occ = [];
    const free = (x, z, rad) => occ.every((o) => (o.x - x) ** 2 + (o.z - z) ** 2 > (o.r + rad) ** 2);
    const place = (minT, maxT, rad, tries = 12) => {
      for (let i = 0; i < tries; i++) {
        const a = rand() * TAU;
        const t = minT + Math.sqrt(rand()) * (maxT - minT);
        const R = isl.edge(a);
        const x = isl.x + Math.cos(a) * R * t, z = isl.z + Math.sin(a) * R * t;
        if (free(x, z, rad)) {
          occ.push({ x, z, r: rad });
          return { x, z, y: isl.topAt(x, z) };
        }
      }
      return null;
    };
    const collider = (x, z, rad, bottom, top, stand) => isl.colliders.push({ x, z, rad, bottom, top, stand });

    // altar: the long-term goal of every island that has one
    if (spawn || (r >= 12 && rand() < 0.2)) {
      const a = rand() * TAU, off = spawn ? 0 : rand() * 0.3 * r;
      const ax = isl.x + Math.cos(a) * off, az = isl.z + Math.sin(a) * off;
      // A level stone plinth that steps down to the surrounding ground, adding tiers
      // until the lowest one is a single step above the terrain. Uphill it simply
      // disappears into the slope, so it never floats and never blocks the way.
      const ay = isl.topAt(ax, az);
      const top = ay + 0.45;
      const edgeRoom = Math.min(...Array.from({ length: 12 }, (_, k) => isl.edge((k / 12) * TAU))) - off - 0.6;
      const groundBelow = (rad) => {
        let lo = Infinity;
        for (let k = 0; k < 16; k++) {
          const sa = (k / 16) * TAU;
          lo = Math.min(lo, isl.topAt(ax + Math.cos(sa) * rad, az + Math.sin(sa) * rad) ?? isl.y);
        }
        return lo;
      };
      const tiers = [[5.6, 0]];
      while (tiers.length < 6) {
        const [rad, drop] = tiers[tiers.length - 1];
        if (top - drop - groundBelow(rad + 0.9) <= STEP - 0.05 || rad + 0.85 > edgeRoom) break;
        tiers.push([rad + 0.85, drop + 0.45]);
      }
      const outer = tiers[tiers.length - 1][0];
      const bottom = Math.min(groundBelow(outer), groundBelow(outer * 0.5), ay) - 1.2;
      occ.push({ x: ax, z: az, r: outer + 0.6 });
      isl.altar = { id: isl.key, x: ax, z: az, y: top, lore: isl.hash % LORE.length };
      isl.decor.push({ t: 'plinth', x: ax, z: az, top, bottom, tiers, rot: rand() * TAU });
      // collider radius is the octagon's inscribed circle, so you never stand on thin air
      for (const [rad, drop] of tiers) collider(ax, az, rad * 0.92, bottom, top - drop, true);
      isl.decor.push({ t: 'pedestal', x: ax, z: az, y: top });
      collider(ax, az, 1.25, top - 1, top + 1.25, true);
      const rot = rand() * TAU;
      for (let k = 0; k < 6; k++) {
        const sa = rot + (k / 6) * TAU;
        const sx = ax + Math.cos(sa) * 4.1, sz = az + Math.sin(sa) * 4.1;
        const h = 2 + rand() * 1.4;
        isl.decor.push({ t: 'stone', x: sx, z: sz, y: top, h, rot: -sa });
        collider(sx, sz, 0.55, top - 1, top + h, true);
      }
    }

    if (B.ruins) {
      const n = 3 + Math.floor(rand() * 4);
      for (let i = 0; i < n; i++) {
        const p = place(0.1, 0.85, 1.3);
        if (!p) continue;
        const h = 2 + rand() * 4.5;
        const broken = rand() < 0.45;
        isl.decor.push({ t: 'column', ...p, h, broken, tilt: broken ? (rand() - 0.5) * 0.25 : 0 });
        collider(p.x, p.z, 0.65, p.y - 1, p.y + h, true);
      }
    }

    const nTrees = Math.round(r * r * 0.022 * B.density);
    for (let i = 0; i < nTrees; i++) {
      const p = place(0.08, 0.88, 1.6);
      if (!p) continue;
      const s = 0.8 + rand() * 0.7;
      isl.decor.push({ t: 'tree', ...p, s, kind: rand() < 0.15 ? (B.tree === 'pine' ? 'round' : 'pine') : B.tree, leaf: Math.floor(rand() * B.leaf.length), rot: rand() * TAU });
      collider(p.x, p.z, 0.4 * s, p.y - 1, p.y + 8, false);
    }

    const nRocks = Math.round(r * 0.22);
    for (let i = 0; i < nRocks; i++) {
      const p = place(0.2, 0.95, 1.2);
      if (!p) continue;
      const s = 0.5 + rand() * 1.1;
      isl.decor.push({ t: 'rock', ...p, s, rot: rand() * TAU });
      collider(p.x, p.z, s * 0.85, p.y - 1, p.y + s * 0.75, true);
    }

    if (B.crystals) {
      const n = Math.round(r * 0.3);
      for (let i = 0; i < n; i++) {
        const p = place(0.1, 0.9, 1.1);
        if (!p) continue;
        const s = 0.7 + rand() * 0.9;
        isl.decor.push({ t: 'crystal', ...p, s, c: Math.floor(rand() * GLOW.length), rot: rand() * TAU });
        collider(p.x, p.z, 0.55 * s, p.y - 1, p.y + 6, false);
      }
    }

    const nTufts = Math.round(r * 0.9);
    for (let i = 0; i < nTufts; i++) {
      const p = place(0.05, 0.92, 0.3, 4);
      if (p) isl.decor.push({ t: 'tuft', ...p, rot: rand() * TAU, flower: rand() < 0.3 });
    }

    if (B.crystals || rand() < 0.55) {
      const n = 2 + Math.floor(rand() * 4);
      for (let i = 0; i < n; i++) {
        const a = rand() * TAU, d = rand() * 0.35 * r;
        const hx = isl.x + Math.cos(a) * d, hz = isl.z + Math.sin(a) * d;
        const t = d / isl.edge(a);
        isl.decor.push({ t: 'hang', x: hx, z: hz, y: isl.y - isl.depth * (1 - t) * 0.9, s: 0.8 + rand() * 1.2, c: Math.floor(rand() * GLOW.length), rot: rand() * TAU });
      }
    }

    const nShards = spawn ? 3 : (rand() < 0.75 ? 1 : 0) + (rand() < 0.45 ? 1 : 0) + (B.crystals ? 1 : 0);
    for (let i = 0; i < nShards; i++) {
      const p = place(0.1, 0.85, 1);
      if (p) isl.shards.push({ id: isl.key + ':' + i, x: p.x, z: p.z, y: p.y + 1.3 });
    }

    if (spawn || rand() < 0.5) {
      const a = spawn ? 0.6 : rand() * TAU;
      const R = isl.edge(a) + 5;
      isl.updraft = { x: isl.x + Math.cos(a) * R, z: isl.z + Math.sin(a) * R, rad: 3.4, bottom: isl.y - 60, top: isl.y + 38 };
    }
    return isl;
  }

  // ----- meshes -----

  _build(isl) {
    const rand = mulberry32(isl.hash ^ 0x9e3779b9);
    const B = BIOMES[isl.biome];
    const terr = new GeoBuilder(rand);
    const glow = new GeoBuilder(rand);
    const pick = (arr) => arr[Math.floor(rand() * arr.length)];

    const rings = clamp(Math.round(isl.r / 3), 4, 10);
    const segs = clamp(Math.round(isl.r * 1.2), 14, 36);
    const center = new THREE.Vector3(isl.x, isl.surf(isl.x, isl.z, 0), isl.z);
    const grid = [];
    for (let i = 1; i <= rings; i++) {
      const row = [];
      const frac = i / rings;
      for (let j = 0; j < segs; j++) {
        const a = (j / segs) * TAU;
        const R = isl.edge(a);
        let x = isl.x + Math.cos(a) * R * frac;
        let z = isl.z + Math.sin(a) * R * frac;
        if (i < rings) {
          x += (rand() - 0.5) * (R / rings) * 0.5;
          z += (rand() - 0.5) * (R / rings) * 0.5;
        }
        const t = i === rings ? 1 : Math.min(0.99, Math.hypot(x - isl.x, z - isl.z) / R);
        row.push(new THREE.Vector3(x, isl.surf(x, z, t), z));
      }
      grid.push(row);
    }
    const grassBase = B.grass;
    const topColor = (y, edge) => {
      const c = _c.copy(grassBase[Math.floor(rand() * grassBase.length)]);
      c.offsetHSL(0, 0, (y - isl.y) / Math.max(1, isl.hill) * 0.05 - (edge ? 0.03 : 0));
      return c.clone();
    };
    for (let j = 0; j < segs; j++) {
      const j1 = (j + 1) % segs;
      const a = grid[0][j], b = grid[0][j1];
      terr.tri(center, b, a, topColor((a.y + b.y + center.y) / 3, false), 0.03);
    }
    for (let i = 0; i < rings - 1; i++) {
      for (let j = 0; j < segs; j++) {
        const j1 = (j + 1) % segs;
        const in0 = grid[i][j], in1 = grid[i][j1], out0 = grid[i + 1][j], out1 = grid[i + 1][j1];
        const edge = i === rings - 2;
        terr.tri(in0, out1, out0, topColor((in0.y + out0.y) / 2, edge), 0.03);
        terr.tri(in0, in1, out1, topColor((in1.y + out1.y) / 2, edge), 0.03);
      }
    }

    // underside: an inverted rocky cone
    const layers = [grid[rings - 1]];
    const L = 4;
    for (let k = 1; k < L; k++) {
      const f = k / L;
      const row = [];
      for (let j = 0; j < segs; j++) {
        const a = (j / segs) * TAU + (rand() - 0.5) * 0.1;
        const R = isl.edge(a) * Math.pow(1 - f, 0.75) * (0.88 + rand() * 0.2);
        row.push(new THREE.Vector3(isl.x + Math.cos(a) * R, isl.y - isl.depth * Math.pow(f, 1.1) + (rand() - 0.5) * 1.5, isl.z + Math.sin(a) * R));
      }
      layers.push(row);
    }
    const tip = new THREE.Vector3(isl.x + (rand() - 0.5) * 3, isl.y - isl.depth, isl.z + (rand() - 0.5) * 3);
    const layerColor = (k) => (k === 0 ? pick(SOIL) : k < 2 ? pick(ROCK) : pick(DEEP));
    for (let k = 0; k < L - 1; k++) {
      for (let j = 0; j < segs; j++) {
        const j1 = (j + 1) % segs;
        const up0 = layers[k][j], up1 = layers[k][j1], lo0 = layers[k + 1][j], lo1 = layers[k + 1][j1];
        terr.tri(up0, up1, lo1, layerColor(k), 0.05);
        terr.tri(up0, lo1, lo0, layerColor(k), 0.05);
      }
    }
    for (let j = 0; j < segs; j++) {
      const j1 = (j + 1) % segs;
      terr.tri(layers[L - 1][j], layers[L - 1][j1], tip, pick(DEEP), 0.04);
    }

    for (const d of isl.decor) {
      switch (d.t) {
        case 'tree': {
          const s = d.s;
          terr.add(BASE.cyl5, mat(d.x, d.y + 0.7 * s, d.z, 0.2 * s, 1.6 * s, 0.2 * s), B.trunk);
          const leaf = B.leaf[d.leaf];
          if (d.kind === 'pine') {
            terr.add(BASE.cone6, mat(d.x, d.y + 1.7 * s, d.z, 1.45 * s, 1.7 * s, 1.45 * s, 0, d.rot), leaf);
            terr.add(BASE.cone6, mat(d.x, d.y + 2.6 * s, d.z, 1.1 * s, 1.5 * s, 1.1 * s, 0, d.rot + 0.5), leaf);
            terr.add(BASE.cone6, mat(d.x, d.y + 3.4 * s, d.z, 0.7 * s, 1.3 * s, 0.7 * s, 0, d.rot + 1), leaf);
          } else {
            terr.add(BASE.ico, mat(d.x, d.y + 2.2 * s, d.z, 1.35 * s, 1.15 * s, 1.35 * s, 0, d.rot), leaf);
            terr.add(BASE.ico, mat(d.x + 0.6 * s, d.y + 2.9 * s, d.z - 0.3 * s, 0.8 * s, 0.75 * s, 0.8 * s, 0.4, d.rot), leaf);
          }
          break;
        }
        case 'rock':
          terr.add(BASE.dodec, mat(d.x, d.y + 0.2 * d.s, d.z, d.s, 0.7 * d.s, 0.9 * d.s, 0, d.rot), pick(ROCK));
          break;
        case 'tuft': {
          const c = d.flower ? GLOW[Math.floor(rand() * GLOW.length)] : B.grass[0];
          for (let k = 0; k < 3; k++) {
            const a = d.rot + k * 2.1;
            terr.add(BASE.cone5, mat(d.x + Math.cos(a) * 0.18, d.y + 0.22, d.z + Math.sin(a) * 0.18, 0.12, 0.5, 0.12, Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3), _c.copy(c).offsetHSL(0, 0, d.flower ? 0.05 : -0.06).clone());
          }
          break;
        }
        case 'stone':
          terr.add(BASE.box, mat(d.x, d.y + d.h / 2 - 0.3, d.z, 0.85, d.h, 0.55, 0, d.rot), pick(STONE));
          terr.add(BASE.octa, mat(d.x, d.y + d.h + 0.1, d.z, 0.18, 0.3, 0.18), GLOW[1]);
          break;
        case 'pedestal':
          terr.add(BASE.cyl6, mat(d.x, d.y + 0.5, d.z, 1.0, 1.0, 1.0), pick(STONE));
          terr.add(BASE.cyl6, mat(d.x, d.y + 1.1, d.z, 1.25, 0.25, 1.25, 0, 0.5), pick(STONE));
          break;
        case 'plinth':
          d.tiers.forEach(([rad, drop], k) => {
            const h = d.top - drop - d.bottom;
            const shade = _c.copy(STONE[1]).offsetHSL(0, 0, -0.06 - k * 0.05).clone();
            terr.add(BASE.cyl8, mat(d.x, d.bottom + h / 2, d.z, rad, h, rad, 0, d.rot), shade, 0.03);
          });
          for (let k = 0; k < 8; k++) {
            const a = d.rot + (k / 8) * TAU + TAU / 16;
            glow.add(BASE.octa, mat(d.x + Math.cos(a) * 5.0, d.top + 0.05, d.z + Math.sin(a) * 5.0, 0.16, 0.12, 0.16), GLOW[0], 0);
          }
          break;
        case 'column': {
          const top = d.y + d.h;
          terr.add(BASE.box, mat(d.x, d.y + 0.15, d.z, 1.4, 0.4, 1.4), pick(STONE));
          terr.add(BASE.cyl6, mat(d.x, d.y + d.h / 2, d.z, 0.6, d.h, 0.6, d.tilt, 0, d.tilt), pick(STONE));
          if (!d.broken) terr.add(BASE.box, mat(d.x, top + 0.15, d.z, 1.5, 0.35, 1.5), pick(STONE));
          break;
        }
        case 'crystal':
          for (let k = 0; k < 3; k++) {
            const a = d.rot + k * 2.2, s = d.s * (k === 0 ? 1 : 0.6);
            glow.add(BASE.octa, mat(d.x + Math.cos(a) * 0.4 * (k > 0), d.y + 0.9 * s, d.z + Math.sin(a) * 0.4 * (k > 0), 0.35 * s, 1.4 * s, 0.35 * s, Math.cos(a) * 0.35 * (k > 0), 0, Math.sin(a) * 0.35 * (k > 0)), GLOW[(d.c + k) % GLOW.length], 0.08);
          }
          break;
        case 'hang':
          glow.add(BASE.octa, mat(d.x, d.y - 0.8 * d.s, d.z, 0.4 * d.s, 1.6 * d.s, 0.4 * d.s, 0, d.rot), GLOW[d.c], 0.08);
          break;
      }
    }

    const group = new THREE.Group();
    const tg = terr.build();
    const terrain = new THREE.Mesh(tg, this.terrainMat);
    group.add(terrain);
    let glowMesh = null;
    const gg = glow.build();
    if (gg) {
      glowMesh = new THREE.Mesh(gg, this.glowMat);
      group.add(glowMesh);
    }

    const shardMeshes = new Map();
    for (const s of isl.shards) {
      if (this.collected.has(s.id)) continue;
      const m = new THREE.Mesh(this.shardGeo, this.shardMat);
      m.position.set(s.x, s.y, s.z);
      const h = new THREE.Sprite(this.shardHaloMat);
      h.scale.setScalar(2.6);
      m.add(h);
      m.userData.phase = rand() * TAU;
      group.add(m);
      shardMeshes.set(s.id, m);
    }

    let orb = null;
    if (isl.altar) {
      const a = isl.altar;
      orb = new THREE.Mesh(this.orbGeo, this.orbOffMat);
      orb.position.set(a.x, a.y + 2.2, a.z);
      const h = new THREE.Sprite(this.orbHaloMat);
      h.scale.setScalar(5);
      h.visible = false;
      orb.add(h);
      orb.userData.halo = h;
      group.add(orb);
      if (this.lit.has(a.id)) this._setOrbLit(orb);
    }

    if (isl.updraft) {
      const u = isl.updraft;
      const pts = new THREE.Points(this.updraftGeo, this.updraftMat);
      pts.position.set(u.x, u.bottom, u.z);
      pts.scale.set(u.rad, u.top - u.bottom, u.rad);
      pts.frustumCulled = false;
      group.add(pts);
    }

    this.scene.add(group);
    return { group, terrain, glowMesh, shardMeshes, orb };
  }

  _setOrbLit(orb) {
    orb.material = this.orbOnMat;
    orb.userData.halo.visible = true;
  }

  _dispose(chunk) {
    this.scene.remove(chunk.group);
    chunk.terrain.geometry.dispose();
    if (chunk.glowMesh) chunk.glowMesh.geometry.dispose();
  }

  _addBeacon(id) {
    if (this.beacons.has(id)) return;
    const [cx, cz] = id.split(',').map(Number);
    const isl = this.data(cx, cz);
    if (!isl || !isl.altar) return;
    const m = new THREE.Mesh(this.beaconGeo, this.beaconMat);
    m.position.set(isl.altar.x, isl.altar.y + 2.5, isl.altar.z);
    m.frustumCulled = false;
    m.renderOrder = 5;
    this.scene.add(m);
    this.beacons.set(id, m);
  }

  // ----- streaming + animation -----

  update(dt, pos, pixelRatio) {
    this.time += dt;
    const cx = Math.floor(pos.x / CELL), cz = Math.floor(pos.z / CELL);
    const ck = cx + ',' + cz;
    if (ck !== this.center) {
      this.center = ck;
      const want = new Set();
      const list = [];
      for (let dz = -VIEW; dz <= VIEW; dz++) {
        for (let dx = -VIEW; dx <= VIEW; dx++) {
          if (dx * dx + dz * dz > VIEW * VIEW + 1) continue;
          const key = cx + dx + ',' + (cz + dz);
          want.add(key);
          if (!this.chunks.has(key)) list.push({ key, cx: cx + dx, cz: cz + dz, d: dx * dx + dz * dz });
        }
      }
      for (const [key, chunk] of this.chunks) {
        if (!want.has(key)) {
          if (chunk) this._dispose(chunk);
          this.chunks.delete(key);
        }
      }
      list.sort((a, b) => a.d - b.d);
      this.queue = list;
      // the player's own cell must exist before physics runs
      if (list.length && list[0].d === 0) this._buildNext();
    }
    const t0 = performance.now();
    while (this.queue.length && performance.now() - t0 < 5) this._buildNext();

    const t = this.time;
    for (const chunk of this.chunks.values()) {
      if (!chunk) continue;
      for (const m of chunk.shardMeshes.values()) {
        m.rotation.y = t * 1.6 + m.userData.phase;
        m.position.y += Math.sin(t * 2 + m.userData.phase) * 0.004;
      }
      if (chunk.orb) chunk.orb.rotation.y = t * 0.5;
    }
    this.updraftMat.uniforms.time.value = t;
    this.updraftMat.uniforms.pr.value = pixelRatio;
    this.beaconMat.uniforms.time.value = t;
    this.whales.update(pos);
  }

  _buildNext() {
    const job = this.queue.shift();
    if (!job || this.chunks.has(job.key)) return;
    const isl = this.data(job.cx, job.cz);
    this.chunks.set(job.key, isl ? this._build(isl) : null);
  }

  setNight(night) {
    // crystals glow brighter at night
    this.glowMat.color.setScalar(0.75 + night * 0.25);
  }

  // ----- physics queries -----

  terrainNear(x, z) {
    const isl = this.islandAt(x, z);
    const chunk = isl && this.chunks.get(isl.key);
    return chunk ? chunk.terrain : null;
  }

  groundAt(x, z, y) {
    const isl = this.islandAt(x, z);
    if (!isl) return null;
    let g = isl.topAt(x, z);
    for (const c of isl.colliders) {
      if (!c.stand) continue;
      if ((x - c.x) ** 2 + (z - c.z) ** 2 < c.rad * c.rad && c.top <= y + 0.7 && (g === null || c.top > g)) g = c.top;
    }
    return g;
  }

  // like groundAt, but also knows about moving platforms (whale backs)
  groundInfo(x, z, y) {
    const g = this.groundAt(x, z, y);
    const w = this.whales.groundAt(x, z, y);
    if (w && (g === null || w.y > g)) return { y: w.y, platform: w.whale };
    return g === null ? null : { y: g, platform: null };
  }

  // bottom of the island's rocky cone above (x, z), used as a ceiling
  undersideAt(x, z) {
    const isl = this.islandAt(x, z);
    if (!isl) return null;
    const t = isl.footprint(x, z);
    if (t === null) return null;
    return { under: isl.y - isl.depth * (1 - t) * 0.9, top: isl.y };
  }

  pushOut(pos, radius, height) {
    const isl = this.islandAt(pos.x, pos.z);
    if (!isl) return;
    for (const c of isl.colliders) {
      // anything standable lower than a step can be walked onto instead of blocking
      if (pos.y >= c.top - (c.stand ? STEP : 0.1) || pos.y + height <= c.bottom) continue;
      const dx = pos.x - c.x, dz = pos.z - c.z;
      const min = c.rad + radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        pos.x = c.x + (dx / d) * min;
        pos.z = c.z + (dz / d) * min;
      }
    }
  }

  updraftAt(x, y, z) {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    let best = 0;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const isl = this.data(cx + dx, cz + dz);
        const u = isl && isl.updraft;
        if (!u || y < u.bottom || y > u.top) continue;
        const d = Math.hypot(x - u.x, z - u.z);
        const reach = u.rad + 1.5;
        if (d > reach) continue;
        const s = Math.min(1, (reach - d) / 1.5) * Math.min(1, (u.top - y) / 8);
        if (s > best) best = s;
      }
    }
    return Math.max(best, this.whales.updraftAt(x, y, z));
  }

  shardsNear(pos, radius) {
    const out = this.whales.shardsNear(pos, radius);
    const isl = this.islandAt(pos.x, pos.z);
    if (!isl) return out;
    const chunk = this.chunks.get(isl.key);
    if (!chunk) return out;
    for (const [id, m] of chunk.shardMeshes) {
      if (m.position.distanceToSquared(_v.set(pos.x, pos.y + 0.9, pos.z)) < radius * radius) out.push(id);
    }
    return out;
  }

  altarNear(pos) {
    const isl = this.islandAt(pos.x, pos.z);
    const a = isl && isl.altar;
    if (!a) return null;
    if (Math.hypot(pos.x - a.x, pos.z - a.z) < 3.6 && Math.abs(pos.y - a.y) < 3.5) return a;
    return null;
  }

  removeShard(id) {
    this.collected.add(id);
    if (id.startsWith('whale:')) return this.whales.removeShard(id);
    const key = id.split(':')[0];
    const chunk = this.chunks.get(key);
    const m = chunk && chunk.shardMeshes.get(id);
    if (m) {
      chunk.group.remove(m);
      chunk.shardMeshes.delete(id);
    }
  }

  altarList() {
    return [...this.lit].map((id) => {
      const [cx, cz] = id.split(',').map(Number);
      const isl = this.data(cx, cz);
      return isl && isl.altar ? { id, name: isl.name, altar: isl.altar } : null;
    }).filter(Boolean);
  }

  lightAltar(id) {
    this.lit.add(id);
    const chunk = this.chunks.get(id);
    if (chunk && chunk.orb) this._setOrbLit(chunk.orb);
    this._addBeacon(id);
  }
}

// ---------- shaders ----------

function makeUpdraftGeometry() {
  const n = 150;
  const pos = new Float32Array(n * 3);
  const seed = new Float32Array(n);
  const rand = mulberry32(1234);
  for (let i = 0; i < n; i++) {
    const a = rand() * TAU, r = Math.sqrt(rand());
    pos[i * 3] = Math.cos(a) * r;
    pos[i * 3 + 1] = rand();
    pos[i * 3 + 2] = Math.sin(a) * r;
    seed[i] = rand();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  return g;
}

const UPDRAFT_VS = /* glsl */ `
attribute float seed;
uniform float time;
uniform float pr;
varying float vA;
void main() {
  vec3 p = position;
  float y = fract(p.y + time * 0.06 * (0.7 + seed * 0.6));
  float r = length(p.xz);
  float ang = atan(p.z, p.x) + time * (0.8 + seed) ;
  p = vec3(cos(ang) * r, y, sin(ang) * r);
  vA = smoothstep(0.0, 0.08, y) * smoothstep(1.0, 0.85, y);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = (2.0 + seed * 3.5) * pr * (60.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

const UPDRAFT_FS = /* glsl */ `
uniform vec3 color;
varying float vA;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d) * vA * 0.8;
  gl_FragColor = vec4(color * a, a);
  #include <colorspace_fragment>
}`;

const BEACON_VS = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const BEACON_FS = /* glsl */ `
uniform float time;
uniform vec3 color;
varying vec2 vUv;
void main() {
  float fade = pow(1.0 - vUv.y, 2.0);
  float ripple = 0.75 + 0.25 * sin(vUv.y * 120.0 - time * 3.0);
  float a = fade * ripple * 0.38;
  gl_FragColor = vec4(color * a, a);
  #include <colorspace_fragment>
}`;
