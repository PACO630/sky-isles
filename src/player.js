import * as THREE from 'three';
import { clamp } from './rng.js';

export const PLAYER_COLORS = ['#7a6cf0', '#ef6f9a', '#3fb8a8', '#f0a24a', '#4a9ff0', '#e8e4f4'];

const GRAVITY = 28;
const JUMP = 11;
const WALK = 7;
const RUN = 11.5;
const GLIDE_SPEED = 16;
const GLIDE_FALL = 2.6;
const RADIUS = 0.4;
const HEIGHT = 1.8;
const COYOTE = 0.12;
const FALL_LIMIT = 4; // touching the cloud sea sends you back

// Animation states shared with the network layer
export const ANIM = { IDLE: 0, WALK: 1, RUN: 2, AIR: 3, GLIDE: 4 };

export const EMOTE = { WAVE: 0, CHEER: 1, HEART: 2, PING: 3 };
export const EMOTES = [
  { icon: '👋', name: '揮手' },
  { icon: '🎉', name: '歡呼' },
  { icon: '❤️', name: '愛心' },
  { icon: '📍', name: '這裡！' },
];

const bubbleCache = new Map();
function bubbleMaterial(icon) {
  if (!bubbleCache.has(icon)) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(255,255,255,0.92)';
    g.beginPath();
    g.arc(64, 58, 50, 0, Math.PI * 2);
    g.moveTo(52, 104);
    g.lineTo(64, 124);
    g.lineTo(76, 104);
    g.fill();
    g.font = '60px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(icon, 64, 62);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    bubbleCache.set(icon, new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
  }
  return bubbleCache.get(icon);
}

export function playEmote(avatar, type) {
  const u = avatar.userData;
  u.emote = { type, left: 2.6 };
  if (!u.bubble) {
    u.bubble = new THREE.Sprite();
    u.bubble.scale.setScalar(0.9);
    u.bubble.position.y = 3.3;
    u.bubble.renderOrder = 11;
    avatar.add(u.bubble);
  }
  u.bubble.material = bubbleMaterial(EMOTES[type].icon);
  u.bubble.visible = true;
}

const lambert = (c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });

export function createAvatar(color) {
  const robeColor = new THREE.Color(color);
  const dark = robeColor.clone().offsetHSL(0, 0, -0.12);
  const robe = lambert(robeColor);
  const robeDark = lambert(dark);
  const mask = lambert('#f6f1e8');
  const scarfMat = lambert(robeColor.clone().offsetHSL(0.5, 0, 0.1));
  const eyeMat = new THREE.MeshBasicMaterial({ color: '#2a2450' });

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.52, 1.05, 7), robe);
  skirt.position.y = 0.55;
  body.add(skirt);
  const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.35, 7), robeDark);
  chest.position.y = 1.2;
  body.add(chest);
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 1), mask);
  head.position.y = 1.58;
  body.add(head);
  for (const sx of [-0.1, 0.1]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.04), eyeMat);
    eye.position.set(sx, 1.6, 0.28);
    body.add(eye);
  }
  const hood = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.6, 7), robe);
  hood.position.set(0, 1.86, -0.06);
  hood.rotation.x = -0.25;
  body.add(hood);
  const scarf = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.14, 7), scarfMat);
  scarf.position.y = 1.36;
  body.add(scarf);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.7), scarfMat);
  tail.geometry.translate(0, 0, -0.35);
  tail.position.set(0.08, 1.36, -0.2);
  body.add(tail);

  const arms = [];
  for (const sx of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(0.3 * sx, 1.3, 0);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.55, 5), robeDark);
    arm.position.y = -0.27;
    pivot.add(arm);
    body.add(pivot);
    arms.push(pivot);
  }

  // a small lantern hanging from the right hand
  const lantern = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0), new THREE.MeshBasicMaterial({ color: '#ffe3a0' }));
  lantern.position.set(0, -0.62, 0.05);
  arms[1].add(lantern);

  // leaf-shaped glider, shown only while gliding
  const glider = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.9);
  shape.quadraticCurveTo(1.7, 0.5, 1.6, -0.2);
  shape.quadraticCurveTo(0.6, -0.1, 0, -0.5);
  shape.quadraticCurveTo(-0.6, -0.1, -1.6, -0.2);
  shape.quadraticCurveTo(-1.7, 0.5, 0, 0.9);
  const wingGeo = new THREE.ShapeGeometry(shape, 4);
  wingGeo.rotateX(Math.PI / 2);
  const wing = new THREE.Mesh(wingGeo, new THREE.MeshLambertMaterial({ color: robeColor.clone().offsetHSL(0, -0.1, 0.18), flatShading: true, side: THREE.DoubleSide }));
  glider.add(wing);
  const rib = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 1.4), robeDark);
  glider.add(rib);
  glider.position.set(0, 2.25, 0);
  glider.visible = false;
  body.add(glider);

  root.userData = { body, arms, tail, glider, head, t: 0 };
  return root;
}

export function animateAvatar(avatar, state, dt, speed) {
  const u = avatar.userData;
  u.t += dt * (state === ANIM.RUN ? 13 : state === ANIM.WALK ? 9 : 3);
  const t = u.t;
  const moving = state === ANIM.WALK || state === ANIM.RUN;
  const k = 1 - Math.exp(-dt * 12);

  u.body.position.y += ((moving ? Math.abs(Math.sin(t)) * 0.08 : Math.sin(t * 0.7) * 0.02) - u.body.position.y) * k;
  const lean = state === ANIM.GLIDE ? 0.35 : moving ? 0.08 + (state === ANIM.RUN ? 0.08 : 0) : 0;
  u.body.rotation.x += (lean - u.body.rotation.x) * k;

  const swing = moving ? Math.sin(t) * 0.7 : 0;
  const gliding = state === ANIM.GLIDE;
  let arm0 = gliding ? Math.PI * 0.95 : state === ANIM.AIR ? -0.6 : swing;
  let arm1 = gliding ? Math.PI * 0.95 : state === ANIM.AIR ? -0.6 : -swing;
  let armZ0 = gliding ? 0.25 : 0;
  let armZ1 = gliding ? -0.25 : 0;

  // emotes override the arms (but never the glider pose)
  if (u.emote) {
    u.emote.left -= dt;
    const e = u.emote.type;
    if (u.emote.left <= 0) {
      u.emote = null;
      if (u.bubble) u.bubble.visible = false;
    } else if (!gliding) {
      const w = u.emote.left * 14;
      if (e === EMOTE.WAVE) { arm1 = Math.PI * 0.9; armZ1 = -0.25 + Math.sin(w) * 0.35; }
      if (e === EMOTE.CHEER) {
        arm0 = arm1 = Math.PI * 0.92;
        armZ0 = 0.35; armZ1 = -0.35;
        u.body.position.y = Math.abs(Math.sin(w * 0.6)) * 0.3;
      }
      if (e === EMOTE.HEART) { arm0 = arm1 = -1.3; armZ0 = -0.5; armZ1 = 0.5; }
      if (e === EMOTE.PING) { arm1 = -2.3; }
    }
  }
  u.arms[0].rotation.x += (arm0 - u.arms[0].rotation.x) * k;
  u.arms[1].rotation.x += (arm1 - u.arms[1].rotation.x) * k;
  u.arms[0].rotation.z += (armZ0 - u.arms[0].rotation.z) * k;
  u.arms[1].rotation.z += (armZ1 - u.arms[1].rotation.z) * k;

  const flap = Math.sin(t * 1.7) * (0.15 + Math.min(speed, 16) * 0.03);
  u.tail.rotation.x = -0.25 + flap * 0.5 + (gliding ? -0.6 : 0);
  u.tail.rotation.y = Math.sin(t * 1.3) * 0.25;

  u.glider.visible = gliding;
  if (gliding) {
    u.glider.rotation.z = Math.sin(t * 0.9) * 0.06;
    u.glider.rotation.x = -0.3;
  }
}

export function makeShadow() {
  const g = new THREE.CircleGeometry(0.55, 16).rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x1a1640, transparent: true, opacity: 0.28, depthWrite: false }));
  m.renderOrder = 1;
  return m;
}

export function placeShadow(shadow, world, pos) {
  const gi = world.groundInfo(pos.x, pos.z, pos.y + 0.1);
  const g = gi ? gi.y : null;
  if (g === null || pos.y - g > 25) {
    shadow.visible = false;
    return;
  }
  shadow.visible = true;
  shadow.position.set(pos.x, g + 0.04, pos.z);
  const s = clamp(1 - (pos.y - g) / 25, 0.3, 1);
  shadow.scale.setScalar(s);
  shadow.material.opacity = 0.28 * s;
}

export function makeLabel(text, color) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  const font = '600 40px "Noto Sans TC", "PingFang TC", system-ui, sans-serif';
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + 48;
  c.width = w;
  c.height = 64;
  ctx.font = font;
  ctx.fillStyle = 'rgba(20,16,50,0.55)';
  const r = 28;
  ctx.beginPath();
  ctx.roundRect(0, 4, w, 56, r);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(26, 32, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 40, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
  sprite.scale.set((w / 64) * 0.5, 0.5, 1);
  sprite.renderOrder = 10;
  return sprite;
}

export class LocalPlayer {
  constructor(avatar) {
    this.avatar = avatar;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.grounded = false;
    this.gliding = false;
    this.airTime = 0;
    this.lastSafe = new THREE.Vector3();
    this.state = ANIM.IDLE;
    this.island = null;
    this.platform = null;
    this.platLocal = new THREE.Vector3();
    this.platYaw = 0;
    this.onRespawn = null;
  }

  // keepSafe: don't treat the destination as a respawn point (e.g. a friend who is mid-air)
  teleport(p, keepSafe = false) {
    this.pos.copy(p);
    this.vel.set(0, 0, 0);
    this.gliding = false;
    this.platform = null;
    if (!keepSafe) this.lastSafe.copy(p);
  }

  update(dt, input, camYaw, world) {
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
    const rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
    let wx = fx * input.moveY + rx * input.moveX;
    let wz = fz * input.moveY + rz * input.moveX;
    const wl = Math.hypot(wx, wz);
    if (wl > 1) { wx /= wl; wz /= wl; }

    // jump / glide
    if (input.jumpPressed) {
      if (this.grounded || this.airTime < COYOTE) {
        this.vel.y = JUMP;
        this.grounded = false;
        this.airTime = COYOTE;
      } else {
        this.gliding = true;
      }
    }
    if (!input.jumpHeld || this.grounded) this.gliding = false;

    // ride along with a moving platform (whale back) we stood on last frame
    if (this.platform) {
      this.platform.toWorld(this.platLocal, this.pos);
      this.yaw += this.platform.yaw - this.platYaw;
      this.platYaw = this.platform.yaw;
    }

    const v = this.vel;
    if (this.gliding) {
      let dx = wx, dz = wz;
      if (wl < 0.1) { dx = Math.sin(this.yaw); dz = Math.cos(this.yaw); }
      const n = Math.hypot(dx, dz) || 1;
      const k = 1 - Math.exp(-dt * 2.2);
      v.x += ((dx / n) * GLIDE_SPEED - v.x) * k;
      v.z += ((dz / n) * GLIDE_SPEED - v.z) * k;
      if (v.y < -GLIDE_FALL) v.y += (-GLIDE_FALL - v.y) * (1 - Math.exp(-dt * 6));
      else v.y -= 6 * dt;
    } else {
      const speed = input.sprint ? RUN : WALK;
      const accel = this.grounded ? 14 : 3.5;
      const k = 1 - Math.exp(-dt * accel);
      v.x += (wx * speed - v.x) * k;
      v.z += (wz * speed - v.z) * k;
      v.y -= GRAVITY * dt;
    }

    const up = world.updraftAt(this.pos.x, this.pos.y + 0.9, this.pos.z);
    if (up > 0) {
      const cap = this.gliding ? 14 : 7;
      if (v.y < cap) v.y = Math.min(cap, v.y + (this.gliding ? 42 : 36) * up * dt);
    }
    if (v.y < -38) v.y = -38;

    this.pos.addScaledVector(v, dt);
    world.pushOut(this.pos, RADIUS, HEIGHT);

    const wasGrounded = this.grounded;
    this.grounded = false;
    const gi = world.groundInfo(this.pos.x, this.pos.z, this.pos.y);
    let platform = null;
    if (gi) {
      const snap = wasGrounded && v.y <= 0 ? 0.6 : 0.02;
      if (this.pos.y <= gi.y + snap && this.pos.y >= gi.y - 2.5 && v.y <= 0.5) {
        this.pos.y = gi.y;
        if (v.y < 0) v.y = 0;
        this.grounded = true;
        platform = gi.platform;
      }
    }
    this.platform = platform;
    if (platform) {
      platform.toLocal(this.pos, this.platLocal);
      this.platYaw = platform.yaw;
    }
    const under = world.undersideAt(this.pos.x, this.pos.z);
    if (under && this.pos.y < under.top - 0.5 && this.pos.y + HEIGHT > under.under) {
      this.pos.y = under.under - HEIGHT;
      if (v.y > 0) v.y = 0;
    }

    if (this.grounded) {
      this.airTime = 0;
      this.island = platform ? null : world.islandAt(this.pos.x, this.pos.z);
      const t = this.island && this.island.footprint(this.pos.x, this.pos.z);
      if (t !== null && t < 0.8) this.lastSafe.copy(this.pos);
    } else {
      this.airTime += dt;
    }

    if (this.pos.y < FALL_LIMIT) {
      this.teleport(this.lastSafe.clone().add(new THREE.Vector3(0, 0.5, 0)));
      if (this.onRespawn) this.onRespawn();
    }

    const hs = Math.hypot(v.x, v.z);
    if (hs > 0.6) {
      const target = Math.atan2(v.x, v.z);
      let d = target - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * (1 - Math.exp(-dt * 12));
    }

    this.state = this.gliding ? ANIM.GLIDE : !this.grounded ? ANIM.AIR : hs > 8.5 ? ANIM.RUN : hs > 0.8 ? ANIM.WALK : ANIM.IDLE;
    this.avatar.position.copy(this.pos);
    this.avatar.rotation.y = this.yaw;
    animateAvatar(this.avatar, this.state, dt, hs);
    return hs;
  }
}
