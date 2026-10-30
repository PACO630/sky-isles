import * as THREE from 'three';
import { mulberry32, hash3 } from './rng.js';
import { GeoBuilder, BASE, mat } from './geo.js';

// Sky whales drift in slow circles high above the islands. Their position is a pure
// function of the wall clock, so every player sees the same whale in the same place
// without any network traffic. Players can ride the updraft under a whale's belly and
// stand on the little garden growing on its back.

const REGION = 72 * 6; // six island cells
const TAU = Math.PI * 2;
const BACK_W = 2.2; // half-width of the walkable back, local units
const BACK_L = 3.6; // half-length
const BACK_H = 2.3; // height of the back above the whale's centre

const C = (h) => new THREE.Color(h);
const TOP = C('#7e8cd6');
const MID = C('#a7b3ec');
const BELLY = C('#eceeff');
const MOSS = [C('#8fd6aa'), C('#a3e0b4'), C('#7fcca2')];
const LEAF = [C('#f7b6d2'), C('#7ad3b0')];
const SPOT = [C('#8ff0ff'), C('#b49cff'), C('#9cffd8')];
const NAME_A = ['澄', '霧', '星', '月', '蒼', '鈴', '晨', '暮', '銀', '虹', '靜', '螢'];
const NAME_B = ['歌', '眠', '語', '羽', '潮', '光', '息', '夢'];

export const whaleTime = () => Date.now() / 1000 - 1.7e9;

class Whale {
  constructor(def, world) {
    this.def = def;
    this.key = def.key;
    this.name = def.name;
    this.shardId = 'whale:' + def.key;
    this.s = def.scale;
    this.x = 0; this.y = 0; this.z = 0; this.yaw = 0;

    const rand = mulberry32(def.hash);
    const body = new GeoBuilder(rand);
    const glow = new GeoBuilder(rand);
    const tailB = new GeoBuilder(rand);
    const sphere = new THREE.SphereGeometry(1, 12, 8).toNonIndexed();
    body.add(sphere, mat(0, 0, 0, 2.6, 2.1, 7), (c) => (c.y > 1.0 ? TOP : c.y > -0.7 ? MID : BELLY), 0.04);
    // fins
    for (const sx of [-1, 1]) {
      body.add(BASE.box, mat(sx * 2.9, -0.7, 1.8, 2.6, 0.22, 1.5, 0, sx * 0.35, sx * -0.35), MID);
      glow.add(BASE.octa, mat(sx * 1.55, 0.25, 5.1, 0.18, 0.22, 0.12), C('#2a2450'), 0);
      for (let k = 0; k < 5; k++) {
        const z = -4 + k * 1.9;
        const r = 2.6 * Math.sqrt(Math.max(0, 1 - (z / 7) ** 2));
        glow.add(BASE.octa, mat(sx * r * 0.97, 0.5, z, 0.12, 0.22, 0.22), SPOT[(k + (sx > 0 ? 1 : 0)) % SPOT.length], 0.05);
      }
    }
    // little garden on the back
    body.add(BASE.cyl6, mat(0, 2.0, 0, BACK_W + 0.1, 0.55, BACK_L + 0.2), MOSS[0], 0.06);
    body.add(BASE.cyl5, mat(0.7, 2.9, -1.4, 0.13, 1.3, 0.13), C('#7e5e6e'));
    body.add(BASE.ico, mat(0.7, 3.7, -1.4, 0.85, 0.75, 0.85, 0, rand() * TAU), LEAF[def.hash % 2]);
    for (let k = 0; k < 7; k++) {
      const a = rand() * TAU, d = Math.sqrt(rand());
      body.add(BASE.cone5, mat(Math.cos(a) * d * 1.8, 2.45, Math.sin(a) * d * 3, 0.1, 0.4, 0.1), MOSS[k % 3], 0.08);
    }
    glow.add(BASE.octa, mat(-0.9, 2.55, 1.6, 0.12, 0.25, 0.12), SPOT[0]);
    glow.add(BASE.octa, mat(-1.2, 2.5, 1.1, 0.1, 0.2, 0.1), SPOT[1]);
    // tail, built around its own pivot so it can sway
    tailB.add(BASE.cone6, mat(0, 0, -1.6, 1.3, 3.6, 0.9, -Math.PI / 2), MID);
    tailB.add(BASE.box, mat(1.4, 0, -3.3, 2.8, 0.2, 1.2, 0, -0.45), TOP);
    tailB.add(BASE.box, mat(-1.4, 0, -3.3, 2.8, 0.2, 1.2, 0, 0.45), TOP);

    this.group = new THREE.Group();
    this.group.add(new THREE.Mesh(body.build(), world.terrainMat));
    this.group.add(new THREE.Mesh(glow.build(), world.glowMat));
    this.tail = new THREE.Mesh(tailB.build(), world.terrainMat);
    this.tail.position.set(0, 0.1, -6.4);
    this.group.add(this.tail);
    this.group.scale.setScalar(this.s);
    this.geos = [this.group.children[0].geometry, this.group.children[1].geometry, this.tail.geometry];

    // updraft column below the belly, unscaled
    this.draft = new THREE.Points(world.updraftGeo, world.updraftMat);
    this.draft.scale.set(4.5, 75, 4.5);
    this.draft.frustumCulled = false;

    this.shard = null;
    if (!world.collected.has(this.shardId)) {
      this.shard = new THREE.Mesh(world.shardGeo, world.shardMat);
      this.shard.position.set(-0.6, 3.5, 1.2);
      const h = new THREE.Sprite(world.shardHaloMat);
      h.scale.setScalar(2.6);
      this.shard.add(h);
      this.group.add(this.shard);
    }
  }

  setTime(t) {
    const d = this.def;
    const th = d.th0 + d.w * t;
    const dir = Math.sign(d.w);
    this.x = d.cx + Math.cos(th) * d.R;
    this.z = d.cz + Math.sin(th) * d.R;
    this.yaw = Math.atan2(-Math.sin(th) * dir, Math.cos(th) * dir);
    this.y = d.y + Math.sin(t * 0.35 + d.th0) * 1.2;
    this.group.position.set(this.x, this.y, this.z);
    this.group.rotation.y = this.yaw;
    this.tail.rotation.x = Math.sin(t * 1.1 + d.th0) * 0.22;
    this.draft.position.set(this.x, this.y - 75, this.z);
    if (this.shard) this.shard.rotation.y = t * 1.6;
  }

  toLocal(p, out) {
    const dx = p.x - this.x, dz = p.z - this.z;
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    return out.set((dx * c - dz * s) / this.s, (p.y - this.y) / this.s, (dx * s + dz * c) / this.s);
  }

  toWorld(l, out) {
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    return out.set((l.x * c + l.z * s) * this.s + this.x, l.y * this.s + this.y, (-l.x * s + l.z * c) * this.s + this.z);
  }

  backTop() {
    return this.y + BACK_H * this.s;
  }
}

const _l = new THREE.Vector3();
const _w = new THREE.Vector3();

export class Whales {
  constructor(world) {
    this.world = world;
    this.active = new Map();
    this.center = null;
  }

  _def(rx, rz) {
    const h = hash3(this.world.seed ^ 0x5bd1e995, rx, rz);
    const rand = mulberry32(h);
    if (rand() > 0.75) return null;
    const R = 90 + rand() * 90;
    return {
      key: rx + ',' + rz,
      hash: h,
      cx: (rx + 0.5) * REGION,
      cz: (rz + 0.5) * REGION,
      R,
      y: 112 + rand() * 16,
      w: (rand() < 0.5 ? -1 : 1) * (4.5 / R),
      th0: rand() * TAU,
      scale: 1 + rand() * 0.45,
      name: '雲鯨「' + NAME_A[Math.floor(rand() * NAME_A.length)] + NAME_B[Math.floor(rand() * NAME_B.length)] + '」',
    };
  }

  update(pos) {
    const rx = Math.floor(pos.x / REGION), rz = Math.floor(pos.z / REGION);
    const key = rx + ',' + rz;
    if (key !== this.center) {
      this.center = key;
      const want = new Set();
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const k = rx + dx + ',' + (rz + dz);
          want.add(k);
          if (this.active.has(k)) continue;
          const def = this._def(rx + dx, rz + dz);
          if (!def) {
            this.active.set(k, null);
            continue;
          }
          const w = new Whale(def, this.world);
          this.world.scene.add(w.group, w.draft);
          this.active.set(k, w);
        }
      }
      for (const [k, w] of this.active) {
        if (want.has(k)) continue;
        if (w) {
          this.world.scene.remove(w.group, w.draft);
          w.geos.forEach((g) => g.dispose());
        }
        this.active.delete(k);
      }
    }
    const t = whaleTime();
    for (const w of this.active.values()) if (w) w.setTime(t);
  }

  list() {
    return [...this.active.values()].filter(Boolean);
  }

  groundAt(x, z, y) {
    let best = null;
    for (const w of this.list()) {
      w.toLocal(_w.set(x, y, z), _l);
      const e = (_l.x / BACK_W) ** 2 + (_l.z / BACK_L) ** 2;
      if (e >= 1) continue;
      const top = w.backTop();
      if (top <= y + 0.7 && (!best || top > best.y)) best = { y: top, whale: w };
    }
    return best;
  }

  updraftAt(x, y, z) {
    let best = 0;
    for (const w of this.list()) {
      const top = w.backTop() + 4;
      if (y < w.y - 75 || y > top) continue;
      const d = Math.hypot(x - w.x, z - w.z);
      const reach = 5 * w.s;
      if (d > reach) continue;
      const s = Math.min(1, (reach - d) / 2) * Math.min(1, (top - y) / 5);
      if (s > best) best = s;
    }
    return best;
  }

  shardsNear(pos, radius) {
    const out = [];
    for (const w of this.list()) {
      if (!w.shard) continue;
      w.shard.getWorldPosition(_w);
      if (_w.distanceToSquared(_l.set(pos.x, pos.y + 0.9, pos.z)) < radius * radius) out.push(w.shardId);
    }
    return out;
  }

  removeShard(id) {
    for (const w of this.list()) {
      if (w.shardId === id && w.shard) {
        w.group.remove(w.shard);
        w.shard = null;
      }
    }
  }
}
