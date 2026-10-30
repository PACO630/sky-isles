import * as THREE from 'three';
import { CELL } from './world.js';
import { makeHaloTexture } from './geo.js';

// At night a star now and then streaks down onto a nearby island and waits to be caught.
// Stars are personal: each traveler sees their own, so nobody steals a friend's.

const FALL_TIME = 2.4;
const LIFETIME = 120;

export class StarFall {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.timer = 25 + Math.random() * 25;
    this.falling = null;
    this.landed = [];

    const halo = makeHaloTexture();
    this.headMat = new THREE.SpriteMaterial({ map: halo, color: '#cfe8ff', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false });
    this.trailGeo = new THREE.CylinderGeometry(0.9, 0.05, 1, 6, 1, true).translate(0, -0.5, 0);
    this.trailMat = new THREE.MeshBasicMaterial({ color: '#9fd0ff', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    this.starGeo = new THREE.OctahedronGeometry(0.7, 0);
    this.starMat = new THREE.MeshBasicMaterial({ color: '#d8f0ff' });
    this.starHalo = new THREE.SpriteMaterial({ map: halo, color: '#8fc8ff', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  }

  _pickTarget(pos) {
    const cx = Math.floor(pos.x / CELL), cz = Math.floor(pos.z / CELL);
    const options = [];
    for (let dz = -2; dz <= 2; dz++) {
      for (let dx = -2; dx <= 2; dx++) {
        const isl = this.world.data(cx + dx, cz + dz);
        if (isl) options.push(isl);
      }
    }
    if (!options.length) return null;
    const isl = options[Math.floor(Math.random() * options.length)];
    const a = Math.random() * Math.PI * 2, d = Math.random() * 0.6;
    const R = isl.edge(a);
    const x = isl.x + Math.cos(a) * R * d, z = isl.z + Math.sin(a) * R * d;
    return new THREE.Vector3(x, isl.topAt(x, z) + 1.5, z);
  }

  spawn(pos) {
    const target = this._pickTarget(pos);
    if (!target) return false;
    const a = Math.random() * Math.PI * 2;
    const start = target.clone().add(new THREE.Vector3(Math.cos(a) * 140, 220, Math.sin(a) * 140));
    const head = new THREE.Sprite(this.headMat);
    head.scale.setScalar(9);
    const trail = new THREE.Mesh(this.trailGeo, this.trailMat);
    trail.scale.set(1, 45, 1);
    trail.frustumCulled = false;
    head.frustumCulled = false;
    this.scene.add(head, trail);
    this.falling = { start, target, head, trail, t: 0 };
    return true;
  }

  // returns the star that just landed (for a toast), if any
  update(dt, pos, night) {
    let landedNow = null;
    if (night > 0.6 && !this.falling) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.timer = 45 + Math.random() * 45;
        this.spawn(pos);
      }
    }
    const f = this.falling;
    if (f) {
      f.t += dt / FALL_TIME;
      const k = Math.min(1, f.t);
      const p = f.start.clone().lerp(f.target, k * k);
      f.head.position.copy(p);
      const dir = f.start.clone().sub(f.target).normalize();
      f.trail.position.copy(p);
      f.trail.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
      if (f.t >= 1) {
        this.scene.remove(f.head, f.trail);
        this.falling = null;
        const m = new THREE.Mesh(this.starGeo, this.starMat);
        m.position.copy(f.target);
        const h = new THREE.Sprite(this.starHalo);
        h.scale.setScalar(5);
        m.add(h);
        this.scene.add(m);
        landedNow = { mesh: m, pos: f.target, ttl: LIFETIME };
        this.landed.push(landedNow);
      }
    }
    for (const s of this.landed) {
      s.ttl -= dt;
      s.mesh.rotation.y += dt * 2.5;
      s.mesh.scale.setScalar(s.ttl < 10 ? Math.max(0.01, s.ttl / 10) : 1);
    }
    this.landed = this.landed.filter((s) => {
      if (s.ttl > 0) return true;
      this.scene.remove(s.mesh);
      return false;
    });
    return landedNow;
  }

  // returns how many stars were caught at this position
  catchNear(pos) {
    let n = 0;
    this.landed = this.landed.filter((s) => {
      if (s.pos.distanceTo(_p.set(pos.x, pos.y + 0.9, pos.z)) < 2.2) {
        this.scene.remove(s.mesh);
        n++;
        return false;
      }
      return true;
    });
    return n;
  }
}

const _p = new THREE.Vector3();
